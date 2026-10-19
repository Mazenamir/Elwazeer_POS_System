import React from 'react';
import { Search, X } from 'lucide-react';

export function SearchBar({
  value,
  onChange,
  onClear,
  placeholder = 'بحث سريع...',
  className = '',
  containerClassName = '',
}) {
  return (
    <div className={`relative flex items-center ${containerClassName}`}>
      <div className="absolute right-2 w-7 h-7 rounded-full bg-[#F1B6D8] text-[#24221F] flex items-center justify-center pointer-events-none shadow-sm">
        <Search className="w-3.5 h-3.5" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-full pr-11 pl-10 py-2 text-xs sm:text-sm font-semibold text-[#24221F] placeholder:text-[#9E988B] focus:bg-white focus:border-[#151515] focus:ring-2 focus:ring-black/5 transition-all outline-none shadow-sm ${className}`}
      />
      {value && (
        <button
          type="button"
          onClick={() => (onClear ? onClear() : onChange(''))}
          className="absolute left-3 text-[#9E988B] hover:text-[#24221F] transition-colors p-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export default SearchBar;
