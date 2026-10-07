import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check, Search, X, Loader2, Plus } from 'lucide-react';

export function SearchableCombobox({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'اختر أو ابحث...',
  searchPlaceholder = 'ابحث هنا...',
  isLoading = false,
  error = null,
  helperText = null,
  required = false,
  customOptionLabel = null,
  customOptionValue = '__CUSTOM__',
  onSelectCustom = null,
  className = '',
  containerClassName = '',
  id,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const searchInputRef = useRef(null);

  const inputId = id || `combobox-${Math.random().toString(36).substring(2, 7)}`;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    } else if (!isOpen) {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Normalize options array into { label, value }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === 'object' && opt !== null) {
        return {
          label: String(opt.label || opt.name || opt.value || ''),
          value: String(opt.value ?? opt.name ?? opt.id ?? ''),
        };
      }
      return {
        label: String(opt),
        value: String(opt),
      };
    });
  }, [options]);

  // Filter options based on search term
  const filteredOptions = useMemo(() => {
    const cleanSearch = searchTerm.trim().toLowerCase();
    if (!cleanSearch) return normalizedOptions;
    return normalizedOptions.filter((opt) =>
      opt.label.toLowerCase().includes(cleanSearch)
    );
  }, [normalizedOptions, searchTerm]);

  // Find currently selected label
  const selectedLabel = useMemo(() => {
    if (value === customOptionValue && customOptionLabel) {
      return customOptionLabel;
    }
    const found = normalizedOptions.find((opt) => opt.value === value || opt.label === value);
    return found ? found.label : (value || '');
  }, [value, normalizedOptions, customOptionValue, customOptionLabel]);

  const handleSelect = (optionValue) => {
    if (optionValue === customOptionValue) {
      if (onSelectCustom) {
        onSelectCustom();
      } else {
        onChange(customOptionValue);
      }
    } else {
      onChange(optionValue);
    }
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col gap-1.5 ${containerClassName}`} dir="rtl">
      {label && (
        <label htmlFor={inputId} className="text-xs font-bold text-slate-700 tracking-wide select-none flex items-center justify-between">
          <span>{label}</span>
          {isLoading && (
            <span className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              جاري التحميل...
            </span>
          )}
        </label>
      )}

      {/* Main trigger button/box */}
      <div
        id={inputId}
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => !isLoading && setIsOpen((prev) => !prev)}
        className={`w-full min-h-[42px] rounded-xl border-2 bg-white px-3.5 py-2 text-sm font-semibold transition-all duration-200 outline-none cursor-pointer flex items-center justify-between gap-2 select-none ${
          error
            ? 'border-rose-400 focus:border-rose-600 focus:ring-2 focus:ring-rose-100'
            : isOpen
            ? 'border-indigo-600 ring-2 ring-indigo-50 shadow-sm'
            : 'border-slate-200 hover:border-slate-300'
        } ${isLoading ? 'opacity-70 cursor-wait' : ''} ${className}`}
      >
        <div className="flex-1 truncate text-right">
          {selectedLabel ? (
            <span className="text-slate-900 font-bold">{selectedLabel}</span>
          ) : (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
          {value && !required && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title="مسح الاختيار"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="absolute z-50 top-[calc(100%+4px)] right-0 left-0 bg-white border-2 border-indigo-100 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          style={{ maxHeight: '280px' }}
        >
          {/* Search Input Box */}
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0 mr-1" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-xs font-bold text-slate-800 outline-none placeholder:text-slate-400"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setIsOpen(false);
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0].value);
                  } else if (customOptionLabel) {
                    handleSelect(customOptionValue);
                  }
                }
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm('');
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50 py-1" role="listbox">
            {isLoading ? (
              <div className="p-4 text-center text-xs font-bold text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                جاري تحميل الخيارات من قاعدة البيانات...
              </div>
            ) : filteredOptions.length === 0 && !customOptionLabel ? (
              <div className="p-4 text-center text-xs text-slate-500 font-semibold">
                لا توجد نتائج مطابقة لـ "{searchTerm}"
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value || value === opt.label;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-right px-3.5 py-2.5 text-xs font-bold flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-800 hover:bg-slate-100'
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0 ml-1" />}
                  </button>
                );
              })
            )}

            {/* Custom / "Other" / "New Product" Option at bottom */}
            {customOptionLabel && (
              <button
                type="button"
                onClick={() => handleSelect(customOptionValue)}
                className={`w-full text-right px-3.5 py-2.5 text-xs font-black flex items-center justify-between border-t border-indigo-100 transition-colors ${
                  value === customOptionValue
                    ? 'bg-indigo-100 text-indigo-900 font-black'
                    : 'bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-600 stroke-[3]" />
                  {customOptionLabel}
                </span>
                {value === customOptionValue && <Check className="w-4 h-4 text-indigo-700 shrink-0 ml-1" />}
              </button>
            )}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-xs font-semibold text-rose-600 animate-fade-in">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}

export default SearchableCombobox;
