import React, { forwardRef } from 'react';

export const Input = forwardRef(function Input(
  {
    label,
    error,
    helperText,
    icon: Icon,
    type = 'text',
    className = '',
    containerClassName = '',
    id,
    ...props
  },
  ref
) {
  const inputId = id || `input-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold text-[#24221F] tracking-wide select-none font-display">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {Icon && (
          <div className="absolute right-3.5 pointer-events-none text-[#9E988B]">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`w-full rounded-2xl border bg-[#FFFDF9] px-3.5 py-2.5 text-sm font-medium transition-all duration-200 outline-none placeholder:text-[#9E988B] text-[#24221F] ${
            Icon ? 'pr-11' : ''
          } ${
            error
              ? 'border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
              : 'border-[#E6DECD] focus:border-[#151515] focus:ring-2 focus:ring-black/5'
          } ${className}`}
          {...props}
        />
      </div>
      {error ? (
        <p className="text-xs font-semibold text-rose-600 animate-fade-in">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Input;
