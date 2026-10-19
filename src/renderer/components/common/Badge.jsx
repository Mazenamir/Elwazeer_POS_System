import React from 'react';

const variantStyles = {
  success: 'bg-[#EEF4E3] text-[#3D5618] border-[#AFC77A]/70',
  warning: 'bg-[#FDF5D2] text-[#7A5B04] border-[#F4D95B]/70',
  danger: 'bg-[#FCEBF4] text-[#931D4E] border-[#F1B6D8]/70',
  info: 'bg-[#EBF2FB] text-[#204E8A] border-[#B8CCED]/70',
  neutral: 'bg-[#FAF6ED] text-[#777266] border-[#E6DECD]',
  purple: 'bg-[#F4EBFC] text-[#5C238A] border-[#D5B8ED]/70',
};

export function Badge({ children, variant = 'neutral', className = '', dot = false }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
        variantStyles[variant] || variantStyles.neutral
      } ${className}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            variant === 'success'
              ? 'bg-[#AFC77A]'
              : variant === 'warning'
              ? 'bg-[#F4D95B]'
              : variant === 'danger'
              ? 'bg-[#F1B6D8]'
              : variant === 'info'
              ? 'bg-[#B8CCED]'
              : 'bg-[#9E988B]'
          }`}
        />
      )}
      {children}
    </span>
  );
}

export default Badge;
