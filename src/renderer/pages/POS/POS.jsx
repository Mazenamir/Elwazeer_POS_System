import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ShoppingCart,
  Barcode,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Printer,
  Check,
  User,
  Phone,
  Building2,
  DollarSign,
  CreditCard,
  Clock,
  RotateCcw,
  Receipt,
  Tag,
  AlertCircle,
  Scissors,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  ArrowRightLeft,
  KeyRound,
  FileText,
  Info,
  Undo2,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';

const BASE_CATEGORIES = ['الكل', 'FORMAL SUIT', 'TUXEDO SUIT', 'SUIT', 'CASUAL SUIT', 'بليزر', 'بدل', 'بنطلون', 'قميص', 'صديري', 'تيشيرت', 'جينز', 'KIDS', 'ترنج', 'كرافت', 'بيبيون', 'حذاء', 'نصف ياقة', 'إكسسوارات', 'WALLET', 'أخرى'];

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch {}
}

export function POS() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();

  // Top Tabs: 'pos' | 'history' | 'returns'
  const [activeTab, setActiveTab] = useState('pos');
  const [categoriesList, setCategoriesList] = useState(BASE_CATEGORIES);

  // Multi-cart tabs
  const [cartTabs, setCartTabs] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_cart_tabs');
      return saved ? JSON.parse(saved) : [{ id: 1, name: 'عميل 1' }];
    } catch {
      return [{ id: 1, name: 'عميل 1' }];
    }
  });
  const [activeCartId, setActiveCartId] = useState(1);

  // Cart items per cartId: { [cartId]: items[] }
  const [carts, setCarts] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_carts_data');
      return saved ? JSON.parse(saved) : { 1: [] };
    } catch {
      return { 1: [] };
    }
  });

  const currentCart = useMemo(() => carts[activeCartId] || [], [carts, activeCartId]);

  // Overall invoice discount per cartId: { [cartId]: { value: 0, type: 'amount' } }
  const [invoiceDiscounts, setInvoiceDiscounts] = useState({});
  const currentDiscount = invoiceDiscounts[activeCartId] || { value: 0, type: 'amount' };
  const [activeDiscountItemId, setActiveDiscountItemId] = useState(null);

  // Data & State
  const [inventory, setInventory] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Load Metadata categories
  useEffect(() => {
    api.get('/inventory/metadata')
      .then((meta) => {
        if (meta?.categories && Array.isArray(meta.categories)) {
          const merged = Array.from(new Set([...BASE_CATEGORIES, ...meta.categories]));
          setCategoriesList(merged);
        }
      })
      .catch(() => {});
  }, []);
  const [settings, setSettings] = useState({
    store_name: 'Bebyoon Center',
    store_phone: '',
    store_address: '',
    cashier_footer: 'شكراً لزيارتكم',
  });
  const [nextOrderId, setNextOrderId] = useState('...');
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'debt' | 'wallet'
  const [paidAmount, setPaidAmount] = useState('');
  const [needsAlteration, setNeedsAlteration] = useState(false);
  const [alterationDueDate, setAlterationDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });

  // Customer suggestions
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Invoice Receipt Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [completedOrder, setCompletedOrder] = useState(null);

  // History Tab State
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    id: '',
    customer: '',
    phone: '',
    date: '',
    status: '',
  });
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });

  // Pay Remaining Modal State
  const [showPayRemainingModal, setShowPayRemainingModal] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState(null);
  const [payRemainingAmount, setPayRemainingAmount] = useState('');
  const [payRemainingMethod, setPayRemainingMethod] = useState('cash');
  const [payRemainingSubmitting, setPayRemainingSubmitting] = useState(false);

  // Edit Invoice Password & Modal State
  const [showEditPasswordModal, setShowEditPasswordModal] = useState(false);
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [editPasswordError, setEditPasswordError] = useState('');
  const [editPasswordChecking, setEditPasswordChecking] = useState(false);
  const [showEditInvoiceModal, setShowEditInvoiceModal] = useState(false);
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState(null);
  const [editOrderData, setEditOrderData] = useState({
    customer_name: '',
    customer_phone: '',
    seller_id: '',
    payment_method: 'cash',
    paid_amount: 0,
    invoice_discount: 0,
    invoice_discount_type: 'amount',
    items: [],
  });
  const [editItemSearchQuery, setEditItemSearchQuery] = useState('');
  const [editItemSearchResults, setEditItemSearchResults] = useState([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Returns Tab State
  const [returnsList, setReturnsList] = useState([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [returnFilters, setReturnFilters] = useState({
    returnId: '',
    orderId: '',
    customer: '',
    phone: '',
    date: '',
  });
  const [returnsPagination, setReturnsPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });

  // Process Return Modal State
  const [showProcessReturnModal, setShowProcessReturnModal] = useState(false);
  const [returnOrderSearchQuery, setReturnOrderSearchQuery] = useState('');
  const [returnFoundOrders, setReturnFoundOrders] = useState([]);
  const [searchingReturnOrders, setSearchingReturnOrders] = useState(false);
  const [selectedReturnOrder, setSelectedReturnOrder] = useState(null);
  const [returnSelection, setReturnSelection] = useState({}); // { [itemId]: boolean }
  const [returnQuantities, setReturnQuantities] = useState({}); // { [itemId]: number }
  const [manualReturnAmount, setManualReturnAmount] = useState('');
  const [processReturnSubmitting, setProcessReturnSubmitting] = useState(false);

  // Return Details Modal & Return Receipt State
  const [showReturnDetailsModal, setShowReturnDetailsModal] = useState(false);
  const [selectedReturnDetails, setSelectedReturnDetails] = useState(null);
  const [showReturnReceiptModal, setShowReturnReceiptModal] = useState(false);
  const [completedReturn, setCompletedReturn] = useState(null);

  // Inter-branch Stock Request Modal
  const [showStockRequestModal, setShowStockRequestModal] = useState(false);
  const [requestProduct, setRequestProduct] = useState(null);
  const [requestSourceBranchId, setRequestSourceBranchId] = useState('');
  const [requestQuantity, setRequestQuantity] = useState('1');
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  // Refs
  const searchInputRef = useRef(null);

  // Save carts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('pos_cart_tabs', JSON.stringify(cartTabs));
      localStorage.setItem('pos_carts_data', JSON.stringify(carts));
    } catch {}
  }, [cartTabs, carts]);

  // Fetch initial lookups: settings, employees, next-order-id
  useEffect(() => {
    async function loadMetadata() {
      try {
        const nextIdUrl = `/next-order-id${activeBranchId && activeBranchId !== 'all' ? `?branch_id=${activeBranchId}` : ''}`;
        const [settingsRes, nextIdRes] = await Promise.all([
          api.get('/public/settings').catch(() => null),
          api.get(nextIdUrl).catch(() => null),
        ]);
        if (settingsRes) {
          setSettings((prev) => ({ ...prev, ...settingsRes }));
        }
        if (nextIdRes?.next_id) {
          setNextOrderId(nextIdRes.next_id);
        }
      } catch {}
    }
    loadMetadata();
  }, [activeBranchId]);

  // Fetch employees for branch
  useEffect(() => {
    async function loadEmployees() {
      try {
        const empUrl = `/employees${activeBranchId && activeBranchId !== 'all' ? `?branch_id=${activeBranchId}` : ''}`;
        const data = await api.get(empUrl);
        const list = Array.isArray(data) ? data : data?.employees || data?.data || [];
        setEmployees(list);
        if (list.length > 0 && !sellerId) {
          setSellerId(list[0].id.toString());
        }
      } catch {}
    }
    loadEmployees();
  }, [activeBranchId]);

  // Fetch Inventory items
  const fetchInventory = useCallback(async () => {
    try {
      setLoadingInventory(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') {
        query.append('branch_id', activeBranchId);
      }
      if (searchQuery.trim()) {
        query.append('search', searchQuery.trim());
      }
      const data = await api.get(`/inventory?${query.toString()}`);
      if (Array.isArray(data)) {
        setInventory(data);
      } else if (data && Array.isArray(data.items)) {
        setInventory(data.items);
      }
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoadingInventory(false);
    }
  }, [activeBranchId, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventory();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchInventory]);

  // Filter products by category
  const filteredProducts = useMemo(() => {
    return inventory.filter((item) => {
      if (selectedCategory === 'الكل') return true;
      return item.category === selectedCategory;
    });
  }, [inventory, selectedCategory]);

  // Barcode Scan / Exact Match on Enter
  const handleBarcodeSubmit = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = searchQuery.trim();
      if (!code) return;

      const matched = inventory.find(
        (i) =>
          (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
          (i.code && i.code.toLowerCase() === code.toLowerCase()) ||
          (i.name && i.name.toLowerCase() === code.toLowerCase())
      );

      if (matched) {
        addToCart(matched);
        setSearchQuery('');
        playBeep();
      } else {
        toast.warning(`لم يتم العثور على منتج بهذا الباركود: ${code}`);
      }
    }
  };

  // Add Item to Current Cart
  const addToCart = (product) => {
    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const existingIndex = items.findIndex((i) => i.id === product.id);

      if (existingIndex > -1) {
        const updated = [...items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return { ...prev, [activeCartId]: updated };
      } else {
        const newItem = {
          id: product.id,
          name: product.name,
          barcode: product.barcode,
          price: Number(product.price || 0),
          color: product.color || '',
          size: product.size_cut || product.size || '',
          image_url: product.image_url || '',
          quantity: 1,
          discount: 0,
          discount_type: 'amount',
        };
        return { ...prev, [activeCartId]: [...items, newItem] };
      }
    });
    playBeep();
  };

  const updateQuantity = (itemId, delta) => {
    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const updated = items
        .map((item) => {
          if (item.id === itemId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
      return { ...prev, [activeCartId]: updated };
    });
  };

  const removeFromCart = (itemId) => {
    setCarts((prev) => ({
      ...prev,
      [activeCartId]: (prev[activeCartId] || []).filter((i) => i.id !== itemId),
    }));
  };

  const updateItemDiscount = (itemId, discountVal, discountType = 'amount') => {
    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const updated = items.map((item) => {
        if (item.id === itemId) {
          const val = Math.max(0, Number(discountVal) || 0);
          return { ...item, discount: val, discount_type: discountType };
        }
        return item;
      });
      return { ...prev, [activeCartId]: updated };
    });
  };

  const clearCurrentCart = () => {
    if (currentCart.length === 0) return;
    setCarts((prev) => ({ ...prev, [activeCartId]: [] }));
    setInvoiceDiscounts((prev) => ({
      ...prev,
      [activeCartId]: { value: 0, type: 'amount' },
    }));
  };

  // Add / Switch / Remove Cart Tabs
  const addCartTab = () => {
    const nextId = Math.max(...cartTabs.map((t) => t.id), 0) + 1;
    const newTab = { id: nextId, name: `عميل ${nextId}` };
    setCartTabs((prev) => [...prev, newTab]);
    setActiveCartId(nextId);
  };

  const removeCartTab = (tabId, e) => {
    e.stopPropagation();
    if (cartTabs.length <= 1) return;
    const nextTabs = cartTabs.filter((t) => t.id !== tabId);
    setCartTabs(nextTabs);
    if (activeCartId === tabId) {
      setActiveCartId(nextTabs[0].id);
    }
    setCarts((prev) => {
      const copy = { ...prev };
      delete copy[tabId];
      return copy;
    });
  };

  // Calculations
  const subtotal = useMemo(() => {
    return currentCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [currentCart]);

  const itemsDiscountTotal = useMemo(() => {
    return currentCart.reduce((sum, item) => {
      const disc = Number(item.discount || 0);
      if (item.discount_type === 'percent') {
        return sum + (item.price * item.quantity * disc) / 100;
      }
      return sum + disc;
    }, 0);
  }, [currentCart]);

  const invoiceDiscountTotal = useMemo(() => {
    const val = Number(currentDiscount.value || 0);
    if (currentDiscount.type === 'percent') {
      return ((subtotal - itemsDiscountTotal) * val) / 100;
    }
    return val;
  }, [subtotal, itemsDiscountTotal, currentDiscount]);

  const totalDiscount = itemsDiscountTotal + invoiceDiscountTotal;
  const grandTotal = Math.max(0, subtotal - totalDiscount);

  // Customer Search suggestions
  const searchCustomers = async (phoneOrName) => {
    if (!phoneOrName || phoneOrName.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const branchParam = activeBranchId && activeBranchId !== 'all' ? `&branch_id=${activeBranchId}` : '';
      const data = await api.get(`/customers?search=${encodeURIComponent(phoneOrName)}${branchParam}`);
      const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
      setCustomerSuggestions(list);
      setShowSuggestions(list.length > 0);
    } catch {
      setCustomerSuggestions([]);
    }
  };

  // Open Checkout Modal
  const openCheckout = () => {
    if (currentCart.length === 0) {
      toast.warning('السلة فارغة! برجاء إضافة منتجات أولاً');
      return;
    }
    setPaidAmount(grandTotal.toString());
    setShowCheckoutModal(true);
  };

  // Submit Order / Checkout
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('الرجاء إدخال اسم ورقم هاتف العميل');
      return;
    }
    if (!sellerId) {
      toast.error('الرجاء اختيار الموظف البائع');
      return;
    }

    const paid = Number(paidAmount) || 0;
    const change = Math.max(0, paid - grandTotal);
    const chosenBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1;

    setCheckoutSubmitting(true);
    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        branch_id: chosenBranchId,
        seller_id: Number(sellerId),
        payment_method: paymentMethod,
        total_amount: grandTotal,
        paid_amount: paid,
        change_amount: change,
        invoice_discount: invoiceDiscountTotal,
        invoice_discount_type: currentDiscount.type,
        items: currentCart.map((i) => ({
          id: i.id,
          quantity: i.quantity,
          price: i.price,
          discount: i.discount || 0,
          discount_type: i.discount_type || 'amount',
        })),
        needs_alteration: needsAlteration,
        alteration_due_date: needsAlteration ? alterationDueDate : null,
      };

      const res = await api.post('/orders', payload);

      toast.success('تم تسجيل وحفظ الفاتورة بنجاح! 🎉');
      setShowCheckoutModal(false);

      setCompletedOrder({
        order_number: res.order_number || res.id || nextOrderId,
        created_at: new Date().toISOString(),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        seller_name: employees.find((e) => e.id.toString() === sellerId)?.name || 'الكاشير',
        branch_name: branches.find((b) => b.id.toString() === chosenBranchId.toString())?.name || 'الفرع الرئيسي',
        items: [...currentCart],
        subtotal,
        discount: totalDiscount,
        total_amount: grandTotal,
        paid_amount: paid,
        change_amount: change,
        payment_method: paymentMethod,
      });

      clearCurrentCart();

      const nextIdUrl = `/next-order-id${activeBranchId && activeBranchId !== 'all' ? `?branch_id=${activeBranchId}` : ''}`;
      const nextIdRes = await api.get(nextIdUrl).catch(() => null);
      if (nextIdRes?.next_id) setNextOrderId(nextIdRes.next_id);
      fetchInventory();

      setShowInvoiceModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل إتمام الطلب، يرجى المحاولة مرة أخرى');
    } finally {
      setCheckoutSubmitting(false);
    }
  };

  // Load Sales History with multi-filters
  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') {
        query.append('branch_id', activeBranchId);
      }
      if (historyFilters.id) query.append('id', historyFilters.id);
      if (historyFilters.customer) query.append('customer', historyFilters.customer);
      if (historyFilters.phone) query.append('phone', historyFilters.phone);
      if (historyFilters.date) query.append('date', historyFilters.date);
      if (historyFilters.status) query.append('status', historyFilters.status);

      query.append('page', historyPagination.page.toString());
      query.append('limit', historyPagination.limit.toString());

      const data = await api.get(`/orders?${query.toString()}`);
      if (Array.isArray(data)) {
        setHistoryOrders(data);
      } else if (data?.orders) {
        setHistoryOrders(data.orders);
        if (data.pagination) {
          setHistoryPagination((prev) => ({ ...prev, ...data.pagination }));
        }
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [activeBranchId, historyFilters, historyPagination.page, historyPagination.limit]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  // Load Returns History
  const fetchReturns = useCallback(async () => {
    try {
      setLoadingReturns(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') {
        query.append('branch_id', activeBranchId);
      }
      if (returnFilters.returnId) query.append('returnId', returnFilters.returnId);
      if (returnFilters.orderId) query.append('orderId', returnFilters.orderId);
      if (returnFilters.customer) query.append('customer', returnFilters.customer);
      if (returnFilters.phone) query.append('phone', returnFilters.phone);
      if (returnFilters.date) query.append('date', returnFilters.date);

      query.append('page', returnsPagination.page.toString());
      query.append('limit', returnsPagination.limit.toString());

      const data = await api.get(`/returns?${query.toString()}`);
      if (Array.isArray(data)) {
        setReturnsList(data);
      } else if (data?.returns) {
        setReturnsList(data.returns);
        if (data.pagination) {
          setReturnsPagination((prev) => ({ ...prev, ...data.pagination }));
        }
      }
    } catch (err) {
      console.error('Failed to load returns:', err);
    } finally {
      setLoadingReturns(false);
    }
  }, [activeBranchId, returnFilters, returnsPagination.page, returnsPagination.limit]);

  useEffect(() => {
    if (activeTab === 'returns') {
      fetchReturns();
    }
  }, [activeTab, fetchReturns]);

  // Pay Remaining Logic
  const openPayRemainingModal = (order) => {
    setSelectedOrderForPayment(order);
    const remaining = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
    setPayRemainingAmount(remaining.toString());
    setPayRemainingMethod('cash');
    setShowPayRemainingModal(true);
  };

  const handlePayRemainingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOrderForPayment) return;
    const amount = Number(payRemainingAmount);
    if (!amount || amount <= 0) {
      toast.warning('يرجى إدخال مبلغ صالح للدفع');
      return;
    }

    try {
      setPayRemainingSubmitting(true);
      await api.post(`/orders/${selectedOrderForPayment.id}/pay-remaining`, {
        amount,
        payment_method: payRemainingMethod,
      });

      toast.success('تم تسجيل سداد المبلغ بنجاح! 💰');
      setShowPayRemainingModal(false);
      fetchHistory();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل الدفعة');
    } finally {
      setPayRemainingSubmitting(false);
    }
  };

  // Edit Invoice Logic
  const openEditInvoicePasswordPrompt = (order) => {
    setSelectedOrderForEdit(order);
    setEditPasswordInput('');
    setEditPasswordError('');
    setShowEditPasswordModal(true);
  };

  const handleVerifyEditPassword = async (e) => {
    e.preventDefault();
    if (!editPasswordInput) {
      setEditPasswordError('يرجى إدخال كلمة المرور');
      return;
    }
    try {
      setEditPasswordChecking(true);
      setEditPasswordError('');
      await api.post('/verify-invoice-edit-password', { password: editPasswordInput });

      // Password valid -> load order details and open edit invoice modal
      setShowEditPasswordModal(false);
      const details = await api.get(`/orders/${selectedOrderForEdit.id}/details`);
      const fullOrder = details?.order || details || selectedOrderForEdit;
      const orderItems = details?.items || fullOrder.items || [];

      setEditOrderData({
        invoice_edit_password: editPasswordInput,
        customer_name: fullOrder.customer_name || '',
        customer_phone: fullOrder.customer_phone || '',
        seller_id: (fullOrder.seller_id || '').toString(),
        payment_method: fullOrder.payment_method || 'cash',
        paid_amount: fullOrder.paid_amount || fullOrder.total_amount || 0,
        invoice_discount: fullOrder.invoice_discount || 0,
        invoice_discount_type: fullOrder.invoice_discount_type || 'amount',
        items: orderItems.map((item) => ({
          inventory_id: item.inventory_id || item.id,
          name: item.name,
          color: item.color,
          size_cut: item.size_cut || item.size,
          quantity: Number(item.quantity || 1),
          price_at_time: Number(item.price_at_time || item.price || 0),
          discount: Number(item.discount || 0),
          discount_type: item.discount_type || 'amount',
        })),
      });

      setShowEditInvoiceModal(true);
    } catch (err) {
      setEditPasswordError(err.message || 'كلمة المرور غير صحيحة');
    } finally {
      setEditPasswordChecking(false);
    }
  };

  // Edit invoice items operations
  const updateEditItemQty = (index, delta) => {
    setEditOrderData((prev) => {
      const items = [...prev.items];
      const newQty = items[index].quantity + delta;
      if (newQty <= 0) return prev;
      items[index] = { ...items[index], quantity: newQty };
      return { ...prev, items };
    });
  };

  const removeEditItem = (index) => {
    setEditOrderData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const addEditItemFromSearch = (product) => {
    setEditOrderData((prev) => {
      const existsIndex = prev.items.findIndex((i) => i.inventory_id === product.id);
      if (existsIndex > -1) {
        const copy = [...prev.items];
        copy[existsIndex] = { ...copy[existsIndex], quantity: copy[existsIndex].quantity + 1 };
        return { ...prev, items: copy };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            inventory_id: product.id,
            name: product.name,
            color: product.color || '',
            size_cut: product.size_cut || product.size || '',
            quantity: 1,
            price_at_time: Number(product.price || 0),
            discount: 0,
            discount_type: 'amount',
          },
        ],
      };
    });
    setEditItemSearchQuery('');
    setEditItemSearchResults([]);
  };

  // Calculate totals in edit modal
  const editSubtotal = useMemo(() => {
    return editOrderData.items.reduce((sum, item) => sum + item.price_at_time * item.quantity, 0);
  }, [editOrderData.items]);

  const editTotal = useMemo(() => {
    const disc = Number(editOrderData.invoice_discount || 0);
    if (editOrderData.invoice_discount_type === 'percent') {
      return Math.max(0, editSubtotal - (editSubtotal * disc) / 100);
    }
    return Math.max(0, editSubtotal - disc);
  }, [editSubtotal, editOrderData.invoice_discount, editOrderData.invoice_discount_type]);

  const handleSaveEditInvoice = async (e) => {
    e.preventDefault();
    if (editOrderData.items.length === 0) {
      toast.warning('يجب أن تحتوي الفاتورة على صنف واحد على الأقل');
      return;
    }
    try {
      setEditSubmitting(true);
      await api.put(`/orders/${selectedOrderForEdit.id}`, {
        invoice_edit_password: editOrderData.invoice_edit_password || editPasswordInput,
        items: editOrderData.items.map((it) => ({
          inventory_id: it.inventory_id,
          quantity: it.quantity,
          price_at_time: it.price_at_time,
          discount: it.discount,
          discount_type: it.discount_type,
        })),
        customer_name: editOrderData.customer_name,
        customer_phone: editOrderData.customer_phone,
        seller_id: editOrderData.seller_id ? Number(editOrderData.seller_id) : null,
        payment_method: editOrderData.payment_method,
        paid_amount: editOrderData.paid_amount,
        change_amount: Math.max(0, editOrderData.paid_amount - editTotal),
        invoice_discount: editOrderData.invoice_discount,
        invoice_discount_type: editOrderData.invoice_discount_type,
        total_amount: editTotal,
      });

      toast.success('تم تحديث الفاتورة والمخزون بنجاح! ✏️');
      setShowEditInvoiceModal(false);
      fetchHistory();
    } catch (err) {
      toast.error(err.message || 'فشل تحديث الفاتورة');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Search orders for Return
  const handleSearchReturnOrders = async (query) => {
    setReturnOrderSearchQuery(query);
    if (!query || query.length < 2) {
      setReturnFoundOrders([]);
      return;
    }
    try {
      setSearchingReturnOrders(true);
      const branchParam = activeBranchId && activeBranchId !== 'all' ? `&branch_id=${activeBranchId}` : '';
      const data = await api.get(`/orders/search?query=${encodeURIComponent(query)}${branchParam}`);
      setReturnFoundOrders(Array.isArray(data) ? data : data?.orders || []);
    } catch {
      setReturnFoundOrders([]);
    } finally {
      setSearchingReturnOrders(false);
    }
  };

  // Helper to calculate exact financial details for returning an item
  const getItemReturnFinancials = (order, item) => {
    if (!order || !item) return { origPrice: 0, unitDiscount: 0, effectiveUnitPrice: 0, netPaidTotal: 0 };
    const origPrice = Number(item.price_at_time || item.price || 0);
    const origQty = Math.max(1, Number(item.quantity || 1));
    const itemTotal = origPrice * origQty;

    // Item-level discount
    const itemDiscVal = Math.max(0, Number(item.discount || 0));
    const isItemPercent = item.discount_type === 'percent' || item.discount_type === 'percentage';
    let itemDiscountAmount = 0;
    if (itemDiscVal > 0) {
      itemDiscountAmount = isItemPercent
        ? (itemTotal * itemDiscVal) / 100
        : Math.min(itemTotal, itemDiscVal);
    }
    const itemLineNet = Math.max(0, itemTotal - itemDiscountAmount);

    // Invoice-level discount distribution
    let orderItemsNetSubtotal = 0;
    (order.items || []).forEach((it) => {
      const p = Number(it.price_at_time || it.price || 0);
      const q = Math.max(1, Number(it.quantity || 1));
      const dVal = Math.max(0, Number(it.discount || 0));
      const isP = it.discount_type === 'percent' || it.discount_type === 'percentage';
      const lDisc = dVal > 0 ? (isP ? (p * q * dVal) / 100 : Math.min(p * q, dVal)) : 0;
      orderItemsNetSubtotal += Math.max(0, p * q - lDisc);
    });

    const invDiscVal = Math.max(0, Number(order.invoice_discount || 0));
    const isInvPercent = order.invoice_discount_type === 'percent' || order.invoice_discount_type === 'percentage';
    let invDiscountTotal = 0;
    if (invDiscVal > 0) {
      invDiscountTotal = isInvPercent
        ? (orderItemsNetSubtotal * invDiscVal) / 100
        : Math.min(orderItemsNetSubtotal, invDiscVal);
    }

    const invoiceDiscountRatio = orderItemsNetSubtotal > 0 ? (invDiscountTotal / orderItemsNetSubtotal) : 0;
    const itemInvoiceDiscShare = itemLineNet * invoiceDiscountRatio;

    const totalItemDiscount = itemDiscountAmount + itemInvoiceDiscShare;
    const netPaidTotal = Math.max(0, itemTotal - totalItemDiscount);
    const effectiveUnitPrice = origQty > 0 ? Math.round((netPaidTotal / origQty) * 100) / 100 : origPrice;
    const unitDiscount = Math.max(0, Math.round((origPrice - effectiveUnitPrice) * 100) / 100);

    return {
      origPrice,
      origQty,
      itemDiscountAmount,
      itemInvoiceDiscShare,
      totalItemDiscount,
      unitDiscount,
      effectiveUnitPrice,
      netPaidTotal,
    };
  };

  // Select an order to return
  const selectOrderForReturn = async (order) => {
    try {
      let fullOrder = order;
      try {
        const details = await api.get(`/orders/${order.id}/details`);
        fullOrder = { ...order, ...details, items: details.items || order.items || [] };
      } catch (e) {
        // Fallback to order with its existing items if details call fails
      }
      setSelectedReturnOrder(fullOrder);

      // Pre-initialize return quantities
      const initialQtys = {};
      const initialSelection = {};
      (fullOrder.items || []).forEach((item) => {
        const availableQty = Math.max(0, Number(item.quantity || 1) - Number(item.returned_quantity || 0));
        initialQtys[item.id] = availableQty;
        initialSelection[item.id] = availableQty > 0;
      });
      setReturnQuantities(initialQtys);
      setReturnSelection(initialSelection);
      setManualReturnAmount('');
    } catch (err) {
      toast.error('تعذر تحميل تفاصيل الفاتورة للإرجاع');
    }
  };

  // Calculate return refund amount based on actual net price paid
  const calculatedReturnAmount = useMemo(() => {
    if (!selectedReturnOrder || !selectedReturnOrder.items) return 0;
    let sum = 0;
    selectedReturnOrder.items.forEach((item) => {
      if (returnSelection[item.id]) {
        const qty = Number(returnQuantities[item.id] || 0);
        const financials = getItemReturnFinancials(selectedReturnOrder, item);
        sum += financials.effectiveUnitPrice * qty;
      }
    });
    return Math.round(sum * 100) / 100;
  }, [selectedReturnOrder, returnSelection, returnQuantities]);

  const finalReturnRefund = manualReturnAmount !== '' ? Number(manualReturnAmount) : calculatedReturnAmount;

  // Submit Process Return
  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    if (!selectedReturnOrder) return;

    const returnItems = (selectedReturnOrder.items || [])
      .filter((item) => returnSelection[item.id] && Number(returnQuantities[item.id]) > 0)
      .map((item) => {
        const financials = getItemReturnFinancials(selectedReturnOrder, item);
        return {
          id: item.inventory_id || item.id,
          quantity: Number(returnQuantities[item.id]),
          price: financials.effectiveUnitPrice,
        };
      });

    if (returnItems.length === 0) {
      toast.warning('يرجى تحديد صنف واحد على الأقل لإرجاعه');
      return;
    }

    try {
      setProcessReturnSubmitting(true);
      const chosenBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : selectedReturnOrder.branch_id || branches[0]?.id || 1;

      const payload = {
        order_id: selectedReturnOrder.id,
        branch_id: chosenBranchId,
        seller_id: Number(sellerId) || selectedReturnOrder.seller_id,
        total_return_amount: finalReturnRefund,
        items: returnItems,
      };

      const res = await api.post('/returns', payload);

      toast.success('تم تسجيل وحفظ المرتجع بنجاح! 🔄');
      setShowProcessReturnModal(false);

      setCompletedReturn({
        return_id: res.returnId || res.id,
        original_order_id: selectedReturnOrder.id,
        created_at: new Date().toISOString(),
        customer_name: selectedReturnOrder.customer_name || 'عميل نقدي',
        customer_phone: selectedReturnOrder.customer_phone || '-',
        seller_name: employees.find((e) => e.id.toString() === sellerId)?.name || 'الكاشير',
        branch_name: branches.find((b) => b.id.toString() === chosenBranchId.toString())?.name || 'الفرع الرئيسي',
        items: returnItems.map((ri) => {
          const original = selectedReturnOrder.items.find((oi) => (oi.inventory_id || oi.id) === ri.id);
          return {
            name: original?.name || 'صنف مرتجع',
            quantity: ri.quantity,
            price: ri.price,
          };
        }),
        total_return_amount: finalReturnRefund,
      });

      setSelectedReturnOrder(null);
      fetchReturns();
      fetchInventory();
      setShowReturnReceiptModal(true);
    } catch (err) {
      toast.error(err.message || 'فشل إتمام عملية الإرجاع');
    } finally {
      setProcessReturnSubmitting(false);
    }
  };

  // Stock Transfer Request
  const openStockRequestModal = (product) => {
    setRequestProduct(product);
    const otherBranches = branches.filter((b) => b.id.toString() !== activeBranchId?.toString());
    if (otherBranches.length > 0) {
      setRequestSourceBranchId(otherBranches[0].id.toString());
    }
    setRequestQuantity('1');
    setShowStockRequestModal(true);
  };

  const handleStockRequestSubmit = async (e) => {
    e.preventDefault();
    if (!requestProduct || !requestSourceBranchId) return;

    try {
      setRequestSubmitting(true);
      const targetBranch = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1;

      await api.post('/inventory/transfer', {
        inventory_id: requestProduct.id,
        from_branch_id: Number(requestSourceBranchId),
        to_branch_id: targetBranch,
        quantity: Number(requestQuantity),
        notes: `طلب بضاعة من الفرع الآخر (${branches.find((b) => b.id.toString() === requestSourceBranchId)?.name})`,
      });

      toast.success('تم إرسال طلب نقل البضاعة بنجاح! 🚚');
      setShowStockRequestModal(false);
    } catch (err) {
      toast.error(err.message || 'فشل إرسال طلب نقل البضاعة');
    } finally {
      setRequestSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-[1700px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Top Bar: Tabs & Active Branch Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm no-print">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'pos'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>نقطة البيع (الكاشير)</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'history'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>سجل مبيعات الكاشير</span>
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'returns'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span>المرتجعات</span>
          </button>
        </div>

        {/* Live Invoice Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 font-extrabold text-xs border border-indigo-100">
            <span>فاتورة رقم:</span>
            <span className="font-mono text-sm">#{nextOrderId}</span>
          </div>
        </div>
      </div>

      {/* 1. POS WORKSPACE VIEW */}
      {activeTab === 'pos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* RIGHT COLUMN (7/8 Cols): Product Catalog & Barcode Scanner */}
          <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
            {/* Search and Barcode Input */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-3">
              <div className="relative flex-1">
                <Barcode className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleBarcodeSubmit}
                  placeholder="امسح الباركود، أو ابحث بالاسم، الكود..."
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pr-11 pl-4 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-600 focus:bg-white transition-all"
                  autoFocus
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Product Cards Grid */}
            <div className="min-h-[500px] max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
              {loadingInventory ? (
                <div className="py-24 text-center text-slate-400 font-bold text-sm">
                  جاري تحميل المنتجات...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-24 text-center text-slate-400 font-bold text-sm bg-white rounded-3xl border border-dashed border-slate-300">
                  لا توجد منتجات مطابقة للبحث
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {filteredProducts.map((product) => {
                    const stock = Number(product.stock_level ?? product.stock_quantity ?? product.stock ?? 0);
                    const isLow = stock <= (product.min_stock_level ?? 5);

                    return (
                      <div
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        {/* Thumbnail */}
                        <div className="aspect-square bg-slate-100 rounded-xl mb-3 overflow-hidden relative flex items-center justify-center">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : (
                            <Tag className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                          )}
                          <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md backdrop-blur-sm">
                            {product.category || 'ملابس'}
                          </span>
                        </div>

                        {/* Title & Attributes */}
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="font-black text-slate-900 text-xs sm:text-sm line-clamp-1 group-hover:text-indigo-600 transition-colors">
                              {product.name}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">
                              #{product.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-slate-500 font-bold">
                            {product.color && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {product.color}
                              </span>
                            )}
                            {(product.size_cut || product.size) && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                {product.size_cut || product.size}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Stock & Inter-Branch Request */}
                        <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
                          <span className={isLow ? 'text-amber-600' : 'text-emerald-600'}>
                            المتوفر: {stock}
                          </span>
                          {branches.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStockRequestModal(product);
                              }}
                              className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded transition-colors"
                              title="طلب بضاعة من الفروع الأخرى"
                            >
                              طلب من فرع 🚚
                            </button>
                          )}
                        </div>

                        {/* Price & Add Button */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-black text-indigo-600">
                            {Number(product.price || 0).toLocaleString()} ج.م
                          </span>
                          <button
                            type="button"
                            className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-all shadow-sm"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* LEFT COLUMN (4/5 Cols): Sticky Cart & Multi-Tab Summary */}
          <div className="lg:col-span-5 xl:col-span-4 bg-white rounded-3xl border border-slate-200/80 shadow-card flex flex-col h-[calc(100vh-140px)] sticky top-24 overflow-hidden">
            {/* Multi-Cart Tabs Header */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {cartTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveCartId(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                    activeCartId === tab.id
                      ? 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:bg-slate-200/70'
                  }`}
                >
                  <span>{tab.name}</span>
                  {cartTabs.length > 1 && (
                    <span
                      onClick={(e) => removeCartTab(tab.id, e)}
                      className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-rose-600"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={addCartTab}
                className="p-1.5 rounded-xl bg-slate-200/80 hover:bg-indigo-600 hover:text-white text-slate-600 transition-colors"
                title="فتح سلة عميل جديد"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Cart Header Actions */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 font-black text-slate-900 text-sm">
                <ShoppingCart className="w-4 h-4 text-indigo-600" />
                <span>عناصر الفاتورة ({currentCart.length})</span>
              </div>
              {currentCart.length > 0 && (
                <button
                  onClick={clearCurrentCart}
                  className="flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-700 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ</span>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-100">
              {currentCart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 mb-3">
                    <ShoppingCart className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-600">السلة فارغة حالياً</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    امسح باركود المنتج أو اضغط على الأصناف لإضافتها للفاتورة
                  </p>
                </div>
              ) : (
                currentCart.map((item) => {
                  const itemDisc = Number(item.discount || 0);
                  const isPerc = item.discount_type === 'percent';
                  const itemDiscAmt = itemDisc > 0 ? (isPerc ? (item.price * item.quantity * itemDisc) / 100 : Math.min(item.price * item.quantity, itemDisc)) : 0;
                  const lineNet = Math.max(0, (item.price * item.quantity) - itemDiscAmt);
                  const isEditingDisc = activeDiscountItemId === item.id;
                  const unitNet = Math.max(0, item.price - (itemDiscAmt / item.quantity));

                  return (
                    <div key={item.id} className="pt-2.5 first:pt-0 pb-2.5 border-b border-slate-100 last:border-b-0 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">
                              #{item.id}
                            </span>
                            <h5 className="text-xs sm:text-sm font-black text-slate-900 truncate">
                              {item.name}
                            </h5>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-400 mt-0.5">
                            {itemDisc > 0 ? (
                              <>
                                <span className="line-through text-slate-400">{item.price.toLocaleString()} ج.م</span>
                                <span className="text-emerald-700 font-black">{unitNet.toLocaleString()} ج.م</span>
                                <span className="text-[10px] text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-black">
                                  خصم: -{itemDisc}{isPerc ? '%' : ' ج.م'}
                                </span>
                              </>
                            ) : (
                              <span>{item.price.toLocaleString()} ج.م</span>
                            )}
                            {item.color && <span>• {item.color}</span>}
                            {item.size && <span>• {item.size}</span>}
                            {!isEditingDisc && itemDisc === 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveDiscountItemId(item.id)}
                                className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline decoration-dotted"
                              >
                                + خصم على القطعة
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Quantity controls */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 shadow-sm"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-slate-900 font-mono">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 shadow-sm"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Total item price & delete */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs sm:text-sm font-black text-slate-900 w-20 text-left">
                            {lineNet.toLocaleString()} ج.م
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.id)}
                            className="text-slate-300 hover:text-rose-500 transition-colors p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Item-level discount input bar */}
                      {(isEditingDisc || itemDisc > 0) && (
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
                          <span className="font-bold text-slate-600 text-[11px] whitespace-nowrap">خصم القطعة:</span>
                          <input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={item.discount || ''}
                            onChange={(e) => updateItemDiscount(item.id, e.target.value, item.discount_type || 'amount')}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-center font-bold text-xs outline-none focus:border-indigo-600"
                          />
                          <select
                            value={item.discount_type || 'amount'}
                            onChange={(e) => updateItemDiscount(item.id, item.discount, e.target.value)}
                            className="bg-white border border-slate-300 rounded-lg px-1.5 py-0.5 text-xs font-bold outline-none cursor-pointer"
                          >
                            <option value="amount">ج.م</option>
                            <option value="percent">%</option>
                          </select>
                          {itemDisc > 0 && (
                            <span className="text-[11px] text-emerald-700 font-bold mr-auto">
                              الصافي: {unitNet.toLocaleString()} ج.م
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              updateItemDiscount(item.id, 0, 'amount');
                              setActiveDiscountItemId(null);
                            }}
                            className="text-slate-400 hover:text-rose-600 text-xs font-bold px-1.5 py-0.5 rounded mr-auto"
                            title="إغلاق الخصم"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer & Checkout Summary */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/80 space-y-3">
              {/* Discount Row */}
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>خصم على الفاتورة:</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    value={currentDiscount.value || ''}
                    onChange={(e) =>
                      setInvoiceDiscounts((prev) => ({
                        ...prev,
                        [activeCartId]: {
                          ...currentDiscount,
                          value: Number(e.target.value) || 0,
                        },
                      }))
                    }
                    placeholder="0"
                    className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-1 text-center font-bold text-xs outline-none focus:border-indigo-600"
                  />
                  <select
                    value={currentDiscount.type}
                    onChange={(e) =>
                      setInvoiceDiscounts((prev) => ({
                        ...prev,
                        [activeCartId]: {
                          ...currentDiscount,
                          type: e.target.value,
                        },
                      }))
                    }
                    className="bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-xs font-bold outline-none cursor-pointer"
                  >
                    <option value="amount">ج.م</option>
                    <option value="percent">%</option>
                  </select>
                </div>
              </div>

              {/* Subtotal & Discount summary */}
              <div className="space-y-1 pt-2 border-t border-slate-200/60 text-xs font-bold">
                <div className="flex justify-between text-slate-500">
                  <span>المجموع الفرعي:</span>
                  <span>{subtotal.toLocaleString()} ج.م</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>إجمالي الخصم:</span>
                    <span>- {totalDiscount.toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 text-base font-black text-slate-900 border-t border-slate-200">
                  <span>الإجمالي النهائي:</span>
                  <span className="text-xl text-indigo-600 font-mono">
                    {grandTotal.toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              {/* Checkout Button */}
              <Button
                variant="primary"
                size="lg"
                onClick={openCheckout}
                disabled={currentCart.length === 0}
                className="w-full !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-700 !shadow-lg !shadow-indigo-600/30 text-white font-black text-base"
              >
                <span>إتمام الدفع والفاتورة</span>
                <span className="font-mono mr-1 font-normal text-indigo-200 text-sm">(F9)</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 2. SALES HISTORY VIEW */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader
            title="سجل مبيعات الكاشير"
            subtitle="عرض وتعديل وتحصيل فواتير البيع المسجلة في هذا الفرع"
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={fetchHistory} icon={RotateCcw}>
                  تحديث
                </Button>
              </div>
            }
          />

          {/* Filter Bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              placeholder="رقم الفاتورة..."
              value={historyFilters.id}
              onChange={(e) => setHistoryFilters({ ...historyFilters, id: e.target.value })}
            />
            <Input
              placeholder="اسم العميل..."
              value={historyFilters.customer}
              onChange={(e) => setHistoryFilters({ ...historyFilters, customer: e.target.value })}
            />
            <Input
              placeholder="رقم الهاتف..."
              value={historyFilters.phone}
              onChange={(e) => setHistoryFilters({ ...historyFilters, phone: e.target.value })}
            />
            <input
              type="date"
              value={historyFilters.date}
              onChange={(e) => setHistoryFilters({ ...historyFilters, date: e.target.value })}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-600"
            />
            <select
              value={historyFilters.status}
              onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value })}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="">جميع الحالات</option>
              <option value="completed">مكتمل</option>
              <option value="deferred">آجل / غير خالص</option>
              <option value="returned">تم الإرجاع</option>
            </select>
          </div>

          {historyLoading ? (
            <div className="py-20 text-center text-slate-400 font-bold text-sm">
              جاري تحميل سجل الفواتير...
            </div>
          ) : historyOrders.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-bold text-sm">
              لا توجد فواتير مسجلة مطابقة للبحث
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-900 text-white text-xs font-black uppercase">
                    <th className="py-3.5 pr-4">رقم الفاتورة</th>
                    <th className="py-3.5">التاريخ والوقت</th>
                    <th className="py-3.5">العميل</th>
                    <th className="py-3.5">الهاتف</th>
                    <th className="py-3.5">البائع</th>
                    <th className="py-3.5">الإجمالي</th>
                    <th className="py-3.5">المتبقي</th>
                    <th className="py-3.5">الحالة</th>
                    <th className="py-3.5 pl-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {historyOrders.map((order) => {
                    const remaining = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
                    const isReturned = order.status === 'returned';

                    return (
                      <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 pr-4 font-bold text-slate-900">
                          #{order.branch_invoice_number || order.id}
                        </td>
                        <td className="py-3.5 text-xs text-slate-500" dir="ltr">
                          {new Date(order.created_at || order.order_date).toLocaleString('ar-EG', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-3.5 font-bold text-slate-800">
                          {order.customer_name || 'عميل نقدي'}
                        </td>
                        <td className="py-3.5 text-slate-500 font-mono text-xs" dir="ltr">
                          {order.customer_phone || '-'}
                        </td>
                        <td className="py-3.5 text-slate-600 text-xs">
                          {order.seller_name || '-'}
                        </td>
                        <td className="py-3.5 font-black text-indigo-600">
                          {Number(order.total_amount || 0).toLocaleString()} ج.م
                        </td>
                        <td className="py-3.5 font-bold text-xs">
                          {isReturned ? (
                            <span className="text-slate-400">-</span>
                          ) : remaining > 0 ? (
                            <span className="text-amber-600">{remaining.toLocaleString()} ج.م</span>
                          ) : (
                            <span className="text-emerald-600">تم الدفع بالكامل</span>
                          )}
                        </td>
                        <td className="py-3.5">
                          {isReturned ? (
                            <Badge variant="danger">تم الإرجاع</Badge>
                          ) : remaining > 0 ? (
                            <Badge variant="warning">آجل / غير خالص</Badge>
                          ) : (
                            <Badge variant="success">مكتمل</Badge>
                          )}
                        </td>
                        <td className="py-3.5 pl-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Print Button */}
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Printer}
                              title="طباعة الفاتورة"
                              onClick={() => {
                                const orderItems = order.items || [];
                                const itemsBaseSubtotal = orderItems.reduce((acc, it) => acc + (Number(it.price_at_time || it.price || 0) * Number(it.quantity || 1)), 0);
                                const itemsDisc = orderItems.reduce((acc, it) => {
                                  const p = Number(it.price_at_time || it.price || 0);
                                  const q = Number(it.quantity || 1);
                                  const d = Number(it.discount || 0);
                                  if (d <= 0) return acc;
                                  return acc + (it.discount_type === 'percent' ? (p * q * d) / 100 : Math.min(p * q, d));
                                }, 0);
                                const invDisc = Number(order.invoice_discount || order.discount || 0);
                                const totalDisc = itemsDisc + invDisc;
                                const calculatedSub = itemsBaseSubtotal > 0 ? itemsBaseSubtotal : (Number(order.total_amount || 0) + totalDisc);

                                setCompletedOrder({
                                  order_number: order.branch_invoice_number || order.id,
                                  created_at: order.created_at || order.order_date,
                                  customer_name: order.customer_name,
                                  customer_phone: order.customer_phone,
                                  seller_name: order.seller_name,
                                  branch_name: order.branch_name,
                                  items: orderItems,
                                  subtotal: calculatedSub,
                                  discount: totalDisc,
                                  total_amount: Number(order.total_amount || 0),
                                  paid_amount: Number(order.paid_amount || order.total_amount || 0),
                                  change_amount: Number(order.change_amount || 0),
                                  payment_method: order.payment_method || 'cash',
                                });
                                setShowInvoiceModal(true);
                              }}
                            />

                            {/* Edit Invoice Button */}
                            {!isReturned && (
                              <button
                                onClick={() => openEditInvoicePasswordPrompt(order)}
                                className="p-1.5 rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                                title="تعديل الفاتورة (محمي بكلمة مرور)"
                              >
                                <Scissors className="w-4 h-4" />
                              </button>
                            )}

                            {/* Pay Remaining Button */}
                            {!isReturned && remaining > 0 && (
                              <button
                                onClick={() => openPayRemainingModal(order)}
                                className="p-1.5 rounded-lg border border-amber-200 text-amber-600 hover:bg-amber-50 transition-colors"
                                title="سداد المبلغ المتبقي"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>
                            )}

                            {/* Return Button */}
                            {!isReturned && (
                              <button
                                onClick={() => {
                                  selectOrderForReturn(order);
                                  setShowProcessReturnModal(true);
                                }}
                                className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors"
                                title="إرجاع أصناف من هذا الطلب"
                              >
                                <Undo2 className="w-4 h-4" />
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
      )}

      {/* 3. RETURNS VIEW */}
      {activeTab === 'returns' && (
        <Card>
          <CardHeader
            title="سجل المرتجعات"
            subtitle="إدارة فواتير المرتجعات واسترداد المبالغ وإرجاع الأصناف للمخزون"
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  icon={Plus}
                  onClick={() => {
                    setSelectedReturnOrder(null);
                    setReturnOrderSearchQuery('');
                    setReturnFoundOrders([]);
                    setShowProcessReturnModal(true);
                  }}
                >
                  إضافة مرتجع جديد
                </Button>
                <Button variant="outline" onClick={fetchReturns} icon={RotateCcw}>
                  تحديث
                </Button>
              </div>
            }
          />

          {/* Returns Filter Bar */}
          <div className="p-4 bg-slate-50 border-b border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <Input
              placeholder="رقم المرتجع..."
              value={returnFilters.returnId}
              onChange={(e) => setReturnFilters({ ...returnFilters, returnId: e.target.value })}
            />
            <Input
              placeholder="رقم الطلب الأصلي..."
              value={returnFilters.orderId}
              onChange={(e) => setReturnFilters({ ...returnFilters, orderId: e.target.value })}
            />
            <Input
              placeholder="اسم العميل..."
              value={returnFilters.customer}
              onChange={(e) => setReturnFilters({ ...returnFilters, customer: e.target.value })}
            />
            <Input
              placeholder="رقم الهاتف..."
              value={returnFilters.phone}
              onChange={(e) => setReturnFilters({ ...returnFilters, phone: e.target.value })}
            />
            <input
              type="date"
              value={returnFilters.date}
              onChange={(e) => setReturnFilters({ ...returnFilters, date: e.target.value })}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-600"
            />
          </div>

          {loadingReturns ? (
            <div className="py-20 text-center text-slate-400 font-bold text-sm">
              جاري تحميل المرتجعات...
            </div>
          ) : returnsList.length === 0 ? (
            <div className="py-20 text-center text-slate-400 font-bold text-sm">
              لا توجد مرتجعات مسجلة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-900 text-white text-xs font-black uppercase">
                    <th className="py-3.5 pr-4">رقم المرتجع</th>
                    <th className="py-3.5">رقم الطلب الأصلي</th>
                    <th className="py-3.5">تاريخ الإرجاع</th>
                    <th className="py-3.5">العميل</th>
                    <th className="py-3.5">الهاتف</th>
                    <th className="py-3.5">البائع</th>
                    <th className="py-3.5">المبلغ المسترد</th>
                    <th className="py-3.5 pl-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {returnsList.map((ret) => (
                    <tr key={ret.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 pr-4 font-bold text-rose-600 font-mono">
                        RET-{ret.id}
                      </td>
                      <td className="py-3.5 font-bold text-slate-800">
                        #{ret.original_order_id || ret.order_id}
                      </td>
                      <td className="py-3.5 text-xs text-slate-500" dir="ltr">
                        {new Date(ret.return_date || ret.created_at).toLocaleString('ar-EG', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3.5 font-bold text-slate-800">
                        {ret.customer_name || 'عميل نقدي'}
                      </td>
                      <td className="py-3.5 text-slate-500 font-mono text-xs" dir="ltr">
                        {ret.customer_phone || '-'}
                      </td>
                      <td className="py-3.5 text-slate-600 text-xs">
                        {ret.seller_name || '-'}
                      </td>
                      <td className="py-3.5 font-black text-rose-600">
                        {Number(ret.total_return_amount || 0).toLocaleString()} ج.م
                      </td>
                      <td className="py-3.5 pl-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Printer}
                            title="طباعة إيصال المرتجع"
                            onClick={() => {
                              setCompletedReturn({
                                return_id: ret.id,
                                original_order_id: ret.original_order_id || ret.order_id,
                                created_at: ret.return_date || ret.created_at,
                                customer_name: ret.customer_name,
                                customer_phone: ret.customer_phone,
                                seller_name: ret.seller_name,
                                branch_name: ret.branch_name,
                                items: ret.items || [],
                                total_return_amount: Number(ret.total_return_amount || 0),
                              });
                              setShowReturnReceiptModal(true);
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Info}
                            title="عرض تفاصيل المرتجع"
                            onClick={() => {
                              setSelectedReturnDetails(ret);
                              setShowReturnDetailsModal(true);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* PROCESS RETURN MODAL */}
      <Modal
        isOpen={showProcessReturnModal}
        onClose={() => setShowProcessReturnModal(false)}
        title="معالجة مرتجع جديد 🔄"
        subtitle="ابحث عن الطلب الأصلي وحدد الأصناف المراد إرجاعها إلى المخزون"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSubmitReturn} className="space-y-6">
          {/* Order Search Box */}
          {!selectedReturnOrder && (
            <div className="space-y-3">
              <label className="text-xs font-bold text-slate-700">البحث عن الفاتورة الأصلية</label>
              <div className="relative">
                <Search className="w-5 h-5 absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={returnOrderSearchQuery}
                  onChange={(e) => handleSearchReturnOrders(e.target.value)}
                  placeholder="ابحث برقم الفاتورة، أو هاتف العميل، أو اسمه..."
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl pr-11 pl-4 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-indigo-600 focus:bg-white transition-all"
                  autoFocus
                />
              </div>

              {searchingReturnOrders && (
                <p className="text-xs text-slate-400">جاري البحث...</p>
              )}

              {returnFoundOrders.length > 0 && (
                <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-60 overflow-y-auto bg-white">
                  {returnFoundOrders.map((ord) => (
                    <div
                      key={ord.id}
                      onClick={() => selectOrderForReturn(ord)}
                      className="p-3.5 hover:bg-indigo-50/50 cursor-pointer flex items-center justify-between transition-colors"
                    >
                      <div>
                        <div className="font-black text-slate-900 text-sm">
                          فاتورة #{ord.branch_invoice_number || ord.id}
                        </div>
                        <div className="text-xs text-slate-500 font-bold mt-0.5">
                          العميل: {ord.customer_name || 'نقدي'} ({ord.customer_phone || '-'})
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-black text-indigo-600">
                          {Number(ord.total_amount).toLocaleString()} ج.م
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {new Date(ord.created_at || ord.order_date).toLocaleDateString('ar-EG')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected Order Items for Return */}
          {selectedReturnOrder && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="font-black text-slate-900">
                    فاتورة #{selectedReturnOrder.branch_invoice_number || selectedReturnOrder.id}
                  </h4>
                  <p className="text-xs font-bold text-slate-500 mt-0.5">
                    العميل: {selectedReturnOrder.customer_name} • الهاتف: {selectedReturnOrder.customer_phone}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedReturnOrder(null)}
                >
                  تغيير الطلب
                </Button>
              </div>

              {/* Discount Notice Banner */}
              {Boolean(Number(selectedReturnOrder.invoice_discount || 0) > 0 || (selectedReturnOrder.items || []).some((it) => Number(it.discount || 0) > 0)) && (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs font-bold flex items-start gap-2.5">
                  <span className="text-base shrink-0">💡</span>
                  <div>
                    <div className="font-black text-amber-950">تنبيه: تم تطبيق خصم على الفاتورة الأصلية</div>
                    <div className="mt-0.5 text-amber-800 leading-relaxed">
                      {Number(selectedReturnOrder.invoice_discount || 0) > 0 && (
                        <span>خصم إجمالي على الفاتورة: <strong>{Number(selectedReturnOrder.invoice_discount).toLocaleString()} {selectedReturnOrder.invoice_discount_type === 'percent' ? '%' : 'ج.م'}</strong> • </span>
                      )}
                      يتم احتساب قيمة المرتجع تلقائياً بناءً على <strong>السعر الصافي المدفوع فعلياً</strong> بعد خصم كل قطعة/الفاتورة لحماية الصندوق من رد مبالغ زائدة.
                    </div>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 font-black text-slate-700">
                    <tr>
                      <th className="p-3 text-center">إرجاع</th>
                      <th className="p-3">الصنف</th>
                      <th className="p-3 text-center">السعر الأساسي</th>
                      <th className="p-3 text-center">الخصم المطبق</th>
                      <th className="p-3 text-center">السعر المدفوع</th>
                      <th className="p-3 text-center">الكمية المباعة</th>
                      <th className="p-3 text-center">الكمية المرتجعة</th>
                      <th className="p-3">الإجمالي المسترد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold text-slate-800">
                    {(selectedReturnOrder.items || []).map((item) => {
                      const maxQty = Math.max(0, Number(item.quantity || 1) - Number(item.returned_quantity || 0));
                      const isChecked = Boolean(returnSelection[item.id]);
                      const currentQty = Number(returnQuantities[item.id] || 0);
                      const fin = getItemReturnFinancials(selectedReturnOrder, item);

                      return (
                        <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${maxQty === 0 ? 'opacity-40 bg-slate-50/50' : ''}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              disabled={maxQty === 0}
                              onChange={(e) =>
                                setReturnSelection({ ...returnSelection, [item.id]: e.target.checked })
                              }
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-black text-slate-900">{item.name}</div>
                            <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                              {item.color} {item.size_cut ? `• ${item.size_cut}` : ''}
                            </div>
                          </td>
                          <td className="p-3 text-center font-semibold text-slate-500">
                            {fin.origPrice.toLocaleString()} ج.م
                          </td>
                          <td className="p-3 text-center">
                            {fin.unitDiscount > 0 ? (
                              <span className="inline-flex items-center text-rose-600 font-black bg-rose-50 px-2 py-0.5 rounded-md text-[11px]">
                                -{fin.unitDiscount.toLocaleString()} ج.م
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0 ج.م</span>
                            )}
                          </td>
                          <td className="p-3 text-center font-black text-indigo-700">
                            {fin.effectiveUnitPrice.toLocaleString()} ج.م
                          </td>
                          <td className="p-3 text-center font-mono">{item.quantity}</td>
                          <td className="p-3 text-center">
                            <input
                              type="number"
                              min="1"
                              max={maxQty}
                              disabled={!isChecked || maxQty === 0}
                              value={currentQty}
                              onChange={(e) =>
                                setReturnQuantities({
                                  ...returnQuantities,
                                  [item.id]: Math.min(maxQty, Math.max(1, Number(e.target.value) || 1)),
                                })
                              }
                              className="w-16 bg-white border border-slate-300 rounded-lg p-1 text-center font-bold text-xs outline-none focus:border-indigo-600"
                            />
                          </td>
                          <td className="p-3 font-black text-rose-600 text-sm font-mono">
                            {isChecked ? (fin.effectiveUnitPrice * currentQty).toLocaleString() : 0} ج.م
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Total Refund & Manual Override */}
              <div className="p-4 bg-rose-50 rounded-2xl border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold text-slate-700">إجمالي المبلغ المسترد للعميل (المبلغ الفعلي المدفوع):</div>
                  <div className="text-2xl font-black text-rose-600 font-mono mt-0.5">
                    {finalReturnRefund.toLocaleString()} ج.م
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-600 whitespace-nowrap">
                    تعديل يدوي للمبلغ:
                  </label>
                  <input
                    type="number"
                    value={manualReturnAmount}
                    onChange={(e) => setManualReturnAmount(e.target.value)}
                    placeholder={calculatedReturnAmount.toString()}
                    className="w-28 bg-white border border-rose-300 rounded-xl px-2.5 py-1.5 text-xs font-bold text-center outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={processReturnSubmitting}
                  className="flex-1 !rounded-2xl !py-3.5 !bg-rose-600 hover:!bg-rose-700 font-black text-base text-white"
                >
                  تأكيد الإرجاع واسترداد المبلغ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => setShowProcessReturnModal(false)}
                >
                  إلغاء
                </Button>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* PAY REMAINING DEBT MODAL */}
      <Modal
        isOpen={showPayRemainingModal}
        onClose={() => setShowPayRemainingModal(false)}
        title="سداد المبلغ المتبقي للفاتورة 💵"
        subtitle={`فاتورة #${selectedOrderForPayment?.branch_invoice_number || selectedOrderForPayment?.id} - العميل: ${selectedOrderForPayment?.customer_name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePayRemainingSubmit} className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5 text-xs font-bold">
            <div className="flex justify-between text-slate-600">
              <span>إجمالي الفاتورة:</span>
              <span>{Number(selectedOrderForPayment?.total_amount || 0).toLocaleString()} ج.م</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>المدفوع سابقاً:</span>
              <span>{Number(selectedOrderForPayment?.paid_amount || 0).toLocaleString()} ج.م</span>
            </div>
            <div className="flex justify-between text-amber-600 pt-1.5 border-t border-slate-200 text-sm font-black">
              <span>المتبقي المستحق:</span>
              <span>
                {Math.max(
                  0,
                  Number(selectedOrderForPayment?.total_amount || 0) - Number(selectedOrderForPayment?.paid_amount || 0)
                ).toLocaleString()}{' '}
                ج.م
              </span>
            </div>
          </div>

          <Input
            label="مبلغ الدفعة الحالية (ج.م) *"
            type="number"
            step="any"
            required
            value={payRemainingAmount}
            onChange={(e) => setPayRemainingAmount(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
            <select
              value={payRemainingMethod}
              onChange={(e) => setPayRemainingMethod(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
            >
              <option value="cash">نقدي (كاش)</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش / محفظة</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={payRemainingSubmitting}
              className="flex-1 !rounded-2xl"
            >
              تأكيد السداد
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowPayRemainingModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* MANAGER PASSWORD PROMPT FOR EDITING INVOICE */}
      <Modal
        isOpen={showEditPasswordModal}
        onClose={() => setShowEditPasswordModal(false)}
        title="التحقق من صلاحية التعديل 🔒"
        subtitle="أدخل كلمة مرور تعديل الفواتير للمتابعة"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleVerifyEditPassword} className="space-y-4">
          <Input
            type="password"
            label="كلمة المرور *"
            icon={KeyRound}
            required
            autoFocus
            value={editPasswordInput}
            onChange={(e) => setEditPasswordInput(e.target.value)}
            error={editPasswordError}
          />

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={editPasswordChecking}
              className="flex-1 !rounded-2xl"
            >
              تحقق ومتابعة
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowEditPasswordModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT INVOICE MODAL */}
      <Modal
        isOpen={showEditInvoiceModal}
        onClose={() => setShowEditInvoiceModal(false)}
        title="تعديل الفاتورة ✏️"
        subtitle={`فاتورة #${selectedOrderForEdit?.branch_invoice_number || selectedOrderForEdit?.id}`}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSaveEditInvoice} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="اسم العميل"
              value={editOrderData.customer_name}
              onChange={(e) => setEditOrderData({ ...editOrderData, customer_name: e.target.value })}
            />
            <Input
              label="رقم الهاتف"
              value={editOrderData.customer_phone}
              onChange={(e) => setEditOrderData({ ...editOrderData, customer_phone: e.target.value })}
            />
          </div>

          {/* Add Item to Edited Order */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">إضافة صنف إضافي للفاتورة</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={editItemSearchQuery}
                onChange={(e) => {
                  setEditItemSearchQuery(e.target.value);
                  const q = e.target.value.toLowerCase().trim();
                  if (q.length > 1) {
                    setEditItemSearchResults(
                      inventory.filter(
                        (p) =>
                          p.name?.toLowerCase().includes(q) ||
                          p.barcode?.toLowerCase().includes(q)
                      ).slice(0, 5)
                    );
                  } else {
                    setEditItemSearchResults([]);
                  }
                }}
                placeholder="ابحث بالاسم أو الباركود لإضافة صنف..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pr-10 pl-3 py-2 text-xs font-bold outline-none"
              />
            </div>
            {editItemSearchResults.length > 0 && (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                {editItemSearchResults.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => addEditItemFromSearch(prod)}
                    className="p-2.5 hover:bg-indigo-50 cursor-pointer flex items-center justify-between text-xs font-bold"
                  >
                    <span>{prod.name} ({prod.color || ''} {prod.size_cut || ''})</span>
                    <span className="text-indigo-600">{Number(prod.price).toLocaleString()} ج.م</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edited Items List */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 font-black text-slate-700">
                <tr>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">السعر</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3">الإجمالي</th>
                  <th className="p-3 text-center">حذف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {editOrderData.items.map((it, idx) => (
                  <tr key={idx}>
                    <td className="p-3">{it.name}</td>
                    <td className="p-3">{it.price_at_time.toLocaleString()} ج.م</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateEditItemQty(idx, -1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-mono">{it.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateEditItemQty(idx, 1)}
                          className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="p-3 font-black text-indigo-600">
                      {(it.price_at_time * it.quantity).toLocaleString()} ج.م
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => removeEditItem(idx)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Edit Totals */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200 font-bold text-xs">
            <div>
              <span>المجموع الفرعي: </span>
              <span className="font-mono">{editSubtotal.toLocaleString()} ج.م</span>
            </div>
            <div>
              <span>الإجمالي بعد الخصم: </span>
              <span className="font-mono text-base font-black text-indigo-600">
                {editTotal.toLocaleString()} ج.م
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={editSubmitting}
              className="flex-1 !rounded-2xl"
            >
              حفظ التعديلات
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowEditInvoiceModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* INTER-BRANCH STOCK REQUEST MODAL */}
      <Modal
        isOpen={showStockRequestModal}
        onClose={() => setShowStockRequestModal(false)}
        title="طلب بضاعة من الفروع الأخرى 🚚"
        subtitle={`طلب تحويل للصنف: ${requestProduct?.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleStockRequestSubmit} className="space-y-4">
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs font-bold text-indigo-900">
            <div>الصنف: {requestProduct?.name}</div>
            <div className="text-[11px] text-indigo-700 mt-1">
              المتوفر بالفرع الحالي: {requestProduct?.stock_level ?? 0}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الفرع المطلوب منه البضاعة *</label>
            <select
              value={requestSourceBranchId}
              onChange={(e) => setRequestSourceBranchId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              {branches
                .filter((b) => b.id.toString() !== activeBranchId?.toString())
                .map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name}
                  </option>
                ))}
            </select>
          </div>

          <Input
            label="الكمية المطلوبة *"
            type="number"
            min="1"
            required
            value={requestQuantity}
            onChange={(e) => setRequestQuantity(e.target.value)}
          />

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={requestSubmitting}
              className="flex-1 !rounded-2xl"
            >
              إرسال طلب التحويل
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowStockRequestModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* RETURN DETAILS MODAL */}
      <Modal
        isOpen={showReturnDetailsModal}
        onClose={() => setShowReturnDetailsModal(false)}
        title="تفاصيل المرتجع 📋"
        subtitle={`مرتجع رقم RET-${selectedReturnDetails?.id} (طلب #${selectedReturnDetails?.original_order_id || selectedReturnDetails?.order_id})`}
        maxWidth="max-w-md"
      >
        {selectedReturnDetails && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs font-bold text-slate-700">
              <div className="flex justify-between">
                <span>العميل:</span>
                <span>{selectedReturnDetails.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span>الهاتف:</span>
                <span>{selectedReturnDetails.customer_phone || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>البائع:</span>
                <span>{selectedReturnDetails.seller_name || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>تاريخ المرتجع:</span>
                <span dir="ltr">
                  {new Date(selectedReturnDetails.return_date || selectedReturnDetails.created_at).toLocaleString('ar-EG')}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-black text-rose-600">
                <span>المبلغ المسترد:</span>
                <span>{Number(selectedReturnDetails.total_return_amount).toLocaleString()} ج.م</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="lg"
              className="w-full !rounded-2xl"
              onClick={() => setShowReturnDetailsModal(false)}
            >
              إغلاق
            </Button>
          </div>
        )}
      </Modal>

      {/* 80mm RETURN RECEIPT MODAL */}
      <Modal
        isOpen={showReturnReceiptModal}
        onClose={() => setShowReturnReceiptModal(false)}
        title="إيصال استرداد مرتجع 🧾"
        subtitle="معاينة إيصال الإرجاع الحراري (80mm)"
        maxWidth="max-w-md"
      >
        {completedReturn && (
          <div className="space-y-4">
            <div
              id="printable-return-receipt"
              className="bg-white p-5 rounded-2xl border border-slate-200 text-black text-xs leading-relaxed space-y-3 font-mono shadow-sm"
              style={{ direction: 'rtl' }}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                <h2 className="text-base font-black tracking-tight">{settings.store_name}</h2>
                <p className="text-[11px] text-slate-600 font-bold">{completedReturn.branch_name}</p>
                <p className="text-xs font-black text-rose-600 uppercase">إيصال مرتجع مبيعات</p>
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div>
                  <div>مرتجع: #RET-{completedReturn.return_id}</div>
                  <div>طلب أصلي: #{completedReturn.original_order_id}</div>
                  <div>العميل: {completedReturn.customer_name}</div>
                </div>
                <div className="text-left" dir="ltr">
                  <div>
                    {new Date(completedReturn.created_at).toLocaleDateString('ar-EG')}
                  </div>
                  <div>
                    {new Date(completedReturn.created_at).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-400 pb-2">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="pb-1">الصنف</th>
                      <th className="pb-1 text-center">الكمية</th>
                      <th className="pb-1 text-left">المسترد</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedReturn.items.map((it, i) => (
                      <tr key={i}>
                        <td className="py-1">{it.name}</td>
                        <td className="py-1 text-center font-bold">{it.quantity}</td>
                        <td className="py-1 text-left font-black">
                          {(it.price * it.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between items-center text-sm font-black text-rose-600 pt-1 border-b border-dashed border-slate-400 pb-2">
                <span>إجمالي المبلغ المسترد:</span>
                <span>{completedReturn.total_return_amount.toLocaleString()} ج.م</span>
              </div>

              <div className="text-center pt-2 space-y-1">
                <p className="text-[10px] text-slate-500">تم تسجيل الإرجاع وإعادة الأصناف للمخزون</p>
                <p className="text-[10px] text-slate-400">الكاشير: {completedReturn.seller_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={Printer}
                onClick={() => window.print()}
                className="flex-1 !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
              >
                طباعة إيصال المرتجع
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowReturnReceiptModal(false)}
              >
                إغلاق
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* CHECKOUT MODAL */}
      <Modal
        isOpen={showCheckoutModal}
        onClose={() => setShowCheckoutModal(false)}
        title="إتمام عملية البيع والدفع 💳"
        subtitle={`المبلغ الإجمالي المطلوب تحصيله: ${grandTotal.toLocaleString()} ج.م`}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleCheckoutSubmit} className="space-y-5">
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
              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute top-full right-0 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 mt-1 max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {customerSuggestions.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone);
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

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الموظف البائع *</label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 transition-colors"
              required
            >
              <option value="">اختر الموظف البائع...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id.toString()}>
                  {emp.name} {emp.job_title ? `(${emp.job_title})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'cash', label: 'نقدي (كاش)', icon: DollarSign },
                { id: 'card', label: 'بطاقة (فيزا)', icon: CreditCard },
                { id: 'wallet', label: 'فودافون كاش', icon: Phone },
                { id: 'debt', label: 'آجل / مديونية', icon: Clock },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setPaymentMethod(m.id)}
                  className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 font-bold text-xs transition-all ${
                    paymentMethod === m.id
                      ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <m.icon className="w-5 h-5 mb-1.5" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">المبلغ المدفوع (ج.م)</label>
              <span className="text-xs font-bold text-slate-500">
                المتبقي (الباقي):{' '}
                <span
                  className={`font-black ${
                    Number(paidAmount) - grandTotal >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {Math.abs(Number(paidAmount) - grandTotal).toLocaleString()} ج.م
                </span>
              </span>
            </div>
            <Input
              type="number"
              step="any"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              placeholder="أدخل المبلغ المدفوع..."
              className="font-black text-lg text-indigo-600"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {[grandTotal, 100, 200, 500, 1000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setPaidAmount(amt.toString())}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-black text-slate-700 transition-colors"
                >
                  {amt === grandTotal ? 'المبلغ بالظبط' : `${amt} ج.م`}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={needsAlteration}
                onChange={(e) => setNeedsAlteration(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
              />
              <span className="text-xs font-bold text-slate-800">
                يحتاج هذا الطلب لتعديل أو تفصيل (بروفة) ✂️
              </span>
            </label>

            {needsAlteration && (
              <Input
                label="موعد استلام التعديل"
                type="date"
                icon={Calendar}
                value={alterationDueDate}
                onChange={(e) => setAlterationDueDate(e.target.value)}
              />
            )}
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={checkoutSubmitting}
              className="flex-1 !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
            >
              تأكيد وحفظ الفاتورة
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowCheckoutModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* 80mm THERMAL RECEIPT MODAL */}
      <Modal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        title="فاتورة بيع ضريبية 🧾"
        subtitle="معاينة إيصال الطباعة الحرارية (80mm)"
        maxWidth="max-w-md"
      >
        {completedOrder && (
          <div className="space-y-4">
            <div
              id="printable-receipt"
              className="bg-white p-5 rounded-2xl border border-slate-200 text-black text-xs leading-relaxed space-y-3 font-mono shadow-sm"
              style={{ direction: 'rtl' }}
            >
              <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
                <h2 className="text-base font-black tracking-tight">{settings.store_name}</h2>
                <p className="text-[11px] text-slate-600 font-bold">{completedOrder.branch_name}</p>
                {settings.store_phone && (
                  <p className="text-[11px] text-slate-600" dir="ltr">
                    Tel: {settings.store_phone}
                  </p>
                )}
                {settings.store_address && (
                  <p className="text-[10px] text-slate-500">{settings.store_address}</p>
                )}
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div>
                  <div>فاتورة: #{completedOrder.order_number}</div>
                  <div>العميل: {completedOrder.customer_name}</div>
                </div>
                <div className="text-left" dir="ltr">
                  <div>{new Date(completedOrder.created_at).toLocaleDateString('ar-EG')}</div>
                  <div>
                    {new Date(completedOrder.created_at).toLocaleTimeString('ar-EG', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>

              <div className="border-b border-dashed border-slate-400 pb-2">
                <table className="w-full text-right text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="pb-1">الصنف</th>
                      <th className="pb-1 text-center">الكمية</th>
                      <th className="pb-1 text-left">السعر</th>
                      <th className="pb-1 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {completedOrder.items.map((item, idx) => {
                      const itemPrice = Number(item.price_at_time ?? item.price ?? 0);
                      const itemQty = Number(item.quantity || 1);
                      const itemDisc = Number(item.discount || 0);
                      const isPerc = item.discount_type === 'percent' || item.discount_type === 'percentage';
                      const itemDiscAmt = itemDisc > 0 ? (isPerc ? (itemPrice * itemQty * itemDisc) / 100 : Math.min(itemPrice * itemQty, itemDisc)) : 0;
                      const itemTotalNet = Math.max(0, (itemPrice * itemQty) - itemDiscAmt);

                      return (
                        <tr key={idx}>
                          <td className="py-1">
                            <div>{item.name} {item.size ? `(${item.size})` : ''}</div>
                            {itemDiscAmt > 0 && (
                              <div className="text-[10px] text-rose-600 font-bold">
                                خصم: -{itemDiscAmt.toLocaleString()} ج.م
                              </div>
                            )}
                          </td>
                          <td className="py-1 text-center font-bold">{itemQty}</td>
                          <td className="py-1 text-left font-bold">
                            {itemDiscAmt > 0 ? (
                              <div>
                                <span className="line-through text-slate-400 text-[10px] block">{itemPrice.toLocaleString()}</span>
                                <span>{(Math.round((itemTotalNet / itemQty) * 100) / 100).toLocaleString()}</span>
                              </div>
                            ) : (
                              itemPrice.toLocaleString()
                            )}
                          </td>
                          <td className="py-1 text-left font-black">
                            {itemTotalNet.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1 text-[11px] font-bold border-b border-dashed border-slate-400 pb-2">
                <div className="flex justify-between">
                  <span>المجموع الفرعي:</span>
                  <span>{completedOrder.subtotal.toLocaleString()} ج.م</span>
                </div>
                {completedOrder.discount > 0 && (
                  <div className="flex justify-between text-rose-600">
                    <span>الخصم:</span>
                    <span>- {completedOrder.discount.toLocaleString()} ج.م</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-black pt-1">
                  <span>الإجمالي المطلوب:</span>
                  <span>{completedOrder.total_amount.toLocaleString()} ج.م</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1">
                  <span>المدفوع ({completedOrder.payment_method}):</span>
                  <span>{completedOrder.paid_amount.toLocaleString()} ج.م</span>
                </div>
                {completedOrder.change_amount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>الباقي للمشتري:</span>
                    <span>{completedOrder.change_amount.toLocaleString()} ج.م</span>
                  </div>
                )}
              </div>

              <div className="text-center pt-2 space-y-1">
                <p className="font-bold text-xs">{settings.cashier_footer}</p>
                <p className="text-[10px] text-slate-400">الكاشير: {completedOrder.seller_name}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                icon={Printer}
                onClick={() => window.print()}
                className="flex-1 !rounded-2xl !py-3.5 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
              >
                طباعة الإيصال الحراري
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowInvoiceModal(false)}
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

export default POS;
