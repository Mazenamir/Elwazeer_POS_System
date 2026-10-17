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
import { printElement } from '../../utils/print';
import { ThermalReceipt } from '../../components/receipts';


const STATUS_MAP = {
  booked: { label: 'محجوزة', variant: 'warning' },
  active: { label: 'تم الاستلام', variant: 'info' },
  returned: { label: 'تم الإرجاع (خالص)', variant: 'success' },
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
  const [returnSettlementAction, setReturnSettlementAction] = useState('collect'); // 'collect' | 'deduct_deposit' | 'debt'
  const [returnPaidAmount, setReturnPaidAmount] = useState('');
  const [returnPaymentMethod, setReturnPaymentMethod] = useState('cash');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Settle Payment Modal State (for rentals with remaining debt)
  const [showSettlePaymentModal, setShowSettlePaymentModal] = useState(false);
  const [selectedRentalForPayment, setSelectedRentalForPayment] = useState(null);
  const [paymentSettleAmount, setPaymentSettleAmount] = useState('');
  const [paymentSettleMethod, setPaymentSettleMethod] = useState('cash');
  const [paymentSettleNotes, setPaymentSettleNotes] = useState('');
  const [paymentSettleSubmitting, setPaymentSettleSubmitting] = useState(false);

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
    const rem = Number(rental.remaining || 0);
    if (rem > 0) {
      setReturnSettlementAction('collect');
      setReturnPaidAmount(rem.toString());
    } else {
      setReturnSettlementAction('collect');
      setReturnPaidAmount('0');
    }
    setReturnPaymentMethod('cash');
    setReturnNotes('');
    setShowReturnModal(true);
  };

  // Submit Return
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRentalForReturn) return;

    const rem = Number(selectedRentalForReturn.remaining || 0);
    const fine = Number(fineAmount) || 0;

    if (rem > 0) {
      if (!returnSettlementAction) {
        toast.warning('يرجى اختيار طريقة تسوية المتبقي');
        return;
      }
      if (returnSettlementAction === 'collect') {
        const paid = Number(returnPaidAmount);
        if (isNaN(paid) || paid <= 0) {
          toast.warning('يرجى إدخال مبلغ تحصيل صحيح أكبر من الصفر');
          return;
        }
        if (paid > rem) {
          toast.warning(`المبلغ المحصل (${paid} ج.م) لا يمكن أن يتجاوز المتبقي المطلوب (${rem} ج.م)`);
          return;
        }
      } else if (returnSettlementAction === 'deduct_deposit') {
        const dep = Number(selectedRentalForReturn.deposit || 0);
        const avail = Math.max(0, dep - fine);
        if (avail <= 0) {
          toast.warning('مبلغ التأمين المتاح 0 ج.م ولا يمكن الخصم منه');
          return;
        }
      }
    }

    setReturnSubmitting(true);
    try {
      await api.put(`/rentals/${selectedRentalForReturn.id}/return`, {
        fine,
        settlement_action: rem > 0 ? returnSettlementAction : 'collect',
        paid_amount: rem > 0 ? Number(returnPaidAmount) || 0 : 0,
        payment_method: returnPaymentMethod,
        notes: returnNotes.trim(),
      });
      toast.success('تم استرجاع القطعة وتسوية الحساب بنجاح! ✅');
      setShowReturnModal(false);
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل استرجاع الإيجار');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Open Settle Payment Modal
  const openSettlePaymentModal = (rental) => {
    setSelectedRentalForPayment(rental);
    setPaymentSettleAmount(rental.remaining ? rental.remaining.toString() : '');
    setPaymentSettleMethod('cash');
    setPaymentSettleNotes('');
    setShowSettlePaymentModal(true);
  };

  // Submit Settle Payment
  const handleSettlePaymentSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRentalForPayment) return;
    const pay = Number(paymentSettleAmount);
    if (!pay || pay <= 0) {
      toast.warning('يرجى إدخال مبلغ سداد صحيح أكبر من الصفر');
      return;
    }
    const maxPay = Number(selectedRentalForPayment.remaining || 0);
    if (pay > maxPay) {
      toast.warning(`المبلغ المدخل (${pay}) أكبر من المتبقي المطلوب (${maxPay})`);
      return;
    }

    setPaymentSettleSubmitting(true);
    try {
      await api.put(`/rentals/${selectedRentalForPayment.id}/settle-payment`, {
        paid_amount: pay,
        payment_method: paymentSettleMethod,
        notes: paymentSettleNotes.trim(),
      });
      toast.success('تم تسجيل سداد المبلغ بنجاح! ✨');
      setShowSettlePaymentModal(false);
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل السداد');
    } finally {
      setPaymentSettleSubmitting(false);
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
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{summary.returned || 0}</span>
              {Number(summary.returned_debt || 0) > 0 && (
                <span className="text-[11px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg border border-amber-200">
                  {summary.returned_debt} عليه متبقي
                </span>
              )}
            </div>
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
                <option value="returned">مُرجعة (الكل)</option>
                <option value="returned_debt">مرتجع (غير خالص / عليه متبقي)</option>
                <option value="returned_settled">تم الإرجاع (خالص)</option>
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
                  const isReturnedWithRemaining = r.status === 'returned' && Number(r.remaining || 0) > 0;
                  const statusInfo = isReturnedWithRemaining
                    ? {
                        label: 'مرتجع (غير خالص / عليه متبقي)',
                        variant: 'warning',
                      }
                    : (r.status === 'returned'
                        ? { label: 'تم الإرجاع (خالص)', variant: 'success' }
                        : (STATUS_MAP[r.status] || {
                            label: r.status,
                            variant: 'neutral',
                          }));
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

                          {/* Settle Remaining Payment if remaining > 0 (for returned or active) */}
                          {Number(r.remaining || 0) > 0 && r.status !== 'cancelled' && (
                            <Button
                              variant="warning"
                              size="sm"
                              onClick={() => openSettlePaymentModal(r)}
                              className="!bg-amber-500 hover:!bg-amber-600 text-white font-bold text-xs"
                              title="سداد المبلغ المتبقي على العميل"
                            >
                              سداد متبقي
                            </Button>
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
        subtitle={`حجز رقم #${selectedRentalForReturn?.id || ''} - العميل: ${selectedRentalForReturn?.customer_name || ''}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleReturnSubmit} className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
            <div className="flex justify-between font-bold text-slate-700">
              <span>القطعة:</span>
              <span>{selectedRentalForReturn?.inventory_name || 'قطعة تأجير'}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>قيمة التأجير الأصلية:</span>
              <span className="font-black text-indigo-600">
                {Number(selectedRentalForReturn?.total_price || 0).toLocaleString()} ج.م
              </span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>مبلغ التأمين المحتجز (الضمان):</span>
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

          {/* Remaining Balance Settlement Section */}
          {Number(selectedRentalForReturn?.remaining || 0) > 0 ? (
            <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-black text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  متبقي على العميل:{' '}
                  <span className="text-rose-600 text-sm font-black">
                    {Number(selectedRentalForReturn.remaining).toLocaleString()} ج.م
                  </span>
                </span>
              </div>
              <p className="text-[11px] text-amber-900 font-medium">
                يلزم تسوية المتبقي أولاً أو تسجيله كدين لإتمام الإرجاع:
              </p>

              <div className="space-y-2">
                {/* Option 1: Collect now */}
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    returnSettlementAction === 'collect'
                      ? 'bg-white border-indigo-600 shadow-sm'
                      : 'border-amber-200 hover:bg-white/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="return_settlement_action"
                    value="collect"
                    checked={returnSettlementAction === 'collect'}
                    onChange={() => setReturnSettlementAction('collect')}
                    className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-900">
                      تحصيل وسداد المتبقي الآن (خالص)
                    </div>
                    <div className="text-[11px] text-slate-500">
                      يقوم العميل بسداد المتبقي حالياً نقداً أو إلكترونياً
                    </div>
                  </div>
                </label>

                {/* Option 2: Deduct from deposit if deposit > 0 */}
                {Number(selectedRentalForReturn?.deposit || 0) > 0 && (() => {
                  const availDep = Math.max(0, Number(selectedRentalForReturn.deposit || 0) - Number(fineAmount || 0));
                  const isDepZero = availDep <= 0;
                  return (
                    <label
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border transition-all ${
                        isDepZero
                          ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-50'
                          : returnSettlementAction === 'deduct_deposit'
                          ? 'bg-white border-indigo-600 shadow-sm cursor-pointer'
                          : 'border-amber-200 hover:bg-white/60 cursor-pointer'
                      }`}
                    >
                      <input
                        type="radio"
                        name="return_settlement_action"
                        value="deduct_deposit"
                        disabled={isDepZero}
                        checked={returnSettlementAction === 'deduct_deposit'}
                        onChange={() => setReturnSettlementAction('deduct_deposit')}
                        className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-900">
                          خصم المتبقي من التأمين المحتجز
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {isDepZero
                            ? 'لا يتوفر مبلغ تأمين متاح للخصم (تم استهلاك التأمين في الغرامات)'
                            : `خصم حتى ${Math.min(availDep, Number(selectedRentalForReturn.remaining || 0)).toLocaleString()} ج.م من التأمين وتصفية الحساب`}
                        </div>
                      </div>
                    </label>
                  );
                })()}

                {/* Option 3: Record as debt */}
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    returnSettlementAction === 'debt'
                      ? 'bg-white border-rose-500 shadow-sm'
                      : 'border-amber-200 hover:bg-white/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="return_settlement_action"
                    value="debt"
                    checked={returnSettlementAction === 'debt'}
                    onChange={() => setReturnSettlementAction('debt')}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-slate-900">
                      تسجيل المبلغ كدين خالص على العميل (آجل)
                    </div>
                    <div className="text-[11px] text-rose-600 font-medium">
                      إرجاع البدلة مع تثبيت دين قدره{' '}
                      {Number(selectedRentalForReturn.remaining).toLocaleString()} ج.م على العميل
                      (تظهر كمرتجع عليه متبقي)
                    </div>
                  </div>
                </label>
              </div>

              {/* If collect selected: show amount and payment method */}
              {returnSettlementAction === 'collect' && (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200/80">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      المبلغ المحصل (ج.م) *
                    </label>
                    <input
                      type="number"
                      required
                      value={returnPaidAmount}
                      onChange={(e) => setReturnPaidAmount(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">
                      طريقة الدفع
                    </label>
                    <select
                      value={returnPaymentMethod}
                      onChange={(e) => setReturnPaymentMethod(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-indigo-600"
                    >
                      <option value="cash">نقدي (كاش)</option>
                      <option value="card">بطاقة (فيزا)</option>
                      <option value="wallet">فودافون كاش / محفظة</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>قيمة الإيجار مسددة بالكامل (لا يوجد متبقي على العميل).</span>
            </div>
          )}

          {/* Settlement Summary Calculations */}
          {(() => {
            const dep = Number(selectedRentalForReturn?.deposit || 0);
            const fine = Number(fineAmount || 0);
            const rem = Number(selectedRentalForReturn?.remaining || 0);

            let netRefund = Math.max(0, dep - fine);
            let finalRemaining = rem;

            if (rem > 0) {
              if (returnSettlementAction === 'deduct_deposit') {
                const avail = Math.max(0, dep - fine);
                const deduct = Math.min(avail, rem);
                netRefund = Math.max(0, avail - deduct);
                finalRemaining = Math.max(0, rem - deduct);
              } else if (returnSettlementAction === 'collect') {
                const paid = Number(returnPaidAmount || 0);
                finalRemaining = Math.max(0, rem - paid);
              }
            }

            return (
              <div className="space-y-2 p-3 bg-slate-100 rounded-xl text-xs font-bold">
                <div className="flex justify-between text-emerald-800">
                  <span>المبلغ المسترد للعميل من التأمين:</span>
                  <span className="font-black text-sm">{netRefund.toLocaleString()} ج.م</span>
                </div>
                {finalRemaining > 0 ? (
                  <div className="flex justify-between text-rose-600 pt-1 border-t border-slate-200">
                    <span>المتبقي المسجل على العميل:</span>
                    <span className="font-black text-sm">
                      {finalRemaining.toLocaleString()} ج.م (دين مؤجل)
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-between text-emerald-700 pt-1 border-t border-slate-200">
                    <span>حالة الحساب بعد الإرجاع:</span>
                    <span className="font-black">خالص بالكامل (تم الإرجاع خالص) ✅</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Notes */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ملاحظات تسوية الإرجاع (اختياري)
            </label>
            <input
              type="text"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              placeholder="أي ملاحظات خاصة بالتسوية أو الاستلام..."
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            {(() => {
              const dep = Number(selectedRentalForReturn?.deposit || 0);
              const fine = Number(fineAmount || 0);
              const rem = Number(selectedRentalForReturn?.remaining || 0);
              let finalRemaining = rem;
              if (rem > 0) {
                if (returnSettlementAction === 'deduct_deposit') {
                  const avail = Math.max(0, dep - fine);
                  const deduct = Math.min(avail, rem);
                  finalRemaining = Math.max(0, rem - deduct);
                } else if (returnSettlementAction === 'collect') {
                  const paid = Number(returnPaidAmount || 0);
                  finalRemaining = Math.max(0, rem - paid);
                }
              }
              const hasDebt = finalRemaining > 0;
              return (
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={returnSubmitting}
                  className={`flex-1 font-black ${
                    hasDebt
                      ? '!bg-amber-600 hover:!bg-amber-700 text-white'
                      : '!bg-emerald-600 hover:!bg-emerald-700 text-white'
                  }`}
                >
                  {hasDebt
                    ? 'تأكيد الاسترجاع وتسجيل المتبقي كدين'
                    : 'تأكيد الاسترجاع وتسوية الحساب (خالص) ✅'}
                </Button>
              );
            })()}
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

      {/* SETTLE PAYMENT MODAL (سداد المتبقي) */}
      <Modal
        isOpen={showSettlePaymentModal}
        onClose={() => setShowSettlePaymentModal(false)}
        title="سداد المبلغ المتبقي على العميل 💰"
        subtitle={`حجز رقم #${selectedRentalForPayment?.id || ''} - العميل: ${selectedRentalForPayment?.customer_name || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSettlePaymentSubmit} className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-2">
            <div className="flex justify-between font-bold text-slate-700">
              <span>القطعة:</span>
              <span>{selectedRentalForPayment?.inventory_name || 'قطعة تأجير'}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-700">
              <span>إجمالي قيمة الحجز:</span>
              <span className="font-mono">
                {Number(selectedRentalForPayment?.total_price || 0).toLocaleString()} ج.م
              </span>
            </div>
            <div className="flex justify-between font-bold text-rose-600 pt-1 border-t border-amber-200">
              <span>المبلغ المتبقي المطلوب سداده:</span>
              <span className="text-sm font-black">
                {Number(selectedRentalForPayment?.remaining || 0).toLocaleString()} ج.م
              </span>
            </div>
          </div>

          <Input
            label="المبلغ المدفوع حالياً (ج.م) *"
            type="number"
            required
            value={paymentSettleAmount}
            onChange={(e) => setPaymentSettleAmount(e.target.value)}
            helperText={`الحد الأقصى للسداد: ${Number(selectedRentalForPayment?.remaining || 0).toLocaleString()} ج.م`}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
            <select
              value={paymentSettleMethod}
              onChange={(e) => setPaymentSettleMethod(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600"
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش / محفظة</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ملاحظات السداد (اختياري)
            </label>
            <input
              type="text"
              value={paymentSettleNotes}
              onChange={(e) => setPaymentSettleNotes(e.target.value)}
              placeholder="رقم العملية أو ملاحظات خاصة..."
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={paymentSettleSubmitting}
              className="flex-1 !bg-emerald-600 hover:!bg-emerald-700 font-black text-white"
            >
              تأكيد سداد المبلغ وتحديث الحساب
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowSettlePaymentModal(false)}
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
        maxWidth="max-w-sm"
        hideHeader={true}
        plain={true}
        bodyClassName="p-2 sm:p-4 flex justify-center overflow-visible"
      >
        {selectedReceiptRental && (
          <ThermalReceipt
            id="printable-rental-receipt"
            type="rental"
            title="إيصال حجز وتأجير"
            orderNumber={`RNT-${selectedReceiptRental.id}`}
            date={selectedReceiptRental.created_at || new Date()}
            customerName={selectedReceiptRental.customer_name}
            customerPhone={selectedReceiptRental.customer_phone}
            sellerName="مسؤول التأجير"
            paymentMethod="كاش"
            branchName={branches.find((b) => b.id?.toString() === activeBranchId?.toString())?.name || 'الفرع الرئيسي'}
            items={[
              {
                name: selectedReceiptRental.inventory_name || 'قطعة تأجير',
                quantity: 1,
                price: Number(selectedReceiptRental.total_price || 0),
              },
            ]}
            subtotal={Number(selectedReceiptRental.total_price || 0)}
            deposit={Number(selectedReceiptRental.deposit || 0)}
            totalAmount={Number(selectedReceiptRental.total_price || 0)}
            paidAmount={Number(selectedReceiptRental.paid_amount || 0)}
            remainingAmount={Number(selectedReceiptRental.remaining || 0)}
            pickupDate={selectedReceiptRental.pickup_date}
            returnDate={selectedReceiptRental.return_date}
            footerMessage="يرجى إحضار هذا الإيصال عند الاستلام والتسليم • شكراً لثقتكم بنا"
            onPrint={() => printElement('printable-rental-receipt', `إيصال حجز تأجير #${selectedReceiptRental.id}`)}
            onClose={() => setShowReceiptModal(false)}
          />
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
      {/* SALE INVOICE RECEIPT MODAL */}
      <Modal
        isOpen={showSaleInvoiceModal}
        onClose={() => setShowSaleInvoiceModal(false)}
        maxWidth="max-w-sm"
        hideHeader={true}
        plain={true}
        bodyClassName="p-2 sm:p-4 flex justify-center overflow-visible"
      >
        {saleInvoiceData && (
          <ThermalReceipt
            id="printable-sale-receipt"
            type="rental-sale"
            title="فاتورة بيع (تحويل تأجير)"
            orderNumber={saleInvoiceData.order_number}
            date={saleInvoiceData.created_at || new Date()}
            customerName={saleInvoiceData.customer_name}
            customerPhone={saleInvoiceData.customer_phone}
            sellerName="مسؤول التأجير"
            paymentMethod={saleInvoiceData.payment_method || 'كاش'}
            branchName={branches.find((b) => b.id?.toString() === activeBranchId?.toString())?.name || 'الفرع الرئيسي'}
            items={[
              {
                name: saleInvoiceData.inventory_name || 'قطعة تأجير محولة لبيع',
                quantity: 1,
                price: Number(saleInvoiceData.sell_price || 0),
              },
            ]}
            subtotal={Number(saleInvoiceData.sell_price || 0)}
            totalAmount={Number(saleInvoiceData.sell_price || 0)}
            paidAmount={Number(saleInvoiceData.sell_price || 0)}
            remainingAmount={0}
            footerMessage="تم تحويل الصنف إلى بيع نهائي ونقله من المخزون • شكراً لتعاملكم معنا"
            onPrint={() => printElement('printable-sale-receipt', `فاتورة بيع تأجير #${saleInvoiceData.order_number}`)}
            onClose={() => setShowSaleInvoiceModal(false)}
          />
        )}
      </Modal>
    </div>
  );
}

export default Rentals;
