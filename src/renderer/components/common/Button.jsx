import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled = false,
  icon: Icon,
  className = '',
  onClick,
  ...props
}) {
  const baseClasses = 'inline-flex items-center justify-center font-bold rounded-xl transition-all duration-200 select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none gap-2 cursor-pointer';

  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  const variantClasses = {
    primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow',
    accent: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
    success: 'bg-success text-white hover:bg-success-hover shadow-sm',
    warning: 'bg-warning text-white hover:bg-warning-hover shadow-sm',
    outline: 'border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  };

  return (
    <button
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.primary} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
