import React from 'react';
import { PackageOpen } from 'lucide-react';
import Button from './Button';

export function EmptyState({
  title = 'لا توجد بيانات',
  description = 'لم يتم العثور على أي عناصر مطابقة في الوقت الحالي',
  icon: Icon = PackageOpen,
  actionText,
  onAction,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center select-none ${className}`}>
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-base md:text-lg font-black text-slate-700">{title}</h3>
      <p className="text-xs md:text-sm font-semibold text-slate-400 mt-1 max-w-sm">{description}</p>
      {actionText && onAction && (
        <Button onClick={onAction} variant="primary" size="sm" className="mt-4">
          {actionText}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;
