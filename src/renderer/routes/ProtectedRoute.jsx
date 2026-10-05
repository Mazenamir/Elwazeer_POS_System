import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, adminOnly = false, permission = null }) {
  const { isAuthenticated, loading, isAdmin, hasPermission, setupRequired } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <span className="text-sm font-bold text-slate-300">جاري التحقق من جلسة المستخدم...</span>
      </div>
    );
  }

  if (setupRequired && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && !isAdmin) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <h2 className="text-xl font-black text-rose-600">غير مصرح لك بدخول هذه الصفحة</h2>
        <p className="text-sm text-slate-500 mt-2">هذه الشاشة مخصصة لإدارة النظام فقط.</p>
      </div>
    );
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
        <h2 className="text-xl font-black text-rose-600">صلاحيات غير كافية</h2>
        <p className="text-sm text-slate-500 mt-2">ليس لديك صلاحية لعرض هذا القسم.</p>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
