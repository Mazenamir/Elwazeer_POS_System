import React, { useState, useEffect, useCallback } from 'react';
import {
  Scissors,
  Plus,
  Search,
  RotateCcw,
  Printer,
  Trash2,
  DollarSign,
  User,
  Phone,
  Ruler,
  Calendar,
  CheckCircle2,
  CreditCard,
  Clock,
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


export function Tailoring() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [employees, setEmployees] = useState([]);

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [measurements, setMeasurements] = useState('');
  const [paidAmount, setPaidAmount] = useState('');
  const [remainingAmount, setRemainingAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [sellerId, setSellerId] = useState('');

  // Pay Remaining Modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedOrderForPay, setSelectedOrderForPay] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Receipt Modal
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState(null);

  // Load Employees
  useEffect(() => {
    async function loadEmployees() {
      try {
        const empUrl = `/employees${(activeBranchId && activeBranchId !== 'all') ? `?branch_id=${activeBranchId}` : ''}`;
        const emps = await api.get(empUrl);
        if (Array.isArray(emps)) {
          setEmployees(emps);
          if (emps.length > 0 && !sellerId) setSellerId(emps[0].id.toString());
        }
      } catch {}
    }
    loadEmployees();
  }, [activeBranchId]);

  // Load Tailoring Orders
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
      if (search.trim()) query.append('search', search.trim());

      const data = await api.get(`/tailoring-orders?${query.toString()}`);
      setOrders(Array.isArray(data) ? data : (data?.orders || data?.data || data?.items || []));
    } catch (err) {
      console.error('Failed to load tailoring orders:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Handle Create
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || !productDescription.trim()) {
      toast.error('الرجاء إدخال بيانات العميل ووصف القطعة المراد تفصيلها');
      return;
    }
    if (!sellerId) {
      toast.error('الرجاء اختيار الموظف المسؤول');
      return;
    }

    setSubmitting(true);
    try {
      const paid = Number(paidAmount) || 0;
      const rem = Number(remainingAmount) || 0;

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        product_description: productDescription.trim(),
        measurements: measurements.trim() || 'مقاسات قياسية',
        paid_amount: paid,
        remaining_amount: rem,
        payment_method: paymentMethod,
        seller_id: Number(sellerId),
        branch_id: (activeBranchId && activeBranchId !== 'all') ? Number(activeBranchId) : (branches[0]?.id || 1),
      };

      const res = await api.post('/tailoring-orders', payload);
      toast.success('تم إنشاء وحفظ أمر التفصيل بنجاح! ✂️');
      setShowCreateModal(false);

      // Reset
      setCustomerName('');
      setCustomerPhone('');
      setProductDescription('');
      setMeasurements('');
      setPaidAmount('');
      setRemainingAmount('0');

      fetchOrders();

      setSelectedReceiptOrder(res);
      setShowReceiptModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل حفظ أمر التفصيل');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Pay Remaining
  const handlePaySubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrderForPay) return;
    const amount = Number(payAmount) || 0;
    if (amount <= 0) {
      toast.error('أدخل مبلغ سداد صحيح');
      return;
    }

    setPaySubmitting(true);
    try {
      await api.put(`/tailoring-orders/${selectedOrderForPay.id}/pay-remaining`, {
        amount,
        payment_method: payMethod,
      });
      toast.success('تم سداد المبلغ المتبقي بنجاح! 💰');
      setShowPayModal(false);
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'فشل سداد المبلغ');
    } finally {
      setPaySubmitting(false);
    }
  };

  // Handle Delete
  const handleDelete = async (id) => {
    if (!confirm('هل تريد حذف أمر التفصيل هذا؟')) return;
    try {
      await api.delete(`/tailoring-orders/${id}`);
      toast.success('تم حذف أمر التفصيل');
      fetchOrders();
    } catch (err) {
      toast.error(err.message || 'فشل حذف الأمر');
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Header & New Order Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            التفصيل والخياطة ✂️
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            إدارة طلبات التفصيل الخاصة، المقاسات، العربون، ومتابعة السداد
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={Plus}
          onClick={() => setShowCreateModal(true)}
          className="!bg-[#151515] hover:!bg-[#24221F] text-white shadow-sm"
        >
          أمر تفصيل جديد
        </Button>
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="طلبات وأوامر التفصيل"
          subtitle="سجل أوامر التفصيل الصادرة في هذا الفرع"
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالاسم، الهاتف، رقم الفاتورة..."
                  className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-1.5 text-xs font-bold outline-none focus:border-[#151515] text-[#24221F]"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchOrders} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل طلبات التفصيل...
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            لا توجد طلبات تفصيل مسجلة
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="bg-[#151515] text-white text-xs font-bold">
                  <th className="py-3 px-3 rounded-r-xl">رقم الفاتورة</th>
                  <th className="py-3 px-2">العميل</th>
                  <th className="py-3 px-2">وصف القطعة</th>
                  <th className="py-3 px-2">المقاسات</th>
                  <th className="py-3 px-2">الإجمالي</th>
                  <th className="py-3 px-2">المدفوع (العربون)</th>
                  <th className="py-3 px-2">المتبقي</th>
                  <th className="py-3 px-2">التاريخ</th>
                  <th className="py-3 px-3 rounded-l-xl">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/60 font-medium">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                    <td className="py-3.5 pr-2 font-bold text-slate-900 font-mono">
                      #{order.invoice_number || order.id}
                    </td>
                    <td className="py-3.5">
                      <div className="font-bold text-slate-900">{order.customer_name}</div>
                      <div className="text-xs text-slate-400 font-mono" dir="ltr">
                        {order.customer_phone}
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-800 font-bold max-w-xs truncate">
                      {order.product_description}
                    </td>
                    <td className="py-3.5 text-xs text-slate-600 max-w-xs truncate">
                      {order.measurements || '-'}
                    </td>
                    <td className="py-3.5 font-black text-indigo-600">
                      {Number(order.total_amount || 0).toLocaleString()} ج.م
                    </td>
                    <td className="py-3.5 text-emerald-700 font-bold">
                      {Number(order.paid_amount || 0).toLocaleString()} ج.م
                    </td>
                    <td className="py-3.5">
                      {Number(order.remaining_amount || 0) > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-rose-600 font-black text-xs">
                            {Number(order.remaining_amount).toLocaleString()} ج.م
                          </span>
                          <button
                            onClick={() => {
                              setSelectedOrderForPay(order);
                              setPayAmount(order.remaining_amount.toString());
                              setShowPayModal(true);
                            }}
                            className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 text-[10px] font-bold border border-rose-200 transition-colors"
                          >
                            سداد
                          </button>
                        </div>
                      ) : (
                        <span className="text-emerald-600 font-bold text-xs">خالص</span>
                      )}
                    </td>
                    <td className="py-3.5 text-xs text-slate-400" dir="ltr">
                      {new Date(order.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="py-3.5 pl-2">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedReceiptOrder(order);
                            setShowReceiptModal(true);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                          title="طباعة إيصال"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(order.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="حذف"
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
      </Card>

      {/* CREATE TAILORING MODAL */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="أمر تفصيل جديد ✂️"
        subtitle="تسجيل تفاصيل الموديل والمقاسات والعربون"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="اسم العميل *"
              icon={User}
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="اسم العميل..."
              required
            />
            <Input
              label="رقم هاتف العميل *"
              icon={Phone}
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              required
            />
          </div>

          <Input
            label="وصف القطعة المراد تفصيلها *"
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
            placeholder="مثال: بدله دبل برست 1 زرار ستان دخلي اسود، بدله كوروزيه 4 زرار، بليزر..."
            required
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">المقاسات التفصيلية *</label>
            <textarea
              rows={3}
              value={measurements}
              onChange={(e) => setMeasurements(e.target.value)}
              placeholder="الجاكت (طول 70 / صدر 44 / وسط 41 / هنش 48 / كتف 21 / كم 63) | البنطلون (طول 106 / وسط 43 / فخد 28)..."
              className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl p-3 text-xs font-bold outline-none focus:border-[#151515] text-[#24221F]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="المبلغ المدفوع مقدماً (العربون) *"
              type="number"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="أدخل العربون..."
              required
            />
            <Input
              label="المبلغ المتبقي بعد التسليم *"
              type="number"
              value={remainingAmount}
              onChange={(e) => setRemainingAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">الموظف المسؤول</label>
              <select
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
                className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-[#151515] text-[#24221F]"
              >
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id.toString()}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">طريقة دفع العربون</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-[#151515] text-[#24221F]"
              >
                <option value="cash">نقدي (كاش)</option>
                <option value="card">بطاقة (فيزا)</option>
                <option value="wallet">فودافون كاش</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="flex-1 !bg-[#151515] hover:!bg-[#24221F] text-white font-black text-base shadow-sm"
            >
              حفظ أمر التفصيل
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

      {/* PAY REMAINING MODAL */}
      <Modal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        title="سداد متبقي التفصيل 💰"
        subtitle={`العميل: ${selectedOrderForPay?.customer_name || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePaySubmit} className="space-y-4">
          <Input
            label="مبلغ السداد (ج.م) *"
            type="number"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            required
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
              className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-[#151515] text-[#24221F]"
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={paySubmitting}
              className="flex-1 !bg-[#151515] hover:!bg-[#24221F] text-white font-black shadow-sm"
            >
              تأكيد السداد
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowPayModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* RECEIPT MODAL */}
      {/* 80mm TAILORING RECEIPT MODAL */}
      <Modal
        isOpen={showReceiptModal}
        onClose={() => setShowReceiptModal(false)}
        maxWidth="max-w-sm"
        hideHeader={true}
        plain={true}
        bodyClassName="p-2 sm:p-4 flex justify-center overflow-visible"
      >
        {selectedReceiptOrder && (
          <ThermalReceipt
            id="tailoring-receipt-ticket"
            type="tailoring"
            title="إيصال أمر تفصيل"
            orderNumber={selectedReceiptOrder.invoice_number || selectedReceiptOrder.id}
            date={selectedReceiptOrder.created_at || new Date()}
            customerName={selectedReceiptOrder.customer_name}
            customerPhone={selectedReceiptOrder.customer_phone}
            sellerName="مسؤول التفصيل"
            paymentMethod="كاش"
            branchName="المقر الرئيسي"
            items={[
              {
                name: selectedReceiptOrder.product_description || 'أمر تفصيل',
                color: selectedReceiptOrder.measurements ? `المقاسات: ${selectedReceiptOrder.measurements}` : '',
                quantity: 1,
                price: Number(selectedReceiptOrder.total_amount || 0),
              },
            ]}
            subtotal={Number(selectedReceiptOrder.total_amount || 0)}
            totalAmount={Number(selectedReceiptOrder.total_amount || 0)}
            paidAmount={Number(selectedReceiptOrder.paid_amount || 0)}
            remainingAmount={Number(selectedReceiptOrder.remaining_amount || 0)}
            footerMessage="شكراً لتعاملكم معنا • يرجى إحضار هذا الإيصال عند الاستلام والتسليم"
            onPrint={() => printElement('tailoring-receipt-ticket', `إيصال تفصيل #${selectedReceiptOrder.invoice_number || selectedReceiptOrder.id}`)}
            onClose={() => setShowReceiptModal(false)}
          />
        )}
      </Modal>
    </div>
  );
}

export default Tailoring;
