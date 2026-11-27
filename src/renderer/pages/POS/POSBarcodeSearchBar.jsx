import React, { useState, useEffect, useRef } from 'react';
import { Barcode, X } from 'lucide-react';

const SEARCH_DEBOUNCE_MS = 160;

/**
 * Isolated barcode and text search input for POS.
 * Keeps keystrokes and rapid HID barcode scanner bursts local so the main POS catalog never re-renders per character.
 */
const POSBarcodeSearchBar = React.memo(function POSBarcodeSearchBar({
  inputRef,
  externalQuery = '',
  onDebouncedChange,
  onBarcodeSubmit,
}) {
  const normalizedExternal = externalQuery || '';
  const [value, setValue] = useState(normalizedExternal);
  const debounceTimerRef = useRef(null);
  const lastPropagatedRef = useRef(normalizedExternal);

  const clearPendingTimer = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, []);

  // Sync only when external state changes outside our own debounced emissions (e.g. reset filters, URL query)
  useEffect(() => {
    if (normalizedExternal !== lastPropagatedRef.current) {
      clearPendingTimer();
      lastPropagatedRef.current = normalizedExternal;
      setValue(normalizedExternal);
    }
  }, [normalizedExternal]);

  const handleChange = (e) => {
    const nextVal = e.target.value;
    setValue(nextVal);
    clearPendingTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      lastPropagatedRef.current = nextVal;
      onDebouncedChange?.(nextVal);
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleKeyDown = async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearPendingTimer();

    const rawValue = inputRef?.current?.value ?? value;
    const code = String(rawValue || '').trim();
    if (!code) return;

    const consumed = await onBarcodeSubmit?.(code);
    if (consumed) {
      lastPropagatedRef.current = '';
      setValue('');
      if (normalizedExternal !== '') {
        onDebouncedChange?.('');
      }
      inputRef?.current?.focus();
    } else {
      lastPropagatedRef.current = rawValue;
      onDebouncedChange?.(rawValue);
    }
  };

  const handleClear = () => {
    clearPendingTimer();
    lastPropagatedRef.current = '';
    setValue('');
    onDebouncedChange?.('');
    inputRef?.current?.focus();
  };

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
      <div className="relative flex-1">
        <Barcode className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="امسح الباركود، أو ابحث بالاسم، الكود..."
          className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pr-11 pl-4 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:bg-white transition-all"
          autoFocus
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
});

export default POSBarcodeSearchBar;
