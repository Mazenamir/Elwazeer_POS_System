import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Package,
  Search,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Printer,
  Download,
  Filter,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Eye,
  Check,
  X,
  Building2,
  Layers,
  Sparkles,
  Inbox,
  Send,
  FileText,
  User,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import { Card } from '../../components/ui/Card';
import { printElement, printHtml } from '../../utils/print';

const STATUS_CONFIG = {
  requested: {
    label: 'طلب معلق',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: Clock,
    colorText: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
  pending: {
    label: 'في الطريق',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: Send,
    colorText: 'text-indigo-700',
    dotColor: 'bg-indigo-500',
  },
  received: {
    label: 'تم الاستلام',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: CheckCircle2,
    colorText: 'text-emerald-700',
    dotColor: 'bg-emerald-500',
  },
  completed: {
    label: 'مكتمل فوري',
    badge: 'bg-slate-100 text-slate-800 border-slate-300',
    icon: Check,
    colorText: 'text-slate-700',
    dotColor: 'bg-slate-500',
  },
  rejected: {
    label: 'مرفوض',
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    icon: XCircle,
    colorText: 'text-rose-700',
    dotColor: 'bg-rose-500',
  },
};

const formatCairoDateTime = (dateVal) => {
  if (!dateVal) return '-';
  try {
    const normalized = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal.trim())
      ? `${dateVal.trim().replace(' ', 'T')}Z`
      : dateVal;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(dateVal);
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return String(dateVal);
  }
};

