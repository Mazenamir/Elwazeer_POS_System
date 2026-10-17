// src/renderer/services/api/client.js
// Centralized API client with automatic auth handling, error parsing, and mutation idempotency

let onUnauthorizedCallback = null;

export function registerUnauthorizedHandler(callback) {
  onUnauthorizedCallback = callback;
}

function generateIdempotencyKey() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Ensure Blob instances have .data returning the blob itself across all environments
if (typeof Blob !== 'undefined') {
  try {
    if (!('data' in Blob.prototype)) {
      Object.defineProperty(Blob.prototype, 'data', {
        get() {
          return this;
        },
        configurable: true,
      });
    }
  } catch (_) {}
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  
  const isBinaryRequest = options.responseType === 'blob' || options.responseType === 'arraybuffer';
  const headers = {
    'Accept': isBinaryRequest ? '*/*' : 'application/json',
    ...(options.headers || {}),
  };

  try {
    const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
    if (token && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}

  // Automatically attach JSON content type if sending body
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // Idempotency key for mutating requests to prevent duplicate transactions
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers['x-idempotency-key']) {
    headers['x-idempotency-key'] = generateIdempotencyKey();
  }

  const config = {
    method,
    headers,
    credentials: 'include', // send cookies automatically
    ...options,
  };

  if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    let response;
    let attempts = 0;
    const maxAttempts = method === 'GET' ? 2 : 1;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        response = await fetch(url, config);
        if ((response.status === 502 || response.status === 503) && attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      } catch (networkErr) {
        if (attempts < maxAttempts) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw networkErr;
      }
    }

    const isVerificationEndpoint = url.includes('/verify-password') || 
                                   url.includes('/verify-invoice-edit-password') || 
                                   url.includes('/login') ||
                                   url.includes('/public/');

    if (response.status === 401 && !isVerificationEndpoint) {
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    // Parse response according to responseType or content-type
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (options.responseType === 'blob') {
      data = await response.blob();
    } else if (options.responseType === 'arraybuffer') {
      data = await response.arrayBuffer();
    } else if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      let errorMessage = `طلب غير ناجح (${response.status})`;
      let errorData = data;
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        try {
          const text = await data.text();
          try {
            errorData = JSON.parse(text);
          } catch {
            errorData = { message: text };
          }
        } catch {}
      } else if (typeof ArrayBuffer !== 'undefined' && (data instanceof ArrayBuffer || ArrayBuffer.isView(data))) {
        try {
          const text = new TextDecoder().decode(data);
          try {
            errorData = JSON.parse(text);
          } catch {
            errorData = { message: text };
          }
        } catch {}
      }
      errorMessage = errorData?.error || errorData?.message || errorMessage;
      throw new ApiError(errorMessage, response.status, errorData);
    }

    if (data && typeof data === 'object') {
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        try {
          if (!('data' in Blob.prototype)) {
            Object.defineProperty(Blob.prototype, 'data', {
              get() { return this; },
              configurable: true,
            });
          }
        } catch (_) {}
      } else {
        try {
          if (data.data === undefined) {
            Object.defineProperty(data, 'data', {
              value: data,
              writable: true,
              enumerable: false,
              configurable: true,
            });
          }
        } catch (e) {}
      }
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(err.message || 'حدث خطأ في الاتصال بالخادم', 0, null);
  }
}

export const api = {
  get: (endpoint, options = {}) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) => request(endpoint, { ...options, method: 'PUT', body }),
  delete: (endpoint, options = {}) => request(endpoint, { ...options, method: 'DELETE' }),
};

export default api;
