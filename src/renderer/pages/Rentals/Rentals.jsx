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
  Building2,
  ArrowRightLeft,
  Trash2,
  Shirt,
  RefreshCw,
  Barcode,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api/client';
import useDebounce from '../../hooks/useDebounce';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
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

  // Filters & Tabs
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'today_all' | 'today_pickup' | 'today_return' | 'upcoming'

  // Barcode Scanner in Booking Modal
  const [barcodeScanInput, setBarcodeScanInput] = useState('');

  // Status Change Modal State
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedRentalForStatus, setSelectedRentalForStatus] = useState(null);
  const [statusNewValue, setStatusNewValue] = useState('booked');
  const [statusNotes, setStatusNotes] = useState('');
  const [statusSubmitting, setStatusSubmitting] = useState(false);

  // Cairo Today Date String (YYYY-MM-DD)
  const cairoTodayStr = useMemo(() => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }, []);

  // New Booking Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const debouncedCustomerPhone = useDebounce(customerPhone, 300);
  const [nationalId, setNationalId] = useState('');
  const [hasIdGuarantee, setHasIdGuarantee] = useState(true);

  // Multi-Item Rental Booking State
  const [bookingItems, setBookingItems] = useState([]);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [customItemCategory, setCustomItemCategory] = useState('قميص');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [showCustomItemInput, setShowCustomItemInput] = useState(false);

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

  // Split Payment State (Dual payment channels)
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitMethod1, setSplitMethod1] = useState('cash');
  const [splitAmount1, setSplitAmount1] = useState('');
  const [splitMethod2, setSplitMethod2] = useState('bank_transfer');
  const [splitAmount2, setSplitAmount2] = useState('');

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
      if (debouncedSearch.trim()) query.append('search', debouncedSearch.trim());

      const data = await api.get(`/rentals?${query.toString()}`);
      setRentals(Array.isArray(data) ? data : (data?.rentals || data?.data || data?.items || []));
    } catch (err) {
      console.error('Failed to load rentals:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchRentals();
    fetchSummary();
  }, [fetchRentals, fetchSummary]);

  // Load Lookups (Rental Inventory and Employees)
  const loadLookups = useCallback(async () => {
    try {
      const branchParam = (activeBranchId && activeBranchId !== 'all') ? `?branch_id=${activeBranchId}` : '';
      const invUrl = `/rental-inventory${branchParam}`;
      const optUrl = `/employees/options${branchParam}`;
      const empUrl = `/employees${branchParam}`;

      const [invRes, optRes] = await Promise.all([
        api.get(invUrl).catch(() => []),
        api.get(optUrl).catch(() => null),
      ]);

      setRentalInventory(Array.isArray(invRes) ? invRes : (invRes?.items || invRes?.data || []));

      let empList = [];
      if (Array.isArray(optRes) && optRes.length > 0) {
        empList = optRes;
      } else {
        const empRes = await api.get(empUrl).catch(() => []);
        empList = Array.isArray(empRes) ? empRes : (empRes?.items || empRes?.employees || empRes?.data || []);
      }

      setEmployees(empList);
      if (empList.length > 0 && !sellerId) {
        setSellerId(empList[0].id.toString());
      }
    } catch (err) {
      console.error('Failed to load lookups:', err);
    }
  }, [activeBranchId, sellerId]);

  useEffect(() => {
    loadLookups();
  }, [loadLookups]);

  // When new booking modal opens, ensure lookups are loaded
  const customerSearchTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (customerSearchTimeoutRef.current) clearTimeout(customerSearchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (showCreateModal && (!employees.length || !rentalInventory.length)) {
      loadLookups();
    }
  }, [showCreateModal, employees.length, rentalInventory.length, loadLookups]);

  // Search customers on typing (debounced)
  const searchCustomers = (query) => {
    if (customerSearchTimeoutRef.current) {
      clearTimeout(customerSearchTimeoutRef.current);
    }
    if (!query || query.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    customerSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const branchParam = (activeBranchId && activeBranchId !== 'all') ? `&branch_id=${activeBranchId}` : '';
        const data = await api.get(`/customers?search=${encodeURIComponent(query)}${branchParam}`);
        const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
        setCustomerSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        setCustomerSuggestions([]);
      }
    }, 250);
  };

  useEffect(() => {
    if (!debouncedCustomerPhone || debouncedCustomerPhone.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    let isCurrent = true;
    const runSearch = async () => {
      try {
        const branchParam = (activeBranchId && activeBranchId !== 'all') ? `&branch_id=${activeBranchId}` : '';
        const data = await api.get(`/customers?search=${encodeURIComponent(debouncedCustomerPhone)}${branchParam}`);
        if (!isCurrent) return;
        const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
        setCustomerSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        if (isCurrent) setCustomerSuggestions([]);
      }
    };
    runSearch();
    return () => {
      isCurrent = false;
    };
  }, [debouncedCustomerPhone, activeBranchId]);

  // Helper to recalculate total price and deposit from booking items
  const recalcTotals = (items) => {
    const sum = items.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
    setTotalPrice(sum > 0 ? sum.toString() : '');
    if (!deposit || deposit === '0' || deposit === '500') {
      const hasSuit = items.some(
        (it) => (it.category || '').toLowerCase().includes('suit') || (it.category || '').includes('بدل')
      );
      setDeposit(hasSuit ? '500' : '200');
    }
  };

  // Add Item from Rental Inventory
  const handleAddInventoryItem = (itemId) => {
    const targetId = itemId || selectedInventoryItemId;
    if (!targetId) return;
    const item = rentalInventory.find((i) => i.id.toString() === targetId.toString());
    if (!item) return;

    const newItem = {
      id: item.id,
      rental_inventory_id: item.id,
      name: item.name,
      category: item.category || 'بدلة تأجير',
      color: item.color,
      size_cut: item.size_cut,
      barcode: item.barcode,
      price: Number(item.rental_price || item.price || 0),
      is_custom: false,
    };

    setBookingItems((prev) => {
      const updated = [...prev, newItem];
      recalcTotals(updated);
      return updated;
    });
    setSelectedInventoryItemId('');
  };

  // Quick Add Standard Accessory Preset
  const handleQuickAddAccessory = (accName, accCategory, accPrice) => {
    const newItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: accName,
      category: accCategory,
      price: Number(accPrice || 0),
      is_custom: true,
    };

    setBookingItems((prev) => {
      const updated = [...prev, newItem];
      recalcTotals(updated);
      return updated;
    });
  };

  // Add Custom Accessory from input
  const handleAddCustomAccessory = () => {
    if (!customItemName.trim()) {
      toast.error('الرجاء إدخال اسم القطعة أو الملحق');
      return;
    }
    const price = Number(customItemPrice) || 0;
    const newItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: customItemName.trim(),
      category: customItemCategory || 'إكسسوار',
      price,
      is_custom: true,
    };

    setBookingItems((prev) => {
      const updated = [...prev, newItem];
      recalcTotals(updated);
      return updated;
    });

    setCustomItemName('');
    setCustomItemPrice('');
    setShowCustomItemInput(false);
  };

  // Remove Item from Booking
  const handleRemoveBookingItem = (index) => {
    setBookingItems((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      recalcTotals(updated);
      return updated;
    });
  };

  // Update Item Price in Booking
  const handleUpdateItemPrice = (index, newPrice) => {
    setBookingItems((prev) => {
      const updated = prev.map((item, i) =>
        i === index ? { ...item, price: Math.max(0, Number(newPrice) || 0) } : item
      );
      recalcTotals(updated);
      return updated;
    });
  };

  // Handle Split Amounts
  const handleSplitAmount1Change = (val) => {
    setSplitAmount1(val);
    const a1 = Number(val) || 0;
    const a2 = Number(splitAmount2) || 0;
    setPaidAmount((a1 + a2).toString());
  };

  const handleSplitAmount2Change = (val) => {
    setSplitAmount2(val);
    const a1 = Number(splitAmount1) || 0;
    const a2 = Number(val) || 0;
    setPaidAmount((a1 + a2).toString());
  };

  const handleFillRemainderToSplit2 = () => {
    const target = Number(paidAmount) || Number(totalPrice) || 0;
    const a1 = Number(splitAmount1) || 0;
    const remainder = Math.max(0, target - a1);
    setSplitAmount2(remainder.toString());
    setPaidAmount((a1 + remainder).toString());
  };

  // Submit New Rental Booking
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('الرجاء إدخال بيانات العميل ورقم الهاتف');
      return;
    }
    if (bookingItems.length === 0) {
      toast.error('الرجاء إضافة قطعة تأجير واحدة على الأقل للحجز (بدلة، قميص، أو إكسسوار)');
      return;
    }

    setSubmitting(true);
    try {
      const price = Number(totalPrice) || 0;
      const dep = Number(deposit) || 0;
      let paid = Number(paidAmount) || 0;
      let finalMethod = paymentMethod;
      let splitsArray = null;

      if (isSplitPayment) {
        const a1 = Number(splitAmount1) || 0;
        const a2 = Number(splitAmount2) || 0;
        if (a1 <= 0 || a2 <= 0) {
          toast.error('يرجى إدخال مبالغ صحيحة للوسيلتين في الدفع المجزأ');
          setSubmitting(false);
          return;
        }
        if (splitMethod1 === splitMethod2) {
          toast.error('لا يمكن اختيار نفس وسيلة الدفع مرتين في الدفع المجزأ');
          setSubmitting(false);
          return;
        }
        finalMethod = 'split';
        paid = a1 + a2;
        splitsArray = [
          { method: splitMethod1, amount: a1 },
          { method: splitMethod2, amount: a2 },
        ];
      }

      const remaining = Math.max(0, price - paid);

      // Separate inventory items from custom accessories
      const invItems = bookingItems.filter((it) => !it.is_custom && it.id);
      const customItems = bookingItems.filter((it) => it.is_custom || !it.id);

      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        national_id: nationalId.trim(),
        branch_id: activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1,
        rental_inventory_id: invItems[0]?.id || null,
        items: invItems.map((it) => ({ id: it.id, name: it.name, category: it.category, price: it.price })),
        custom_items: customItems.map((it) => ({
          name: it.name,
          category: it.category,
          price: it.price,
          is_custom: true,
        })),
        pickup_date: pickupDate,
        return_date: returnDate,
        total_price: price,
        deposit: dep,
        paid_amount: paid,
        remaining,
        id_card_guarantee: hasIdGuarantee,
        seller_id: sellerId ? Number(sellerId) : null,
        payment_method: finalMethod,
        payment_splits: splitsArray ? JSON.stringify(splitsArray) : null,
        notes: notes.trim(),
      };

      const res = await api.post('/rentals', payload);
      toast.success('تم تسجيل وحفظ حجز التأجير بنجاح! ✨');
      setShowCreateModal(false);

      // Reset form
      setCustomerName('');
      setCustomerPhone('');
      setNationalId('');
      setBookingItems([]);
      setSelectedInventoryItemId('');
      setTotalPrice('');
      setDeposit('');
      setPaidAmount('');
      setIsSplitPayment(false);
      setSplitAmount1('');
      setSplitAmount2('');
      setNotes('');

      fetchRentals();
      fetchSummary();

      // Show receipt with all booking items and payment details
      setSelectedReceiptRental({
        ...res,
        items: bookingItems,
        payment_method: finalMethod,
        payment_splits: splitsArray,
        paid_amount: paid,
        total_price: price,
        remaining,
        deposit: dep,
      });
      setShowReceiptModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل الحجز');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Barcode Scan or Search in New Booking Modal
  const handleBarcodeScanOrSearch = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    if (e && e.preventDefault) e.preventDefault();
    const code = barcodeScanInput.trim();
    if (!code) return;

    // 1. Match local loaded inventory
    let found = rentalInventory.find(
      (it) =>
        (it.barcode && it.barcode.toLowerCase() === code.toLowerCase()) ||
        it.id.toString() === code ||
        (it.name && it.name.toLowerCase().includes(code.toLowerCase()))
    );

    // 2. If not found in loaded page, query backend
    if (!found) {
      try {
        const branchParam = (activeBranchId && activeBranchId !== 'all') ? `&branch_id=${activeBranchId}` : '';
        const res = await api.get(`/rental-inventory?search=${encodeURIComponent(code)}${branchParam}`);
        const items = Array.isArray(res) ? res : (res?.items || res?.data || []);
        if (items.length > 0) {
          found = items[0];
          setRentalInventory((prev) => [found, ...prev.filter((p) => p.id !== found.id)]);
        }
      } catch {}
    }

    if (found) {
      handleAddInventoryItem(found.id);
      setBarcodeScanInput('');
      toast.success(`تمت إضافة "${found.name}" بنجاح!`);
    } else {
      toast.error(`عفواً، لم يتم العثور على بدلة بالباركود (${code})`);
    }
  };

  // Open Status Change Modal
  const openStatusModal = (rental) => {
    setSelectedRentalForStatus(rental);
    setStatusNewValue(rental.status || 'booked');
    setStatusNotes('');
    setShowStatusModal(true);
  };

  // Submit Status Change
  const handleUpdateStatus = async (e) => {
    if (e) e.preventDefault();
    if (!selectedRentalForStatus) return;
    try {
      setStatusSubmitting(true);
      await api.put(`/rentals/${selectedRentalForStatus.id}/status`, {
        status: statusNewValue,
        notes: statusNotes,
      });
      toast.success('تم تعديل حالة الحجز بنجاح!');
      setShowStatusModal(false);
      fetchRentals();
      fetchSummary();
    } catch (err) {
      toast.error(err.message || 'فشل تعديل حالة الحجز');
    } finally {
      setStatusSubmitting(false);
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
        >
          حجز إيجار جديد
        </Button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          variant="pastel-yellow"
          title="محجوزة"
          value={summary.booked || 0}
          icon={Clock}
          subtitle={summary.upcoming ? `${summary.upcoming} حجز قادم من اليوم` : 'حجوزات قادمة ومؤكدة'}
          onClick={() => setStatusFilter(statusFilter === 'upcoming' ? 'all' : 'upcoming')}
          className="cursor-pointer hover:ring-2 hover:ring-amber-400/50 transition-all"
        />

        <StatCard
          variant="pastel-blue"
          title="تم الاستلام"
          value={summary.active || 0}
          icon={Sparkles}
          subtitle="بدل خارج المحل حالياً"
        />

        <StatCard
          variant="pastel-green"
          title="مُرجعة"
          value={summary.returned || 0}
          icon={CheckCircle2}
          subtitle={
            Number(summary.returned_debt || 0) > 0
              ? `${summary.returned_debt} عليه متبقي`
              : 'تمت إعادتها للمخزون'
          }
        />

        <StatCard
          variant="pastel-pink"
          title="ملغي"
          value={summary.cancelled || 0}
          icon={AlertTriangle}
          subtitle="حجوزات ملغاة"
        />
      </div>

      {/* Main Table Card */}
      <Card>
        {/* Navigation Tabs for Daily Operations */}
        <div className="px-6 pt-3 pb-3 border-b border-[#E6DECD]/70 flex flex-wrap items-center justify-between gap-2.5 bg-[#FAF8F5]/80">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => { setActiveTab('all'); setStatusFilter('all'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#151515] text-white shadow-xs'
                  : 'bg-white border border-[#E6DECD] text-[#565147] hover:bg-[#F3ECE1]'
              }`}
            >
              <span>📋 كل الحجوزات</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('today_pickup'); setStatusFilter('today_pickup'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'today_pickup'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-blue-50 border border-blue-200 text-blue-900 hover:bg-blue-100'
              }`}
              title="البدل المجدول استلام العميل لها اليوم وبانتظار الخروج للمناسبة"
            >
              <span>📦 استلام اليوم (خروج للعميل)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                statusFilter === 'today_pickup' ? 'bg-white text-blue-800' : 'bg-blue-200 text-blue-900'
              }`}>
                {summary.today_pickups || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('today_return'); setStatusFilter('today_return'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'today_return'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-50 border border-emerald-200 text-emerald-900 hover:bg-emerald-100'
              }`}
              title="البدل المجدول تسليمها للمحل اليوم وبانتظار الإرجاع والتسوية"
            >
              <span>↩️ تسليم اليوم (عودة للمحل)</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                statusFilter === 'today_return' ? 'bg-white text-emerald-800' : 'bg-emerald-200 text-emerald-900'
              }`}>
                {summary.today_returns || 0}
              </span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('upcoming'); setStatusFilter('upcoming'); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                statusFilter === 'upcoming'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-indigo-50 border border-indigo-200 text-indigo-900 hover:bg-indigo-100'
              }`}
              title="الحجوزات المستقبلية القادمة مرتبة تصاعدياً بالأقرب موعداً"
            >
              <span>⏳ حجوزات قادمة</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                statusFilter === 'upcoming' ? 'bg-white text-indigo-800' : 'bg-indigo-200 text-indigo-900'
              }`}>
                {summary.upcoming || 0}
              </span>
            </button>
          </div>
        </div>

        <CardHeader
          title="سجل الحجوزات"
          subtitle="استعراض وتحديث حالات الإيجارات"
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Search */}
              <div className="relative w-72">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="ابحث بالعميل، الهاتف، رقم الحجز، أو باركود البدلة..."
                  className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
                />
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setActiveTab(e.target.value);
                }}
                className="bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] cursor-pointer transition-colors"
              >
                <option value="all">كل الحالات</option>
                <option value="today_pickup">📦 استلام اليوم (خروج للعميل - {summary.today_pickups || 0})</option>
                <option value="today_return">↩️ تسليم اليوم (عودة للمحل - {summary.today_returns || 0})</option>
                <option value="upcoming">⏳ حجوزات قادمة ({summary.upcoming || 0})</option>
                <option value="booked">محجوزة (الكل - {summary.booked || 0})</option>
                <option value="active">تم الاستلام (مع العميل - {summary.active || 0})</option>
                <option value="returned">مُرجعة (الكل - {summary.returned || 0})</option>
                <option value="returned_debt">مرتجع (عليه متبقي - {summary.returned_debt || 0})</option>
                <option value="returned_settled">تم الإرجاع (خالص)</option>
                <option value="sold">محولة لبيع</option>
                <option value="cancelled">ملغي ({summary.cancelled || 0})</option>
              </select>

              <Button variant="outline" size="sm" onClick={fetchRentals} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            جاري تحميل الحجوزات...
          </div>
        ) : rentals.length === 0 ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            {statusFilter === 'today_pickup'
              ? 'لا توجد بدل بانتظار استلام العميل لها اليوم 🎉'
              : statusFilter === 'today_return'
                ? 'لا توجد بدل بانتظار تسليمها ورجوعها للمحل اليوم ✨'
                : statusFilter === 'upcoming'
                  ? 'لا توجد حجوزات مستقبلية قادمة'
                  : 'لا توجد حجوزات مسجلة مطابقة للبحث أو الفلتر المحدد'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
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
              <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
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
                    <tr key={r.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                      <td className="py-3.5 pr-2 font-bold text-[#24221F]">
                        #{r.id}
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-[#24221F]">{r.customer_name}</div>
                        <div className="text-xs text-[#777266] font-mono" dir="ltr">
                          {r.customer_phone}
                        </div>
                      </td>
                      <td className="py-3.5">
                        <div className="font-bold text-[#24221F] flex items-center gap-1.5">
                          <span>{r.inventory_name || r.items?.[0]?.name || 'قطعة تأجير'}</span>
                          {Array.isArray(r.items) && r.items.length > 1 && (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-black">
                              +{r.items.length - 1} ملحقات
                            </span>
                          )}
                        </div>
                        {Array.isArray(r.items) && r.items.length > 1 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.items.map((it, idx) => (
                              <span
                                key={idx}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  it.is_custom
                                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                                    : 'bg-[#FAF6ED] border border-[#E6DECD] text-[#24221F]'
                                }`}
                              >
                                {it.name || it.product_name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-[#777266] font-bold mt-0.5">
                            {r.rental_inventory_id && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF6ED] border border-[#E6DECD] text-[#24221F] font-mono text-[10px]">
                                كود: #{r.rental_inventory_id}
                              </span>
                            )}
                            {r.inventory_barcode && (
                              <span className="font-mono text-[#777266]">#{r.inventory_barcode}</span>
                            )}
                            {r.inventory_color && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF6ED] border border-[#E6DECD]">
                                {r.inventory_color}
                              </span>
                            )}
                            {r.inventory_size && (
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF6ED] border border-[#E6DECD]">
                                {r.inventory_size}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 text-xs text-[#565147]">
                        <div className="flex items-center gap-1">
                          <span className="text-[#777266] font-bold">من:</span>
                          <span>{new Date(r.pickup_date).toLocaleDateString('ar-EG')}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[#777266] font-bold">إلى:</span>
                          <span className={isDelay ? 'text-rose-600 font-black' : ''}>
                            {new Date(r.return_date).toLocaleDateString('ar-EG')}
                          </span>
                        </div>
                        {isDelay && (
                          <div className="text-[11px] text-rose-600 font-black mt-0.5">
                            تأخير {r.delay_days} يوم!
                          </div>
                        )}
                        {r.status === 'booked' && r.pickup_date && String(r.pickup_date).slice(0, 10) === cairoTodayStr && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-black mt-1">
                            <span>📦 موعد استلام العميل اليوم</span>
                          </div>
                        )}
                        {r.status === 'active' && r.return_date && String(r.return_date).slice(0, 10) === cairoTodayStr && (
                          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black mt-1">
                            <span>↩️ موعد تسليم البدلة للمحل اليوم</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5">
                        <div className="font-black text-[#24221F] text-sm flex items-center gap-1.5">
                          <span>{Number(r.total_price || 0).toLocaleString()} ج.م</span>
                          {r.payment_method === 'split' && (
                            <span className="px-1.5 py-0.2 rounded bg-purple-50 border border-purple-200 text-purple-700 text-[10px] font-black">
                              دفع مجزأ
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#777266] font-bold mt-0.5">
                          تأمين: {Number(r.deposit || 0).toLocaleString()} ج.م
                        </div>
                      </td>
                      <td className="py-3.5">
                        {Number(r.remaining || 0) > 0 ? (
                          <span className="text-rose-600 font-black text-xs">
                            {Number(r.remaining).toLocaleString()} ج.م
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-bold text-xs">مسدد بالكامل</span>
                        )}
                      </td>
                      <td className="py-3.5">
                        <button
                          type="button"
                          onClick={() => openStatusModal(r)}
                          className="cursor-pointer group text-right block"
                          title="اضغط لتغيير حالة هذا الحجز"
                        >
                          <Badge variant={statusInfo.variant} dot className="group-hover:ring-2 group-hover:ring-indigo-400 transition-all">
                            {statusInfo.label}
                          </Badge>
                        </button>
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

                          {/* Change Status Button - Always available on EVERY row */}
                          <button
                            type="button"
                            onClick={() => openStatusModal(r)}
                            className="px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors flex items-center gap-1 shrink-0 shadow-2xs"
                            title="تعديل وتغيير حالة الحجز"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                            <span>تغيير الحالة</span>
                          </button>

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

          {/* MULTI-ITEM RENTAL SELECTION & ACCESSORIES */}
          <div className="space-y-3 p-3.5 bg-slate-50/80 border-2 border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>قطع التأجير والملحقات المضافة للحجز *</span>
                {bookingItems.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                    {bookingItems.length} قطع
                  </span>
                )}
              </label>
              <span className="text-[11px] text-slate-500 font-medium">يمكنك حجز بدلة وإضافة قميص وإكسسوارات</span>
            </div>

            {/* Quick Barcode Scan for Suit / Rental Item */}
            <div className="flex gap-2 items-center bg-white p-2 rounded-xl border border-dashed border-indigo-300">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                <input
                  type="text"
                  value={barcodeScanInput}
                  onChange={(e) => setBarcodeScanInput(e.target.value)}
                  onKeyDown={handleBarcodeScanOrSearch}
                  placeholder="امسح باركود البدلة بالمسدس أو اكتب الكود واضغط Enter للإضافة السريعة..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pr-9 pl-3 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Search}
                onClick={() => handleBarcodeScanOrSearch({ key: 'Enter', preventDefault: () => {} })}
                className="text-xs font-bold shrink-0"
              >
                بحث وإضافة
              </Button>
            </div>

            {/* Selector from Rental Inventory */}
            <div className="flex gap-2">
              <select
                value={selectedInventoryItemId}
                onChange={(e) => {
                  setSelectedInventoryItemId(e.target.value);
                  if (e.target.value) handleAddInventoryItem(e.target.value);
                }}
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              >
                <option value="">اختر بدلة / قطعة من مخزون التأجير للإضافة...</option>
                {rentalInventory.map((item) => (
                  <option key={item.id} value={item.id.toString()}>
                    #{item.id} - {item.name} {item.barcode ? `[باركود: ${item.barcode}]` : ''} {item.category ? `(${item.category})` : ''} {item.color ? `(${item.color})` : ''}{' '}
                    {item.size_cut ? `[${item.size_cut}]` : ''} - سعر الإيجار: {Number(item.rental_price || item.price || 0).toLocaleString()} ج.م
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => handleAddInventoryItem()}
                disabled={!selectedInventoryItemId}
                className="!bg-indigo-600 hover:!bg-indigo-700 font-bold text-xs"
              >
                إضافة القطعة
              </Button>
            </div>

            {/* Quick Add Accessories Presets */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-bold text-slate-600 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Shirt className="w-3.5 h-3.5 text-indigo-500" />
                  <span>إضافة ملحقات سريعة (إكسسوارات / قمصان):</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomItemInput((prev) => !prev)}
                  className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold underline cursor-pointer"
                >
                  {showCustomItemInput ? 'إخفاء الإضافة المخصصة' : '+ إضافة ملحق باسم مخصص'}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { name: 'قميص أبيض كلاسيك', category: 'قميص', price: 150 },
                  { name: 'قميص أسود كلاسيك', category: 'قميص', price: 150 },
                  { name: 'بيبيون ستان أسود', category: 'بيبيون', price: 50 },
                  { name: 'كرافتة ستان كلاسيك', category: 'كرافت', price: 75 },
                  { name: 'حذاء كلاسيك أسود', category: 'حذاء', price: 200 },
                  { name: 'صدرية بدلة كلاسيك', category: 'صدرية', price: 150 },
                  { name: 'منديل جيب ستان', category: 'إكسسوار', price: 30 },
                ].map((acc, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleQuickAddAccessory(acc.name, acc.category, acc.price)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 text-[11px] font-bold text-slate-700 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-indigo-600" />
                    <span>{acc.name}</span>
                    <span className="text-slate-400 font-normal">({acc.price} ج.م)</span>
                  </button>
                ))}
              </div>

              {/* Inline Custom Accessory Input */}
              {showCustomItemInput && (
                <div className="flex flex-wrap sm:flex-nowrap gap-2 p-2.5 bg-white border border-indigo-200 rounded-xl mt-2 animate-fadeIn">
                  <input
                    type="text"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    placeholder="اسم الملحق (مثال: بروش، حزام جلد، كبك)..."
                    className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-600"
                  />
                  <select
                    value={customItemCategory}
                    onChange={(e) => setCustomItemCategory(e.target.value)}
                    className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold outline-none focus:border-indigo-600"
                  >
                    <option value="قميص">قميص</option>
                    <option value="بيبيون">بيبيون</option>
                    <option value="كرافت">كرافت</option>
                    <option value="حذاء">حذاء</option>
                    <option value="صدرية">صدرية</option>
                    <option value="إكسسوار">إكسسوار</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                  <input
                    type="number"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    placeholder="السعر (ج.م)..."
                    className="w-24 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:border-indigo-600 font-mono"
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAddCustomAccessory}
                    className="!bg-indigo-600 text-xs font-bold"
                  >
                    إضافة
                  </Button>
                </div>
              )}
            </div>

            {/* List of currently selected items */}
            {bookingItems.length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs font-bold border border-dashed border-slate-300 rounded-xl bg-white/60">
                لم يتم إضافة أي قطع بعد. اختر بدلة تأجير أو أضف ملحقاً من الأزرار أعلاه.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto divide-y divide-slate-100 bg-white border border-slate-200 rounded-xl p-1.5">
                {bookingItems.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.is_custom ? (
                            <span className="px-1.5 py-0.2 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[9px] font-bold">
                              ملحق إضافي
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 text-[9px] font-bold">
                              مخزون تأجير
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5">
                          <span>{item.category}</span>
                          {item.color && <span>• لون: {item.color}</span>}
                          {item.size_cut && <span>• مقاس: {item.size_cut}</span>}
                          {item.barcode && <span className="font-mono">#{item.barcode}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-500 font-medium">سعر الإيجار:</span>
                        <input
                          type="number"
                          value={item.price}
                          onChange={(e) => handleUpdateItemPrice(idx, e.target.value)}
                          className="w-20 px-2 py-1 text-xs font-mono font-bold text-right border border-slate-200 rounded-lg outline-none focus:border-indigo-600 bg-slate-50"
                        />
                        <span className="text-[10px] text-slate-500">ج.م</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveBookingItem(idx)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                        title="إزالة من الحجز"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              label="مبلغ التأمين المسترد (ج.م) *"
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
              onChange={(e) => {
                setPaidAmount(e.target.value);
                if (isSplitPayment) {
                  const p = Number(e.target.value) || 0;
                  const half = Math.round(p / 2);
                  setSplitMethod1('cash');
                  setSplitAmount1(half.toString());
                  setSplitMethod2('bank_transfer');
                  setSplitAmount2((p - half).toString());
                }
              }}
              placeholder="0"
            />
          </div>

          {/* SELLER & PAYMENT METHOD (WITH DUAL / SPLIT PAYMENT) */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">الموظف المسؤول</label>
                <select
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-indigo-600"
                >
                  <option value="">اختر الموظف...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id.toString()}>
                      {emp.name} {emp.position ? `(${emp.position})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
                  {/* Split Payment Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isSplitPayment;
                      setIsSplitPayment(next);
                      if (next) {
                        const target = Number(paidAmount) || Number(totalPrice) || 0;
                        const half = Math.round(target / 2);
                        setSplitMethod1('cash');
                        setSplitAmount1(half > 0 ? half.toString() : '');
                        setSplitMethod2('bank_transfer');
                        setSplitAmount2((target - half) > 0 ? (target - half).toString() : '');
                        setPaidAmount(target > 0 ? target.toString() : '');
                      }
                    }}
                    className={`px-2.5 py-0.5 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 cursor-pointer ${
                      isSplitPayment
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>{isSplitPayment ? 'دفع مجزأ مفعل ✓' : 'دفع مجزأ بطريقتين (Split)'}</span>
                  </button>
                </div>

                {!isSplitPayment ? (
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold outline-none focus:border-indigo-600"
                  >
                    <option value="cash">نقدي (كاش بالدرج)</option>
                    <option value="bank_transfer">انستاباي / بنكي</option>
                    <option value="card">بطاقة (فيزا)</option>
                    <option value="wallet">فودافون كاش</option>
                    <option value="debt">آجل / متبقي</option>
                  </select>
                ) : (
                  <div className="text-[11px] font-bold text-purple-700 bg-purple-50 px-3 py-2 rounded-xl border border-purple-200">
                    تم تفعيل الدفع المجزأ بين وسيلتين (حدد الوسائل والمبالغ بالأسفل)
                  </div>
                )}
              </div>
            </div>

            {/* Split Payment Breakdown Box */}
            {isSplitPayment && (
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5 animate-fadeIn">
                <div className="text-xs font-black text-purple-950 flex items-center justify-between">
                  <span>توزيع الدفع المجزأ بين وسيلتين:</span>
                  <span className="text-[11px] font-bold text-purple-800 font-mono">
                    إجمالي المدفوع: {((Number(splitAmount1) || 0) + (Number(splitAmount2) || 0)).toLocaleString()} ج.م
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Method 1 */}
                  <div className="p-2.5 bg-white border border-purple-100 rounded-xl space-y-1.5 shadow-2xs">
                    <span className="text-xs font-bold text-slate-700">الوسيلة الأولى:</span>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'cash', label: 'كاش' },
                        { id: 'bank_transfer', label: 'انستاباي' },
                        { id: 'card', label: 'فيزا' },
                        { id: 'wallet', label: 'فودافون كاش' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSplitMethod1(m.id);
                            if (splitMethod2 === m.id) {
                              setSplitMethod2(m.id === 'cash' ? 'bank_transfer' : 'cash');
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            splitMethod1 === m.id
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={splitAmount1}
                      onChange={(e) => handleSplitAmount1Change(e.target.value)}
                      placeholder="المبلغ (ج.م)..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold outline-none focus:border-purple-600"
                      required
                    />
                  </div>

                  {/* Method 2 */}
                  <div className="p-2.5 bg-white border border-purple-100 rounded-xl space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>الوسيلة الثانية:</span>
                      <button
                        type="button"
                        onClick={handleFillRemainderToSplit2}
                        className="text-[10px] text-purple-700 hover:underline font-bold cursor-pointer"
                      >
                        ملء باقي المبلغ
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {[
                        { id: 'cash', label: 'كاش' },
                        { id: 'bank_transfer', label: 'انستاباي' },
                        { id: 'card', label: 'فيزا' },
                        { id: 'wallet', label: 'فودافون كاش' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSplitMethod2(m.id);
                            if (splitMethod1 === m.id) {
                              setSplitMethod1(m.id === 'cash' ? 'bank_transfer' : 'cash');
                            }
                          }}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            splitMethod2 === m.id
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={splitAmount2}
                      onChange={(e) => handleSplitAmount2Change(e.target.value)}
                      placeholder="المبلغ (ج.م)..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold outline-none focus:border-purple-600"
                      required
                    />
                  </div>
                </div>
              </div>
            )}
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
                      <option value="bank_transfer">انستاباي / تحويل بنكي</option>
                      <option value="card">بطاقة (فيزا)</option>
                      <option value="wallet">فودافون كاش</option>
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
              <option value="bank_transfer">انستاباي / تحويل بنكي</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش</option>
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
            branchId={selectedReceiptRental.branch_id || activeBranchId}
            branchLogo={branches.find((b) => b.id?.toString() === (selectedReceiptRental.branch_id || activeBranchId)?.toString())?.logo_url}
            title="إيصال حجز وتأجير"
            orderNumber={`RNT-${selectedReceiptRental.id}`}
            date={selectedReceiptRental.created_at || new Date()}
            customerName={selectedReceiptRental.customer_name}
            customerPhone={selectedReceiptRental.customer_phone}
            sellerName={selectedReceiptRental.seller_name || 'مسؤول التأجير'}
            paymentMethod={selectedReceiptRental.payment_method || 'cash'}
            paymentSplits={selectedReceiptRental.payment_splits}
            cashAmount={Number(selectedReceiptRental.cash_amount || 0)}
            cardAmount={Number(selectedReceiptRental.card_amount || 0)}
            walletAmount={Number(selectedReceiptRental.wallet_amount || 0)}
            bankTransferAmount={Number(selectedReceiptRental.bank_transfer_amount || 0)}
            branchName={branches.find((b) => b.id?.toString() === (selectedReceiptRental.branch_id || activeBranchId)?.toString())?.name || 'الفرع الرئيسي'}
            items={
              Array.isArray(selectedReceiptRental.items) && selectedReceiptRental.items.length > 0
                ? selectedReceiptRental.items.map((it) => ({
                    name: `${it.item_type && it.item_type !== 'suit' ? `[${it.item_type}] ` : ''}${it.name || it.product_name || 'قطعة تأجير'}${it.size ? ` (${it.size})` : ''}`,
                    quantity: 1,
                    price: Number(it.price || it.rental_price || 0),
                  }))
                : [
                    {
                      name: selectedReceiptRental.inventory_name || 'قطعة تأجير',
                      quantity: 1,
                      price: Number(selectedReceiptRental.total_price || 0),
                    },
                  ]
            }
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

      {/* STATUS CHANGE MODAL */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="تغيير وتعديل حالة الحجز 🔄"
        subtitle={
          selectedRentalForStatus
            ? `حجز رقم #${selectedRentalForStatus.id} - العميل: ${selectedRentalForStatus.customer_name}`
            : ''
        }
        maxWidth="max-w-md"
      >
        <form onSubmit={handleUpdateStatus} className="space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold">الصنف / البدلة:</span>
              <span className="font-black text-slate-800">{selectedRentalForStatus?.inventory_name || 'بدلة تأجير'}</span>
            </div>
            {selectedRentalForStatus?.inventory_barcode && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">باركود القطعة:</span>
                <span className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-indigo-700">
                  {selectedRentalForStatus.inventory_barcode}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-bold">فترة الحجز:</span>
              <span className="font-mono text-slate-700 font-bold">
                {selectedRentalForStatus?.pickup_date} ⬅ {selectedRentalForStatus?.return_date}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-bold">الحالة الحالية:</span>
              <Badge variant={STATUS_MAP[selectedRentalForStatus?.status]?.variant || 'default'} dot>
                {STATUS_MAP[selectedRentalForStatus?.status]?.label || selectedRentalForStatus?.status}
              </Badge>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800">اختر الحالة الجديدة:</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'booked', label: 'محجوزة', desc: 'في المحل (بانتظار التسليم)', color: 'border-amber-300 bg-amber-50/60 text-amber-900', active: 'ring-2 ring-amber-500 bg-amber-100/80 font-black' },
                { id: 'active', label: 'تم الاستلام', desc: 'خارج المحل (مع العميل)', color: 'border-blue-300 bg-blue-50/60 text-blue-900', active: 'ring-2 ring-blue-500 bg-blue-100/80 font-black' },
                { id: 'returned', label: 'تم الإرجاع (خالص)', desc: 'عادت للمحل وانتهى الحجز', color: 'border-emerald-300 bg-emerald-50/60 text-emerald-900', active: 'ring-2 ring-emerald-500 bg-emerald-100/80 font-black' },
                { id: 'cancelled', label: 'ملغي', desc: 'إلغاء الحجز وإعادة القطعة', color: 'border-rose-300 bg-rose-50/60 text-rose-900', active: 'ring-2 ring-rose-500 bg-rose-100/80 font-black' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setStatusNewValue(opt.id)}
                  className={`p-2.5 rounded-xl border text-right transition-all cursor-pointer ${
                    statusNewValue === opt.id ? opt.active : `${opt.color} opacity-70 hover:opacity-100`
                  }`}
                >
                  <div className="font-bold text-xs">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ملاحظات تغيير الحالة (اختياري)
            </label>
            <input
              type="text"
              value={statusNotes}
              onChange={(e) => setStatusNotes(e.target.value)}
              placeholder="سبب التعديل أو أي تفاصيل..."
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-600"
            />
          </div>

          <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium leading-relaxed">
            💡 ملاحظة: تحديث الحالة إلى "تم الاستلام" يسجل خروج القطعة من المخزون، وتحديثها إلى "محجوزة" أو "تم الإرجاع" أو "ملغي" يضمن تواجد القطعة في مخزون الفرع.
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={statusSubmitting}
              className="flex-1 !rounded-2xl !bg-indigo-600 hover:!bg-indigo-700 font-black text-white"
            >
              حفظ وتأكيد الحالة
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
              <option value="bank_transfer">انستاباي / تحويل بنكي</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش</option>
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
            branchId={saleInvoiceData.branch_id || activeBranchId}
            branchLogo={branches.find((b) => b.id?.toString() === (saleInvoiceData.branch_id || activeBranchId)?.toString())?.logo_url}
            title="فاتورة بيع (تحويل تأجير)"
            orderNumber={saleInvoiceData.order_number}
            date={saleInvoiceData.created_at || new Date()}
            customerName={saleInvoiceData.customer_name}
            customerPhone={saleInvoiceData.customer_phone}
            sellerName="مسؤول التأجير"
            paymentMethod={saleInvoiceData.payment_method || 'كاش'}
            branchName={branches.find((b) => b.id?.toString() === (saleInvoiceData.branch_id || activeBranchId)?.toString())?.name || 'الفرع الرئيسي'}
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
