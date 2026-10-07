import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  Calendar,
  Plus,
  Search,
  RotateCcw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  X,
  User,
  Phone,
  ShieldCheck,
  CreditCard,
  DollarSign,
  Tag,
  Check,
  Ban,
  PackageCheck,
  Eye,
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

const STATUS_MAP = {
  booked: { label: 'محجوزة', variant: 'warning' },
  active: { label: 'تم الاستلام', variant: 'info' },
  returned: { label: 'مُرجعة', variant: 'success' },
  sold: { label: 'محولة لبيع', variant: 'purple' },
  cancelled: { label: 'ملغي', variant: 'danger' },
};

export function Rentals() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();

  // Data State
  const [rentals, setRentals] = useState([]);
  const [summary, setSummary] = useState({ booked: 0, active: 0, returned: 0, cancelled: 0 });
  const [loading, setLoading] = useState(true);
  const [rentalInventory, setRentalInventory] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // New Booking Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [hasIdGuarantee, setHasIdGuarantee] = useState(true);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [pickupDate, setPickupDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [returnDate, setReturnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  });
  const [totalPrice, setTotalPrice] = useState('');
  const [deposit, setDeposit] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');

  // Customer auto-suggestions
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Return Modal State
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedRentalForReturn, setSelectedRentalForReturn] = useState(null);
  const [fineAmount, setFineAmount] = useState('0');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Thermal Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptRental, setSelectedReceiptRental] = useState(null);

  // Sale Conversion Modal State
  const [showSaleConversionModal, setShowSaleConversionModal] = useState(false);
  const [selectedRentalForSale, setSelectedRentalForSale] = useState(null);
  const [salePrice, setSalePrice] = useState('');
  const [salePaymentMethod, setSalePaymentMethod] = useState('cash');
  const [saleConverting, setSaleConverting] = useState(false);
  const [showSaleInvoiceModal, setShowSaleInvoiceModal] = useState(false);
  const [saleInvoiceData, setSaleInvoiceData] = useState(null);

  // Load Rentals Summary
  const fetchSummary = useCallback(async () => {
    try {
      const summaryUrl = `/rentals/summary${(activeBranchId && activeBranchId !== 'all') ? `?branch_id=${activeBranchId}` : ''}`;
      const res = await api.get(summaryUrl);
      if (res) setSummary(res);
    } catch {}
  }, [activeBranchId]);

  // Load Rentals List
  const fetchRentals = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
      if (statusFilter !== 'all') query.append('status', statusFilter);
      if (search.trim()) query.append('name', search.trim());

      const data = await api.get(`/rentals?${query.toString()}`);
      setRentals(Array.isArray(data) ? data : (data?.rentals || data?.data || data?.items || []));
    } catch (err) {
      console.error('Failed to load rentals:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, statusFilter, search]);

  useEffect(() => {
    fetchRentals();
    fetchSummary();
  }, [fetchRentals, fetchSummary]);

  // Load Rental Inventory for creation
  useEffect(() => {
    async function loadLookups() {
      try {
        const invUrl = `/rental-inventory${(activeBranchId && activeBranchId !== 'all') ? `?branch_id=${activeBranchId}` : ''}`;
        const empUrl = `/employees${(activeBranchId && activeBranchId !== 'all') ? `?branch_id=${activeBranchId}` : ''}`;
        const [invRes, empRes] = await Promise.all([
          api.get(invUrl),
          api.get(empUrl),
        ]);
        setRentalInventory(Array.isArray(invRes) ? invRes : (invRes?.items || invRes?.data || []));
        if (Array.isArray(empRes)) {
          setEmployees(empRes);
          if (empRes.length > 0 && !sellerId) setSellerId(empRes[0].id.toString());
        }
      } catch {}
    }
    loadLookups();
  }, [activeBranchId]);

  // Search customers on typing
  const searchCustomers = async (query) => {
    if (!query || query.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const branchParam = (activeBranchId && activeBranchId !== 'all') ? `&branch_id=${activeBranchId}` : '';
      const data = await api.get(`/customers?search=${encodeURIComponent(query)}${branchParam}`);
      const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
      setCustomerSuggestions(list);
      setShowSuggestions(list.length > 0);
    } catch {
      setCustomerSuggestions([]);
    }
  };

  // Select Item updates default price and deposit
  const handleItemSelect = (itemId) => {
    setSelectedItemId(itemId);
    const item = rentalInventory.find((i) => i.id.toString() === itemId.toString());
    if (item) {
      setTotalPrice(item.rental_price ? item.rental_price.toString() : '');
      setDeposit(item.deposit ? item.deposit.toString() : '500');
    }
  };

  // Submit New Rental Booking
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !selectedItemId) {
      toast.error('الرجاء إدخال بيانات العميل واختيار قطعة التأجير');
      return;
    }

    setSubmitting(true);
    try {
      const price = Number(totalPrice) || 0;
      const dep = Number(deposit) || 0;
      const paid = Number(paidAmount) || 0;
      const remaining = Math.max(0, price - paid);

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        national_id: nationalId.trim(),
        branch_id: (activeBranchId && activeBranchId !== 'all') ? Number(activeBranchId) : (branches[0]?.id || 1),
        rental_inventory_id: Number(selectedItemId),
        pickup_date: pickupDate,
        return_date: returnDate,
        total_price: price,
        deposit: dep,
        paid_amount: paid,
        remaining,
        id_card_guarantee: hasIdGuarantee,
        seller_id: sellerId ? Number(sellerId) : null,
        payment_method: paymentMethod,
        notes: notes.trim(),
      };

      const res = await api.post('/rentals', payload);
      toast.success('تم تسجيل وحفظ حجز التأجير بنجاح! ✨');
      setShowCreateModal(false);

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setNationalId('');
      setSelectedItemId('');
      setTotalPrice('');
      setDeposit('');
      setPaidAmount('');
      setNotes('');

      fetchRentals();
      fetchSummary();

      // Show receipt
      setSelectedReceiptRental(res);
      setShowReceiptModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل الحجز');
    } finally {
      setSubmitting(false);
    }
  };

  // Pickup Rental
  const handlePickup = async (rentalId) => {
    if (!confirm('هل تريد تأكيد تسليم القطعة للعميل وبدء فترة التأجير؟')) return;
    try {
      await api.put(`/rentals/${rentalId}/pickup`);
      toast.success('تم تأكيد تسليم القطعة بنجاح! 👗');
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل تأكيد الاستلام');
    }
  };

  // Cancel Rental
  const handleCancel = async (rentalId) => {
    if (!confirm('هل أنت متأكد من إلغاء هذا الحجز؟')) return;
    try {
      await api.put(`/rentals/${rentalId}/cancel`);
      toast.success('تم إلغاء الحجز');
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل إلغاء الحجز');
    }
  };

  // Open Return Modal
  const openReturnModal = (rental) => {
    setSelectedRentalForReturn(rental);
    setFineAmount(rental.suggested_fine ? rental.suggested_fine.toString() : '0');
    setShowReturnModal(true);
  };

  // Submit Return
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRentalForReturn) return;

    setReturnSubmitting(true);
    try {
      await api.put(`/rentals/${selectedRentalForReturn.id}/return`, {
        fine: Number(fineAmount) || 0,
      });
      toast.success('تم استرجاع القطعة وتسوية التأمين بنجاح! ✅');
      setShowReturnModal(false);
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل استرجاع الإيجار');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Open Sale Conversion Modal
  const openSaleConversionModal = (rental) => {
    setSelectedRentalForSale(rental);
    setSalePrice(rental.total_price ? (Number(rental.total_price) * 2).toString() : '500');
    setSalePaymentMethod(rental.payment_method || 'cash');
    setShowSaleConversionModal(true);
  };

  // Submit Sale Conversion
  const handleSaleConversionSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRentalForSale) return;
    const numericPrice = Number(salePrice);
    if (!numericPrice || numericPrice <= 0) {
      toast.warning('يرجى إدخال سعر بيع صحيح');
      return;
    }

    try {
      setSaleConverting(true);
      const res = await api.put(`/rentals/${selectedRentalForSale.id}/sell`, {
        sell_price: numericPrice,
        payment_method: salePaymentMethod,
      });

      toast.success('تم تحويل التأجير إلى بيع نهائي بنجاح! 🏷️');
      setShowSaleConversionModal(false);

      setSaleInvoiceData({
        order_number: res.order_id || res.id || selectedRentalForSale.id,
        customer_name: selectedRentalForSale.customer_name,
        customer_phone: selectedRentalForSale.customer_phone,
        inventory_name: selectedRentalForSale.inventory_name,
        sell_price: numericPrice,
        payment_method: salePaymentMethod,
        created_at: new Date().toISOString(),
      });

      fetchRentals();
      fetchSummary();
      setShowSaleInvoiceModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل تحويل التأجير إلى بيع');
    } finally {
      setSaleConverting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            إدارة التأجير والمناسبات ✨
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            متابعة حجوزات البدل والسموكنج، تواريخ الاستلام والتسليم والتأمين
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={Plus}
          onClick={() => setShowCreateModal(true)}
          className="!bg-indigo-600 hover:!bg-indigo-700 shadow-md shadow-indigo-600/20"
        >
          حجز إيجار جديد
        </Button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">محجوزة</div>
            <div className="text-2xl font-black text-slate-900">{summary.booked || 0}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">تم الاستلام</div>
            <div className="text-2xl font-black text-slate-900">{summary.active || 0}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">مُرجعة</div>
            <div className="text-2xl font-black text-slate-900">{summary.returned || 0}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-400">ملغي</div>
            <div className="text-2xl font-black text-slate-900">{summary.cancelled || 0}</div>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="سجل الحجوزات"
          subtitle="استعراض وتحديث حالات الإيجارات"
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث باسم العميل أو الهاتف..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold outline-none focus:border-indigo-600"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="all">كل الحالات</option>
                <option value="booked">محجوزة</option>
                <option value="active">تم الاستلام</option>
                <option value="returned">مُرجعة</option>
                <option value="sold">محولة لبيع</option>
                <option value="cancelled">ملغي</option>
              </select>

              <Button variant="outline" size="sm" onClick={fetchRentals} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل الحجوزات...
          </div>
        ) : rentals.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            لا توجد حجوزات مسجلة مطابقة للبحث
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 text-xs font-black uppercase">
                  <th className="pb-3 pr-2">رقم الحجز</th>
                  <th className="pb-3">العميل</th>
                  <th className="pb-3">القطعة المستأجرة</th>
                  <th className="pb-3">فترة الإيجار</th>
                  <th className="pb-3">الإجمالي والتأمين</th>
                  <th className="pb-3">المتبقي</th>
                  <th className="pb-3">الحالة</th>
                  <th className="pb-3 pl-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rentals.map((r) => {
                  const statusInfo = STATUS_MAP[r.status] || {
                    label: r.status,
                    variant: 'neutral',
                  };
                  const isDelay = r.delay_days > 0 && r.status === 'active';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 pr-2 font-bold text-slate-900">
                        #{r.id}
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-slate-900">{r.customer_name}</div>
                        <div className="text-xs text-slate-400 font-mono" dir="ltr">
                          {r.customer_phone}
                        </div>
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-slate-800">
                          {r.inventory_name || 'قطعة تأجير'}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-bold mt-0.5">
                          {r.rental_inventory_id && (
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[10px]">
                              كود: #{r.rental_inventory_id}
                            </span>
                          )}
                          {r.inventory_barcode && (
                            <span className="font-mono text-slate-400">#{r.inventory_barcode}</span>
                          )}
                          {r.inventory_color && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100">
                              {r.inventory_color}
                            </span>
                          )}
                          {r.inventory_size && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100">
                              {r.inventory_size}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400 font-bold">من:</span>
                          <span>{new Date(r.pickup_date).toLocaleDateString('ar-EG')}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-slate-400 font-bold">إلى:</span>
                          <span className={isDelay ? 'text-rose-600 font-black' : ''}>
                            {new Date(r.return_date).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                        {isDelay && (
                          <div className="text-[11px] text-rose-600 font-black mt-0.5">
                            تأخير {r.delay_days} يوم!
                          </div>
                        )}
                      </td>
                      <td className="py-3.5">
                        <div className="font-black text-indigo-600 text-sm">
                          {Number(r.total_price || 0).toLocaleString()} ج.م
                        </div>
                        <div className="text-xs text-slate-400 font-bold mt-0.5">
                          تأمين: {Number(r.deposit || 0).toLocaleString()} ج.م
                        </div>
                      </td>
                      <td className="py-3.5">
                        {Number(r.remaining || 0) > 0 ? (
                          <span className="text-rose-600 font-black text-xs">
                            {Number(r.remaining).toLocaleString()} ج.م
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-bold text-xs">مسدد بالكامل</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        <Badge variant={statusInfo.variant} dot>
                          {statusInfo.label}
                        </Badge>
                      </td>
                      <td className="py-3.5 pl-2">
                        <div className="flex items-center gap-1.5">
                          {/* Pickup button if booked */}
                          {r.status === 'booked' && (
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handlePickup(r.id)}
                            >
                              تسليم القطعة
                            </Button>
                          )}

                          {/* Return button if active */}
                          {r.status === 'active' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => openReturnModal(r)}
                              className="!bg-indigo-600"
                            >
                              إرجاع وتسوية
                            </Button>
                          )}

                          {/* Cancel if booked */}
                          {r.status === 'booked' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(r.id)}
                              className="text-rose-600 hover:bg-rose-50"
                            >
                              إلغاء
                            </Button>
                          )}

                          {/* Convert to Sale if booked or active */}
                          {['booked', 'active'].includes(r.status) && (
                            <button
                              onClick={() => openSaleConversionModal(r)}
                              className="p-1.5 rounded-lg border border-purple-200 text-purple-600 hover:bg-purple-50 transition-colors"
                              title="تحويل التأجير إلى بيع نهائي"
                            >
                              <Tag className="w-4 h-4" />
                            </button>
                          )}

                          {/* Print Receipt */}
                          <button
                            onClick={() => {
                              setSelectedReceiptRental(r);
                              setShowReceiptModal(true);
                            }}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="طباعة إيصال الحجز"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
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

      {/* CREATE NEW RENTAL BOOKING MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="تسجيل حجز تأجير جديد ✨"
        subtitle="حجز بدلة تأجير مع تحديد التواريخ والتأمين"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {/* Customer Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <Input
                label="رقم هاتف العميل *"
                icon={Phone}
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  searchCustomers(e.target.value);
                }}
                placeholder="01XXXXXXXXX"
                required
              />
              {/* Customer Auto-Suggestions */}
              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 mt-1 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {customerSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone);
                        if (c.national_id) setNationalId(c.national_id);
                        setShowSuggestions(false);
                      }}
                      className="p-3 hover:bg-indigo-50 cursor-pointer transition-colors flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-slate-800">{c.name}</span>
                      <span className="font-mono text-slate-500">{c.phone}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Input
              label="اسم العميل *"
              icon={User}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="اسم العميل..."
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="الرقم القومي (اختياري)"
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              placeholder="14 رقم..."
            />
            <div className="flex items-center gap-2 pt-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={hasIdGuarantee}
                  onChange={(e) => setHasIdGuarantee(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
                />
                <span>استلام وصل أمانة أو بطاقة شخصية كضمان</span>
              </label>
            </div>
          </div>

          {/* Rental Item Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">قطعة التأجير (المخزون) *</label>
            <select
              value={selectedItemId}
              onChange={(e) => handleItemSelect(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              <option value="">اختر القطعة المراد حجزها...</option>
              {rentalInventory.map((item) => (
                <option key={item.id} value={item.id.toString()}>
                  #{item.id} - {item.name} {item.category ? `(${item.category})` : ''} {item.color ? `(${item.color})` : ''}{' '}
                  {item.size_cut ? `[${item.size_cut}]` : ''} - سعر الإيجار:{' '}
                  {Number(item.rental_price || 0).toLocaleString()} ج.م
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="تاريخ الاستلام *"
              type="date"
              icon={Calendar}
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              required
            />
            <Input
              label="تاريخ الإرجاع المتوقع *"
              type="date"
              icon={Calendar}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              required
            />
          </div>

          {/* Financials */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="سعر التأجير الإجمالي (ج.م) *"
              type="number"
              value={totalPrice}
              onChange={(e) => setTotalPrice(e.target.value)}
              placeholder="0"
              required
            />
            <Input
              label="مبلغ التأمين (ج.م) *"
              type="number"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              placeholder="500"
              required
            />
            <Input
              label="المدفوع مقدماً (ج.م)"
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Seller & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">الموظف المسؤول</label>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-indigo-600"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id.toString()}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-indigo-600"
              >
                <option value="cash">نقدي (كاش)</option>
                <option value="card">بطاقة (فيزا)</option>
                <option value="wallet">فودافون كاش</option>
                <option value="debt">آجل / متبقي</option>
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">ملاحظات الحجز</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات خاصة بالمقاس أو المناسبة..."
              rows={2}
              className="w-full bg-white border-2 border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-indigo-600"
            />
          </div>

          {/* Modal Buttons */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
            >
              تأكيد وحفظ الحجز
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

      {/* RETURN & SETTLEMENT MODAL */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="استرجاع القطعة وتسوية التأمين 📦"
        subtitle={`العميل: ${selectedRentalForReturn?.customer_name || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between font-bold text-slate-700">
              <span>القطعة:</span>
              <span>{selectedRentalForReturn?.inventory_name}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>مبلغ التأمين المحتجز:</span>
              <span className="text-emerald-600 font-black">
                {Number(selectedRentalForReturn?.deposit || 0).toLocaleString()} ج.م
              </span>
            </div>
            {selectedRentalForReturn?.delay_days > 0 && (
              <div className="flex justify-between font-bold text-rose-600">
                <span>أيام التأخير:</span>
                <span>{selectedRentalForReturn.delay_days} يوم</span>
              </div>
            )}
          </div>

          <Input
            label="مبلغ الغرامة / الخصم من التأمين (ج.م)"
            type="number"
            value={fineAmount}
            onChange={(e) => setFineAmount(e.target.value)}
            helperText="في حال وجود تلف أو تأخير، يتم خصم هذا المبلغ من التأمين"
          />

          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold flex justify-between">
            <span>المبلغ المسترد للعميل من التأمين:</span>
            <span className="font-black">
              {Math.max(
                0,
                Number(selectedRentalForReturn?.deposit || 0) - Number(fineAmount || 0)
              ).toLocaleString()}{' '}
              ج.م
            </span>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={returnSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              تأكيد الاسترجاع وتسليم التأمين
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowReturnModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* THERMAL RENTAL RECEIPT MODAL */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        title="إيصال حجز تأجير 🧾"
        subtitle="معاينة إيصال الاستلام والتأمين للطباعة الحرارية"
        maxWidth="max-w-md"
      >
        {selectedReceiptRental && (
          <div className="space-y-4">
            <div
              id="printable-rental-receipt"
              className="bg-white p-5 rounded-2xl border border-slate-200 text-black text-xs leading-relaxed space-y-3 font-mono shadow-sm"
              style={{ direction: 'rtl' }}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                <h2 className="text-base font-black">Bebyoon Center</h2>
                <p className="text-[11px] text-slate-600 font-bold">إيصال حجز وتأجير</p>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div>
                  <div>حجز رقم: #{selectedReceiptRental.id}</div>
                  <div>العميل: {selectedReceiptRental.customer_name}</div>
                  <div>الهاتف: {selectedReceiptRental.customer_phone}</div>
                </div>
                <div className="text-left" dir="ltr">
                  <div>استلام: {selectedReceiptRental.pickup_date}</div>
                  <div>إرجاع: {selectedReceiptRental.return_date}</div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div className="flex justify-between">
                  <span>القطعة:</span>
                  <span>{selectedReceiptRental.inventory_name || 'قطعة تأجير'}</span>
                </div>
                <div className="flex justify-between">
                  <span>قيمة التأجير:</span>
                  <span>{Number(selectedReceiptRental.total_price || 0).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>مبلغ التأمين:</span>
                  <span>{Number(selectedReceiptRental.deposit || 0).toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between">
                  <span>المدفوع:</span>
                  <span>{Number(selectedReceiptRental.paid_amount || 0).toLocaleString()} ج.م</span>
                </div>
                {Number(selectedReceiptRental.remaining || 0) > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>المتبقي:</span>
                    <span>{Number(selectedReceiptRental.remaining || 0).toLocaleString()} ج.م</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-2 space-y-1 text-[10px] text-slate-500">
                <p>يرجى إحضار هذا الإيصال عند الاستلام والتسليم</p>
                <p>شكراً لثقتكم بنا</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={Printer}
                onClick={() => window.print()}
                className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
              >
                طباعة الإيصال
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowReceiptModal(false)}
              >
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* SALE CONVERSION MODAL */}
      <Modal
        isOpen={showSaleConversionModal}
        onClose={() => setShowSaleConversionModal(false)}
        title="تحويل التأجير إلى بيع نهائي 🏷️"
        subtitle={`حجز رقم #${selectedRentalForSale?.id} - العميل: ${selectedRentalForSale?.customer_name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaleConversionSubmit} className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold space-y-1">
            <div>الصنف: {selectedRentalForSale?.inventory_name}</div>
            <div className="text-slate-500">
              قيمة التأجير الأصلية: {Number(selectedRentalForSale?.total_price || 0).toLocaleString()} ج.م
            </div>
          </div>

          <Input
            label="سعر البيع النهائي (ج.م) *"
            type="number"
            required
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
            <select
              value={salePaymentMethod}
              onChange={(e) => setSalePaymentMethod(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش / محفظة</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={saleConverting}
              className="flex-1 !rounded-2xl !bg-purple-600 hover:!bg-purple-700 font-black text-white"
            >
              تأكيد البيع النهائي
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowSaleConversionModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* SALE INVOICE RECEIPT MODAL */}
      <Modal
        isOpen={showSaleInvoiceModal}
        onClose={() => setShowSaleInvoiceModal(false)}
        title="فاتورة بيع نهائي (تحويل تأجير) 🧾"
        subtitle="معاينة إيصال البيع الحراري (80mm)"
        maxWidth="max-w-md"
      >
        {saleInvoiceData && (
          <div className="space-y-4">
            <div
              id="printable-sale-receipt"
              className="bg-white p-5 rounded-2xl border border-slate-200 text-black text-xs leading-relaxed space-y-3 font-mono shadow-sm"
              style={{ direction: 'rtl' }}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                <h2 className="text-base font-black">Bebyoon Center</h2>
                <p className="text-[11px] text-purple-600 font-black">فاتورة بيع (تحويل من تأجير)</p>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div>
                  <div>رقم الفاتورة: #{saleInvoiceData.order_number}</div>
                  <div>العميل: {saleInvoiceData.customer_name}</div>
                  <div>الهاتف: {saleInvoiceData.customer_phone || '-'}</div>
                </div>
                <div className="text-left" dir="ltr">
                  <div>{new Date(saleInvoiceData.created_at).toLocaleDateString('ar-EG')}</div>
                </div>
              </div>

              <div className="space-y-1 text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div className="flex justify-between">
                  <span>الصنف المباع:</span>
                  <span>{saleInvoiceData.inventory_name}</span>
                </div>
                <div className="flex justify-between text-base font-black text-purple-600 pt-1">
                  <span>سعر البيع النهائي:</span>
                  <span>{saleInvoiceData.sell_price.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>طريقة الدفع:</span>
                  <span>{saleInvoiceData.payment_method}</span>
                </div>
              </div>

              <div className="text-center pt-2 space-y-1 text-[10px] text-slate-500">
                <p>تم تحويل الصنف إلى بيع دائم ونقله من المخزون</p>
                <p>شكراً لتعاملكم معنا</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={Printer}
                onClick={() => window.print()}
                className="flex-1 !bg-purple-600 hover:!bg-purple-700 font-black"
              >
                طباعة الفاتورة
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowSaleInvoiceModal(false)}
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

export default Rentals;
