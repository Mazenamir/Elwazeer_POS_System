import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import api from '../../services/api/client';

export function Header({ onToggleMobileMenu }) {
  const { user, isAdmin } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();
  const [timeStr, setTimeStr] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [syncError, setSyncError] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

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

  useEffect(() => {
    fetchSyncStatus();
    const statusInterval = setInterval(fetchSyncStatus, 20000);
    return () => clearInterval(statusInterval);
  }, []);

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

  const isOnline = syncStatus?.online !== false;

  return (
    <header className="h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 sticky top-0 z-40 px-4 sm:px-8 flex items-center justify-between shadow-sm">
      {/* Right side: Mobile Menu Button & Branch Picker */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm cursor-pointer"
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
            onClick={() => changeZoom(0.1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all shadow-none hover:shadow-sm cursor-pointer"
            title="تكبير الشاشة"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => changeZoom(-0.1)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-900 hover:bg-white transition-all shadow-none hover:shadow-sm cursor-pointer"
            title="تصغير الشاشة"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {/* Online / Sync Status Pill (Clickable for diagnostics) */}
        <button
          type="button"
          onClick={handleOpenModal}
          title="حالة المزامنة والاتصال - انقر لفتح التشخيص والإعدادات"
          className={`hidden md:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
            syncError
              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
              : syncing
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              : !isOnline
              ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
          }`}
        >
          {syncing ? (
            <>
              <RefreshCw className="w-3 h-3 animate-spin text-indigo-600" />
              <span>جاري المزامنة...</span>
            </>
          ) : syncError ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>فشل الاتصال</span>
            </>
          ) : !isOnline ? (
            <>
              <WifiOff className="w-3.5 h-3.5 text-amber-600" />
              <span>غير متصل بالمركزي</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 -mr-4"></span>
              <span>متصل</span>
            </>
          )}
        </button>

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

      {/* Sync Diagnostics & Configuration Modal */}
      {showSyncModal && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in"
          style={{ direction: 'rtl' }}
        >
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">تشخيص وإعدادات المزامنة والربط</h3>
                  <p className="text-xs text-slate-500 font-medium">
                    إدارة الاتصال بالسيرفر الرئيسي، فحص الإنترنت، وتحديث البيانات
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
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
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : isOnline
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-white ${
                      syncError
                        ? 'bg-rose-600'
                        : isOnline
                        ? 'bg-emerald-600'
                        : 'bg-amber-600'
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
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-indigo-600">
                    {diagnostics?.queue?.pending ?? syncStatus?.pending ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5">عمليات قيد الإرسال</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-rose-600">
                    {diagnostics?.queue?.failed ?? syncStatus?.failed ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5">بحاجة لإعادة محاولة</div>
                </div>
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-center">
                  <div className="text-xl font-black text-emerald-600">
                    {diagnostics?.queue?.synced ?? 0}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 mt-0.5">تمت مزامنتها</div>
                </div>
              </div>

              {/* Last Error banner if present */}
              {diagnostics?.queue?.last_error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
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
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{syncing ? 'جاري المزامنة...' : 'مزامنة فورية الآن'}</span>
                </button>
                <button
                  onClick={handlePullCatalog}
                  disabled={pullingCatalog}
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-slate-900/10 disabled:opacity-50 cursor-pointer"
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
