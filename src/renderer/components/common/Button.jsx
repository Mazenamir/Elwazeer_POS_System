import React from 'react';
import { Loader2 } from 'lucide-react';

export function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  onClick,
  ...props
}) {
  const isButtonLoading = Boolean(isLoading || loading);
  const baseClasses = 'inline-flex items-center justify-center font-bold rounded-2xl transition-all duration-200 select-none active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none gap-2 cursor-pointer font-display whitespace-nowrap shrink-0';

  const sizeClasses = {
    sm: 'px-3.5 py-1.5 text-xs',
    md: 'px-4.5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  const variantClasses = {
    primary: 'bg-[#151515] text-white hover:bg-neutral-800 shadow-sm hover:shadow',
    accent: 'bg-[#F1B6D8] text-[#24221F] hover:bg-[#E8A2CA] shadow-sm',
    success: 'bg-[#AFC77A] text-[#24221F] hover:bg-[#9EBA66] shadow-sm',
    warning: 'bg-[#F4D95B] text-[#24221F] hover:bg-[#E8CB42] shadow-sm',
    outline: 'border border-[#E6DECD] bg-[#FFFDF9] text-[#24221F] hover:bg-[#FAF6ED] hover:border-[#D4CBB9] shadow-sm',
    ghost: 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
  };

  return (
    <button
      type={type}
      disabled={disabled || isButtonLoading}
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.primary} ${className}`}
      {...props}
    >
      {isButtonLoading ? (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      ) : Icon ? (
        <Icon className="w-4 h-4 shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
