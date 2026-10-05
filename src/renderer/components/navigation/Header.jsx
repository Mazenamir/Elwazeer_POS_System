import React, { useState, useEffect } from 'react';
import { Menu, Building2, User, Clock, ShieldCheck, ZoomIn, ZoomOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';

export function Header({ onToggleMobileMenu }) {
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();
  const [timeStr, setTimeStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('ar-EG', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-40 px-4 sm:px-8 flex items-center justify-between shadow-sm">
      {/* Right side: Mobile Menu Button & Branch Picker */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Branch Selector (Admin or Branch User) */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          {isAdmin ? (
            <select
              value={activeBranchId}
              onChange={(e) => selectBranch(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 transition-colors cursor-pointer shadow-sm"
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id.toString()}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
              {branches.find((b) => b.id.toString() === activeBranchId.toString())?.name ||
                'الفرع الحالي'}
            </div>
          )}
        </div>
      </div>

      {/* Left side: Clock, Status, User Profile */}
      <div className="flex items-center gap-3 sm:gap-6">
        {/* Live Clock */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-slate-600 text-xs font-bold select-none">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span dir="ltr">{timeStr}</span>
        </div>

        {/* Zoom Controls (Electron / Desktop) */}
        <div className="hidden sm:flex items-center gap-1 bg-slate-100/80 border border-slate-200 rounded-xl p-1">
          <button
            onClick={() => window.postMessage({ type: 'zoom-in' }, '*')}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all shadow-none hover:shadow-sm"
            title="تكبير الشاشة"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => window.postMessage({ type: 'zoom-out' }, '*')}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all shadow-none hover:shadow-sm"
            title="تصغير الشاشة"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Online Status Pill */}
        <div className="hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 -mr-4"></span>
          <span>متصل</span>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-3 pr-3 sm:border-r border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-900 to-indigo-950 text-white flex items-center justify-center font-black text-sm shadow-md shadow-slate-900/10 shrink-0">
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="hidden sm:block text-right">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-black text-slate-900 leading-none">
                {user?.name || user?.username || 'مستخدم النظام'}
              </span>
              {isAdmin && <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {isAdmin ? 'مدير النظام' : 'مستخدم فرع'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
