import React, { forwardRef } from 'react';

export const Select = forwardRef(function Select(
  {
    label,
    error,
    helperText,
    options = [],
    className = '',
    containerClassName = '',
    id,
    children,
    ...props
  },
  ref
) {
  const selectId = id || `select-${Math.random().toString(36).substring(2, 7)}`;

  return (
    <div className={`flex flex-col gap-1.5 ${containerClassName}`}>
      {label && (
        <label htmlFor={selectId} className="text-xs font-bold text-slate-700 tracking-wide select-none">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={selectId}
          className={`w-full rounded-xl border-2 bg-white px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 outline-none text-slate-900 cursor-pointer ${
            error
              ? 'border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
              : 'border-slate-200 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-50'
          } ${className}`}
          {...props}
        >
          {children ||
            options.map((opt) => (
              <option key={typeof opt === 'object' ? opt.value : opt} value={typeof opt === 'object' ? opt.value : opt}>
                {typeof opt === 'object' ? opt.label : opt}
              </option>
            ))}
        </select>
      </div>
      {error ? (
        <p className="text-xs font-semibold text-rose-600 animate-fade-in">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
});

export default Select;
