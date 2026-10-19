import React from 'react';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`bg-[#FFFDF9] rounded-3xl md:rounded-[26px] border border-[#E6DECD] shadow-[0_2px_10px_rgba(36,34,31,0.03)] p-6 md:p-8 transition-shadow duration-150 ${
        hover ? 'hover:shadow-md hover:border-[#D4CBB9]' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, className = '' }) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-5 border-b border-[#E6DECD]/70 ${className}`}>
      <div>
        <h2 className="text-xl md:text-2xl font-black text-[#24221F] tracking-tight font-display">{title}</h2>
        {subtitle && <p className="text-xs md:text-sm font-medium text-[#777266] mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default Card;
