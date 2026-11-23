/**
 * Elwazeer POS System — Global Frontend Error Reporter
 * Captures unhandled JS errors, unhandled Promise rejections, and React ErrorBoundary crashes
 * with client-side deduplication and throttling so infinite loops never flood the server.
 */

const DEDUP_WINDOW_MS = 10000;
const MAX_REPORTS_PER_MINUTE = 10;

const recentFingerprints = new Map();
let windowStart = Date.now();
let reportsInWindow = 0;
let initialized = false;

function shouldSend(fingerprint) {
  const now = Date.now();

  if (now - windowStart > 60000) {
    windowStart = now;
    reportsInWindow = 0;
  }
  if (reportsInWindow >= MAX_REPORTS_PER_MINUTE) {
    return false;
  }

  const lastSent = recentFingerprints.get(fingerprint);
  if (lastSent && now - lastSent < DEDUP_WINDOW_MS) {
    return false;
  }

  recentFingerprints.set(fingerprint, now);
  if (recentFingerprints.size > 100) {
    for (const [key, ts] of recentFingerprints.entries()) {
      if (now - ts >= DEDUP_WINDOW_MS) recentFingerprints.delete(key);
    }
  }
  reportsInWindow += 1;
  return true;
}

export async function reportClientError({
  message,
  stack = null,
  componentStack = null,
  type = 'FRONTEND_ERROR',
  level = 'error',
  filename = null,
  lineno = null,
  colno = null,
} = {}) {
  try {
    const cleanMsg = String(message || '').trim();
    if (!cleanMsg) return null;

    // Ignore benign browser ResizeObserver noise
    if (cleanMsg.includes('ResizeObserver loop')) return null;

    const fingerprint = `${type}|${cleanMsg.slice(0, 160)}`;
    if (!shouldSend(fingerprint)) return null;

    const headers = { 'Content-Type': 'application/json' };
    try {
      const token = (typeof localStorage !== 'undefined' ? localStorage.getItem('auth_token') : null)
        || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('auth_token') : null);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch {}

    const res = await fetch('/api/client-errors', {
      method: 'POST',
      headers,
      credentials: 'include',
      keepalive: true,
      body: JSON.stringify({
        message: cleanMsg.slice(0, 1500),
        stack: stack ? String(stack).slice(0, 3500) : null,
        componentStack: componentStack ? String(componentStack).slice(0, 2000) : null,
        type,
        level,
        filename,
        lineno,
        colno,
        url: typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : null,
      }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      return data?.errorId || null;
    }
  } catch {
    // Never throw from the error reporter itself
  }
  return null;
}

export function initGlobalErrorHandlers() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('error', (event) => {
    const err = event?.error;
    const msg = err?.message || event?.message || 'Unhandled window error';
    reportClientError({
      message: msg,
      stack: err?.stack || null,
      type: 'WINDOW_ERROR',
      filename: event?.filename || null,
      lineno: event?.lineno || null,
      colno: event?.colno || null,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = reason instanceof Error
      ? reason.message
      : (typeof reason === 'string' ? reason : (reason?.message || 'Unhandled Promise Rejection'));
    reportClientError({
      message: msg,
      stack: reason?.stack || null,
      type: 'UNHANDLED_REJECTION',
    });
  });
}
