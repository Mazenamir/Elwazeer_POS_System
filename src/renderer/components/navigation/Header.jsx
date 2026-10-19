import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu,
  Building2,
  User,
  Clock,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Server,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Settings,
  X,
  Activity,
  DownloadCloud,
  Search,
  Bell,
  Package,
  Users,
  Receipt,
  Truck,
  UserCheck,
  Loader2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import { NotificationDropdown } from './NotificationDropdown';

const LiveClock = React.memo(function LiveClock() {
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
    <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFFDF9] border border-[#E6DECD] text-[#777266] text-xs font-bold select-none shadow-sm">
      <Clock className="w-3.5 h-3.5 text-[#9E988B]" />
      <span dir="ltr">{timeStr}</span>
    </div>
  );
});

export function Header({ onToggleMobileMenu }) {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchCategory, setSearchCategory] = useState('all');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchContainerRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // Close search dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search query
  useEffect(() => {
    const query = globalSearch.trim();
    if (!query) {
      setSearchResults(null);
      setShowSearchDropdown(false);
      setSearchLoading(false);
      setHighlightedIndex(-1);
      return;
    }

    setSearchLoading(true);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const branchParam = activeBranchId && activeBranchId !== 'all' ? `&branch_id=${activeBranchId}` : '';
        const res = await api.get(`/search?q=${encodeURIComponent(query)}${branchParam}`);
        setSearchResults(res);
        setShowSearchDropdown(true);
        setHighlightedIndex(0);
      } catch (err) {
        console.error('Search fetch error:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 180);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [globalSearch, activeBranchId]);

  // Flattened results for keyboard navigation & active tab
  const flattenedResults = useMemo(() => {
    if (!searchResults) return [];
    const list = [];
    if (searchCategory === 'all' || searchCategory === 'products') {
      (searchResults.products || []).forEach((item) => list.push({ ...item, _type: 'product' }));
    }
    if (searchCategory === 'all' || searchCategory === 'customers') {
      (searchResults.customers || []).forEach((item) => list.push({ ...item, _type: 'customer' }));
    }
    if (searchCategory === 'all' || searchCategory === 'orders') {
      (searchResults.orders || []).forEach((item) => list.push({ ...item, _type: 'order' }));
    }
    if (searchCategory === 'all' || searchCategory === 'employees') {
      (searchResults.employees || []).forEach((item) => list.push({ ...item, _type: 'employee' }));
    }
    if (searchCategory === 'all' || searchCategory === 'suppliers') {
      (searchResults.suppliers || []).forEach((item) => list.push({ ...item, _type: 'supplier' }));
    }
    return list;
  }, [searchResults, searchCategory]);

  const handleSelectItem = useCallback((item) => {
    setShowSearchDropdown(false);
    if (!item) return;

    switch (item._type) {
      case 'product':
        navigate(`/suppliers?tab=inventory&search=${encodeURIComponent(item.barcode || item.name)}`);
        break;
      case 'customer':
        navigate(`/customers?search=${encodeURIComponent(item.phone || item.name)}`);
        break;
      case 'order':
        navigate(`/pos?tab=history&orderId=${encodeURIComponent(item.branch_invoice_number || item.id)}`);
        break;
      case 'employee':
        navigate(`/employees?search=${encodeURIComponent(item.name || item.phone)}`);
        break;
      case 'supplier':
        navigate(`/suppliers?tab=suppliers&search=${encodeURIComponent(item.name || item.code || '')}`);
        break;
      default:
        break;
    }
  }, [navigate]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showSearchDropdown && globalSearch.trim()) {
        setShowSearchDropdown(true);
        return;
      }
      setHighlightedIndex((prev) => (prev < flattenedResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : flattenedResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && flattenedResults[highlightedIndex]) {
        handleSelectItem(flattenedResults[highlightedIndex]);
      } else if (flattenedResults.length > 0) {
        handleSelectItem(flattenedResults[0]);
      } else if (globalSearch.trim()) {
        setShowSearchDropdown(false);
        const isNum = /^\d+$/.test(globalSearch.trim());
        if (isNum && globalSearch.trim().length <= 4) {
          navigate(`/pos?tab=history&orderId=${encodeURIComponent(globalSearch.trim())}`);
        } else if (isNum && globalSearch.trim().length >= 8) {
          navigate(`/customers?search=${encodeURIComponent(globalSearch.trim())}`);
        } else {
          navigate(`/customers?search=${encodeURIComponent(globalSearch.trim())}`);
        }
      }
    } else if (e.key === 'Escape') {
      setShowSearchDropdown(false);
    }
  };

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncError, setSyncError] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  // Notification Center state
  const { toast } = useToast();
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationStats, setNotificationStats] = useState({});
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationMenuRef = React.useRef(null);
  const knownNotificationIdsRef = React.useRef(null);
  const initialNotifLoadedRef = React.useRef(false);

  // Sync Diagnostics & Configuration Modal state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [diagnostics, setDiagnostics] = useState(null);
  const [loadingDiag, setLoadingDiag] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState('');
  const [branchIdInput, setBranchIdInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState(null);
  const [pullingCatalog, setPullingCatalog] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState(null);
  const [webZoom, setWebZoom] = useState(() => Number(window.localStorage.getItem('app-zoom')) || 1);

  const changeZoom = (delta) => {
    if (window.electronAPI?.changeZoom) {
      window.electronAPI.changeZoom(delta);
      return;
    }

    const nextZoom = Math.min(2, Math.max(0.5, webZoom + delta));
    document.documentElement.style.zoom = String(nextZoom);
    window.localStorage.setItem('app-zoom', String(nextZoom));
    setWebZoom(nextZoom);
  };

  useEffect(() => {
    if (!window.electronAPI?.changeZoom && webZoom !== 1) {
      document.documentElement.style.zoom = String(webZoom);
    }
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const data = await api.get('/sync/status');
      setSyncStatus(data);
    } catch {}
  };

  const loadDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const data = await api.get('/sync/diagnostics');
      setDiagnostics(data);
      if (data?.server_url) setServerUrlInput(data.server_url);
      if (data?.branch_id) setBranchIdInput(String(data.branch_id));
    } catch (e) {
      console.error('Failed to load diagnostics:', e);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleOpenModal = () => {
    setShowSyncModal(true);
    setConfigFeedback(null);
    setCatalogFeedback(null);
    loadDiagnostics();
  };

  const handleManualSync = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(false);
    setSyncMsg('جاري الاتصال والمزامنة...');
    try {
      const res = await api.post('/sync/cycle');
      if (res?.ok) {
        setSyncMsg(res.message || 'تمت المزامنة بنجاح!');
        setSyncError(false);
      } else {
        setSyncMsg(res?.message || 'تعذر إتمام المزامنة');
        setSyncError(!res?.partial);
      }
    } catch (err) {
      const msg = err?.data?.message || err?.message || 'تعذر الاتصال بالخادم';
      setSyncMsg(msg);
      setSyncError(true);
    } finally {
      setSyncing(false);
      fetchSyncStatus();
      if (showSyncModal) loadDiagnostics();
      setTimeout(() => {
        setSyncMsg('');
        setSyncError(false);
      }, 4500);
    }
  };

  const handleSaveConfig = async (e) => {
    if (e) e.preventDefault();
    setSavingConfig(true);
    setConfigFeedback(null);
    try {
      const res = await api.post('/sync/configure', {
        serverUrl: serverUrlInput,
        branchId: branchIdInput,
      });
      setConfigFeedback({
        success: Boolean(res.ok && res.test_ping),
        message: res.message || 'تم حفظ الإعدادات',
      });
      fetchSyncStatus();
      loadDiagnostics();
    } catch (err) {
      setConfigFeedback({
        success: false,
        message: err?.data?.message || err?.message || 'فشل حفظ الإعدادات',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handlePullCatalog = async () => {
    if (pullingCatalog) return;
    setPullingCatalog(true);
    setCatalogFeedback(null);
    try {
      const res = await api.post('/sync/pull');
      if (res?.ok) {
        setCatalogFeedback({
          success: true,
          message: `تم تحديث البيانات بنجاح (${res.counts?.inventory || 0} صنف، ${res.counts?.users || 0} مستخدم)`,
        });
      } else {
        setCatalogFeedback({
          success: false,
          message: res?.error || 'تعذر سحب البيانات من السيرفر',
        });
      }
      fetchSyncStatus();
      loadDiagnostics();
    } catch (err) {
      setCatalogFeedback({
        success: false,
        message: err?.data?.message || err?.message || 'فشل تحديث البيانات',
      });
    } finally {
      setPullingCatalog(false);
    }
  };

  const fetchNotifications = React.useCallback(async (isPolling = false) => {
    try {
      if (!isPolling && !initialNotifLoadedRef.current) {
        setLoadingNotifications(true);
      }
      const data = await api.get('/notifications');
      initialNotifLoadedRef.current = true;
      const list = data?.notifications || [];
      const unread = data?.unreadCount || 0;
      setNotifications(list);
      setUnreadCount(unread);
      setNotificationStats(data?.stats || {});

      // Background Pop-up Toast Notifications for newly detected events
      const currentIds = new Set(list.map((n) => n.id));
      if (knownNotificationIdsRef.current === null) {
        // Initial load: populate known IDs without spamming alerts
        knownNotificationIdsRef.current = currentIds;
      } else {
        // Notify for any new unread notification
        list.forEach((n) => {
          if (!knownNotificationIdsRef.current.has(n.id) && !n.read) {
            knownNotificationIdsRef.current.add(n.id);
            if (n.category === 'branch') {
              toast.warning(n.message);
            } else if (n.category === 'transfer') {
              toast.info(n.message);
            } else {
              toast.warning(n.message);
            }
          }
        });

        // Reconcile and prune IDs that are no longer active (e.g. branch reconnected)
        // so that if a branch disconnects again, a toast will fire!
        for (const id of knownNotificationIdsRef.current) {
          if (!currentIds.has(id)) {
            knownNotificationIdsRef.current.delete(id);
          }
        }
      }
    } catch (err) {
      console.warn('[Header] Failed to fetch notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, [toast]);

  const handleMarkAsRead = async (id) => {
    try {
      await api.post('/notifications/read', { ids: [id] });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.warn('Failed to mark notification as read:', e);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.post('/notifications/read', { all: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.warn('Failed to mark all as read:', e);
    }
  };

  const handleClearAll = async () => {
    try {
      await api.post('/notifications/clear', { all: true });
      setNotifications([]);
      setUnreadCount(0);
      setNotificationStats({ total: 0, unread: 0, branches: 0, transfers: 0, inventory: 0 });
    } catch (e) {
      console.warn('Failed to clear notifications:', e);
      // Fallback optimistic clear
      setNotifications([]);
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    fetchNotifications(false);
    const notifInterval = setInterval(() => {
      fetchNotifications(true);
    }, 15000);
    return () => clearInterval(notifInterval);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target)) {
        setShowNotificationDropdown(false);
      }
    }
    if (showNotificationDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showNotificationDropdown]);

  useEffect(() => {
    fetchSyncStatus();
    const statusInterval = setInterval(fetchSyncStatus, 20000);
    return () => clearInterval(statusInterval);
  }, []);

  const isOnline = syncStatus?.online !== false;

  return (
    <header className="h-20 bg-[#F8F2E4] border-b border-[#E6DECD] sticky top-0 z-40 px-4 sm:px-8 flex items-center justify-between shadow-[0_1px_3px_rgba(36,34,31,0.03)]">
      {/* Right side: Mobile Menu Button & Branch Picker */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 rounded-2xl bg-[#151515] text-white hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Branch Selector (Admin or Branch User) */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-[#F4D95B]/20 border border-[#F4D95B]/40 flex items-center justify-center text-[#24221F] shrink-0">
            <Building2 className="w-4 h-4" />
          </div>
          {isAdmin ? (
            <select
              value={activeBranchId}
              onChange={(e) => selectBranch(e.target.value)}
              className="bg-[#FFFDF9] border border-[#E6DECD] rounded-2xl px-3.5 py-1.5 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors cursor-pointer shadow-sm hover:border-[#D4CBB9]"
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id.toString()}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs font-bold text-[#24221F] bg-[#FFFDF9] px-3.5 py-1.5 rounded-2xl border border-[#E6DECD] shadow-sm">
              {branches.find((b) => b.id.toString() === activeBranchId.toString())?.name ||
                'الفرع الحالي'}
            </div>
          )}
        </div>
      </div>

      {/* Center Search Bar with Spotlight Dropdown */}
      <div className="hidden md:flex items-center flex-1 max-w-xl mx-6 relative" ref={searchContainerRef}>
        <div className="relative w-full flex items-center">
          <div className="absolute right-2 w-7 h-7 rounded-full bg-[#F1B6D8] text-[#24221F] flex items-center justify-center pointer-events-none shadow-sm z-10">
            {searchLoading ? (
              <Loader2 className="w-3.5 h-3.5 stroke-[2.5] animate-spin text-[#24221F]" />
            ) : (
              <Search className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
          </div>
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            onFocus={() => {
              if (globalSearch.trim()) setShowSearchDropdown(true);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder="بحث سريع ذكي (أصناف، عملاء، فواتير، موظفين)..."
            className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-full pr-11 pl-32 py-2 text-xs font-semibold text-[#24221F] placeholder:text-[#9E988B] focus:bg-white focus:border-[#151515] focus:ring-2 focus:ring-black/5 transition-all outline-none shadow-sm font-display"
          />

          {/* Clear button if text present */}
          {globalSearch.trim() && (
            <button
              type="button"
              onClick={() => {
                setGlobalSearch('');
                setSearchResults(null);
                setShowSearchDropdown(false);
              }}
              className="absolute left-28 p-1 text-[#9E988B] hover:text-[#24221F] rounded-full transition-colors cursor-pointer"
              title="مسح البحث"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Quick Filter Tags directly inside search input */}
          <div className="absolute left-2.5 flex items-center gap-1 text-[10px] text-[#777266] font-bold select-none font-display">
            <span className="text-[#9E988B] hidden xl:inline">في:</span>
            <button
              type="button"
              onClick={() => {
                const q = globalSearch.trim();
                navigate(q ? `/pos?tab=history&orderId=${encodeURIComponent(q)}` : '/pos');
              }}
              className="px-1.5 py-0.5 rounded-md hover:bg-[#FAF6ED] hover:text-[#24221F] transition-colors"
            >
              فواتير
            </button>
            <span className="text-[#E6DECD]">|</span>
            <button
              type="button"
              onClick={() => {
                const q = globalSearch.trim();
                navigate(q ? `/suppliers?tab=inventory&search=${encodeURIComponent(q)}` : '/suppliers?tab=inventory');
              }}
              className="px-1.5 py-0.5 rounded-md hover:bg-[#FAF6ED] hover:text-[#24221F] transition-colors"
            >
              منتجات
            </button>
            <span className="text-[#E6DECD]">|</span>
            <button
              type="button"
              onClick={() => {
                const q = globalSearch.trim();
                navigate(q ? `/customers?search=${encodeURIComponent(q)}` : '/customers');
              }}
              className="px-1.5 py-0.5 rounded-md hover:bg-[#FAF6ED] hover:text-[#24221F] transition-colors"
            >
              عملاء
            </button>
          </div>
        </div>

        {/* Floating Spotlight Dropdown */}
        {showSearchDropdown && (
          <div
            className="absolute top-full mt-2 w-[540px] max-w-[90vw] right-0 z-50 bg-[#FFFDF9] border border-[#E6DECD] rounded-3xl shadow-2xl overflow-hidden font-display flex flex-col animate-fade-in"
            style={{ direction: 'rtl' }}
          >
            {/* Spotlight Header & Category Tabs */}
            <div className="p-3 bg-[#FAF6ED]/80 border-b border-[#E6DECD] flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => setSearchCategory('all')}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                    searchCategory === 'all'
                      ? 'bg-[#151515] text-white shadow-sm'
                      : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                  }`}
                >
                  الكل ({searchResults?.total_matches || 0})
                </button>
                {searchResults?.products?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategory('products')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      searchCategory === 'products'
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                    }`}
                  >
                    منتجات ({searchResults.products.length})
                  </button>
                )}
                {searchResults?.customers?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategory('customers')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      searchCategory === 'customers'
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                    }`}
                  >
                    عملاء ({searchResults.customers.length})
                  </button>
                )}
                {searchResults?.orders?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategory('orders')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      searchCategory === 'orders'
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                    }`}
                  >
                    فواتير ({searchResults.orders.length})
                  </button>
                )}
                {searchResults?.employees?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategory('employees')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      searchCategory === 'employees'
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                    }`}
                  >
                    موظفون ({searchResults.employees.length})
                  </button>
                )}
                {searchResults?.suppliers?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategory('suppliers')}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      searchCategory === 'suppliers'
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F]'
                    }`}
                  >
                    موردون ({searchResults.suppliers.length})
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowSearchDropdown(false)}
                className="text-[#9E988B] hover:text-[#24221F] p-1 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Results Body */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-[#F0EAE0] custom-scrollbar p-1">
              {searchLoading && (
                <div className="py-8 text-center text-xs text-[#777266] flex flex-col items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#24221F]" />
                  <span>جاري البحث في قاعدة البيانات...</span>
                </div>
              )}

              {!searchLoading && flattenedResults.length === 0 && (
                <div className="py-8 text-center px-4">
                  <div className="w-10 h-10 rounded-full bg-[#FAF6ED] border border-[#E6DECD] mx-auto flex items-center justify-center text-[#9E988B] mb-2">
                    <Search className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-bold text-[#24221F]">لا توجد نتائج مطابقة لـ "{globalSearch}"</p>
                  <p className="text-[11px] text-[#777266] mt-1">تأكد من كتابة الاسم أو الباركود أو رقم الهاتف بشكل صحيح</p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSearchDropdown(false);
                        navigate(`/customers?search=${encodeURIComponent(globalSearch.trim())}`);
                      }}
                      className="px-3 py-1 bg-[#FAF6ED] hover:bg-[#F4EFE4] border border-[#E6DECD] rounded-full text-[11px] font-bold text-[#24221F] transition-colors"
                    >
                      البحث في العملاء
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSearchDropdown(false);
                        navigate(`/suppliers?tab=inventory&search=${encodeURIComponent(globalSearch.trim())}`);
                      }}
                      className="px-3 py-1 bg-[#FAF6ED] hover:bg-[#F4EFE4] border border-[#E6DECD] rounded-full text-[11px] font-bold text-[#24221F] transition-colors"
                    >
                      البحث في الأصناف
                    </button>
                  </div>
                </div>
              )}

              {!searchLoading && flattenedResults.map((item, idx) => {
                const isSelected = highlightedIndex === idx;

                if (item._type === 'product') {
                  return (
                    <div
                      key={`prod-${item.id}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isSelected ? 'bg-[#FAF6ED] ring-1 ring-[#151515]/10 shadow-sm' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#24221F] flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.category && (
                              <span className="text-[10px] font-bold text-[#777266] bg-white border border-[#E6DECD] px-1.5 py-0.2 rounded-md">
                                {item.category}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#777266] mt-0.5 flex items-center gap-2">
                            {item.barcode && <span className="font-mono text-[#24221F] font-bold">{item.barcode}</span>}
                            {item.color && <span>اللون: {item.color}</span>}
                            {item.size_cut && <span>المقاس: {item.size_cut}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-xs font-black text-[#24221F]">{Number(item.price || 0).toLocaleString()} ج.م</div>
                        <div className="mt-0.5">
                          {Number(item.stock_level || 0) > 0 ? (
                            <span className="text-[10px] font-bold text-[#3D5618] bg-[#EEF4E3] border border-[#AFC77A]/50 px-2 py-0.5 rounded-full">
                              متوفر: {item.stock_level}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-[#931D4E] bg-[#FCEBF4] border border-[#F1B6D8] px-2 py-0.5 rounded-full">
                              نفذت الكمية
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item._type === 'customer') {
                  return (
                    <div
                      key={`cust-${item.id}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isSelected ? 'bg-[#FAF6ED] ring-1 ring-[#151515]/10 shadow-sm' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0 font-black text-xs">
                          <Users className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#24221F] flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.branch_name && (
                              <span className="text-[10px] font-bold text-[#777266] bg-white border border-[#E6DECD] px-1.5 py-0.2 rounded-md">
                                {item.branch_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#777266] mt-0.5 flex items-center gap-2">
                            <span className="font-mono text-[#24221F] font-bold">{item.phone}</span>
                            {item.status && <span className="text-[10px] text-[#9E988B]">({item.status})</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          عميل #{item.id}
                        </span>
                        {Number(item.total_spent || 0) > 0 && (
                          <div className="text-[10px] font-mono text-[#777266] mt-0.5">
                            {Number(item.total_spent).toLocaleString()} ج.م
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (item._type === 'order') {
                  return (
                    <div
                      key={`ord-${item.id}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isSelected ? 'bg-[#FAF6ED] ring-1 ring-[#151515]/10 shadow-sm' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
                          <Receipt className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#24221F] flex items-center gap-1.5">
                            <span>فاتورة #{item.branch_invoice_number || item.id}</span>
                            {item.customer_name && (
                              <span className="text-[11px] font-medium text-[#777266]">
                                &bull; {item.customer_name}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[#9E988B] mt-0.5 flex items-center gap-2">
                            {item.branch_name && <span>{item.branch_name}</span>}
                            {item.order_date && <span>{new Date(item.order_date).toLocaleDateString('ar-EG')}</span>}
                            <span>{item.payment_method === 'cash' ? 'نقدي' : item.payment_method}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="text-xs font-black text-[#24221F]">{Number(item.total_amount || 0).toLocaleString()} ج.م</div>
                        <div className="mt-0.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.status === 'returned'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {item.status === 'completed' ? 'مكتملة' : item.status === 'returned' ? 'مرتجع' : item.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                if (item._type === 'employee') {
                  return (
                    <div
                      key={`emp-${item.id}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isSelected ? 'bg-[#FAF6ED] ring-1 ring-[#151515]/10 shadow-sm' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shrink-0">
                          <UserCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#24221F] flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.position && (
                              <span className="text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.2 rounded-md">
                                {item.position}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#777266] mt-0.5 flex items-center gap-2">
                            {item.phone && <span className="font-mono text-[#24221F] font-bold">{item.phone}</span>}
                            {item.branch_name && <span>{item.branch_name}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                          موظف
                        </span>
                      </div>
                    </div>
                  );
                }

                if (item._type === 'supplier') {
                  return (
                    <div
                      key={`sup-${item.id}`}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      onClick={() => handleSelectItem(item)}
                      className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all ${
                        isSelected ? 'bg-[#FAF6ED] ring-1 ring-[#151515]/10 shadow-sm' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-black text-[#24221F] flex items-center gap-1.5">
                            <span>{item.name}</span>
                            {item.code && (
                              <span className="text-[10px] font-mono font-bold text-[#777266] bg-white border border-[#E6DECD] px-1.5 py-0.2 rounded-md">
                                {item.code}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#777266] mt-0.5 flex items-center gap-2">
                            {item.phone && <span className="font-mono text-[#24221F] font-bold">{item.phone}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                          مورد
                        </span>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>

            {/* Footer with Keyboard Hints */}
            <div className="px-4 py-2 bg-[#FAF6ED]/60 border-t border-[#E6DECD] flex items-center justify-between text-[10px] text-[#9E988B] font-medium">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#E6DECD] rounded shadow-xs font-mono font-bold text-[#24221F]">↑↓</kbd>
                  <span>للتنقل</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#E6DECD] rounded shadow-xs font-mono font-bold text-[#24221F]">Enter</kbd>
                  <span>للاختيار</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-white border border-[#E6DECD] rounded shadow-xs font-mono font-bold text-[#24221F]">Esc</kbd>
                  <span>للإغلاق</span>
                </span>
              </div>
              <div className="text-[#777266] font-bold">
                {flattenedResults.length} نتيجة
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Left side: Clock, Controls, Notification & Settings Icons, User Profile */}
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        {/* Live Clock */}
        <LiveClock />

        {/* Zoom Controls (Electron / Desktop) */}
        <div className="hidden lg:flex items-center gap-1 bg-[#FFFDF9] border border-[#E6DECD] rounded-full p-1 shadow-sm">
          <button
            onClick={() => changeZoom(0.1)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#777266] hover:text-[#24221F] hover:bg-[#F4EFE4] transition-all cursor-pointer"
            title="تكبير الشاشة"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeZoom(-0.1)}
            className="w-7 h-7 flex items-center justify-center rounded-full text-[#777266] hover:text-[#24221F] hover:bg-[#F4EFE4] transition-all cursor-pointer"
            title="تصغير الشاشة"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Online / Sync Status Pill (Clickable for diagnostics) - Only visible in Branch Mode */}
        {syncStatus?.is_branch_mode && (
          <button
            type="button"
            onClick={handleOpenModal}
            title="حالة المزامنة والاتصال - انقر لفتح التشخيص والإعدادات"
            className={`hidden md:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-sm ${
              syncError
                ? 'bg-[#FCEBF4] border-[#F1B6D8] text-[#931D4E] hover:bg-[#FADCEB]'
                : syncing
                ? 'bg-[#FFF9EC] border-[#F4D95B] text-[#7A5B04] hover:bg-[#FDF3CD]'
                : !isOnline
                ? 'bg-[#FDF5D2] border-[#F4D95B] text-[#7A5B04] hover:bg-[#FDEBB5]'
                : 'bg-[#EEF4E3] border-[#AFC77A] text-[#3D5618] hover:bg-[#E3EDD4]'
            }`}
          >
            {syncing ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin text-[#7A5B04]" />
                <span>جاري المزامنة...</span>
              </>
            ) : syncError ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#931D4E]" />
                <span>فشل الاتصال</span>
              </>
            ) : !isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#7A5B04]" />
                <span>غير متصل</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#AFC77A] animate-ping"></span>
                <span className="w-2 h-2 rounded-full bg-[#AFC77A] -mr-4"></span>
                <span>متصل</span>
              </>
            )}
          </button>
        )}

        {/* Dark Circular Control Icons (Matches Reference Header) */}
        <div className="flex items-center gap-1.5">
          {/* Notification Bell with Badge & Dropdown */}
          <div className="relative" ref={notificationMenuRef}>
            <button
              type="button"
              onClick={() => setShowNotificationDropdown((prev) => !prev)}
              title="مركز التنبيهات"
              className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm cursor-pointer ${
                showNotificationDropdown
                  ? 'bg-[#E11D48] text-white ring-2 ring-[#E11D48]/30 shadow-md'
                  : 'bg-[#151515] text-white hover:bg-neutral-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#E11D48] text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-md border-2 border-[#F8F2E4] animate-pulse">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {showNotificationDropdown && (
              <NotificationDropdown
                notifications={notifications}
                unreadCount={unreadCount}
                stats={notificationStats}
                loading={loadingNotifications}
                onMarkAsRead={handleMarkAsRead}
                onMarkAllAsRead={handleMarkAllAsRead}
                onClearAll={handleClearAll}
                onClose={() => setShowNotificationDropdown(false)}
                onOpenSyncModal={handleOpenModal}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            title="الإعدادات"
            className="w-8 h-8 rounded-full bg-[#151515] text-white flex items-center justify-center hover:bg-neutral-800 transition-colors shadow-sm cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* User Profile */}
        <div className="flex items-center gap-2.5 pr-2.5 sm:border-r border-[#E6DECD]">
          <div className="w-9 h-9 rounded-full bg-[#151515] text-white flex items-center justify-center font-black text-xs shadow-md shrink-0">
            {user?.name ? user.name.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="hidden sm:block text-right">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-[#24221F] leading-none font-display">
                {user?.name || user?.username || 'مستخدم النظام'}
              </span>
              {isAdmin && <ShieldCheck className="w-3 h-3 text-[#AFC77A] shrink-0" />}
            </div>
            <span className="text-[10px] font-semibold text-[#777266]">
              {isAdmin ? 'مدير النظام' : 'مستخدم فرع'}
            </span>
          </div>
        </div>
      </div>

      {/* Sync Diagnostics & Configuration Modal */}
      {showSyncModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
          style={{ direction: 'rtl' }}
        >
          <div className="relative w-full max-w-2xl bg-[#FFFDF9] rounded-3xl shadow-2xl border border-[#E6DECD] overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#E6DECD] bg-[#FAF6ED]/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#151515] text-[#F1B6D8] flex items-center justify-center shadow-md">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#24221F] font-display">تشخيص وإعدادات المزامنة والربط</h3>
                  <p className="text-xs text-[#777266] font-medium">
                    إدارة الاتصال بالسيرفر الرئيسي، فحص الإنترنت، وتحديث البيانات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-2 rounded-2xl text-[#9E988B] hover:text-[#24221F] hover:bg-[#F4EFE4] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  syncError
                    ? 'bg-[#FCEBF4] border-[#F1B6D8] text-[#931D4E]'
                    : isOnline
                    ? 'bg-[#EEF4E3] border-[#AFC77A] text-[#3D5618]'
                    : 'bg-[#FDF5D2] border-[#F4D95B] text-[#7A5B04]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center text-white ${
                      syncError
                        ? 'bg-rose-600'
                        : isOnline
                        ? 'bg-[#AFC77A] text-[#24221F]'
                        : 'bg-[#F4D95B] text-[#24221F]'
                    }`}
                  >
                    {syncError ? (
                      <AlertTriangle className="w-5 h-5" />
                    ) : isOnline ? (
                      <Wifi className="w-5 h-5" />
                    ) : (
                      <WifiOff className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <div className="font-black text-sm">
                      {syncError
                        ? 'فشل الاتصال بالسيرفر'
                        : isOnline
                        ? 'متصل بالسيرفر الرئيسي'
                        : 'السيرفر الرئيسي غير متاح حالياً'}
                    </div>
                    <div className="text-xs opacity-80 mt-0.5 font-mono" dir="ltr">
                      {diagnostics?.server_url || syncStatus?.server_url || 'غير محدد'}
                    </div>
                  </div>
                </div>

                <div className="text-left text-xs font-bold font-mono">
                  فرع #{diagnostics?.branch_id ?? syncStatus?.branch_id ?? 1}
                </div>
              </div>

              {/* Queue Statistics Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-[#24221F]">
                    {diagnostics?.queue?.pending ?? syncStatus?.pending ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-[#777266] mt-0.5">عمليات قيد الإرسال</div>
                </div>
                <div className="bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-rose-600">
                    {diagnostics?.queue?.failed ?? syncStatus?.failed ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-[#777266] mt-0.5">بحاجة لإعادة محاولة</div>
                </div>
                <div className="bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-[#3D5618]">
                    {diagnostics?.queue?.synced ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-[#777266] mt-0.5">تمت مزامنتها</div>
                </div>
              </div>

              {/* Last Error banner if present */}
              {diagnostics?.queue?.last_error && (
                <div className="p-3 rounded-2xl bg-[#FCEBF4] border border-[#F1B6D8] text-[#931D4E] text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">آخر خطأ: </span>
                    <span className="font-mono text-[11px]">{diagnostics.queue.last_error}</span>
                    {diagnostics.queue.last_error_entity && (
                      <span className="block text-[10px] text-rose-600 mt-0.5">
                        العملية: {diagnostics.queue.last_error_entity}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleManualSync}
                  disabled={syncing}
                  className="w-full py-2.5 px-4 rounded-2xl bg-[#151515] hover:bg-neutral-800 active:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'جاري المزامنة...' : 'مزامنة فورية الآن'}</span>
                </button>
                <button
                  onClick={handlePullCatalog}
                  disabled={pullingCatalog}
                  className="w-full py-2.5 px-4 rounded-2xl bg-[#24221F] hover:bg-neutral-800 active:bg-black text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
                >
                  <DownloadCloud className={`w-3.5 h-3.5 ${pullingCatalog ? 'animate-spin' : ''}`} />
                  <span>{pullingCatalog ? 'جاري السحب والتحديث...' : 'تحديث الأصناف والأسعار'}</span>
                </button>
              </div>

              {catalogFeedback && (
                <div
                  className={`p-3 rounded-xl border text-xs font-bold ${
                    catalogFeedback.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {catalogFeedback.message}
                </div>
              )}

              {/* Server URL & Branch Configuration Form */}
              <form
                onSubmit={handleSaveConfig}
                className="mt-4 pt-4 border-t border-slate-100 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5 text-indigo-600" />
                    <span>تعديل رابط السيرفر المركزي (Central Server URL)</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">حفظ تلقائي في ملف الإعدادات</span>
                </div>

                <p className="text-[11px] text-slate-500 leading-relaxed">
                  إذا تغير عنوان الـ IP للإنترنت الخاص بالسيرفر الرئيسي، يمكنك إدخال الـ IP الجديد أو
                  نطاق DuckDNS هنا واختبار الاتصال وحفظه فوراً دون الحاجة لفتح أي ملفات.
                </p>

                <div className="space-y-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      رابط السيرفر (مع المنفذ 6253):
                    </label>
                    <input
                      type="text"
                      dir="ltr"
                      value={serverUrlInput}
                      onChange={(e) => setServerUrlInput(e.target.value)}
                      placeholder="http://156.218.156.48:6253 أو http://yourname.duckdns.org:6253"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-xs font-mono font-bold text-slate-800 bg-slate-50/50 transition-colors"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      رقم الفرع الحالي (Branch ID):
                    </label>
                    <input
                      type="number"
                      dir="ltr"
                      value={branchIdInput}
                      onChange={(e) => setBranchIdInput(e.target.value)}
                      placeholder="2"
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none text-xs font-bold text-slate-800 bg-slate-50/50 transition-colors"
                    />
                  </div>
                </div>

                {configFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold ${
                      configFeedback.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    {configFeedback.message}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-900/20 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${savingConfig ? 'animate-spin' : ''}`} />
                  <span>{savingConfig ? 'جاري فحص الرابط والحفظ...' : 'اختبار وحفظ الإعدادات'}</span>
                </button>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400 font-medium">
              <span>Bebyoon POS &bull; نظام المزامنة اللامركزي</span>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Header;
