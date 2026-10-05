import React from 'react';
import { Loader2 } from 'lucide-react';

export function LoadingState({ message = 'جاري تحميل البيانات...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-slate-400 gap-3 select-none ${className}`}>
      <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      <p className="text-sm font-bold text-slate-500">{message}</p>
    </div>
  );
}

export default LoadingState;
