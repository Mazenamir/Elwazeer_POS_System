import React, { useState, useEffect, useCallback } from 'react';
import {
  Ruler,
  Plus,
  Search,
  RotateCcw,
  CheckCircle2,
  Clock,
  Trash2,
  Calendar,
  User,
  Phone,
  Tag,
  Scissors,
  Edit3,
  Printer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { printElement } from '../../utils/print';
import { Card, CardHeader } from '../../components/ui/Card';

const STATUS_MAP = {
  pending: { label: 'تحت التنفيذ', variant: 'warning' },
  in_progress: { label: 'جاري العمل', variant: 'info' },
  ready: { label: 'جاهز للاستلام', variant: 'purple' },
  completed: { label: 'جاهز للاستلام', variant: 'purple' },
  delivered: { label: 'تم التسليم', variant: 'success' },
};

export function Alterations() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();

  const [alterations, setAlterations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [orderId, setOrderId] = useState('');

  // Update Status Modal
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedAlteration, setSelectedAlteration] = useState(null);
  const [newStatus, setNewStatus] = useState('ready');

  // Ticket Print Modal
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [selectedTicketAlt, setSelectedTicketAlt] = useState(null);

  // Load Alterations
  const fetchAlterations = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
      if (statusFilter !== 'all') query.append('status', statusFilter);
      if (search.trim()) query.append('search', search.trim());

      const data = await api.get(`/alterations?${query.toString()}`);
      setAlterations(Array.isArray(data) ? data : (data?.alterations || data?.data || data?.items || []));
    } catch (err) {
      console.error('Failed to load alterations:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, statusFilter, search]);

  useEffect(() => {
    fetchAlterations();
  }, [fetchAlterations]);

  // Create Alteration
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      toast.error('الرجاء إدخال تفاصيل التعديل المطلوب');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        branch_id: (activeBranchId && activeBranchId !== 'all') ? Number(activeBranchId) : (branches[0]?.id || 1),
        description: description.trim(),
        due_date: dueDate,
        order_id: orderId ? Number(orderId) : null,
      };

      await api.post('/alterations', payload);
      toast.success('تم تسجيل طلب التعديل بنجاح! 📐');
      setShowCreateModal(false);

      setDescription('');
      setOrderId('');
      fetchAlterations();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل التعديل');
    } finally {
      setSubmitting(false);
    }
  };

  // Update Status
  const handleStatusUpdate = async (e) => {
    e.preventDefault();
    if (!selectedAlteration) return;

    try {
      await api.patch(`/alterations/${selectedAlteration.id}`, {
        status: newStatus,
      });
      toast.success('تم تحديث حالة التعديل بنجاح! ✅');
      setShowStatusModal(false);
      fetchAlterations();
    } catch (err) {
      toast.error(err.message || 'فشل تحديث الحالة');
    }
  };

  // Delete
  const handleDelete = async (id) => {
    if (!confirm('هل تريد حذف هذا التعديل؟')) return;
    try {
      await api.delete(`/alterations/${id}`);
      toast.success('تم حذف طلب التعديل');
      fetchAlterations();
    } catch (err) {
      toast.error(err.message || 'فشل حذف التعديل');
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            التعديلات والضبط 📐
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            متابعة أوامر تقصير وتضييق وتعديل البدل والجاكيت والبنطلون وتجهيز الحجوزات
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={Plus}
          onClick={() => setShowCreateModal(true)}
          className="!bg-indigo-600 hover:!bg-indigo-700 shadow-md shadow-indigo-600/20"
        >
          طلب تعديل جديد
        </Button>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="سجل التعديلات"
          subtitle="الأوامر الحالية وقيد التنفيذ والتسليم"
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالعميل، القطعة، الفاتورة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold outline-none focus:border-indigo-600"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="all">كل الحالات</option>
                <option value="pending">تحت التنفيذ</option>
                <option value="ready">جاهز للاستلام</option>
                <option value="delivered">تم التسليم</option>
              </select>

              <Button variant="outline" size="sm" onClick={fetchAlterations} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل طلبات التعديل...
          </div>
        ) : alterations.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            لا توجد طلبات تعديل مسجلة
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs font-black uppercase">
                  <th className="pb-3 pr-2">رقم التعديل</th>
                  <th className="pb-3">العميل / الفاتورة</th>
                  <th className="pb-3">القطعة</th>
                  <th className="pb-3">تفاصيل التعديل</th>
                  <th className="pb-3">موعد التسليم</th>
                  <th className="pb-3">الحالة</th>
                  <th className="pb-3 pl-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {alterations.map((alt) => {
                  const statusInfo = STATUS_MAP[alt.status] || {
                    label: alt.status,
                    variant: 'neutral',
                  };

                  return (
                    <tr key={alt.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 pr-2 font-bold text-slate-900 font-mono">
                        #{alt.id}
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-slate-900">
                          {alt.customer_name || 'عميل نقدي'}
                        </div>
                        {alt.order_id && (
                          <div className="text-xs text-slate-400 font-mono">
                            فاتورة: #{alt.order_id}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-slate-800">
                          {alt.product_name || 'قطعة من الفاتورة'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold mt-0.5">
                          {alt.product_color && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100">
                              {alt.product_color}
                            </span>
                          )}
                          {alt.product_size && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100">
                              {alt.product_size}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 text-xs text-slate-700 max-w-sm font-bold">
                        {alt.description}
                      </td>
                      <td className="py-3.5 text-xs font-bold text-indigo-600" dir="ltr">
                        {alt.due_date ? new Date(alt.due_date).toLocaleDateString('ar-EG') : '-'}
                      </td>
                      <td className="py-3.5">
                        <Badge variant={statusInfo.variant} dot>
                          {statusInfo.label}
                        </Badge>
                      </td>
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedTicketAlt(alt);
                              setShowTicketModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="طباعة التيكت"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAlteration(alt);
                              setNewStatus(alt.status || 'ready');
                              setShowStatusModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="تغيير الحالة"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {['pending', 'in_progress'].includes(alt.status) && (
                            <button
                              onClick={() => handleDelete(alt.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* CREATE ALTERATION MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="طلب تعديل جديد 📐"
        subtitle="تسجيل تفاصيل التعديل وموعد التسليم"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <Input
            label="رقم الفاتورة المرتبطة (اختياري)"
            type="number"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="مثال: 1042"
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">تفاصيل التعديل المطلوب *</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثال: تقصير البنطلون 2 سم وتضييق الجاكيت من الظهر، رفع أكمام البدلة..."
              className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-indigo-600"
              required
            />
          </div>

          <Input
            label="موعد التسليم المتوقع *"
            type="date"
            icon={Calendar}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            required
          />

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
            >
              حفظ أمر التعديل
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowCreateModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* UPDATE STATUS MODAL */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="تحديث حالة التعديل 🔄"
        subtitle={`التعديل #${selectedAlteration?.id || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleStatusUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">اختر الحالة الجديدة</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-indigo-600"
            >
              <option value="pending">تحت التنفيذ</option>
              <option value="in_progress">جاري العمل</option>
              <option value="ready">جاهز للاستلام</option>
              <option value="delivered">تم التسليم</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              حفظ الحالة
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowStatusModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* TICKET PRINT MODAL */}
      <Modal
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        title="تيكت طلب تعديل 🖨️"
        subtitle="معاينة وطباعة تيكت التعديل الحراري (80mm)"
        maxWidth="max-w-md"
      >
        {selectedTicketAlt && (
          <div className="space-y-4">
            <div
              id="alteration-ticket"
              className="bg-white p-5 rounded-2xl border-2 border-slate-900 text-black text-xs leading-relaxed space-y-3 font-mono shadow-sm mx-auto"
              style={{ direction: 'rtl', maxWidth: '80mm' }}
            >
              <div className="text-center pb-2 border-b-2 border-slate-900 space-y-1">
                <h1 className="text-base font-black">Bebyoon Center</h1>
                <p className="text-xs font-black">تيكت طلب تعديل</p>
                <div className="text-[11px] font-bold text-slate-600">
                  كود التعديل: #{selectedTicketAlt.id}
                </div>
              </div>

              <div className="space-y-1 text-xs font-bold border-b border-slate-300 pb-2">
                {selectedTicketAlt.order_id && (
                  <p>
                    <span className="font-black">رقم الفاتورة:</span> #{selectedTicketAlt.order_id}
                  </p>
                )}
                <p>
                  <span className="font-black">اسم العميل:</span> {selectedTicketAlt.customer_name || 'عميل نقدي'}
                </p>
                {selectedTicketAlt.customer_phone && (
                  <p>
                    <span className="font-black">هاتف العميل:</span> {selectedTicketAlt.customer_phone}
                  </p>
                )}
                <p>
                  <span className="font-black">القطعة:</span> {selectedTicketAlt.product_name || 'قطعة من الفاتورة'}
                  {selectedTicketAlt.product_color ? ` (${selectedTicketAlt.product_color})` : ''}
                  {selectedTicketAlt.product_size ? ` - مقاس ${selectedTicketAlt.product_size}` : ''}
                </p>
              </div>

              <div className="pt-1 text-right">
                <p className="text-sm font-black underline mb-1">المطلوب:</p>
                <p className="text-xs font-bold whitespace-pre-wrap leading-relaxed p-2 bg-slate-50 rounded-lg border border-slate-200">
                  {selectedTicketAlt.description}
                </p>
              </div>

              <div className="pt-2 border-t border-dashed border-slate-400 text-center">
                <p className="text-[10px] font-bold text-slate-500">تاريخ الاستلام (المتوقع):</p>
                <p className="text-sm font-black mt-0.5">
                  {selectedTicketAlt.due_date ? new Date(selectedTicketAlt.due_date).toLocaleDateString('ar-EG') : 'غير محدد'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={Printer}
                onClick={() => printElement('alteration-ticket', `تيكت تعديل #${selectedTicketAlt.id}`)}
                className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
              >
                طباعة التيكت
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowTicketModal(false)}
              >
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Alterations;
