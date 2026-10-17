import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-xl',
  className = '',
  bodyClassName = 'p-6 sm:p-8',
  closeOnBackdropClick = true,
  hideHeader = false,
  plain = false,
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const modalElement = (
    <div
      className="fixed inset-0 z-[9990] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      style={{ direction: 'rtl' }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 animate-fade-in"
        onClick={() => {
          if (closeOnBackdropClick) {
            onClose();
          }
        }}
      />

      {/* Modal Dialog Content */}
      <div
        className={`relative w-full ${maxWidth} my-auto ${
          plain
            ? 'bg-transparent border-0 shadow-none'
            : 'bg-white rounded-3xl md:rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden'
        } z-10 animate-scale-in flex flex-col max-h-[90vh] ${className}`}
      >
        {/* Header */}
        {!hideHeader && !plain && (title || subtitle) && (
          <div className="flex items-center justify-between p-6 sm:p-8 border-b border-slate-100 shrink-0">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs sm:text-sm font-semibold text-slate-400 mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Body */}
        <div className={`${bodyClassName} overflow-y-auto flex-1 custom-scrollbar`}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
}

export default Modal;
