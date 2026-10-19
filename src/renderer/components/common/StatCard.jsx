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
  metrics,
  chart,
  className = '',
}) {
  const isPastel = variant && variant.startsWith('pastel-');

  const pastelCardStyles = {
    'pastel-yellow': {
      card: 'bg-[#F4D95B] border-[#E8CE50] text-[#24221F] shadow-[0_4px_16px_rgba(244,217,91,0.25)]',
      iconBox: 'bg-black/10 text-[#24221F]',
      title: 'text-[#24221F]/80',
      value: 'text-[#24221F]',
      pill: 'bg-black/10 text-[#24221F] border-black/10',
      watermark: (
        <svg className="absolute -left-3 -bottom-4 w-28 h-28 text-black/[0.04] pointer-events-none transform -rotate-12" viewBox="0 0 100 100" fill="currentColor">
          <polygon points="50 5, 95 30, 95 80, 50 95, 5 80, 5 30" />
        </svg>
      ),
    },
    'pastel-pink': {
      card: 'bg-[#F1B6D8] border-[#E5A5C9] text-[#24221F] shadow-[0_4px_16px_rgba(241,182,216,0.25)]',
      iconBox: 'bg-black/10 text-[#24221F]',
      title: 'text-[#24221F]/80',
      value: 'text-[#24221F]',
      pill: 'bg-black/10 text-[#24221F] border-black/10',
      watermark: (
        <svg className="absolute -left-2 -bottom-2 w-28 h-28 text-black/[0.04] pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
        </svg>
      ),
    },
    'pastel-green': {
      card: 'bg-[#AFC77A] border-[#9EB66A] text-[#24221F] shadow-[0_4px_16px_rgba(175,199,122,0.25)]',
      iconBox: 'bg-black/10 text-[#24221F]',
      title: 'text-[#24221F]/80',
      value: 'text-[#24221F]',
      pill: 'bg-black/10 text-[#24221F] border-black/10',
      watermark: (
        <svg className="absolute -left-4 -bottom-4 w-32 h-32 text-black/[0.04] pointer-events-none" viewBox="0 0 100 100" fill="currentColor">
          <path d="M20 90 L80 90 L50 15 Z" />
        </svg>
      ),
    },
    'pastel-blue': {
      card: 'bg-[#B8CCED] border-[#A5BAE2] text-[#24221F] shadow-[0_4px_16px_rgba(184,204,237,0.25)]',
      iconBox: 'bg-black/10 text-[#24221F]',
      title: 'text-[#24221F]/80',
      value: 'text-[#24221F]',
      pill: 'bg-black/10 text-[#24221F] border-black/10',
      watermark: (
        <svg className="absolute -left-4 -bottom-4 w-32 h-32 text-black/[0.04] pointer-events-none" viewBox="0 0 100 100" fill="currentColor">
          <path d="M50 0 L61 35 L98 35 L68 57 L79 91 L50 70 L21 91 L32 57 L2 35 L39 35 Z" />
        </svg>
      ),
    },
  };

  if (isPastel && pastelCardStyles[variant]) {
    const pStyle = pastelCardStyles[variant];
    return (
      <div
        className={`relative overflow-hidden p-6 md:p-7 rounded-3xl md:rounded-[26px] border transition-[box-shadow,transform] duration-150 group flex flex-col justify-between hover:translate-y-[-2px] hover:shadow-lg ${pStyle.card} ${className}`}
      >
        {pStyle.watermark}
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-3">
            <div
              className={`w-11 h-11 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shrink-0 ${pStyle.iconBox}`}
            >
              {Icon && <Icon className="w-5 h-5 md:w-6 md:h-6" />}
            </div>
            {trend && (
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-extrabold border ${pStyle.pill}`}
              >
                {trend}
              </span>
            )}
          </div>
          <h3 className={`text-xs font-bold uppercase tracking-wider mb-2 select-none font-display ${pStyle.title}`}>
            {title}
          </h3>

          {metrics && metrics.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 mt-1 select-none">
              {metrics.map((m, idx) => (
                <div key={idx} className="flex flex-col">
                  <span className="text-base sm:text-lg font-black tracking-tight font-display text-[#24221F] leading-tight">
                    {m.value}
                  </span>
                  <span className="text-[10px] sm:text-[11px] font-bold text-[#24221F]/70 truncate font-display mt-0.5">
                    {m.label}
                  </span>
                  {m.sublabel && (
                    <span className="text-[9px] font-medium text-[#24221F]/50 truncate mt-0.5">
                      {m.sublabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={`text-2xl md:text-3xl font-black tracking-tight font-display ${pStyle.value}`}>
              {value}
            </p>
          )}

          {chart && (
            <div className="mt-3 pt-2 relative z-10">
              {chart}
            </div>
          )}
        </div>
        {subtitle && !chart && (
          <p className="relative z-10 text-xs font-semibold text-[#24221F]/70 mt-3 pt-2 border-t border-black/10">
            {subtitle}
          </p>
        )}
      </div>
    );
  }

  const variantColorMap = {
    primary: 'bg-[#151515] text-white',
    success: 'bg-[#AFC77A] text-[#24221F]',
    warning: 'bg-[#F4D95B] text-[#24221F]',
    danger: 'bg-[#F1B6D8] text-[#24221F]',
    info: 'bg-[#B8CCED] text-[#24221F]',
    purple: 'bg-[#D5B8ED] text-[#24221F]',
  };

  const resolvedColorClass = variant
    ? (variantColorMap[variant] || 'bg-[#151515] text-white')
    : (colorClass || 'bg-[#151515] text-white');

  return (
    <div
      className={`bg-[#FFFDF9] p-6 md:p-7 rounded-3xl md:rounded-[26px] border border-[#E6DECD] shadow-[0_2px_8px_rgba(36,34,31,0.03)] hover:shadow-md hover:border-[#D4CBB9] transition-all duration-300 group flex flex-col justify-between ${className}`}
    >
      <div>
        <div className="flex justify-between items-start mb-4">
          <div
            className={`w-12 h-12 md:w-13 md:h-13 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110 shrink-0 shadow-sm ${resolvedColorClass}`}
          >
            {Icon && <Icon className="w-6 h-6 md:w-6.5 md:h-6.5" />}
          </div>
          {trend && (
            <span
              className={`px-3 py-1 rounded-full text-[11px] font-extrabold border ${
                trendType === 'positive'
                  ? 'bg-[#EEF4E3] text-[#3D5618] border-[#AFC77A]'
                  : trendType === 'negative'
                  ? 'bg-[#FCEBF4] text-[#931D4E] border-[#F1B6D8]'
                  : 'bg-[#FAF6ED] text-[#777266] border-[#E6DECD]'
              }`}
            >
              {trend}
            </span>
          )}
        </div>
        <h3 className="text-[#777266] text-xs font-bold uppercase tracking-wider mb-1 select-none font-display">
          {title}
        </h3>
        <p className="text-2xl md:text-3xl font-black text-[#24221F] tracking-tight font-display">
          {value}
        </p>
      </div>
      {subtitle && (
        <p className="text-xs font-semibold text-[#777266] mt-3 pt-2 border-t border-[#E6DECD]/60">
          {subtitle}
        </p>
      )}
    </div>
  );
}

export default StatCard;
