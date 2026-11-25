import React, { useEffect, useState } from 'react';
import { X, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, ImageOff } from 'lucide-react';

export default function ImageLightboxModal({
  isOpen,
  items = [],
  initialIndex = 0,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoomed, setZoomed] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const safeIdx = Math.max(0, Math.min(initialIndex, Math.max(0, items.length - 1)));
      setCurrentIndex(safeIdx);
      setZoomed(false);
      setImgError(false);
    }
  }, [isOpen, initialIndex, items.length]);

  useEffect(() => {
    setImgError(false);
    setZoomed(false);
  }, [currentIndex]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowRight' && items.length > 1) {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
      } else if (e.key === 'ArrowLeft' && items.length > 1) {
        setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, items.length, onClose]);

  if (!isOpen || !items.length) return null;

  const current = items[currentIndex] || items[0];
  if (!current) return null;

  const goPrev = (e) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  };

  const goNext = (e) => {
    e?.stopPropagation();
    setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
      dir="rtl"
    >
      {/* Top Bar */}
      <div
        className="absolute top-4 inset-x-4 flex items-center justify-between gap-3 z-20 pointer-events-none"
      >
        <div className="pointer-events-auto flex items-center gap-2 bg-black/55 text-white px-3.5 py-2 rounded-xl backdrop-blur-md border border-white/10 max-w-[75vw]">
          <span className="font-black text-sm truncate">{current.title || 'معاينة الصورة'}</span>
          {current.subtitle && (
            <span className="text-xs text-slate-300 font-bold truncate hidden sm:inline">
              • {current.subtitle}
            </span>
          )}
          {items.length > 1 && (
            <span className="text-xs font-mono bg-white/15 px-2 py-0.5 rounded-md shrink-0">
              {currentIndex + 1} / {items.length}
            </span>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed((z) => !z);
            }}
            className="w-10 h-10 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
            title={zoomed ? 'تصغير' : 'تكبير'}
          >
            {zoomed ? <ZoomOut className="w-5 h-5" /> : <ZoomIn className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
            }}
            className="w-10 h-10 rounded-full bg-black/55 hover:bg-rose-600 text-white flex items-center justify-center border border-white/15 transition-colors cursor-pointer"
            title="إغلاق (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation Arrows */}
      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center border border-white/15 transition-all cursor-pointer"
            title="السابق"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={goNext}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center border border-white/15 transition-all cursor-pointer"
            title="التالي"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        </>
      )}

      {/* Main Image Container */}
      <div
        className="relative max-w-[92vw] max-h-[84vh] flex items-center justify-center overflow-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {!imgError && current.src ? (
          <img
            src={current.src}
            alt={current.title || 'صورة القطعة'}
            onError={() => setImgError(true)}
            onClick={() => setZoomed((z) => !z)}
            className={`rounded-2xl shadow-2xl border border-white/10 bg-slate-900/60 transition-transform duration-200 select-none ${
              zoomed
                ? 'max-w-none max-h-none w-auto h-auto scale-125 cursor-zoom-out'
                : 'max-w-[90vw] max-h-[80vh] object-contain cursor-zoom-in'
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 p-10 rounded-2xl bg-slate-900/90 border border-white/10 text-slate-300">
            <ImageOff className="w-12 h-12 text-slate-500" />
            <p className="text-sm font-bold">تعذر تحميل الصورة</p>
          </div>
        )}
      </div>
    </div>
  );
}
