import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import Button from '../common/Button';

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100, 'all'],
  className = '',
}) {
  const isAll = pageSize === 'all';
  const startItem = isAll ? 1 : Math.min((currentPage - 1) * pageSize + 1, totalItems || 0);
  const endItem = isAll ? totalItems : Math.min(currentPage * pageSize, totalItems || 0);

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl select-none ${className}`}
    >
      <div className="flex items-center gap-3 text-xs font-bold text-slate-500">
        <span>
          عرض <span className="text-slate-900">{totalItems > 0 ? startItem : 0}</span> إلى{' '}
          <span className="text-slate-900">{endItem}</span> من إجمالي{' '}
          <span className="text-indigo-600 font-black">{totalItems || 0}</span> عنصر
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 mr-2">
            <span>لكل صفحة:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                onPageSizeChange(val);
              }}
              className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 outline-none focus:border-indigo-600"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt === 'all' ? 'الكل' : opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(1)}
            disabled={currentPage <= 1}
            title="الصفحة الأولى"
            className="!px-2 !py-1.5"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            title="الصفحة السابقة"
            className="!px-2.5 !py-1.5 text-xs font-bold"
          >
            <ChevronRight className="w-4 h-4" />
            <span className="hidden sm:inline">السابق</span>
          </Button>

          <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-extrabold text-indigo-600">
            {currentPage} / {totalPages}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            title="الصفحة التالية"
            className="!px-2.5 !py-1.5 text-xs font-bold"
          >
            <span className="hidden sm:inline">التالي</span>
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage >= totalPages}
            title="الصفحة الأخيرة"
            className="!px-2 !py-1.5"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default Pagination;
