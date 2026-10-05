import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toastFn = useCallback((optionsOrMsg, maybeVariant) => {
    if (!optionsOrMsg) return;
    if (typeof optionsOrMsg === 'string') {
      return addToast(optionsOrMsg, (maybeVariant === 'danger' ? 'error' : maybeVariant) || 'info');
    }
    if (typeof optionsOrMsg === 'object') {
      const { message, title, variant, duration } = optionsOrMsg;
      const fullMsg = title && message ? `${title}: ${message}` : (message || title || '');
      const type = (variant === 'danger' ? 'error' : variant) || 'info';
      return addToast(fullMsg, type, duration);
    }
  }, [addToast]);

  toastFn.success = useCallback((msg, dur) => addToast(msg, 'success', dur), [addToast]);
  toastFn.error = useCallback((msg, dur) => addToast(msg, 'error', dur || 5000), [addToast]);
  toastFn.warning = useCallback((msg, dur) => addToast(msg, 'warning', dur), [addToast]);
  toastFn.info = useCallback((msg, dur) => addToast(msg, 'info', dur), [addToast]);
  toastFn.toast = toastFn;

  return (
    <ToastContext.Provider value={{ toast: toastFn, addToast, removeToast }}>
      {children}
      {/* Toast Render Container */}
      <div className="fixed bottom-6 left-6 z-[9999] flex flex-col gap-2 max-w-md w-full pointer-events-none">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 ${
              item.type === 'success'
                ? 'bg-emerald-950/90 text-white border-emerald-500/30 shadow-emerald-900/20'
                : item.type === 'error'
                ? 'bg-rose-950/90 text-white border-rose-500/30 shadow-rose-900/20'
                : item.type === 'warning'
                ? 'bg-amber-950/90 text-white border-amber-500/30 shadow-amber-900/20'
                : 'bg-slate-900/90 text-white border-slate-700 shadow-slate-900/30'
            }`}
            style={{ direction: 'rtl' }}
          >
            <div className="shrink-0 mt-0.5">
              {item.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {item.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {item.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {item.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
            </div>
            <div className="flex-1 text-sm font-semibold leading-relaxed">
              {item.message}
            </div>
            <button
              onClick={() => removeToast(item.id)}
              className="shrink-0 p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context.toast;
}

export default ToastContext;
