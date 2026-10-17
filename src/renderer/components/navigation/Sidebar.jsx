import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Sparkles,
  Scissors,
  Ruler,
  Users,
  Package,
  Archive,
  AlertTriangle,
  UserCheck,
  Receipt,
  BarChart3,
  Barcode,
  Settings,
  LogOut,
  Pin,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';

export function Sidebar({ mobileOpen, setMobileOpen }) {
  const { user, logout, isAdmin } = useAuth();
  const { activeBranch } = useBranch();
  const [locked, setLocked] = useState(() => localStorage.getItem('sidebarLocked') === 'true');
  const [hovered, setHovered] = useState(false);

  const isExpanded = locked || hovered;

  const toggleLock = () => {
    const next = !locked;
    setLocked(next);
    localStorage.setItem('sidebarLocked', next ? 'true' : 'false');
  };

  const allNavItems = [
    { to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, perm: 'Dashboard.html' },
    { to: '/pos', label: 'الكاشير', icon: ShoppingCart, perm: 'index.html' },
    { to: '/rentals', label: 'التأجير', icon: Sparkles, perm: 'Rentals.html' },
    { to: '/alterations', label: 'التعديلات', icon: Ruler, perm: 'Alterations.html' },
    { to: '/tailoring', label: 'تفصيل', icon: Scissors, perm: 'Tailoring.html' },
    { to: '/customers', label: 'العملاء', icon: Users, perm: 'Customers.html' },
    {
      to: '/suppliers',
      label: isAdmin ? 'المخزون والموردين' : 'إدارة المخزون',
      icon: Package,
      perm: 'Suppliers.html',
    },
    { to: '/rental-inventory', label: 'مخزون التأجير', icon: Archive, perm: 'RentalInventory.html' },
    { to: '/worn-products', label: 'المنتجات المهترئة', icon: AlertTriangle, perm: 'WornProducts.html' },
    { to: '/employees', label: 'الموظفين', icon: UserCheck, perm: 'Employees.html' },
    { to: '/expenses', label: 'المصاريف', icon: Receipt, perm: 'Expenses.html' },
    { to: '/reports', label: 'التقارير', icon: BarChart3, perm: 'Reports.html' },
    { to: '/barcodes', label: 'طباعة الباركود', icon: Barcode, perm: 'Barcodes.html' },
    { to: '/settings', label: 'الإعدادات', icon: Settings, perm: 'Settings.html' },
  ];

  const userPerms = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return null; // all
    if (Array.isArray(user.permissions)) return user.permissions;
    try {
      return JSON.parse(user.permissions || '[]');
    } catch {
      return [];
    }
  }, [user]);

  const navItems = React.useMemo(() => {
    if (!user) return [];
    if (user.role === 'admin') return allNavItems;
    if (!Array.isArray(userPerms)) return [];
    return allNavItems.filter((item) => userPerms.includes(item.perm));
  }, [user, userPerms]);

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[70] lg:hidden transition-opacity"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main Sidebar */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed lg:sticky top-0 h-screen bg-slate-900 text-white z-[80] transition-all duration-300 flex flex-col shadow-2xl border-l border-slate-800 ${
          mobileOpen
            ? 'right-0 w-72'
            : 'max-lg:-right-full ' + (isExpanded ? 'w-72' : 'w-20')
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 px-5 flex items-center justify-between border-b border-slate-800/80 shrink-0 overflow-hidden">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-md shadow-white/5 shrink-0 overflow-hidden">
              <img
                src="/logos/app-icon.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>
            <div
              className={`transition-opacity duration-300 whitespace-nowrap overflow-hidden ${
                isExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'
              }`}
            >
              <h1 className="text-lg font-black tracking-tight text-white">Bebyoon Center</h1>
              <p className="text-[11px] font-semibold text-slate-400">
                {activeBranch?.name || 'المركز الرئيسي'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Desktop Pin Button */}
            <button
              onClick={toggleLock}
              className={`hidden lg:flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all ${
                isExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
              } ${locked ? 'text-indigo-400 bg-slate-800' : ''}`}
              title={locked ? 'إلغاء تثبيت القائمة' : 'تثبيت القائمة'}
            >
              <Pin className={`w-4 h-4 transform ${locked ? 'rotate-45' : ''}`} />
            </button>

            {/* Mobile Close Button */}
            <button
              onClick={() => setMobileOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="mt-3 px-3 flex flex-col gap-1.5 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center rounded-xl font-bold transition-all duration-200 select-none group ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/80'
                  }`
                }
              >
                <div className="w-14 h-12 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                </div>
                <span
                  className={`text-sm tracking-wide whitespace-nowrap overflow-hidden transition-opacity duration-300 ${
                    isExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'
                  }`}
                >
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        {/* Footer Logout Button */}
        <div className="p-3 border-t border-slate-800/80 shrink-0">
          <button
            onClick={logout}
            className="w-full flex items-center rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold transition-all group"
          >
            <div className="w-14 h-12 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            </div>
            <span
              className={`text-sm tracking-wide whitespace-nowrap overflow-hidden transition-opacity duration-300 ${
                isExpanded ? 'opacity-100' : 'opacity-0 lg:hidden'
              }`}
            >
              تسجيل الخروج
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
