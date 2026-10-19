import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  User,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  Phone,
  Calendar,
  DollarSign,
  FileText,
  Download,
  Clock,
  History,
  CheckCircle2,
  X,
  CreditCard,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';

export function Customers() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null && q !== undefined) {
      setSearch(q);
    }
  }, [searchParams]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [status, setStatus] = useState('عادي');
  const [notes, setNotes] = useState('');

  // Customer History Drawer / Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load Customers
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
      if (search.trim()) query.append('search', search.trim());

      if (pagination.limit === 'all') {
        query.append('all', 'true');
      } else {
        query.append('page', pagination.page.toString());
        query.append('limit', pagination.limit.toString());
      }

      const data = await api.get(`/customers?${query.toString()}`);
      const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
      setCustomers(list);

      if (data?.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit === 'all' ? data.total || 1 : prev.limit))),
        }));
      } else {
        setPagination((prev) => ({
          ...prev,
          total: list.length,
          totalPages: 1,
        }));
      }
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, search, pagination.page, pagination.limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [activeBranchId]);

  const handlePageChange = (newPage) => {
    const pageNum = Math.max(1, Math.min(newPage, pagination.totalPages));
    setPagination((prev) => ({ ...prev, page: pageNum }));
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({
      ...prev,
      limit: newLimit === 'all' ? 'all' : Number(newLimit),
      page: 1,
    }));
  };

  const openCreateModal = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setNationalId('');
    setStatus('عادي');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (c) => {
    setEditingCustomer(c);
    setName(c.name || '');
    setPhone(c.phone || '');
    setNationalId(c.national_id || '');
    setStatus(c.status || 'عادي');
    setNotes(c.notes || '');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      toast.error('الرجاء إدخال اسم ورقم هاتف العميل');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        phone: phone.trim(),
        national_id: nationalId.trim(),
        status,
        notes: notes.trim(),
        branch_id: (activeBranchId && activeBranchId !== 'all') ? Number(activeBranchId) : (branches[0]?.id || 1),
      };

      if (editingCustomer) {
        await api.put(`/customers/${editingCustomer.id}`, payload);
        toast.success('تم تحديث بيانات العميل بنجاح! ✅');
      } else {
        await api.post('/customers', payload);
        toast.success('تمت إضافة العميل بنجاح! 👤');
      }

      setShowModal(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.message || 'فشل حفظ بيانات العميل');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
    try {
      await api.delete(`/customers/${id}`);
      toast.success('تم حذف العميل بنجاح');
      fetchCustomers();
    } catch (err) {
      toast.error(err.message || 'فشل حذف العميل');
    }
  };

  const openHistory = async (customer) => {
    setSelectedCustomer(customer);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    try {
      const data = await api.get(`/customers/${customer.id}/history`);
      setHistoryData(data);
    } catch (err) {
      console.error(err);
      toast.error('فشل تحميل سجل العميل');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Export to CSV
  const exportToCSV = () => {
    if (customers.length === 0) {
      toast.warning('لا توجد بيانات للتصدير');
      return;
    }

    const headers = ['رقم العميل', 'الاسم', 'الهاتف', 'الرقم القومي', 'الحالة', 'إجمالي المشتريات', 'تاريخ الانضمام'];
    const rows = customers.map((c) => [
      c.id,
      `"${c.name}"`,
      `"${c.phone}"`,
      `"${c.national_id || ''}"`,
      `"${c.status || 'عادي'}"`,
      c.total_spent || 0,
      c.join_date ? new Date(c.join_date).toLocaleDateString('ar-EG') : '',
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `customers_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('تم تصدير ملف العملاء بنجاح! 📊');
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            دليل العملاء 👥
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            سجل العملاء، كشوف الحسابات، فواتير المبيعات وحجوزات التأجير السابقة
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" icon={Download} onClick={exportToCSV}>
            تصدير CSV
          </Button>
          <Button
            variant="primary"
            size="lg"
            icon={UserPlus}
            onClick={openCreateModal}
          >
            إضافة عميل جديد
          </Button>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="قائمة العملاء"
          subtitle={`إجمالي العملاء المسجلين: ${Number(pagination.total || customers.length).toLocaleString()} عميل${
            pagination.totalPages > 1 && pagination.limit !== 'all'
              ? ` (صفحة ${pagination.page} من ${pagination.totalPages})`
              : ''
          }`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  placeholder="ابحث بالاسم أو رقم الهاتف..."
                  className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchCustomers} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            جاري تحميل العملاء...
          </div>
        ) : customers.length === 0 ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            لا يوجد عملاء مسجلين مطابقين للبحث
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                  <th className="pb-3 pr-2">العميل والكود</th>
                  <th className="pb-3">رقم الهاتف</th>
                  <th className="pb-3">الرقم القومي</th>
                  <th className="pb-3">الحالة</th>
                  <th className="pb-3">إجمالي التعاملات</th>
                  <th className="pb-3">تاريخ الانضمام</th>
                  <th className="pb-3 pl-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                    <td className="py-3.5 pr-2 font-bold text-[#24221F] flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#FDF5D2] border border-[#F4D95B]/40 text-[#24221F] flex items-center justify-center font-black text-xs shrink-0">
                        {c.initials || (c.name ? c.name.charAt(0) : 'ع')}
                      </div>
                      <div>
                        <div>{c.name}</div>
                        <div className="text-[10px] font-mono text-[#777266] font-bold">كود: #{c.id}</div>
                      </div>
                    </td>
                    <td className="py-3.5 font-mono text-xs text-[#565147]" dir="ltr">
                      {c.phone}
                    </td>
                    <td className="py-3.5 font-mono text-xs text-[#777266]" dir="ltr">
                      {c.national_id || '-'}
                    </td>
                    <td className="py-3.5">
                      <Badge
                        variant={
                          c.status === 'مميز'
                            ? 'success'
                            : c.status === 'محظور'
                            ? 'danger'
                            : 'neutral'
                        }
                      >
                        {c.status || 'عادي'}
                      </Badge>
                    </td>
                    <td className="py-3.5 font-black text-[#24221F]">
                      {Number(c.total_spent || 0).toLocaleString()} ج.م
                    </td>
                    <td className="py-3.5 text-xs text-[#777266]" dir="ltr">
                      {c.join_date ? new Date(c.join_date).toLocaleDateString('ar-EG') : '-'}
                    </td>
                    <td className="py-3.5 pl-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openHistory(c)}
                          className="p-1.5 text-[#777266] hover:text-[#151515] hover:bg-[#FAF6ED] rounded-lg transition-colors"
                          title="عرض سجل وفواتير العميل"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-1.5 text-[#777266] hover:text-[#151515] hover:bg-[#FAF6ED] rounded-lg transition-colors"
                          title="تعديل بيانات العميل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="p-1.5 text-[#777266] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="حذف العميل"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Customers Pagination Bar */}
        {pagination.total > 0 && (
          <div className="p-4 border-t border-[#E6DECD] flex flex-col md:flex-row items-center justify-between gap-3 bg-[#FAF6ED]/60 rounded-b-3xl">
            {/* Info summary & Page size */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#777266]">
              <span>
                عرض{' '}
                <span className="text-[#24221F] font-black">
                  {pagination.limit === 'all'
                    ? `1 - ${pagination.total}`
                    : `${(pagination.page - 1) * pagination.limit + 1} - ${Math.min(
                        pagination.page * pagination.limit,
                        pagination.total
                      )}`}
                </span>{' '}
                من إجمالي{' '}
                <span className="text-[#24221F] font-black">
                  {Number(pagination.total).toLocaleString()}
                </span>{' '}
                عميل
              </span>

              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-[#777266]">لكل صفحة:</span>
                {[30, 50, 100, 200, 'الكل'].map((lim) => (
                  <button
                    key={lim}
                    onClick={() => handleLimitChange(lim)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      pagination.limit === lim || (lim === 'الكل' && pagination.limit === 'all')
                        ? 'bg-[#151515] text-white shadow-sm'
                        : 'bg-[#FFFDF9] border border-[#E6DECD] text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
                    }`}
                  >
                    {lim}
                  </button>
                ))}
              </div>
            </div>

            {/* Page Navigation Controls */}
            {pagination.totalPages > 1 && pagination.limit !== 'all' && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(1)}
                  title="الصفحة الأولى"
                  className="!px-2"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className="!text-xs !py-1"
                >
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  السابق
                </Button>

                <span className="px-3 py-1 bg-[#FFFDF9] border border-[#E6DECD] rounded-lg text-xs font-black text-[#24221F]">
                  صفحة {pagination.page} من {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className="!text-xs !py-1"
                >
                  التالي
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.totalPages)}
                  title="الصفحة الأخيرة"
                  className="!px-2"
                >
                  <ChevronsLeft className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* CREATE / EDIT CUSTOMER MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCustomer ? 'تعديل بيانات العميل ✏️' : 'إضافة عميل جديد 👤'}
        subtitle="أدخل بيانات الاتصال والتصنيف"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingCustomer && (
            <div className="text-xs font-mono font-bold text-[#24221F] bg-[#FAF6ED] p-2.5 rounded-xl border border-[#E6DECD] flex items-center justify-between">
              <span>كود العميل: #{editingCustomer.id}</span>
              <span>تاريخ الانضمام: {editingCustomer.join_date ? new Date(editingCustomer.join_date).toLocaleDateString('ar-EG') : '-'}</span>
            </div>
          )}

          <Input
            label="اسم العميل *"
            icon={User}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="الاسم ثلاثي..."
            required
          />

          <Input
            label="رقم الهاتف *"
            icon={Phone}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
            required
          />

          <Input
            label="الرقم القومي (اختياري)"
            value={nationalId}
            onChange={(e) => setNationalId(e.target.value)}
            placeholder="14 رقم..."
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#777266]">تصنيف العميل</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3.5 py-2.5 text-sm font-bold text-[#24221F] outline-none focus:border-[#151515]"
            >
              <option value="عادي">عادي</option>
              <option value="مميز">عميل مميز (VIP)</option>
              <option value="محظور">محظور (Blacklisted)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#777266]">ملاحظات إضافية</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات أو عنوان العميل..."
              className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl p-3 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515]"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-[#E6DECD]">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="flex-1 font-black"
            >
              {editingCustomer ? 'حفظ التعديلات' : 'إضافة العميل'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* CUSTOMER HISTORY MODAL */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`سجل تعاملات: ${selectedCustomer?.name || ''}`}
        subtitle={`الهاتف: ${selectedCustomer?.phone || ''} | إجمالي المشتريات: ${Number(selectedCustomer?.total_spent || 0).toLocaleString()} ج.م`}
        maxWidth="max-w-3xl"
      >
        {historyLoading ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل سجل العميل...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Sales Orders */}
            <div>
              <h4 className="text-sm font-black text-[#24221F] mb-3 flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#151515]" />
                <span>فواتير الشراء السابقة</span>
              </h4>
              {!historyData?.orders || historyData.orders.length === 0 ? (
                <p className="text-xs text-[#777266] bg-[#FAF6ED] p-4 rounded-2xl text-center font-bold border border-[#E6DECD]">
                  لا توجد فواتير شراء مسجلة لهذا العميل
                </p>
              ) : (
                <div className="overflow-x-auto border border-[#E6DECD] rounded-2xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#FAF6ED] border-b border-[#E6DECD] font-bold text-[#777266]">
                      <tr>
                        <th className="p-3">رقم الفاتورة</th>
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">الإجمالي</th>
                        <th className="p-3">المدفوع</th>
                        <th className="p-3">طريقة الدفع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                      {historyData.orders.map((o) => (
                        <tr key={o.id} className="hover:bg-[#FAF6ED]/50 transition-colors">
                          <td className="p-3 font-bold text-[#24221F]">#{o.branch_invoice_number || o.id}</td>
                          <td className="p-3 text-[#777266]" dir="ltr">{new Date(o.order_date || o.created_at).toLocaleDateString('ar-EG')}</td>
                          <td className="p-3 font-black text-[#24221F]">{Number(o.total_amount || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 text-emerald-700 font-bold">{Number(o.paid_amount || 0).toLocaleString()} ج.م</td>
                          <td className="p-3 text-[#565147]">{o.payment_method || 'كاش'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Rentals */}
            <div>
              <h4 className="text-sm font-black text-[#24221F] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#151515]" />
                <span>حجوزات التأجير السابقة</span>
              </h4>
              {!historyData?.rentals || historyData.rentals.length === 0 ? (
                <p className="text-xs text-[#777266] bg-[#FAF6ED] p-4 rounded-2xl text-center font-bold border border-[#E6DECD]">
                  لا توجد حجوزات تأجير مسجلة لهذا العميل
                </p>
              ) : (
                <div className="overflow-x-auto border border-[#E6DECD] rounded-2xl">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-[#FAF6ED] border-b border-[#E6DECD] font-bold text-[#777266]">
                      <tr>
                        <th className="p-3">الحجز</th>
                        <th className="p-3">القطعة</th>
                        <th className="p-3">الفترة</th>
                        <th className="p-3">السعر والتأمين</th>
                        <th className="p-3">الحالة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                      {historyData.rentals.map((r) => (
                        <tr key={r.id} className="hover:bg-[#FAF6ED]/50 transition-colors">
                          <td className="p-3 font-bold text-[#24221F]">#{r.id}</td>
                          <td className="p-3 font-bold text-[#24221F]">{r.inventory_name || 'قطعة تأجير'}</td>
                          <td className="p-3 text-[#777266]">{r.pickup_date} إلى {r.return_date}</td>
                          <td className="p-3 font-black text-[#24221F]">
                            {Number(r.total_price || 0).toLocaleString()} ج.م
                          </td>
                          <td className="p-3">
                            {(() => {
                              const isReturnedWithRem = r.status === 'returned' && Number(r.remaining || 0) > 0;
                              const statusMap = {
                                booked: { label: 'محجوزة', variant: 'warning' },
                                active: { label: 'تم الاستلام (نشط)', variant: 'info' },
                                returned: { label: 'تم الإرجاع (خالص)', variant: 'success' },
                                sold: { label: 'محولة لبيع', variant: 'purple' },
                                cancelled: { label: 'ملغي', variant: 'danger' },
                              };
                              const badgeInfo = isReturnedWithRem
                                ? { label: 'مرتجع (غير خالص / عليه متبقي)', variant: 'warning' }
                                : (statusMap[r.status] || { label: r.status || '-', variant: 'neutral' });
                              return (
                                <Badge variant={badgeInfo.variant}>
                                  {badgeInfo.label}
                                </Badge>
                              );
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Customers;
