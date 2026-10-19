import React from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Home } from 'lucide-react';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-20 h-20 rounded-3xl bg-[#151515] border border-[#24221F] flex items-center justify-center text-white mb-6 shadow-sm">
        <span className="text-3xl font-black">404</span>
      </div>
      <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
        الصفحة غير موجودة
      </h1>
      <p className="text-sm font-semibold text-slate-500 max-w-sm mt-2 mb-8">
        عذراً، المسار الذي تحاول الوصول إليه غير موجود أو تم نقله.
      </p>
      <Button
        variant="primary"
        size="lg"
        icon={Home}
        onClick={() => navigate('/dashboard')}
      >
        العودة إلى لوحة التحكم
      </Button>
    </div>
  );
}

export default NotFound;