export default function BranchTransferLogs({ isAdmin = false, onRefreshBanners }) {
  const { user } = useAuth();
  const { branches, activeBranchId, selectBranch } = useBranch();
  const toast = useToast();

  const isBranchScoped = !isAdmin && Boolean(user?.branch_id);
  const currentBranchId = isBranchScoped ? Number(user.branch_id) : (activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : null);

  // Filters state
  const [direction, setDirection] = useState('all'); // 'all' | 'outgoing' | 'incoming'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'requested' | 'pending' | 'received' | 'completed' | 'rejected'
  const [selectedBranchFilter, setSelectedBranchFilter] = useState(() => (activeBranchId && activeBranchId !== 'all' ? activeBranchId.toString() : 'all'));
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Data state
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [summary, setSummary] = useState({
    total: 0,
    requested: 0,
    pending: 0,
    received: 0,
    completed: 0,
    rejected: 0,
    total_quantity: 0,
    outgoing_count: 0,
    incoming_count: 0,
  });

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [selectedTransferForModal, setSelectedTransferForModal] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [search]);

  // Sync selected branch filter if activeBranchId changes externally
  useEffect(() => {
    if (isAdmin) {
      setSelectedBranchFilter(activeBranchId && activeBranchId !== 'all' ? activeBranchId.toString() : 'all');
    }
  }, [isAdmin, activeBranchId]);

  // Fetch transfer logs
  const fetchTransferLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (isBranchScoped) {
        params.append('branch_id', user.branch_id);
      } else if (selectedBranchFilter && selectedBranchFilter !== 'all') {
        params.append('branch_id', selectedBranchFilter);
      }

      if (direction !== 'all') params.append('direction', direction);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      params.append('page', page.toString());
      params.append('limit', limit.toString());

      const res = await api.get(`/inventory/transfers/logs?${params.toString()}`);
      setItems(res?.items || []);
      setPagination(res?.pagination || { page: 1, limit, total: 0, totalPages: 1 });
      if (res?.summary) {
        setSummary(res.summary);
      }
    } catch (err) {
      console.error('Failed to load transfer logs:', err);
      toast.error('فشل تحميل سجل تحويلات الفروع');
    } finally {
      setLoading(false);
    }
  }, [isBranchScoped, user?.branch_id, selectedBranchFilter, direction, statusFilter, debouncedSearch, startDate, endDate, page, limit, toast]);

  useEffect(() => {
    fetchTransferLogs();
  }, [fetchTransferLogs]);

  // Quick Action Handlers
  const handleApprove = async (transferId) => {
    try {
      setActionLoadingId(transferId);
      await api.post(`/inventory/transfers/${transferId}/approve`);
      toast.success('تمت الموافقة على طلب التحويل وبدء الشحن بنجاح! 🚚');
      fetchTransferLogs();
      if (onRefreshBanners) onRefreshBanners();
      if (selectedTransferForModal?.id === transferId) {
        setSelectedTransferForModal(null);
      }
    } catch (err) {
      toast.error(err.message || 'فشل قبول طلب التحويل');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (transferId) => {
    try {
      setActionLoadingId(transferId);
      await api.post(`/inventory/transfers/${transferId}/reject`);
      toast.success('تم رفض طلب التحويل بنجاح');
      fetchTransferLogs();
      if (onRefreshBanners) onRefreshBanners();
      if (selectedTransferForModal?.id === transferId) {
        setSelectedTransferForModal(null);
      }
    } catch (err) {
      toast.error(err.message || 'فشل رفض طلب التحويل');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReceive = async (transferId) => {
    try {
      setActionLoadingId(transferId);
      await api.post(`/inventory/transfers/${transferId}/receive`);
      toast.success('تم تأكيد استلام الشحنة وإضافتها لمخزون الفرع بنجاح! 📦✅');
      fetchTransferLogs();
      if (onRefreshBanners) onRefreshBanners();
      if (selectedTransferForModal?.id === transferId) {
        setSelectedTransferForModal(null);
      }
    } catch (err) {
      toast.error(err.message || 'فشل تأكيد استلام الشحنة');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Date Presets
  const applyDatePreset = (preset) => {
    const today = new Date().toISOString().slice(0, 10);
    if (preset === 'today') {
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'week') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(today);
    } else if (preset === 'month') {
      const d = new Date();
      d.setDate(1);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(today);
    } else if (preset === 'all') {
      setStartDate('');
      setEndDate('');
    }
    setPage(1);
  };

  // Export to Excel
  const handleExportExcel = async () => {
    try {
      setExportingExcel(true);
      toast.info('جاري تجهيز وتصدير سجل التحويلات بصيغة Excel... ⏳');

      const params = new URLSearchParams();
      params.append('type', 'transfer_logs');
      if (isBranchScoped) {
        params.append('branch_id', user.branch_id);
      } else if (selectedBranchFilter && selectedBranchFilter !== 'all') {
        params.append('branch_id', selectedBranchFilter);
      }
      if (direction !== 'all') params.append('direction', direction);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);

      const res = await api.get(`/reports/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = res instanceof Blob
        ? res
        : (res?.data instanceof Blob
            ? res.data
            : new Blob([res?.data || res], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const fileName = `سجل_تحويلات_الفروع_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = fileName;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('تم تصدير ملف سجل التحويلات بنجاح! 📊');
    } catch (err) {
      console.error('Failed to export excel:', err);
      toast.error('فشل تصدير ملف Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // Print single transfer receipt / voucher
  const handlePrintTransferVoucher = (transfer) => {
    const statusObj = STATUS_CONFIG[transfer.status] || { label: transfer.status };
    let sizes = transfer.sizes_breakdown;
    if (!sizes && transfer.sizes_data) {
      try {
        sizes = typeof transfer.sizes_data === 'string' ? JSON.parse(transfer.sizes_data) : transfer.sizes_data;
      } catch {
        sizes = null;
      }
    }

    const html = `
      <div style="font-family: Cairo, Arial, sans-serif; direction: rtl; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #ccc; border-radius: 8px;">
        <div style="text-align: center; border-bottom: 2px solid #24221f; padding-bottom: 12px; margin-bottom: 16px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 900;">إذن نقل بضاعة بين الفروع</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #666;">رقم الإذن: #${transfer.id} | التاريخ: ${formatCairoDateTime(transfer.transfer_date)}</p>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 16px; background: #faf6ed; padding: 12px 14px; border-radius: 6px; border: 1px solid #ebdcb9;">
          <div style="flex: 1;">
            <div style="font-size: 11px; color: #777;">من فرع (المصدر):</div>
            <div style="font-size: 14px; font-weight: bold; color: #151515;">${transfer.from_branch_name}</div>
            <div style="font-size: 12px; color: #333; margin-top: 4px;">
              <strong>الشخص المُسلِّم:</strong> <span style="font-weight: bold; color: #b45309;">${transfer.sender_name || (transfer.status === 'requested' ? 'بانتظار الموافقة والإرسال' : 'غير محدد')}</span>
            </div>
            ${transfer.created_by_name && (transfer.status === 'requested' || transfer.created_by_name !== transfer.sender_name) ? `
              <div style="font-size: 11px; color: #666; margin-top: 2px;">
                <strong>طالب النقل:</strong> ${transfer.created_by_name}
              </div>
            ` : ''}
          </div>
          <div style="font-size: 22px; align-self: center; padding: 0 10px;">⬅️</div>
          <div style="flex: 1; text-align: left; direction: ltr;">
            <div style="font-size: 11px; color: #777; direction: rtl; text-align: right;">إلى فرع (الوجهة):</div>
            <div style="font-size: 14px; font-weight: bold; color: #151515; direction: rtl; text-align: right;">${transfer.to_branch_name}</div>
            <div style="font-size: 12px; color: #333; margin-top: 4px; direction: rtl; text-align: right;">
              <strong>الشخص المُستلِم:</strong> <span style="font-weight: bold; color: #047857;">${transfer.receiver_name || (transfer.status === 'pending' ? 'بانتظار الاستلام' : '—')}</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 12px; color: #666;">الصنف:</div>
          <div style="font-size: 16px; font-weight: bold; color: #111;">${transfer.inventory_name || transfer.product_name}</div>
          ${transfer.inventory_barcode ? `<div style="font-size: 12px; color: #555; font-family: monospace;">الباركود: ${transfer.inventory_barcode}</div>` : ''}
          <div style="font-size: 13px; margin-top: 4px;"><strong>إجمالي الكمية:</strong> ${transfer.quantity} قطعة</div>
          <div style="font-size: 13px;"><strong>الحالة:</strong> ${statusObj.label}</div>
        </div>

        ${Array.isArray(sizes) && sizes.length > 0 ? `
          <div style="margin-top: 14px; border-top: 1px dashed #ccc; padding-top: 10px;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 6px;">بيان تفاصيل المقاسات والألوان:</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
              <thead>
                <tr style="background: #eee;">
                  <th style="padding: 6px; border: 1px solid #ddd; text-align: right;">المقاس</th>
                  <th style="padding: 6px; border: 1px solid #ddd; text-align: right;">اللون</th>
                  <th style="padding: 6px; border: 1px solid #ddd; text-align: center;">الكمية</th>
                </tr>
              </thead>
              <tbody>
                ${sizes.map((s) => `
                  <tr>
                    <td style="padding: 6px; border: 1px solid #ddd;">${s.size_name}</td>
                    <td style="padding: 6px; border: 1px solid #ddd;">${s.color_name || '—'}</td>
                    <td style="padding: 6px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${s.quantity}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div style="margin-top: 35px; display: flex; justify-content: space-between; font-size: 12px; padding-top: 20px; border-top: 1px solid #eee;">
          <div style="text-align: center; width: 30%;">
            <div style="font-weight: bold;">الفرع المُسلِّم:</div>
            <div style="font-size: 11px; color: #555; margin-top: 3px;">${transfer.sender_name || (transfer.status === 'requested' ? 'بانتظار الإرسال' : 'غير محدد')}</div>
            <div style="margin-top: 30px; border-bottom: 1px dotted #999;"></div>
            <div style="font-size: 10px; color: #777; margin-top: 4px;">توقيع المُسلِّم</div>
          </div>
          <div style="text-align: center; width: 30%;">
            <div style="font-weight: bold;">المندوب / الناقل:</div>
            <div style="font-size: 11px; color: #555; margin-top: 3px;">—</div>
            <div style="margin-top: 30px; border-bottom: 1px dotted #999;"></div>
            <div style="font-size: 10px; color: #777; margin-top: 4px;">توقيع الناقل</div>
          </div>
          <div style="text-align: center; width: 30%;">
            <div style="font-weight: bold;">الفرع المُستلِم:</div>
            <div style="font-size: 11px; color: #555; margin-top: 3px;">${transfer.receiver_name || (transfer.status === 'pending' ? 'بانتظار الاستلام' : '—')}</div>
            <div style="margin-top: 30px; border-bottom: 1px dotted #999;"></div>
            <div style="font-size: 10px; color: #777; margin-top: 4px;">توقيع المُستلِم</div>
          </div>
        </div>
      </div>
    `;

    printHtml(html, `إذن_تحويل_مخزون_${transfer.id}`);
  };

  // Branch Name helper for current scope banner
  const activeBranchObj = useMemo(() => {
    if (isBranchScoped) {
      return branches.find((b) => Number(b.id) === Number(user?.branch_id));
    }
    if (selectedBranchFilter && selectedBranchFilter !== 'all') {
      return branches.find((b) => b.id.toString() === selectedBranchFilter);
    }
    return null;
  }, [branches, isBranchScoped, user?.branch_id, selectedBranchFilter]);

  return (
    <div className="space-y-5" style={{ direction: 'rtl' }}>
      {/* SCOPE BANNER / BRANCH INDICATOR */}
      <div className="bg-gradient-to-r from-[#24221F] to-[#3B3832] text-white p-5 rounded-3xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/10">
            <ArrowRightLeft className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight">سجل وحالات التحويلات بين الفروع</h2>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                من وإلى الفروع
              </span>
            </div>
            <p className="text-xs text-white/70 mt-0.5">
              {activeBranchObj
                ? `عرض العمليات الخاصة بـ: ${activeBranchObj.name} (صادر ووارد)`
                : 'عرض شامل لكافة تحويلات الفروع والمخزن الرئيسي'}
            </p>
          </div>
        </div>

        {/* ADMIN BRANCH SWITCHER & EXPORT BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
              <Building2 className="w-4 h-4 text-amber-300" />
              <span className="font-bold text-white/90">تخصيص الفرع:</span>
              <select
                value={selectedBranchFilter}
                onChange={(e) => {
                  setSelectedBranchFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-[#24221F] text-white rounded-lg px-2.5 py-1 text-xs font-bold border border-white/20 outline-none cursor-pointer"
              >
                <option value="all">كافة الفروع (مجمّع)</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name} {b.is_main_warehouse ? '🏢 (المخزن الرئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            icon={Download}
            isLoading={exportingExcel}
            onClick={handleExportExcel}
            className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 text-xs font-bold"
          >
            تصدير Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={() => printElement('transfer-logs-print-area', 'سجل تحويلات الفروع')}
            className="!bg-white/10 !text-white !border-white/20 hover:!bg-white/20 text-xs font-bold"
          >
            طباعة الكشف
          </Button>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-[#FFFDF9] border border-[#E6DECD] rounded-2xl p-3.5 shadow-2xs hover:border-[#151515]/30 transition-all">
          <div className="flex items-center justify-between text-[#777266] text-xs font-bold mb-1">
            <span>إجمالي العمليات</span>
            <ArrowRightLeft className="w-4 h-4 text-[#24221F]" />
          </div>
          <div className="text-xl font-black text-[#24221F]">{summary.total.toLocaleString()}</div>
          <div className="text-[11px] text-[#9E988B] mt-0.5">
            {summary.total_quantity} قطعة محولة
          </div>
        </div>

        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-indigo-700 text-xs font-bold mb-1">
            <span>شحنات في الطريق</span>
            <Send className="w-4 h-4 text-indigo-600 animate-bounce" />
          </div>
          <div className="text-xl font-black text-indigo-900">{summary.pending.toLocaleString()}</div>
          <div className="text-[11px] text-indigo-600 mt-0.5">بانتظار تأكيد الاستلام</div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 text-xs font-bold mb-1">
            <span>طلبات معلقة</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-amber-900">{summary.requested.toLocaleString()}</div>
          <div className="text-[11px] text-amber-700 mt-0.5">بانتظار الموافقة</div>
        </div>

        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-bold mb-1">
            <span>تم استلامها</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-emerald-900">{summary.received.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-700 mt-0.5">استلمها الفرع المستهدف</div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-slate-700 text-xs font-bold mb-1">
            <span>مكتمل فوري</span>
            <Check className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-xl font-black text-slate-900">{summary.completed.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">تحويلات فورية مباشرة</div>
        </div>

        <div className="bg-rose-50/70 border border-rose-200 rounded-2xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between text-rose-800 text-xs font-bold mb-1">
            <span>مرفوضة</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-black text-rose-900">{summary.rejected.toLocaleString()}</div>
          <div className="text-[11px] text-rose-700 mt-0.5">طلبات تم رفضها</div>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="bg-[#FFFDF9] border border-[#E6DECD] rounded-3xl p-4 shadow-[0_2px_10px_rgba(36,34,31,0.03)] space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* DIRECTION PILLS (من و إلى) */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl">
            <button
              type="button"
              onClick={() => {
                setDirection('all');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                direction === 'all'
                  ? 'bg-[#151515] text-white shadow-sm'
                  : 'text-[#777266] hover:text-[#24221F]'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>كافة الاتجاهات ({summary.total})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDirection('outgoing');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                direction === 'outgoing'
                  ? 'bg-[#151515] text-white shadow-sm'
                  : 'text-[#777266] hover:text-[#24221F]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-amber-500" />
              <span>تحويلات صادرة من الفرع 📤 {summary.outgoing_count > 0 ? `(${summary.outgoing_count})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setDirection('incoming');
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                direction === 'incoming'
                  ? 'bg-[#151515] text-white shadow-sm'
                  : 'text-[#777266] hover:text-[#24221F]'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-indigo-500" />
              <span>تحويلات واردة إلى الفرع 📥 {summary.incoming_count > 0 ? `(${summary.incoming_count})` : ''}</span>
            </button>
          </div>

          {/* SEARCH INPUT */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777266] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالصنف، الباركود، الفرع، أو رقم الإذن (#ID)..."
              className="w-full bg-white border border-[#E6DECD] rounded-2xl pr-10 pl-8 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-all"
            />
            {search.trim() && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-[#777266] hover:text-[#24221F] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* SECOND ROW: STATUS FILTER & DATE RANGE */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E6DECD]/50 text-xs">
          {/* STATUS PILLS */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-[#777266] ml-1">الحالة:</span>
            {[
              { id: 'all', label: 'الكل' },
              { id: 'requested', label: 'طلبات معلقة ⏳' },
              { id: 'pending', label: 'في الطريق 🚚' },
              { id: 'received', label: 'تم الاستلام ✅' },
              { id: 'completed', label: 'مكتمل فوري ⚡' },
              { id: 'rejected', label: 'مرفوض ❌' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setStatusFilter(st.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  statusFilter === st.id
                    ? 'bg-[#24221F] text-white shadow-xs'
                    : 'bg-white border border-[#E6DECD] text-[#777266] hover:text-[#24221F] hover:bg-[#FAF6ED]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* DATE RANGE & PRESETS */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-[#E6DECD] rounded-xl px-2.5 py-1">
              <Calendar className="w-3.5 h-3.5 text-[#777266]" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-bold text-[#24221F] bg-transparent outline-none"
              />
              <span className="text-[#9E988B] font-bold">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="text-xs font-bold text-[#24221F] bg-transparent outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyDatePreset('today')}
                className="px-2 py-1 rounded-lg bg-white border border-[#E6DECD] text-[11px] font-bold text-[#777266] hover:text-[#24221F]"
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('week')}
                className="px-2 py-1 rounded-lg bg-white border border-[#E6DECD] text-[11px] font-bold text-[#777266] hover:text-[#24221F]"
              >
                الأسبوع
              </button>
              <button
                type="button"
                onClick={() => applyDatePreset('month')}
                className="px-2 py-1 rounded-lg bg-white border border-[#E6DECD] text-[11px] font-bold text-[#777266] hover:text-[#24221F]"
              >
                الشهر
              </button>
              {(startDate || endDate) && (
                <button
                  type="button"
                  onClick={() => applyDatePreset('all')}
                  className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold"
                  title="مسح الفلترة الزمنية"
                >
                  مسح
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={fetchTransferLogs}
              isLoading={loading}
              className="px-2.5 py-1 text-xs"
            >
              تحديث
            </Button>
          </div>
        </div>
      </div>

      {/* TRANSFERS DATA TABLE */}
      <Card id="transfer-logs-print-area">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[#FAF6ED] text-[#777266] font-black border-b border-[#E6DECD]">
              <tr>
                <th className="p-3.5 text-center w-14">#ID</th>
                <th className="p-3.5">التاريخ والوقت</th>
                <th className="p-3.5 text-center">الاتجاه</th>
                <th className="p-3.5">المنتج والتصنيف</th>
                <th className="p-3.5">مسار التحويل (من ⬅️ إلى)</th>
                <th className="p-3.5">المُسلِّم 📤 / المُستلِم 📥</th>
                <th className="p-3.5 text-center">الكمية</th>
                <th className="p-3.5">تفاصيل المقاسات والألوان</th>
                <th className="p-3.5 text-center">الحالة</th>
                <th className="p-3.5 text-center no-print">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6DECD]/60 font-bold">
              {loading ? (
                <tr>
                  <td colSpan="10" className="text-center py-12 text-[#777266]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-[#151515] border-t-transparent rounded-full animate-spin" />
                      <span>جاري تحميل سجل التحويلات...</span>
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-12 text-[#777266]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Package className="w-10 h-10 text-[#9E988B]" />
                      <div className="text-sm font-black text-[#24221F]">لا توجد تحويلات مطابقة للفلاتر المحددة</div>
                      <div className="text-xs text-[#9E988B]">جرّب تغيير خيارات البحث أو تحديد نطاق زمني مختلف</div>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((tr) => {
                  const statusObj = STATUS_CONFIG[tr.status] || {
                    label: tr.status,
                    badge: 'bg-gray-100 text-gray-800 border-gray-300',
                    icon: AlertTriangle,
                    colorText: 'text-gray-700',
                  };
                  const StatusIcon = statusObj.icon;
                  const isOut = tr.is_outgoing;
                  const isIn = tr.is_incoming;
                  const canReceive = tr.can_receive ?? ((isAdmin || Number(user?.branch_id) === Number(tr.to_branch_id)) && tr.status === 'pending');

                  return (
                    <tr
                      key={tr.id}
                      className="hover:bg-[#FFFDF9] transition-colors group"
                    >
                      {/* ID */}
                      <td className="p-3.5 text-center font-mono font-black text-[#777266]">
                        #{tr.id}
                      </td>

                      {/* DATE */}
                      <td className="p-3.5 whitespace-nowrap text-[#24221F]">
                        <div>{formatCairoDateTime(tr.transfer_date)}</div>
                        {tr.updated_at && tr.status !== 'requested' && (
                          <div className="text-[10px] text-[#9E988B]">
                            تحديث: {formatCairoDateTime(tr.updated_at)}
                          </div>
                        )}
                      </td>

                      {/* DIRECTION */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-800 border border-amber-300">
                            <ArrowUpRight className="w-3 h-3 text-amber-600" />
                            <span>صادر</span>
                          </span>
                        ) : isIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-indigo-50 text-indigo-800 border border-indigo-300">
                            <ArrowDownLeft className="w-3 h-3 text-indigo-600" />
                            <span>وارد</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-50 text-slate-700 border border-slate-300">
                            <ArrowRightLeft className="w-3 h-3" />
                            <span>تحويل فرعي</span>
                          </span>
                        )}
                      </td>

                      {/* PRODUCT */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          {tr.image_url ? (
                            <img
                              src={tr.image_url}
                              alt={tr.inventory_name}
                              className="w-9 h-9 rounded-lg object-cover border border-[#E6DECD] shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[#FAF6ED] border border-[#E6DECD] flex items-center justify-center text-[#777266] shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <div className="font-black text-[#24221F] text-xs">
                              {tr.inventory_name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-[#777266] font-mono mt-0.5">
                              {tr.inventory_barcode && <span>#{tr.inventory_barcode}</span>}
                              {tr.category && <span className="bg-[#FAF6ED] px-1.5 py-0.2 rounded">{tr.category}</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* ROUTE */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isOut ? 'bg-amber-100/70 text-amber-900 border border-amber-300' : 'bg-[#FAF6ED] text-[#24221F]'}`}>
                            {tr.from_branch_name}
                          </span>
                          <span className="text-[#9E988B] font-bold">⬅️</span>
                          <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${isIn ? 'bg-indigo-100/70 text-indigo-900 border border-indigo-300' : 'bg-[#FAF6ED] text-[#24221F]'}`}>
                            {tr.to_branch_name}
                          </span>
                        </div>
                      </td>

                      {/* SENDER / RECEIVER USERS */}
                      <td className="p-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex items-center gap-1.5" title="الشخص الذي سلّم / قام بالتحويل أو الإرسال">
                            <span className="text-[#777266] font-bold text-[10px]">سلّم:</span>
                            <span className={`font-black px-2 py-0.5 rounded-lg border ${
                              tr.status === 'requested'
                                ? 'bg-amber-50 text-amber-800 border-amber-200 font-normal'
                                : tr.status === 'rejected'
                                ? 'bg-rose-50 text-rose-700 border-rose-200 font-normal'
                                : 'bg-[#FAF6ED] text-[#24221F] border-[#E6DECD]'
                            }`}>
                              {tr.sender_name || (tr.status === 'requested' ? 'بانتظار الإرسال' : 'غير محدد')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5" title="الشخص الذي استلم">
                            <span className="text-[#777266] font-bold text-[10px]">استلم:</span>
                            <span className={`font-black px-2 py-0.5 rounded-lg border ${
                              tr.status === 'received' || tr.status === 'completed'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-50 text-slate-500 border-slate-200 font-normal'
                            }`}>
                              {tr.receiver_name || (tr.status === 'pending' ? 'بانتظار الاستلام' : '—')}
                            </span>
                          </div>
                          {tr.created_by_name && (tr.status === 'requested' || tr.created_by_name !== tr.sender_name) && (
                            <div className="text-[10px] text-[#777266] pr-1">
                              طلبها: <span className="font-bold text-[#24221F]">{tr.created_by_name}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* QUANTITY */}
                      <td className="p-3.5 text-center font-mono font-black text-sm text-[#24221F]">
                        {tr.quantity} <span className="text-[10px] text-[#777266]">قطعة</span>
                      </td>

                      {/* SIZES BREAKDOWN */}
                      <td className="p-3.5">
                        {Array.isArray(tr.sizes_breakdown) && tr.sizes_breakdown.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {tr.sizes_breakdown.map((s, sidx) => (
                              <span
                                key={sidx}
                                className="px-1.5 py-0.5 rounded-md bg-white border border-[#E6DECD] text-[10px] font-bold text-[#24221F]"
                              >
                                {s.color_name ? `${s.color_name} ` : ''}
                                {s.size_name}: <strong className="font-mono text-indigo-700">{s.quantity}</strong>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#9E988B] text-xs">—</span>
                        )}
                      </td>

                      {/* STATUS */}
                      <td className="p-3.5 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black border ${statusObj.badge}`}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{statusObj.label}</span>
                        </span>
                      </td>

                      {/* ACTIONS */}
                      <td className="p-3.5 text-center whitespace-nowrap no-print">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* RECEIVE ACTION */}
                          {canReceive && (
                            <Button
                              size="sm"
                              variant="primary"
                              icon={CheckCircle2}
                              isLoading={actionLoadingId === tr.id}
                              onClick={() => handleReceive(tr.id)}
                              className="!bg-emerald-600 hover:!bg-emerald-700 text-white font-black text-xs px-3 py-1.5 shadow-sm rounded-xl flex items-center gap-1.5 whitespace-nowrap"
                              title="تأكيد استلام الشحنة وإضافتها لمخزون الفرع"
                            >
                              <span>تأكيد الاستلام</span>
                            </Button>
                          )}

                          {/* APPROVE ACTION */}
                          {tr.can_approve && (
                            <>
                              <Button
                                size="sm"
                                variant="primary"
                                isLoading={actionLoadingId === tr.id}
                                onClick={() => handleApprove(tr.id)}
                                className="!bg-indigo-600 hover:!bg-indigo-700 text-white font-black text-xs px-2 py-1 shadow-xs"
                                title="موافقة وإرسال البضاعة"
                              >
                                موافقة ✅
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                isLoading={actionLoadingId === tr.id}
                                onClick={() => handleReject(tr.id)}
                                className="font-black text-xs px-2 py-1"
                                title="رفض طلب التحويل"
                              >
                                رفض ❌
                              </Button>
                            </>
                          )}

                          {/* DETAILS MODAL TRIGGER */}
                          <button
                            type="button"
                            onClick={() => setSelectedTransferForModal(tr)}
                            className="p-1.5 rounded-lg border border-[#E6DECD] hover:bg-[#FAF6ED] text-[#777266] hover:text-[#24221F] transition-colors cursor-pointer"
                            title="عرض تفاصيل التحويل"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* PRINT VOUCHER TRIGGER */}
                          <button
                            type="button"
                            onClick={() => handlePrintTransferVoucher(tr)}
                            className="p-1.5 rounded-lg border border-[#E6DECD] hover:bg-[#FAF6ED] text-[#777266] hover:text-[#24221F] transition-colors cursor-pointer"
                            title="طباعة إذن نقل البضاعة"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION FOOTER */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-[#E6DECD] bg-[#FFFDF9] no-print">
            <div className="text-xs font-bold text-[#777266]">
              عرض صفحة {pagination.page} من {pagination.totalPages} (إجمالي {pagination.total.toLocaleString()} عملية)
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E6DECD] bg-white text-xs font-bold text-[#24221F] hover:bg-[#FAF6ED] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              <span className="px-3 py-1 font-mono font-bold text-xs bg-[#FAF6ED] rounded-xl border border-[#E6DECD]">
                {pagination.page} / {pagination.totalPages}
              </span>

              <button
                type="button"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[#E6DECD] bg-white text-xs font-bold text-[#24221F] hover:bg-[#FAF6ED] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span>التالي</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* TRANSFER DETAILS MODAL */}
      {selectedTransferForModal && (
        <Modal
          isOpen={Boolean(selectedTransferForModal)}
          onClose={() => setSelectedTransferForModal(null)}
          title={`تفاصيل تحويل بضاعة #${selectedTransferForModal.id}`}
          subtitle={`التاريخ: ${formatCairoDateTime(selectedTransferForModal.transfer_date)}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4" style={{ direction: 'rtl' }}>
            {/* STATUS & ROUTE BANNER */}
            <div className="p-4 bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl flex items-center justify-between">
              <div>
                <span className="text-xs text-[#777266] block">حالة التحويل:</span>
                <span className={`inline-flex items-center gap-1.5 mt-1 px-3 py-1 rounded-full text-xs font-black border ${STATUS_CONFIG[selectedTransferForModal.status]?.badge || 'bg-gray-100'}`}>
                  {STATUS_CONFIG[selectedTransferForModal.status]?.label || selectedTransferForModal.status}
                </span>
              </div>

              <div className="flex items-center gap-3 text-center">
                <div>
                  <span className="text-[11px] text-[#777266] block">الفرع المصدر:</span>
                  <span className="text-sm font-black text-[#24221F]">{selectedTransferForModal.from_branch_name}</span>
                </div>
                <span className="text-lg text-[#9E988B]">⬅️</span>
                <div>
                  <span className="text-[11px] text-[#777266] block">الفرع الوجهة:</span>
                  <span className="text-sm font-black text-[#24221F]">{selectedTransferForModal.to_branch_name}</span>
                </div>
              </div>
            </div>

            {/* SENDER & RECEIVER INFO CARD */}
            <div className="p-3.5 bg-[#FAF6ED] border border-[#E6DECD] rounded-2xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-white p-3 rounded-xl border border-[#E6DECD] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#777266]">
                    📤 الشخص الذي سلّم (المُرسِل):
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                    {selectedTransferForModal.from_branch_name}
                  </span>
                </div>
                <div className={`text-sm font-black ${
                  selectedTransferForModal.status === 'requested'
                    ? 'text-amber-700 font-bold'
                    : selectedTransferForModal.status === 'rejected'
                    ? 'text-rose-700 font-normal'
                    : 'text-[#24221F]'
                }`}>
                  {selectedTransferForModal.sender_name || (selectedTransferForModal.status === 'requested' ? 'بانتظار الموافقة والإرسال' : 'غير محدد')}
                </div>
                {selectedTransferForModal.created_by_name && (selectedTransferForModal.status === 'requested' || selectedTransferForModal.created_by_name !== selectedTransferForModal.sender_name) && (
                  <div className="text-[11px] text-[#777266] mt-1 pt-1 border-t border-slate-100 flex items-center justify-between">
                    <span>طالب التحويل (المُنشِئ):</span>
                    <span className="font-bold text-[#24221F]">{selectedTransferForModal.created_by_name}</span>
                  </div>
                )}
              </div>

              <div className="bg-white p-3 rounded-xl border border-[#E6DECD] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#777266]">
                    📥 الشخص الذي استلم (المُستلِم):
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold">
                    {selectedTransferForModal.to_branch_name}
                  </span>
                </div>
                <div className={`text-sm font-black ${
                  selectedTransferForModal.status === 'received' || selectedTransferForModal.status === 'completed'
                    ? 'text-emerald-700'
                    : 'text-[#9E988B]'
                }`}>
                  {selectedTransferForModal.receiver_name || (selectedTransferForModal.status === 'pending' ? 'بانتظار الاستلام' : '—')}
                </div>
                {selectedTransferForModal.status === 'pending' && (
                  <div className="text-[10px] text-amber-600 font-bold">
                    ⏳ الشحنة في الطريق وبانتظار تأكيد استلامها
                  </div>
                )}
                {(selectedTransferForModal.status === 'received' || selectedTransferForModal.status === 'completed') && (
                  <div className="text-[10px] text-emerald-600 font-bold">
                    ✅ تم الاستلام وإضافتها للمخزون
                  </div>
                )}
              </div>
            </div>

            {/* PRODUCT CARD */}
            <div className="p-4 bg-white border border-[#E6DECD] rounded-2xl flex items-center gap-3">
              {selectedTransferForModal.image_url ? (
                <img
                  src={selectedTransferForModal.image_url}
                  alt={selectedTransferForModal.inventory_name}
                  className="w-14 h-14 rounded-xl object-cover border border-[#E6DECD]"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-[#FAF6ED] border border-[#E6DECD] flex items-center justify-center text-[#777266]">
                  <Package className="w-6 h-6" />
                </div>
              )}
              <div className="flex-1">
                <h4 className="text-sm font-black text-[#24221F]">{selectedTransferForModal.inventory_name}</h4>
                <div className="flex flex-wrap items-center gap-3 text-xs text-[#777266] mt-1 font-mono">
                  {selectedTransferForModal.inventory_barcode && <span>الباركود: #{selectedTransferForModal.inventory_barcode}</span>}
                  {selectedTransferForModal.category && <span>التصنيف: {selectedTransferForModal.category}</span>}
                  <span className="font-bold text-[#151515]">إجمالي الكمية: {selectedTransferForModal.quantity} قطعة</span>
                </div>
              </div>
            </div>

            {/* SIZES BREAKDOWN TABLE */}
            {Array.isArray(selectedTransferForModal.sizes_breakdown) && selectedTransferForModal.sizes_breakdown.length > 0 && (
              <div className="border border-[#E6DECD] rounded-2xl overflow-hidden">
                <div className="bg-[#FAF6ED] px-4 py-2 border-b border-[#E6DECD] text-xs font-black text-[#24221F]">
                  تفاصيل المقاسات والألوان المنقولة
                </div>
                <table className="w-full text-right text-xs">
                  <thead className="bg-white border-b border-[#E6DECD] text-[#777266]">
                    <tr>
                      <th className="p-2.5">المقاس</th>
                      <th className="p-2.5">اللون</th>
                      <th className="p-2.5 text-center">الكمية المحولة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6DECD] font-bold">
                    {selectedTransferForModal.sizes_breakdown.map((s, idx) => (
                      <tr key={idx} className="hover:bg-[#FAF6ED]/50">
                        <td className="p-2.5 font-mono">{s.size_name}</td>
                        <td className="p-2.5">{s.color_name || '—'}</td>
                        <td className="p-2.5 text-center font-mono font-black text-indigo-700">{s.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ACTION FOOTER */}
            <div className="flex items-center justify-between pt-3 border-t border-[#E6DECD]">
              <Button
                variant="outline"
                size="sm"
                icon={Printer}
                onClick={() => handlePrintTransferVoucher(selectedTransferForModal)}
              >
                طباعة إذن النقل
              </Button>

              <div className="flex items-center gap-2">
                {(selectedTransferForModal.can_receive ?? ((isAdmin || Number(user?.branch_id) === Number(selectedTransferForModal.to_branch_id)) && selectedTransferForModal.status === 'pending')) && (
                  <Button
                    variant="primary"
                    size="sm"
                    icon={CheckCircle2}
                    isLoading={actionLoadingId === selectedTransferForModal.id}
                    onClick={() => handleReceive(selectedTransferForModal.id)}
                    className="!bg-emerald-600 hover:!bg-emerald-700 text-white font-black text-xs px-4 py-2 shadow-md rounded-xl flex items-center gap-2 whitespace-nowrap"
                  >
                    تأكيد استلام الشحنة وإضافتها للمخزون ✅
                  </Button>
                )}
                {selectedTransferForModal.can_approve && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Check}
                      isLoading={actionLoadingId === selectedTransferForModal.id}
                      onClick={() => handleApprove(selectedTransferForModal.id)}
                      className="!bg-indigo-600 hover:!bg-indigo-700"
                    >
                      موافقة
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={X}
                      isLoading={actionLoadingId === selectedTransferForModal.id}
                      onClick={() => handleReject(selectedTransferForModal.id)}
                    >
                      رفض
                    </Button>
                  </>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTransferForModal(null)}
                >
                  إغلاق
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
