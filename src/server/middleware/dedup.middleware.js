const crypto = require('crypto');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DUPLICATE_MUTATION_TTL_MS = 800; // 800ms window for catching duplicate submissions

const recentMutations = new Map();
const inFlightMutations = new Map();

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function shouldGuardDuplicateMutation(req) {
  if (!MUTATING_METHODS.has(req.method)) return false;
  if (!req.path.startsWith('/api/')) return false;
  if (req.path === '/api/login' || req.path === '/api/logout') return false;
  if (req.path === '/api/sync/apply' || req.headers['x-sync-apply'] === '1') return false;
  if (req.path === '/api/rentals/scan-action') return false;
  return true;
}

function duplicateMutationKey(req) {
  const requester = req.cookies?.token || req.headers.authorization || req.ip || 'anonymous';
  const idempotencyKey = req.headers['x-idempotency-key'] || '';
  const bodyText = stableStringify(req.body || {});
  return hashValue([
    hashValue(requester),
    idempotencyKey,
    req.method,
    req.originalUrl || req.url,
    bodyText,
  ].join('\n'));
}

function replayCapturedResponse(res, captured) {
  res.status(captured.statusCode || 200);
  for (const [name, value] of Object.entries(captured.headers || {})) {
    if (value !== undefined) res.set(name, value);
  }
  if (captured.kind === 'json') return res.json(captured.body);
  if (captured.kind === 'send') return res.send(captured.body);
  return res.end();
}

function duplicateMutationGuard(req, res, next) {
  if (!shouldGuardDuplicateMutation(req)) return next();

  const key = duplicateMutationKey(req);
  const now = Date.now();
  const recent = recentMutations.get(key);
  if (recent && recent.expiresAt > now) {
    return replayCapturedResponse(res, recent.response);
  }
  if (recent) recentMutations.delete(key);

  const inFlight = inFlightMutations.get(key);
  if (inFlight) {
    return inFlight.done
      .then((captured) => replayCapturedResponse(res, captured))
      .catch((err) => {
        console.error('Duplicate request replay failed:', err);
        res.status(409).json({ error: 'Duplicate request is already being processed' });
      });
  }

  let resolveDone;
  let rejectDone;
  const entry = {
    done: new Promise((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    }),
  };
  inFlightMutations.set(key, entry);

  let captured = null;
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body) => {
    captured = {
      kind: 'json',
      statusCode: res.statusCode,
      headers: { 'content-type': res.getHeader('content-type') },
      body,
    };
    return originalJson(body);
  };

  res.send = (body) => {
    if (!captured) {
      captured = {
        kind: 'send',
        statusCode: res.statusCode,
        headers: { 'content-type': res.getHeader('content-type') },
        body,
      };
    }
    return originalSend(body);
  };

  res.on('finish', () => {
    inFlightMutations.delete(key);
    const response = captured || { kind: 'end', statusCode: res.statusCode, headers: {} };
    if (res.statusCode < 500) {
      recentMutations.set(key, {
        response,
        expiresAt: Date.now() + DUPLICATE_MUTATION_TTL_MS,
      });
      setTimeout(() => {
        const cached = recentMutations.get(key);
        if (cached && cached.expiresAt <= Date.now()) recentMutations.delete(key);
      }, DUPLICATE_MUTATION_TTL_MS + 100);
    }
    resolveDone(response);
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      inFlightMutations.delete(key);
      rejectDone(new Error('Request closed before response finished'));
    }
  });

  next();
}

module.exports = {
  duplicateMutationGuard,
};
