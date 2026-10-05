import React from 'react';

export function StatCard({
  title,
  value,
  subtitle,
  trend,
  trendType = 'neutral',
  icon: Icon,
  variant,
  colorClass,
  className = '',
}) {
  const variantColorMap = {
    primary: 'bg-indigo-600 text-white',
    success: 'bg-emerald-600 text-white',
    warning: 'bg-amber-500 text-white',
    danger: 'bg-rose-600 text-white',
    info: 'bg-sky-600 text-white',
    purple: 'bg-purple-600 text-white',
  };

  const resolvedColorClass = variant
    ? (variantColorMap[variant] || 'bg-indigo-600 text-white')
    : (colorClass || 'bg-indigo-600 text-white');

  return (
    <div
      className={`bg-white p-6 md:p-7 rounded-2xl md:rounded-[2rem] border border-slate-200/80 shadow-card hover:shadow-premium hover:border-slate-300 transition-all duration-300 group flex flex-col justify-between ${className}`}
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <div
            className={`w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center shadow-md transition-transform duration-300 group-hover:scale-110 shrink-0 ${resolvedColorClass}`}
          >
            {Icon && <Icon className="w-6 h-6 md:w-7 md:h-7" />}
          </div>
          {trend && (
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${
                trendType === 'positive'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : trendType === 'negative'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {trend}
            </span>
          )}
        </div>
        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1 select-none">
          {title}
        </h3>
        <p className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
          {value}
        </p>
      </div>
      {subtitle && (
        <p className="text-xs font-semibold text-slate-400 mt-3 pt-2 border-t border-slate-100/80">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default StatCard;
