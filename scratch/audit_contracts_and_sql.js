/**
 * Static Contracts, Bundle TDZ, Arity, and Route Integrity Audit
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

const errors = [];
const warnings = [];

console.log('=== 1. PRODUCTION BUNDLE TDZ AUDIT ===');
const assetsDir = path.join(ROOT, 'dist', 'renderer', 'assets');
if (!fs.existsSync(assetsDir)) {
  errors.push('Missing dist/renderer/assets directory. Run npm run build:client first.');
} else {
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  if (!jsFiles.length) errors.push('No .js bundle found in dist/renderer/assets');
  for (const jf of jsFiles) {
    const code = fs.readFileSync(path.join(assetsDir, jf), 'utf8');
    let hits = 0;
    for (const m of code.matchAll(/\},\s*\[([a-zA-Z0-9_$,]+)\]\)\s*[,;]/g)) {
      const deps = m[1].split(',').filter(Boolean);
      let depth = 0;
      const start = m.index + m[0].length;
      const top = [];
      for (let k = start; k < Math.min(code.length, start + 8000); k++) {
        const ch = code[k];
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') {
          depth--;
          if (depth < 0) break;
        } else if (depth === 0) {
          top.push(ch);
        }
      }
      const topStr = top.join('');
      for (const dm of topStr.matchAll(/(?:^|[;,])(?:let|const)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)=/g)) {
        if (deps.includes(dm[1])) {
          hits++;
          errors.push(`Bundle TDZ in ${jf} @ ${m.index}: ident '${dm[1]}' referenced before initialization`);
        }
      }
    }
    console.log(`✓ ${jf}: ${hits} TDZ hits`);
  }
}

console.log('=== 2. CONTROLLER <-> SERVICE ARITY AUDIT ===');
const serverFiles = walk(path.join(ROOT, 'src', 'server', 'modules'));
const serviceFns = new Map();
for (const f of serverFiles) {
  if (!f.endsWith('.service.js')) continue;
  const code = fs.readFileSync(f, 'utf8');
  const map = new Map();
  for (const m of code.matchAll(/(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g)) {
    const raw = m[2].trim();
    const count = raw ? raw.split(',').length : 0;
    map.set(m[1], { count, raw });
  }
  serviceFns.set(f, map);
}

let arityCount = 0;
for (const f of serverFiles) {
  if (!f.endsWith('.controller.js')) continue;
  const svcFile = f.replace('.controller.js', '.service.js');
  const svcMap = serviceFns.get(svcFile);
  if (!svcMap) continue;
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    for (const m of line.matchAll(/Service\.([a-zA-Z0-9_]+)\(([^;]+)\)/g)) {
      const fn = m[1];
      const argsStr = m[2].trim();
      let depth = 0;
      let argc = argsStr ? 1 : 0;
      for (const ch of argsStr) {
        if ('({['.includes(ch)) depth++;
        else if (')}]'.includes(ch)) depth--;
        else if (ch === ',' && depth === 0) argc++;
      }
      const decl = svcMap.get(fn);
      if (decl && argc > decl.count) {
        arityCount++;
        errors.push(`Arity mismatch: ${path.relative(ROOT, f)}:${idx + 1} passes ${argc} args to ${fn}(${decl.raw})`);
      }
    }
  });
}
console.log(`✓ Controller/service arity mismatches: ${arityCount}`);

console.log('=== 3. FRONTEND ROUTES & EXPRESS ENDPOINTS AUDIT ===');
const routePatterns = [];
for (const f of serverFiles) {
  if (!f.endsWith('.routes.js')) continue;
  const code = fs.readFileSync(f, 'utf8');
  for (const m of code.matchAll(/router\.(get|post|put|patch|delete)\(\s*(['"`\[][\s\S]*?['"`\]])\s*,/g)) {
    const method = m[1].toUpperCase();
    const raw = m[2].replace(/\s+/g, ' ');
    const paths = raw.startsWith('[') ? [...raw.matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]) : [raw.slice(1, -1)];
    for (const p of paths) {
      routePatterns.push({
        method,
        raw: p,
        re: new RegExp('^' + p.replace(/:[^/]+/g, '[^/]+') + '$'),
      });
    }
  }
}

const uiDirs = [
  path.join(ROOT, 'src', 'renderer', 'pages'),
  path.join(ROOT, 'src', 'renderer', 'components'),
  path.join(ROOT, 'src', 'renderer', 'context'),
];
let unmatchedUiCalls = 0;
for (const dir of uiDirs) {
  for (const f of walk(dir)) {
    const code = fs.readFileSync(f, 'utf8');
    for (const m of code.matchAll(/(?:api|client)\.(get|post|put|patch|delete)\(\s*([`'"])([^`'"]+)\2/g)) {
      const method = m[1].toUpperCase();
      let url = m[3]
        .split('?')[0]
        .replace(/\/\$\{[^}]+\}/g, '/123')
        .replace(/\$\{[^}]+\}$/g, '')
        .replace(/\$\{[^}]+\}/g, '123')
        .replace(/^\/api/, '')
        .trim();
      if (!url.startsWith('/') || url === '/123') continue;
      const ok = routePatterns.some((rp) => rp.method === method && rp.re.test(url));
      if (!ok) {
        unmatchedUiCalls++;
        errors.push(`Unmatched UI API call in ${path.relative(ROOT, f)}: ${method} ${url} (raw: ${m[3]})`);
      }
    }
  }
}
console.log(`✓ Unmatched UI API calls in pages/components/context: ${unmatchedUiCalls}`);

console.log('=== 4. CIRCULAR IMPORT CHECK IN SRC/RENDERER ===');
const rendererFiles = walk(path.join(ROOT, 'src', 'renderer'));
const edges = new Map();
for (const file of rendererFiles) {
  const src = fs.readFileSync(file, 'utf8');
  const imports = [];
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = path.resolve(path.dirname(file), m[1]);
    for (const ext of ['', '.js', '.jsx', '/index.js', '/index.jsx']) {
      if (fs.existsSync(target + ext) && fs.statSync(target + ext).isFile()) {
        imports.push(path.relative(ROOT, target + ext));
        break;
      }
    }
  }
  edges.set(path.relative(ROOT, file), imports);
}
const visiting = new Set();
const visited = new Set();
const stack = [];
let cycles = 0;
function dfs(u) {
  visiting.add(u);
  stack.push(u);
  for (const v of edges.get(u) || []) {
    if (visiting.has(v)) {
      cycles++;
      errors.push(`Circular import in renderer: ${stack.slice(stack.indexOf(v)).concat(v).join(' -> ')}`);
    } else if (!visited.has(v)) {
      dfs(v);
    }
  }
  stack.pop();
  visiting.delete(u);
  visited.add(u);
}
for (const k of edges.keys()) {
  if (!visited.has(k)) dfs(k);
}
console.log(`✓ Renderer circular imports: ${cycles}`);

if (warnings.length) {
  console.log('\nWARNINGS:');
  warnings.forEach((w) => console.log('  ⚠', w));
}

if (errors.length) {
  console.error('\nSTATIC AUDIT FAILURES:');
  errors.forEach((e) => console.error('  ✗', e));
  process.exit(1);
}

console.log('\n=== STATIC AUDIT PASSED 100% (0 ERRORS) ===');
