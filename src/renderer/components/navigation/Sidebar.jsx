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

const ALL_NAV_ITEMS = [
  { to: '/dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, perm: 'Dashboard.html', category: 'العامة' },
  { to: '/pos', label: 'الكاشير', icon: ShoppingCart, perm: 'index.html', category: 'العامة' },
  { to: '/rentals', label: 'التأجير', icon: Sparkles, perm: 'Rentals.html', category: 'العامة' },
  { to: '/alterations', label: 'التعديلات', icon: Ruler, perm: 'Alterations.html', category: 'العامة' },
  { to: '/tailoring', label: 'تفصيل', icon: Scissors, perm: 'Tailoring.html', category: 'العامة' },
  { to: '/customers', label: 'العملاء', icon: Users, perm: 'Customers.html', category: 'العمليات والمخزون' },
  {
    to: '/suppliers',
    label: 'المخزون والموردين',
    adminLabel: 'المخزون والموردين',
    staffLabel: 'إدارة المخزون',
    icon: Package,
    perm: 'Suppliers.html',
    category: 'العمليات والمخزون',
  },
  { to: '/rental-inventory', label: 'مخزون التأجير', icon: Archive, perm: 'RentalInventory.html', category: 'العمليات والمخزون' },
  { to: '/worn-products', label: 'المنتجات المهترئة', icon: AlertTriangle, perm: 'WornProducts.html', category: 'العمليات والمخزون' },
  { to: '/employees', label: 'الموظفين', icon: UserCheck, perm: 'Employees.html', category: 'الإدارة والتقارير' },
  { to: '/expenses', label: 'المصاريف', icon: Receipt, perm: 'Expenses.html', category: 'الإدارة والتقارير' },
  { to: '/reports', label: 'التقارير', icon: BarChart3, perm: 'Reports.html', category: 'الإدارة والتقارير' },
  { to: '/barcodes', label: 'طباعة الباركود', icon: Barcode, perm: 'Barcodes.html', category: 'الإدارة والتقارير' },
  { to: '/settings', label: 'الإعدادات', icon: Settings, perm: 'Settings.html', category: 'الإدارة والتقارير' },
];

export function Sidebar({ mobileOpen, setMobileOpen, isPinned = true, onTogglePin }) {
  const { user, logout, isAdmin } = useAuth();
  const { activeBranch, branches } = useBranch();
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = React.useRef(null);

  const displayBranch = React.useMemo(() => {
    if (activeBranch) return activeBranch;
    const targetId = user?.branch_id;
    if (targetId && branches?.length) {
      return branches.find((b) => b.id?.toString() === targetId.toString()) || null;
    }
    return branches?.find((b) => b.is_main_warehouse) || branches?.[0] || null;
  }, [activeBranch, user?.branch_id, branches]);

  const branchLogo = displayBranch?.logo_url || '/logos/app-icon.png';
  const branchName = displayBranch?.name || 'Bebyoon Center';

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (!isPinned) {
      hoverTimeoutRef.current = setTimeout(() => {
        setIsHovered(true);
      }, 40);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 120);
  };

  const isExpanded = isPinned || isHovered;

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
    const items = ALL_NAV_ITEMS.map((item) => ({
      ...item,
      label: item.to === '/suppliers' ? (isAdmin ? item.adminLabel : item.staffLabel) : item.label,
    }));
    if (user.role === 'admin') return items;
    if (!Array.isArray(userPerms)) return [];
    return items.filter((item) => userPerms.includes(item.perm));
  }, [user, userPerms, isAdmin]);

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`fixed top-0 lg:top-3 right-0 lg:right-3 h-screen lg:h-[calc(100vh-24px)] lg:rounded-[28px] bg-[#151515] text-[#E5E5E5] transition-[width,box-shadow] duration-200 ease-out flex flex-col border border-neutral-800/80 overflow-hidden will-change-[width] ${
          mobileOpen
            ? 'w-72 h-screen top-0 right-0 rounded-none z-[90]'
            : isPinned
            ? 'w-72 shadow-2xl z-[80]'
            : isHovered
            ? 'w-72 shadow-2xl z-[90]'
            : 'w-20 shadow-lg z-[80]'
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 flex items-center px-3.5 border-b border-neutral-800/70 shrink-0 overflow-hidden relative">
          {/* Logo Button and Brand Name */}
          <div className={`flex items-center transition-all duration-200 ${isExpanded ? 'gap-3 flex-1' : 'justify-center w-full'}`}>
            <button
              onClick={onTogglePin}
              className="w-11 h-11 rounded-2xl bg-white flex items-center justify-center p-1.5 shadow-md shadow-white/5 shrink-0 overflow-hidden hover:ring-2 hover:ring-[#F1B6D8] transition-all cursor-pointer"
              title={isPinned ? 'إلغاء تثبيت القائمة (فتح عند التحويم)' : 'تثبيت القائمة مفتوحة دائماً'}
            >
              <img
                src={branchLogo}
                alt={branchName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  if (!e.currentTarget.dataset.fallback) {
                    e.currentTarget.dataset.fallback = 'true';
                    e.currentTarget.src = '/logos/app-icon.png';
                  } else {
                    e.currentTarget.style.display = 'none';
                  }
                }}
              />
            </button>

            {isExpanded && (
              <div className="whitespace-nowrap overflow-hidden select-none flex-1">
                <h1 className="text-base font-extrabold tracking-tight text-white font-display flex items-center gap-1.5">
                  <span>{branchName}</span>
                  <span className="w-2 h-2 rounded-full bg-[#F1B6D8] inline-block shadow-sm"></span>
                </h1>
                <p className="text-[11px] font-medium text-neutral-400 truncate">
                  {displayBranch ? (displayBranch.is_main_warehouse ? 'المخزن الرئيسي' : (displayBranch.location || displayBranch.name)) : 'المركز الرئيسي'}
                </p>
              </div>
            )}
          </div>

          {/* Action Buttons: Pin & Mobile Close */}
          {isExpanded && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={onTogglePin}
                className={`hidden lg:flex p-1.5 rounded-xl transition-colors cursor-pointer ${
                  isPinned ? 'text-[#F1B6D8] bg-neutral-800/90' : 'text-neutral-400 hover:text-white hover:bg-neutral-800/80'
                }`}
                title={isPinned ? 'إلغاء التثبيت (فتح عند التحويم)' : 'تثبيت القائمة مفتوحة'}
              >
                <Pin className={`w-4 h-4 transition-transform duration-200 ${isPinned ? 'rotate-45' : ''}`} />
              </button>

              <button
                onClick={() => setMobileOpen(false)}
                className="lg:hidden p-1.5 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="mt-3 px-3 flex flex-col gap-1 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const prevCategory = index > 0 ? navItems[index - 1].category : null;
            const isNewCategory = item.category && item.category !== prevCategory;

            return (
              <React.Fragment key={item.to}>
                {isNewCategory && isExpanded && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-wider text-neutral-500 font-display select-none">
                    {item.category}
                  </div>
                )}
                <NavLink
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  title={!isExpanded ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-2xl font-bold transition-colors duration-150 select-none group relative ${
                      isExpanded ? 'px-2' : 'justify-center'
                    } ${
                      isActive
                        ? 'bg-neutral-800/90 text-white shadow-sm ring-1 ring-white/10'
                        : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <div className="w-12 h-11 flex items-center justify-center shrink-0">
                        <Icon className={`w-5 h-5 transition-transform group-hover:scale-105 ${isActive ? 'text-[#F1B6D8]' : ''}`} />
                      </div>
                      {isExpanded && (
                        <span className="text-xs tracking-wide whitespace-nowrap overflow-hidden flex-1">
                          {item.label}
                        </span>
                      )}
                      {isActive && isExpanded && (
                        <span className="w-1.5 h-5 rounded-full bg-[#F1B6D8] absolute left-2" />
                      )}
                    </>
                  )}
                </NavLink>
              </React.Fragment>
            );
          })}
        </nav>

        {/* Footer Logout Button */}
        <div className="p-3 border-t border-neutral-800/70 shrink-0">
          <button
            onClick={logout}
            title={!isExpanded ? 'تسجيل الخروج' : undefined}
            className={`w-full flex items-center rounded-2xl text-neutral-400 hover:text-rose-300 hover:bg-rose-500/10 font-bold transition-colors group cursor-pointer ${
              isExpanded ? 'px-3 gap-3' : 'justify-center'
            }`}
          >
            <div className="w-12 h-11 flex items-center justify-center shrink-0">
              <LogOut className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
            </div>
            {isExpanded && (
              <span className="text-xs tracking-wide whitespace-nowrap overflow-hidden">
                تسجيل الخروج
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;

