import React, { useState, useMemo } from 'react';
import {
  Bell,
  WifiOff,
  Package,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  CheckCheck,
  Trash2,
  X,
  Activity,
  Layers,
  ArrowRightLeft,
  Clock,
  ExternalLink,
} from 'lucide-react';

function formatRelativeTimeArabic(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now - date) / 1000));

  if (diffSec < 60) return 'الآن';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return 'منذ دقيقة';
  if (diffMin === 2) return 'منذ دقيقتين';
  if (diffMin >= 3 && diffMin <= 10) return `منذ ${diffMin} دقائق`;
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) return 'منذ ساعة';
  if (diffHours === 2) return 'منذ ساعتين';
  if (diffHours >= 3 && diffHours <= 10) return `منذ ${diffHours} ساعات`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'أمس';
  if (diffDays === 2) return 'منذ يومين';
  if (diffDays >= 3 && diffDays <= 10) return `منذ ${diffDays} أيام`;

  return date.toLocaleDateString('ar-EG', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function NotificationDropdown({
  notifications = [],
  unreadCount = 0,
  stats = {},
  loading = false,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onClose,
  onOpenSyncModal,
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'branches' | 'transfers'

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'branches') {
      return notifications.filter((n) => n.category === 'branch');
    }
    if (activeTab === 'transfers') {
      return notifications.filter((n) => n.category === 'transfer');
    }
    return notifications;
  }, [notifications, activeTab]);

  const branchCount = stats.branches ?? notifications.filter((n) => n.category === 'branch').length;
  const transferCount = stats.transfers ?? notifications.filter((n) => n.category === 'transfer').length;
  const totalCount = stats.total ?? notifications.length;

  return (
    <div
      className="absolute left-0 mt-3 w-[360px] sm:w-[440px] max-w-[calc(100vw-2rem)] bg-[#FFFDF9] rounded-3xl shadow-2xl border border-[#E6DECD] z-50 overflow-hidden flex flex-col animate-fade-in font-display select-none"
      style={{ direction: 'rtl', maxHeight: 'min(620px, 86vh)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#E6DECD] bg-[#FAF6ED]/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-[#151515] text-[#F1B6D8] flex items-center justify-center shadow-sm shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-[#24221F]">مركز التنبيهات</h3>
              {unreadCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#FCEBF4] text-[#931D4E] border border-[#F1B6D8]">
                  {unreadCount} جديد
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EEF4E3] text-[#3D5618] border border-[#AFC77A]">
                  مكتملة
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#777266] font-medium mt-0.5">
              متابعة مباشرة لاتصال الفروع وحركة البضائع
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllAsRead}
              title="تحديد الكل كمقروء"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-[#E6DECD] hover:border-[#151515] hover:bg-[#FAF6ED] text-[11px] font-bold text-[#24221F] transition-all shadow-sm cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5 text-[#3D5618]" />
              <span className="hidden sm:inline">تحديد الكل كمقروء</span>
            </button>
          )}

          {notifications.length > 0 && onClearAll && (
            <button
              type="button"
              onClick={onClearAll}
              title="مسح وتفريغ الإشعارات"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white border border-[#E6DECD] hover:border-rose-400 hover:bg-rose-50 text-[11px] font-bold text-[#777266] hover:text-rose-700 transition-all shadow-sm cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">مسح</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-[#9E988B] hover:text-[#24221F] hover:bg-[#FAF6ED] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-3 pb-2 bg-[#FFFDF9] border-b border-[#F0EBE1] flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FAF6ED] text-[#777266] hover:text-[#24221F] hover:bg-[#F4EFE4]'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>الكل</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-[#E6DECD]/70 text-[#24221F]'
            }`}
          >
            {totalCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('branches')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'branches'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FAF6ED] text-[#777266] hover:text-[#24221F] hover:bg-[#F4EFE4]'
          }`}
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>حالة الفروع</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              branchCount > 0 ? 'bg-[#FCEBF4] text-[#931D4E]' : 'bg-[#E6DECD]/70 text-[#24221F]'
            }`}
          >
            {branchCount}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transfers')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'transfers'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FAF6ED] text-[#777266] hover:text-[#24221F] hover:bg-[#F4EFE4]'
          }`}
        >
          <ArrowRightLeft className="w-3.5 h-3.5" />
          <span>حركة البضائع</span>
          <span
            className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
              activeTab === 'transfers'
                ? 'bg-white/20 text-white'
                : 'bg-[#E6DECD]/70 text-[#24221F]'
            }`}
          >
            {transferCount}
          </span>
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 custom-scrollbar min-h-[220px]">
        {loading && notifications.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <Activity className="w-6 h-6 text-[#9E988B] animate-spin mb-2" />
            <p className="text-xs text-[#777266] font-bold">جاري تحميل التنبيهات...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#EEF4E3] border border-[#AFC77A]/40 flex items-center justify-center text-[#3D5618] mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-[#24221F]">
              {activeTab === 'branches'
                ? 'جميع الفروع متصلة ومستقرة'
                : activeTab === 'transfers'
                ? 'لا توجد حركات تحويل بضائع حالياً'
                : 'لا توجد أي تنبيهات جديدة'}
            </h4>
            <p className="text-xs text-[#777266] mt-1 max-w-xs">
              {activeTab === 'branches'
                ? 'جميع الفروع نشطة وترسل نبضات المزامنة بانتظام.'
                : activeTab === 'transfers'
                ? 'يتم رصد الشحنات المحولة وتأكيدات الاستلام فور إجرائها.'
                : 'النظام يعمل بشكل ممتاز وجميع العمليات متوافقة.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((notif) => {
            const isUnread = !notif.read;
            const isBranchDisconnect = notif.category === 'branch';
            const isTransfer = notif.category === 'transfer';
            const isInventory = notif.category === 'inventory';

            let iconBadge = null;
            if (isBranchDisconnect) {
              iconBadge = (
                <div className="w-8 h-8 rounded-xl bg-[#FCEBF4] text-[#931D4E] border border-[#F1B6D8] flex items-center justify-center shrink-0 shadow-xs">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              );
            } else if (isTransfer) {
              if (notif.severity === 'success') {
                iconBadge = (
                  <div className="w-8 h-8 rounded-xl bg-[#EEF4E3] text-[#3D5618] border border-[#AFC77A] flex items-center justify-center shrink-0 shadow-xs">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                );
              } else {
                iconBadge = (
                  <div className="w-8 h-8 rounded-xl bg-[#FFF9EC] text-[#7A5B04] border border-[#F4D95B] flex items-center justify-center shrink-0 shadow-xs">
                    <Package className="w-4 h-4" />
                  </div>
                );
              }
            } else if (isInventory) {
              iconBadge = (
                <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0 shadow-xs">
                  <AlertCircle className="w-4 h-4" />
                </div>
              );
            } else {
              iconBadge = (
                <div className="w-8 h-8 rounded-xl bg-[#FAF6ED] text-[#24221F] border border-[#E6DECD] flex items-center justify-center shrink-0 shadow-xs">
                  <Bell className="w-4 h-4" />
                </div>
              );
            }

            return (
              <div
                key={notif.id}
                onClick={() => isUnread && onMarkAsRead(notif.id)}
                className={`group relative p-3 sm:p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  isUnread
                    ? 'bg-[#FFFDF9] border-[#D4CBB9] shadow-sm hover:border-[#151515] hover:shadow-md ring-1 ring-black/5'
                    : 'bg-[#FAF6ED]/40 border-[#E6DECD]/70 hover:bg-[#FAF6ED] opacity-90'
                }`}
              >
                {/* Unread Pink Dot */}
                {isUnread && (
                  <span className="absolute top-3.5 left-3.5 w-2 h-2 rounded-full bg-[#E11D48] ring-4 ring-[#FCEBF4]" />
                )}

                <div className="flex items-start gap-3">
                  {iconBadge}

                  <div className="flex-1 min-w-0 pr-0.5">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[11px] font-black text-[#24221F]">
                        {notif.title || 'إشعار'}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-[#9E988B] font-bold">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelativeTimeArabic(notif.timestamp)}</span>
                      </div>
                    </div>

                    <p className="text-xs font-bold text-[#24221F] leading-relaxed break-words">
                      {notif.message}
                    </p>

                    {/* Metadata tags */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-[#777266]">
                      {notif.metadata?.branch_name && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FAF6ED] border border-[#E6DECD]">
                          {notif.metadata.branch_name}
                        </span>
                      )}
                      {notif.metadata?.quantity && (
                        <span className="px-2 py-0.5 rounded-md bg-[#FAF6ED] border border-[#E6DECD]">
                          الكمية: {notif.metadata.quantity}
                        </span>
                      )}
                      {isUnread && (
                        <span className="text-[#931D4E] font-extrabold text-[10px]">
                          انقر للتعليم كمقروء
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: Live update status & Sync diagnostics shortcut */}
      <div className="p-3 border-t border-[#E6DECD] bg-[#FAF6ED]/90 flex items-center justify-between text-[11px] font-bold text-[#777266]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-[#AFC77A] animate-pulse"></span>
          <span>تحديث فوري تلقائي</span>
        </div>

        {onOpenSyncModal && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSyncModal();
            }}
            className="flex items-center gap-1 text-[#24221F] hover:text-[#931D4E] hover:underline cursor-pointer"
          >
            <span>تشخيص وإعدادات المزامنة</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default NotificationDropdown;
