import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Wallet,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import ExpensesManager from '../../components/expenses/ExpensesManager';
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
import { getPaymentMethodArabic } from '../../utils/receiptHelpers';


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

function playErrorSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.setValueAtTime(180, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch {}
}

export function POS() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches, activeBranch } = useBranch();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  // Top Tabs: 'pos' | 'history' | 'returns'
  const initialPosTab = searchParams.get('tab') || (searchParams.get('orderId') ? 'history' : 'pos');
  const [activeTab, setActiveTab] = useState(initialPosTab);
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

  // Data & State (Cached for instant load over WAN/Network)
  const [inventory, setInventory] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`pos_catalog_${activeBranchId || 'all'}`);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [employees, setEmployees] = useState([]);
  const hasInventoryRef = useRef(false);

  // Load Metadata categories, colors, sizes
  const [metadataColors, setMetadataColors] = useState([]);
  const [metadataSizes, setMetadataSizes] = useState([]);

  useEffect(() => {
    api.get('/inventory/metadata')
      .then((meta) => {
        if (meta?.categories && Array.isArray(meta.categories)) {
          const merged = Array.from(new Set([...BASE_CATEGORIES, ...meta.categories]));
          setCategoriesList(merged);
        }
        if (meta?.colors && Array.isArray(meta.colors)) {
          setMetadataColors(meta.colors);
        }
        if (meta?.sizes && Array.isArray(meta.sizes)) {
          setMetadataSizes(meta.sizes);
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
  const [loadingInventory, setLoadingInventory] = useState(() => {
    try {
      const cached = sessionStorage.getItem(`pos_catalog_${activeBranchId || 'all'}`);
      return cached ? JSON.parse(cached).length === 0 : false;
    } catch {
      return false;
    }
  });

  // Determine the effective branch for cashier checkout & invoice generation
  const effectiveBranchId = useMemo(() => {
    if (activeBranchId && activeBranchId !== 'all') {
      return activeBranchId.toString();
    }
    if (user?.branch_id) {
      return user.branch_id.toString();
    }
    const defaultRetailBranch = branches.find((b) => !b.is_main_warehouse) || branches[0];
    return defaultRetailBranch ? defaultRetailBranch.id.toString() : '1';
  }, [activeBranchId, user?.branch_id, branches]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const defaultStockFilter = activeBranchId && activeBranchId !== 'all' ? 'in_branch' : 'all';
  const [stockFilter, setStockFilter] = useState(() => (activeBranchId && activeBranchId !== 'all' ? 'in_branch' : 'all'));

  // Sync stockFilter when activeBranchId changes
  useEffect(() => {
    if (activeBranchId && activeBranchId !== 'all') {
      setStockFilter('in_branch');
    } else {
      setStockFilter(defaultStockFilter);
    }
  }, [activeBranchId]);
  const [selectedSize, setSelectedSize] = useState('all');
  const [selectedColor, setSelectedColor] = useState('all');
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'stock_desc' | 'stock_asc' | 'price_asc' | 'price_desc' | 'name_asc'

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [checkoutBranchId, setCheckoutBranchId] = useState('');
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'bank_transfer' | 'card' | 'wallet' | 'debt'
  const [paidAmount, setPaidAmount] = useState('');
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitMethod1, setSplitMethod1] = useState('cash');
  const [splitAmount1, setSplitAmount1] = useState('');
  const [splitMethod2, setSplitMethod2] = useState('bank_transfer');
  const [splitAmount2, setSplitAmount2] = useState('');
  const [needsAlteration, setNeedsAlteration] = useState(false);
  const [alterationDueDate, setAlterationDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });

  // Size selection modal state for products with multiple sizes
  const [showSizeModal, setShowSizeModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState(null);

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
    id: searchParams.get('orderId') || '',
    customer: searchParams.get('customer') || '',
    phone: searchParams.get('phone') || '',
    date: '',
    status: '',
  });
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 30,
    total: 0,
    totalPages: 1,
  });

  // Sync searchParams when navigating from Header search
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const orderIdParam = searchParams.get('orderId');
    const searchParam = searchParams.get('search');
    if (orderIdParam) {
      setActiveTab('history');
      setHistoryFilters((prev) => ({ ...prev, id: orderIdParam }));
    } else if (tabParam) {
      setActiveTab(tabParam);
    }
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [searchParams]);

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
  const customerSearchTimeoutRef = useRef(null);
  const returnSearchTimeoutRef = useRef(null);

  // Clean up search debounce timers on unmount
  useEffect(() => {
    return () => {
      if (customerSearchTimeoutRef.current) clearTimeout(customerSearchTimeoutRef.current);
      if (returnSearchTimeoutRef.current) clearTimeout(returnSearchTimeoutRef.current);
    };
  }, []);

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
        const nextIdUrl = `/next-order-id${effectiveBranchId ? `?branch_id=${effectiveBranchId}` : ''}`;
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
  }, [effectiveBranchId]);

  // Filter employees for checkout based on chosen checkout branch
  const checkoutEmployees = useMemo(() => {
    const targetBranch = checkoutBranchId || (activeBranchId !== 'all' ? activeBranchId : null);
    if (!targetBranch) return employees;
    const filtered = employees.filter((e) => !e.branch_id || e.branch_id.toString() === targetBranch.toString());
    return filtered.length > 0 ? filtered : employees;
  }, [employees, checkoutBranchId, activeBranchId]);

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

  useEffect(() => {
    hasInventoryRef.current = Array.isArray(inventory) && inventory.length > 0;
  }, [inventory]);

  // Fetch Inventory items with background revalidation & caching
  const fetchInventory = useCallback(async () => {
    try {
      if (!hasInventoryRef.current) {
        setLoadingInventory(true);
      }
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') {
        query.append('branch_id', activeBranchId);
      }
      // Always fetch full catalog for cashier to ensure instant offline-grade search and complete categories
      query.append('all', 'true');
      const data = await api.get(`/inventory?${query.toString()}`);
      const items = Array.isArray(data) ? data : (data?.items || []);
      if (Array.isArray(items) && items.length > 0) {
        setInventory(items);
        try {
          sessionStorage.setItem(`pos_catalog_${activeBranchId || 'all'}`, JSON.stringify(items));
        } catch {}
      }
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoadingInventory(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    try {
      const cached = sessionStorage.getItem(`pos_catalog_${activeBranchId || 'all'}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setInventory(parsed);
          setLoadingInventory(false);
        }
      }
    } catch {}
  }, [activeBranchId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchInventory();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchInventory]);

  // Keep categories bar up to date with any categories present in inventory
  useEffect(() => {
    if (inventory.length > 0) {
      const invCats = inventory.map((i) => i.category).filter(Boolean);
      if (invCats.length > 0) {
        setCategoriesList((prev) => Array.from(new Set([...prev, ...invCats])));
      }
    }
  }, [inventory]);

  // Extract all available sizes dynamically from inventory and metadata
  const availableSizes = useMemo(() => {
    const sizeSet = new Set();
    inventory.forEach((item) => {
      if (item.size_cut) sizeSet.add(String(item.size_cut).trim());
      if (item.size) sizeSet.add(String(item.size).trim());
      if (Array.isArray(item.sizes)) {
        item.sizes.forEach((s) => {
          if (s?.size_name) sizeSet.add(String(s.size_name).trim());
        });
      }
    });
    if (Array.isArray(metadataSizes)) {
      metadataSizes.forEach((s) => {
        if (s) sizeSet.add(String(s).trim());
      });
    }
    const cleanList = Array.from(sizeSet).filter(
      (s) => s && s !== '-' && s !== 'null' && s !== 'undefined'
    );
    return cleanList.sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      const isNumA = !isNaN(numA) && /^\d+(\.\d+)?$/.test(a);
      const isNumB = !isNaN(numB) && /^\d+(\.\d+)?$/.test(b);
      if (isNumA && isNumB) return numA - numB;
      if (isNumA && !isNumB) return -1;
      if (!isNumA && isNumB) return 1;
      return a.localeCompare(b, 'ar');
    });
  }, [inventory, metadataSizes]);

  // Extract all available colors dynamically from inventory and metadata
  const availableColors = useMemo(() => {
    const colorSet = new Set();
    inventory.forEach((item) => {
      if (item.color) colorSet.add(String(item.color).trim());
      if (Array.isArray(item.sizes)) {
        item.sizes.forEach((s) => {
          if (s?.color_name) colorSet.add(String(s.color_name).trim());
        });
      }
    });
    if (Array.isArray(metadataColors)) {
      metadataColors.forEach((c) => {
        if (c) colorSet.add(String(c).trim());
      });
    }
    const cleanList = Array.from(colorSet).filter(
      (c) => c && c !== '-' && c !== 'null' && c !== 'undefined'
    );
    return cleanList.sort((a, b) => a.localeCompare(b, 'ar'));
  }, [inventory, metadataColors]);

  // Filter products by category, search query, color, size, stock status, and sorting
  const filteredProducts = useMemo(() => {
    const queryTerm = (searchQuery || '').trim().toLowerCase();
    const selCategory = (selectedCategory || 'الكل').trim().toLowerCase();

    const list = inventory.filter((item) => {
      // 1. Category Filter
      if (selCategory !== 'الكل' && selCategory !== 'all') {
        const cat = (item.category || '').trim().toLowerCase();
        if (selCategory === 'بدل') {
          if (!cat.includes('suit') && !cat.includes('بدل')) return false;
        } else if (selCategory === 'formal suit' || selCategory === 'بدل رسمية') {
          if (cat !== 'formal suit' && !cat.includes('بدل رسمية')) return false;
        } else if (selCategory === 'tuxedo suit' || selCategory === 'بدل سموكن') {
          if (cat !== 'tuxedo suit' && !cat.includes('بدل سموكن')) return false;
        } else if (selCategory === 'casual suit' || selCategory === 'بدل كاجوال') {
          if (cat !== 'casual suit' && !cat.includes('بدل كاجوال')) return false;
        } else if (selCategory === 'suit' || selCategory === 'بدل عادية') {
          if (cat !== 'suit' && !cat.includes('بدل عادية')) return false;
        } else if (selCategory === 'kids' || selCategory === 'أطفال' || selCategory === 'اطفال') {
          if (cat !== 'kids' && !cat.includes('أطفال') && !cat.includes('اطفال')) return false;
        } else if (selCategory === 'wallet' || selCategory === 'محافظ') {
          if (cat !== 'wallet' && !cat.includes('محافظ') && !cat.includes('محفظ')) return false;
        } else if (selCategory === 'أخرى' || selCategory === 'اخري') {
          if (cat && !['أخرى', 'اخري', 'other', 'uncategorized'].includes(cat)) return false;
        } else {
          if (cat !== selCategory && !cat.includes(selCategory) && !selCategory.includes(cat)) return false;
        }
      }

      // 2. Search Query Filter (in-memory fast search)
      if (queryTerm) {
        const nameMatch = (item.name || '').toLowerCase().includes(queryTerm);
        const barcodeMatch = (item.barcode || '').toLowerCase().includes(queryTerm);
        const idMatch = String(item.id || '').toLowerCase().includes(queryTerm);
        const colorMatch = (item.color || '').toLowerCase().includes(queryTerm);
        const catMatch = (item.category || '').toLowerCase().includes(queryTerm);
        const sizeMatch = (item.size_cut || item.size || '').toLowerCase().includes(queryTerm);
        const sizesMatch = Array.isArray(item.sizes) && item.sizes.some((s) =>
          (s.size_name || '').toLowerCase().includes(queryTerm) ||
          (s.color_name || '').toLowerCase().includes(queryTerm)
        );

        if (!nameMatch && !barcodeMatch && !idMatch && !colorMatch && !catMatch && !sizeMatch && !sizesMatch) {
          return false;
        }
      }

      return true;
    });

    const map = new Map();
    for (const item of list) {
      const nameKey = (item.name || '').trim().toLowerCase();
      const colorKey = (item.color || '').trim().toLowerCase();
      const catKey = (item.category || '').trim().toLowerCase();
      const priceKey = String(item.price || 0);
      const groupKey = `${nameKey}___${colorKey}___${catKey}___${priceKey}`;

      const itemSizes = Array.isArray(item.sizes) && item.sizes.length > 0 ? item.sizes : [];
      const baseSizeName = itemSizes[0]?.size_name || item.size_cut || item.size || null;

      if (!map.has(groupKey)) {
        map.set(groupKey, {
          ...item,
          isGrouped: true,
          originalItems: [item],
          sizes: itemSizes.length > 1
            ? itemSizes.map((s) => ({
                id: s.id || item.id,
                size_name: s.size_name,
                stock_level: Number(s.stock_level ?? 0),
                barcode: s.barcode || item.barcode,
                color_name: s.color_name || item.color || '',
              }))
            : (baseSizeName ? [{
                id: item.id,
                size_name: baseSizeName,
                stock_level: Number(item.stock_level ?? 0),
                barcode: item.barcode,
                color_name: item.color || '',
              }] : []),
          total_stock: Number(item.total_stock ?? item.stock_level ?? 0),
          stock_level: Number(item.stock_level ?? 0),
          available_branches: Array.isArray(item.available_branches)
            ? item.available_branches.map((b) => ({ ...b, stock_level: Number(b.stock_level || 0) }))
            : [],
        });
      } else {
        const grouped = map.get(groupKey);
        grouped.originalItems.push(item);
        grouped.total_stock += Number(item.total_stock ?? item.stock_level ?? 0);
        grouped.stock_level += Number(item.stock_level ?? 0);

        // Merge available branches cleanly without mutating source inventory objects
        if (Array.isArray(item.available_branches)) {
          for (const ab of item.available_branches) {
            const existingB = grouped.available_branches.find((b) => b.branch_id === ab.branch_id);
            if (existingB) {
              existingB.stock_level += Number(ab.stock_level || 0);
            } else {
              grouped.available_branches.push({ ...ab, stock_level: Number(ab.stock_level || 0) });
            }
          }
        }

        // Add size to sizes list if not already present and if a valid size exists
        const sizeName = itemSizes[0]?.size_name || item.size_cut || item.size;
        if (sizeName) {
          const existingSize = grouped.sizes.find((s) => s.size_name === sizeName);
          if (!existingSize) {
            grouped.sizes.push({
              id: item.id,
              size_name: sizeName,
              stock_level: Number(item.stock_level ?? 0),
              barcode: item.barcode,
              color_name: item.color || '',
            });
          } else {
            existingSize.stock_level += Number(item.stock_level ?? 0);
          }
        }
      }
    }

    // Sort sizes numerically or alphabetically
    const result = Array.from(map.values());
    for (const prod of result) {
      if (Array.isArray(prod.sizes) && prod.sizes.length > 1) {
        prod.sizes.sort((a, b) => {
          const numA = parseFloat(a.size_name);
          const numB = parseFloat(b.size_name);
          if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
          return String(a.size_name).localeCompare(String(b.size_name), 'ar');
        });
      }
    }

    // Apply color, size, and stock filters on the grouped products
    const isAllBranches = !activeBranchId || activeBranchId === 'all';
    let filteredList = result.filter((prod) => {
      // 1. Color filter
      if (selectedColor && selectedColor !== 'all') {
        const targetColor = selectedColor.trim().toLowerCase();
        const prodColor = (prod.color || '').trim().toLowerCase();
        const hasColorVariant = Array.isArray(prod.sizes) && prod.sizes.some((s) => (s.color_name || '').trim().toLowerCase() === targetColor);
        if (prodColor !== targetColor && !hasColorVariant) {
          return false;
        }
      }

      // 2. Size filter
      if (selectedSize && selectedSize !== 'all') {
        const targetSize = selectedSize.trim().toLowerCase();
        const prodSize = (prod.size_cut || prod.size || '').trim().toLowerCase();
        const hasSizeVariant = Array.isArray(prod.sizes) && prod.sizes.some((s) => String(s.size_name || '').trim().toLowerCase() === targetSize);
        if (prodSize !== targetSize && !hasSizeVariant) {
          return false;
        }
      }

      // 3. Stock filter
      const branchStock = isAllBranches
        ? Number(prod.total_stock ?? prod.stock_level ?? 0)
        : Number(prod.stock_level ?? 0);

      if (stockFilter === 'in_branch') {
        if (selectedSize && selectedSize !== 'all') {
          const targetSize = selectedSize.trim().toLowerCase();
          const targetSizeObj = prod.sizes?.find((s) => String(s.size_name || '').trim().toLowerCase() === targetSize);
          if (targetSizeObj) {
            return Number(targetSizeObj.stock_level ?? 0) > 0;
          }
        }
        return branchStock > 0;
      }

      if (stockFilter === 'in_any_branch') {
        const total = Number(prod.total_stock ?? prod.stock_level ?? 0);
        return total > 0;
      }

      if (stockFilter === 'out_of_stock') {
        if (selectedSize && selectedSize !== 'all') {
          const targetSize = selectedSize.trim().toLowerCase();
          const targetSizeObj = prod.sizes?.find((s) => String(s.size_name || '').trim().toLowerCase() === targetSize);
          if (targetSizeObj) {
            return Number(targetSizeObj.stock_level ?? 0) <= 0;
          }
        }
        return branchStock <= 0;
      }

      if (stockFilter === 'low_stock') {
        const minLevel = Number(prod.min_stock_level ?? 5);
        return branchStock > 0 && branchStock <= minLevel;
      }

      return true;
    });

    // 4. Sorting
    if (sortBy === 'stock_desc') {
      filteredList.sort((a, b) => {
        const stockA = isAllBranches ? (a.total_stock ?? a.stock_level ?? 0) : (a.stock_level ?? 0);
        const stockB = isAllBranches ? (b.total_stock ?? b.stock_level ?? 0) : (b.stock_level ?? 0);
        return stockB - stockA;
      });
    } else if (sortBy === 'stock_asc') {
      filteredList.sort((a, b) => {
        const stockA = isAllBranches ? (a.total_stock ?? a.stock_level ?? 0) : (a.stock_level ?? 0);
        const stockB = isAllBranches ? (b.total_stock ?? b.stock_level ?? 0) : (b.stock_level ?? 0);
        return stockA - stockB;
      });
    } else if (sortBy === 'price_asc') {
      filteredList.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortBy === 'price_desc') {
      filteredList.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortBy === 'name_asc') {
      filteredList.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    }

    return filteredList;
  }, [inventory, selectedCategory, searchQuery, selectedColor, selectedSize, stockFilter, sortBy, activeBranchId]);

  const hasActiveFilters = useMemo(() => {
    return (
      (selectedCategory && selectedCategory !== 'الكل' && selectedCategory !== 'all') ||
      stockFilter !== defaultStockFilter ||
      selectedSize !== 'all' ||
      selectedColor !== 'all' ||
      sortBy !== 'default' ||
      searchQuery.trim() !== ''
    );
  }, [selectedCategory, stockFilter, defaultStockFilter, selectedSize, selectedColor, sortBy, searchQuery]);

  const resetAllFilters = useCallback(() => {
    setSelectedCategory('الكل');
    setStockFilter(defaultStockFilter);
    setSelectedSize('all');
    setSelectedColor('all');
    setSortBy('default');
    setSearchQuery('');
  }, []);

  const totalMatchingPieces = useMemo(() => {
    const isAll = !activeBranchId || activeBranchId === 'all';
    return filteredProducts.reduce((sum, p) => {
      const stock = isAll ? Number(p.total_stock ?? p.stock_level ?? 0) : Number(p.stock_level ?? 0);
      return sum + Math.max(0, stock);
    }, 0);
  }, [filteredProducts, activeBranchId]);

  // Helper to resolve inventory product for any cart item (handling backward compatibility for stored carts)
  const findProductForCartItem = useCallback(
    (item) => {
      if (!item) return null;
      const targetId = Number(item.productId || item.id);
      const direct = inventory.find((p) => Number(p.id) === targetId);
      if (direct) return direct;
      const bySize = inventory.find(
        (p) => Array.isArray(p.sizes) && p.sizes.some((s) => Number(s.id) === Number(item.id))
      );
      if (bySize) return bySize;
      return (
        inventory.find(
          (p) =>
            (p.barcode && item.barcode && p.barcode.toLowerCase() === item.barcode.toLowerCase()) ||
            (p.name && item.name && p.name.trim().toLowerCase() === item.name.trim().toLowerCase()) ||
            (Array.isArray(p.sizes) &&
              p.sizes.some(
                (s) => s.barcode && item.barcode && s.barcode.toLowerCase() === item.barcode.toLowerCase()
              ))
        ) || null
      );
    },
    [inventory]
  );

  // Helper to get available stock for current branch or globally with color awareness
  const getProductAvailableStock = useCallback(
    (product, sizeName = null, colorName = null) => {
      if (!product) return 0;

      if (Array.isArray(product.sizes) && product.sizes.length > 0) {
        if (sizeName) {
          const cleanSize = String(sizeName).trim().toLowerCase();
          const cleanColor = colorName ? String(colorName).trim().toLowerCase() : null;

          // 1. Try exact match on size + color
          if (cleanColor) {
            const matchBoth = product.sizes.find(
              (s) =>
                String(s.size_name || '').trim().toLowerCase() === cleanSize &&
                String(s.color_name || '').trim().toLowerCase() === cleanColor
            );
            if (matchBoth && matchBoth.stock_level !== undefined) {
              return Number(matchBoth.stock_level || 0);
            }
          }

          // 2. Try match on size name alone
          const matchingSizes = product.sizes.filter(
            (s) => String(s.size_name || '').trim().toLowerCase() === cleanSize
          );
          if (matchingSizes.length > 0) {
            const sumStock = matchingSizes.reduce((sum, s) => sum + Number(s.stock_level || 0), 0);
            return sumStock;
          }
        }
      }

      const isAll = !activeBranchId || activeBranchId === 'all';
      const baseStock = isAll
        ? Number(product.total_stock ?? product.stock_level ?? 0)
        : Number(product.stock_level ?? 0);

      if (baseStock > 0) return baseStock;

      if (Array.isArray(product.sizes) && product.sizes.length > 0) {
        const sizesSum = product.sizes.reduce((sum, s) => sum + Number(s.stock_level || 0), 0);
        if (sizesSum > 0) return sizesSum;
      }

      return 0;
    },
    [activeBranchId]
  );

  // Barcode Scan / Exact Match on Enter
  const handleBarcodeSubmit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const code = searchQuery.trim();
      if (!code) return;

      let matched = inventory.find(
        (i) =>
          (i.barcode && i.barcode.toLowerCase() === code.toLowerCase()) ||
          (i.code && i.code.toLowerCase() === code.toLowerCase()) ||
          (i.name && i.name.toLowerCase() === code.toLowerCase()) ||
          (Array.isArray(i.sizes) && i.sizes.some((s) => s.barcode && s.barcode.toLowerCase() === code.toLowerCase()))
      );

      if (!matched) {
        try {
          const directRes = await api.get(`/inventory?barcode=${encodeURIComponent(code)}&branch_id=${activeBranchId || 'all'}`);
          const found = Array.isArray(directRes) ? directRes[0] : directRes?.items?.[0];
          if (found) matched = found;
        } catch {}
      }

      if (matched) {
        const availableStock = getProductAvailableStock(matched);
        if (availableStock <= 0) {
          playErrorSound();
          const branchName = branches.find((b) => b.id.toString() === activeBranchId?.toString())?.name || 'فرعك';
          toast.error(`عفواً، الصنف "${matched.name}" غير متوفر في ${branchName} (0) ولا يمكن ضربه بالفاتورة.`);
          return;
        }

        // Check if barcode specifically matched an individual size/variant
        const specificSize = Array.isArray(matched.sizes)
          ? matched.sizes.find((s) => s.barcode && s.barcode.toLowerCase() === code.toLowerCase())
          : null;

        if (specificSize) {
          const sizeStock = Number(specificSize.stock_level ?? 0);
          if (sizeStock <= 0) {
            playErrorSound();
            toast.error(`عفواً، المقاس "${specificSize.size_name}" (${specificSize.color_name || ''}) نفد من المخزون.`);
            return;
          }
          addToCart(matched, specificSize.size_name, specificSize);
          setSearchQuery('');
          return;
        }

        if (matched.sizes && Array.isArray(matched.sizes) && matched.sizes.length > 1) {
          const hasAnyInStock = matched.sizes.some((s) => Number(s.stock_level || 0) > 0);
          if (!hasAnyInStock) {
            playErrorSound();
            toast.error(`عفواً، جميع مقاسات الصنف "${matched.name}" نفدت من المخزون.`);
            return;
          }
          setPendingProduct(matched);
          setShowSizeModal(true);
          setSearchQuery('');
        } else {
          addToCart(matched);
          setSearchQuery('');
        }
      } else {
        playErrorSound();
        toast.warning(`لم يتم العثور على منتج بهذا الباركود: ${code}`);
      }
    }
  };

  // Add Item to Current Cart with optional selectedSize
  const addToCart = (product, selectedSize = null, selectedSizeObj = null) => {
    let itemSize = selectedSize;
    let chosenBarcode = product.barcode;

    if (selectedSizeObj) {
      itemSize = selectedSizeObj.size_name;
      if (selectedSizeObj.barcode) chosenBarcode = selectedSizeObj.barcode;
    } else if (itemSize && Array.isArray(product.sizes)) {
      const foundSize = product.sizes.find(
        (s) => String(s.size_name || '').trim().toLowerCase() === String(itemSize).trim().toLowerCase()
      );
      if (foundSize && foundSize.barcode) {
        chosenBarcode = foundSize.barcode;
      }
    }

    if (!itemSize) {
      if (product.sizes && Array.isArray(product.sizes) && product.sizes.length === 1) {
        itemSize = product.sizes[0].size_name;
        if (product.sizes[0].barcode) chosenBarcode = product.sizes[0].barcode;
      } else {
        itemSize = product.size_cut || product.size || '';
      }
    }

    const itemColor = selectedSizeObj?.color_name || product.color || '';
    const availableStock = getProductAvailableStock(product, itemSize, itemColor);
    if (availableStock <= 0) {
      playErrorSound();
      const branchName = branches.find((b) => b.id.toString() === activeBranchId?.toString())?.name || 'فرعك';
      toast.error(`عفواً، الصنف "${product.name}"${itemSize ? ` مقاس (${itemSize})` : ''} غير متوفر في ${branchName} (0) ولا يمكن ضربه بالفاتورة.`);
      return;
    }

    const cartItemId = `${product.id}_${itemSize || 'default'}_${itemColor}`;

    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const existingIndex = items.findIndex((i) =>
        i.cartItemId
          ? i.cartItemId === cartItemId
          : (Number(i.productId || i.id) === Number(product.id) && (i.size || '') === (itemSize || '') && (i.color || '') === itemColor)
      );

      if (existingIndex > -1) {
        const currentQty = items[existingIndex].quantity;
        if (currentQty + 1 > availableStock) {
          playErrorSound();
          toast.warning(`الكمية المتاحة في المخزون لهذا الصنف هي ${availableStock} قطعة فقط.`);
          return prev;
        }
        const updated = [...items];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: currentQty + 1,
        };
        playBeep();
        return { ...prev, [activeCartId]: updated };
      } else {
        const newItem = {
          cartItemId,
          id: product.id,
          productId: product.id,
          size_row_id: selectedSizeObj?.id || null,
          name: product.name,
          barcode: chosenBarcode || product.barcode,
          price: Number(product.price || 0),
          color: itemColor,
          size: itemSize,
          image_url: product.image_url || '',
          quantity: 1,
          discount: 0,
          discount_type: 'amount',
          maxStock: availableStock,
        };
        playBeep();
        return { ...prev, [activeCartId]: [...items, newItem] };
      }
    });
  };

  // Handler when clicking a product card in POS
  const handleProductCardClick = (product) => {
    const availableStock = getProductAvailableStock(product);
    if (availableStock <= 0) {
      playErrorSound();
      const branchName = branches.find((b) => b.id.toString() === activeBranchId?.toString())?.name || 'فرعك';
      toast.error(`عفواً، الصنف "${product.name}" غير متوفر في ${branchName} (0) ولا يمكن ضربه بالفاتورة.`);
      return;
    }

    if (product.sizes && Array.isArray(product.sizes) && product.sizes.length > 1) {
      const hasAnyInStock = product.sizes.some((s) => Number(s.stock_level || 0) > 0);
      if (!hasAnyInStock) {
        playErrorSound();
        toast.error(`عفواً، جميع مقاسات الصنف "${product.name}" نفدت من المخزون ولا يمكن ضربه بالفاتورة.`);
        return;
      }
      setPendingProduct(product);
      setShowSizeModal(true);
    } else {
      addToCart(product);
    }
  };

  const updateQuantity = (cartKey, delta) => {
    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const updated = items
        .map((item) => {
          const matches =
            (item.cartItemId && item.cartItemId === cartKey) ||
            (!item.cartItemId && (item.id === cartKey || item.productId === cartKey));
          if (matches) {
            if (delta > 0) {
              const prod = findProductForCartItem(item);
              const maxStock = getProductAvailableStock(prod, item.size, item.color) || item.maxStock || Infinity;
              if (item.quantity + delta > maxStock) {
                playErrorSound();
                toast.warning(`الكمية المتاحة في المخزون هي ${maxStock} قطعة فقط.`);
                return item;
              }
            }
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean);
      return { ...prev, [activeCartId]: updated };
    });
  };

  const removeFromCart = (cartKey) => {
    setCarts((prev) => ({
      ...prev,
      [activeCartId]: (prev[activeCartId] || []).filter(
        (i) =>
          !(
            (i.cartItemId && i.cartItemId === cartKey) ||
            (!i.cartItemId && (i.id === cartKey || i.productId === cartKey))
          )
      ),
    }));
  };

  const updateItemDiscount = (cartKey, discountVal, discountType = 'amount') => {
    setCarts((prev) => {
      const items = prev[activeCartId] || [];
      const updated = items.map((item) => {
        const matches = (item.cartItemId && item.cartItemId === cartKey) || (!item.cartItemId && item.id === cartKey);
        if (matches) {
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

  // Customer Search suggestions (debounced)
  const searchCustomers = (phoneOrName) => {
    if (customerSearchTimeoutRef.current) {
      clearTimeout(customerSearchTimeoutRef.current);
    }
    if (!phoneOrName || phoneOrName.length < 2) {
      setCustomerSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    customerSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const branchParam = activeBranchId && activeBranchId !== 'all' ? `&branch_id=${activeBranchId}` : '';
        const data = await api.get(`/customers?search=${encodeURIComponent(phoneOrName)}${branchParam}`);
        const list = Array.isArray(data) ? data : (data?.customers || data?.data || data?.items || []);
        setCustomerSuggestions(list);
        setShowSuggestions(list.length > 0);
      } catch {
        setCustomerSuggestions([]);
      }
    }, 250);
  };

  // Open Checkout Modal
  const openCheckout = () => {
    if (currentCart.length === 0) {
      toast.warning('السلة فارغة! برجاء إضافة منتجات أولاً');
      return;
    }

    for (const item of currentCart) {
      const prod = findProductForCartItem(item);
      const available = getProductAvailableStock(prod, item.size, item.color);
      if (available <= 0) {
        playErrorSound();
        const branchName = branches.find((b) => b.id.toString() === activeBranchId?.toString())?.name || 'فرعك الحالي';
        const otherWithStock = (prod?.available_branches || [])
          .filter((b) => Number(b.stock_level || 0) > 0 && b.branch_id.toString() !== activeBranchId?.toString())
          .map((b) => `${b.branch_name} (${b.stock_level} قطعة)`)
          .join('، ');

        const errorMsg = otherWithStock
          ? `لا يمكن المتابعة: الصنف "${item.name}" غير متوفر في ${branchName} حالياً، ولكنه متوفر في: ${otherWithStock}. يرجى التبديل للفرع المتوفر به الصنف.`
          : `لا يمكن المتابعة: الصنف "${item.name}" غير متوفر بالمخزون حالياً`;

        toast.error(errorMsg);
        return;
      }
      if (item.quantity > available) {
        playErrorSound();
        toast.error(`لا يمكن المتابعة: كمية الصنف "${item.name}" (${item.quantity}) تتجاوز المتاح بالمخزون (${available})`);
        return;
      }
    }

    let targetBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : effectiveBranchId;
    if (!activeBranchId || activeBranchId === 'all') {
      for (const item of currentCart) {
        const prod = findProductForCartItem(item);
        const branchWithStock = prod?.available_branches?.find((b) => Number(b.stock_level || 0) >= item.quantity);
        if (branchWithStock) {
          targetBranch = branchWithStock.branch_id.toString();
          break;
        }
      }
    }
    setCheckoutBranchId(targetBranch ? targetBranch.toString() : '1');

    setPaidAmount(grandTotal.toString());
    setIsSplitPayment(false);
    setSplitMethod1('cash');
    setSplitAmount1('');
    setSplitMethod2('bank_transfer');
    setSplitAmount2('');
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

    for (const item of currentCart) {
      const prod = findProductForCartItem(item);
      const available = getProductAvailableStock(prod, item.size, item.color);
      if (available <= 0 || item.quantity > available) {
        playErrorSound();
        toast.error(`لا يمكن إتمام الفاتورة: الصنف "${item.name}" غير متوفر بالكمية المطلوبة (المتاح: ${available})`);
        return;
      }
    }

    let finalPaid = Number(paidAmount) || 0;
    let finalMethod = paymentMethod;
    let splitsJson = null;
    let pCash = 0;
    let pBank = 0;
    let pCard = 0;
    let pWallet = 0;

    if (isSplitPayment) {
      const a1 = Number(splitAmount1) || 0;
      const a2 = Number(splitAmount2) || 0;
      if (a1 <= 0 || a2 <= 0) {
        toast.error('يرجى إدخال مبالغ صحيحة أكبر من صفر لكلتا طريقتي الدفع المجزأ');
        return;
      }
      if (splitMethod1 === splitMethod2) {
        toast.error('لا يمكن اختيار نفس طريقة الدفع مرتين في الدفع المجزأ');
        return;
      }
      finalPaid = a1 + a2;
      finalMethod = 'split';
      const splitsArray = [
        { method: splitMethod1, amount: a1 },
        { method: splitMethod2, amount: a2 },
      ];
      splitsJson = JSON.stringify(splitsArray);

      if (splitMethod1 === 'cash') pCash += a1;
      else if (splitMethod1 === 'bank_transfer') pBank += a1;
      else if (splitMethod1 === 'card') pCard += a1;
      else if (splitMethod1 === 'wallet') pWallet += a1;

      if (splitMethod2 === 'cash') pCash += a2;
      else if (splitMethod2 === 'bank_transfer') pBank += a2;
      else if (splitMethod2 === 'card') pCard += a2;
      else if (splitMethod2 === 'wallet') pWallet += a2;
    } else {
      if (paymentMethod === 'cash') pCash = finalPaid;
      else if (paymentMethod === 'bank_transfer') pBank = finalPaid;
      else if (paymentMethod === 'card') pCard = finalPaid;
      else if (paymentMethod === 'wallet') pWallet = finalPaid;
    }

    const change = Math.max(0, finalPaid - grandTotal);
    if (isSplitPayment) {
      if (change > 0 && change > pCash) {
        toast.error('لا يمكن صرف باقي نقدي يتجاوز المبلغ النقدي المستلم من العميل');
        return;
      }
    } else if (paymentMethod !== 'cash' && change > 0) {
      toast.error('لا يمكن صرف باقي نقدي لعمليات الدفع غير النقدية');
      return;
    }
    const sellerObj = employees.find((e) => e.id.toString() === sellerId?.toString());
    const chosenBranchId =
      checkoutBranchId && checkoutBranchId !== 'all'
        ? Number(checkoutBranchId)
        : activeBranchId && activeBranchId !== 'all'
        ? Number(activeBranchId)
        : Number(sellerObj?.branch_id || effectiveBranchId || 1);

    setCheckoutSubmitting(true);
    try {
      const payload = {
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        branch_id: chosenBranchId,
        seller_id: Number(sellerId),
        payment_method: finalMethod,
        payment_splits: splitsJson,
        cash_amount: pCash,
        bank_transfer_amount: pBank,
        card_amount: pCard,
        wallet_amount: pWallet,
        total_amount: grandTotal,
        paid_amount: finalPaid,
        change_amount: change,
        invoice_discount: invoiceDiscountTotal,
        invoice_discount_type: currentDiscount.type,
        items: currentCart.map((i) => {
          const prod = findProductForCartItem(i);
          return {
            id: Number(prod?.id || i.productId || i.id),
            size: i.size || null,
            color: i.color || null,
            quantity: i.quantity,
            price: i.price,
            discount: i.discount || 0,
            discount_type: i.discount_type || 'amount',
          };
        }),
        needs_alteration: needsAlteration,
        alteration_due_date: needsAlteration ? alterationDueDate : null,
      };

      const res = await api.post('/orders', payload);

      toast.success('تم تسجيل وحفظ الفاتورة بنجاح! 🎉');
      setShowCheckoutModal(false);

      const actualBranchId = res.branchId || res.branch_id || chosenBranchId || user?.branch_id;
      const chosenBranchObj = branches.find((b) => b.id?.toString() === actualBranchId?.toString());
      setCompletedOrder({
        order_number: res.branchInvoiceNumber || res.branch_invoice_number || res.order_number || res.orderId || res.id || nextOrderId,
        created_at: new Date().toISOString(),
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        seller_name: employees.find((e) => e.id.toString() === sellerId)?.name || 'الكاشير',
        branch_id: actualBranchId,
        branch_name:
          chosenBranchObj?.name ||
          (activeBranchId && activeBranchId !== 'all'
            ? branches.find((b) => b.id.toString() === activeBranchId.toString())?.name
            : '') ||
          settings.store_name ||
          '',
        branch_logo: chosenBranchObj?.logo_url,
        subtotal,
        discount: totalDiscount,
        total_amount: grandTotal,
        paid_amount: finalPaid,
        change_amount: change,
        payment_method: finalMethod,
        payment_splits: splitsJson,
        cash_amount: pCash,
        bank_transfer_amount: pBank,
        card_amount: pCard,
        wallet_amount: pWallet,
        items: currentCart.map((i) => ({
          name: i.name,
          category: i.category,
          size: i.size,
          quantity: i.quantity,
          price: i.price,
          price_at_time: i.price,
          discount: i.discount || 0,
          discount_type: i.discount_type || 'amount',
        })),
      });

      clearCurrentCart();

      const nextIdUrl = `/next-order-id${effectiveBranchId ? `?branch_id=${effectiveBranchId}` : ''}`;
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

  // Helpers to update filters and reset pagination to page 1
  const updateHistoryFilter = (key, value) => {
    setHistoryFilters((prev) => ({ ...prev, [key]: value }));
    setHistoryPagination((prev) => ({ ...prev, page: 1 }));
  };

  const updateReturnFilter = (key, value) => {
    setReturnFilters((prev) => ({ ...prev, [key]: value }));
    setReturnsPagination((prev) => ({ ...prev, page: 1 }));
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
      const list = Array.isArray(data) ? data : (data?.orders || data?.items || data?.data || []);
      setHistoryOrders(list);

      if (data?.pagination) {
        setHistoryPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setHistoryPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit || 30))),
        }));
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
      if (returnFilters.returnId) {
        query.append('returnId', returnFilters.returnId);
        query.append('return_id', returnFilters.returnId);
      }
      if (returnFilters.orderId) {
        query.append('orderId', returnFilters.orderId);
        query.append('order_id', returnFilters.orderId);
      }
      if (returnFilters.customer) query.append('customer', returnFilters.customer);
      if (returnFilters.phone) query.append('phone', returnFilters.phone);
      if (returnFilters.date) query.append('date', returnFilters.date);

      query.append('page', returnsPagination.page.toString());
      query.append('limit', returnsPagination.limit.toString());

      const data = await api.get(`/returns?${query.toString()}`);
      const list = Array.isArray(data) ? data : (data?.returns || data?.items || data?.data || []);
      setReturnsList(list);

      if (data?.pagination) {
        setReturnsPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setReturnsPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit || 30))),
        }));
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

  // Search orders for Return (debounced)
  const handleSearchReturnOrders = (query) => {
    setReturnOrderSearchQuery(query);
    if (returnSearchTimeoutRef.current) {
      clearTimeout(returnSearchTimeoutRef.current);
    }
    if (!query || query.length < 2) {
      setReturnFoundOrders([]);
      return;
    }
    returnSearchTimeoutRef.current = setTimeout(async () => {
      try {
        setSearchingReturnOrders(true);
        const branchParam = activeBranchId && activeBranchId !== 'all' ? `&branch_id=${activeBranchId}` : '';
        const data = await api.get(`/orders/search?query=${encodeURIComponent(query)}${branchParam}`);
        setReturnFoundOrders(Array.isArray(data) ? data : (data?.orders || data?.items || data?.data || []));
      } catch {
        setReturnFoundOrders([]);
      } finally {
        setSearchingReturnOrders(false);
      }
    }, 300);
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
          size: item.size || null,
          color: item.color || null,
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

      const chosenBranchObj = branches.find((b) => b.id.toString() === chosenBranchId.toString());
      setCompletedReturn({
        return_id: res.returnId || res.id,
        original_order_id: selectedReturnOrder.id,
        created_at: new Date().toISOString(),
        customer_name: selectedReturnOrder.customer_name || 'عميل نقدي',
        customer_phone: selectedReturnOrder.customer_phone || '-',
        seller_name: employees.find((e) => e.id.toString() === sellerId)?.name || 'الكاشير',
        branch_id: chosenBranchId,
        branch_name: chosenBranchObj?.name || 'الفرع الرئيسي',
        branch_logo: chosenBranchObj?.logo_url,
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
        is_request: true,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFDF9] p-3 rounded-3xl border border-[#E6DECD] shadow-sm no-print">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer font-display ${
              activeTab === 'pos'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>نقطة البيع (الكاشير)</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer font-display ${
              activeTab === 'history'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>سجل مبيعات الكاشير</span>
          </button>

          <button
            onClick={() => setActiveTab('returns')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer font-display ${
              activeTab === 'returns'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <Undo2 className="w-4 h-4" />
            <span>المرتجعات</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all cursor-pointer font-display ${
              activeTab === 'expenses'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>المصروفات</span>
          </button>
        </div>

        {/* Live Invoice Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FDF5D2] text-[#7A5B04] font-extrabold text-xs border border-[#F4D95B]/70 shadow-sm font-display">
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

            {/* Comprehensive Dropdown Filter Bar */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-sm space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
                {/* 1. Category Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    <span>التصنيف</span>
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={`w-full bg-slate-50 text-xs font-bold rounded-xl px-2.5 py-2 border outline-none cursor-pointer transition-all ${
                      selectedCategory !== 'الكل'
                        ? 'border-indigo-500 bg-indigo-50/50 text-indigo-900 font-black ring-1 ring-indigo-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-indigo-500 focus:bg-white'
                    }`}
                  >
                    <option value="الكل">كل التصنيفات ({categoriesList.length})</option>
                    {categoriesList
                      .filter((c) => c !== 'الكل')
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </select>
                </div>

                {/* 2. Stock Availability Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>حالة المخزون</span>
                  </label>
                  <select
                    value={stockFilter}
                    onChange={(e) => setStockFilter(e.target.value)}
                    className={`w-full bg-slate-50 text-xs font-bold rounded-xl px-2.5 py-2 border outline-none cursor-pointer transition-all ${
                      stockFilter !== defaultStockFilter
                        ? 'border-emerald-500 bg-emerald-50/50 text-emerald-900 font-black ring-1 ring-emerald-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-emerald-500 focus:bg-white'
                    }`}
                  >
                    {activeBranchId && activeBranchId !== 'all' ? (
                      <>
                        <option value="in_branch">
                          {activeBranch?.name ? `المتوفر في (${activeBranch.name}) فقط` : 'المتوفر بالفرع فقط'}
                        </option>
                        <option value="all">كل حالات المخزن (كل الفروع والمنتهي)</option>
                        <option value="in_any_branch">المتوفر في أي فرع</option>
                        <option value="low_stock">نواقص الفرع (≤ 5)</option>
                        <option value="out_of_stock">المنتهي من الفرع (0)</option>
                      </>
                    ) : (
                      <>
                        <option value="all">كل حالات المخزن (الإجمالي)</option>
                        <option value="in_any_branch">المتوفر في أي فرع (له رصيد)</option>
                        <option value="out_of_stock">نفد من المخزون (0)</option>
                        <option value="low_stock">رصيد منخفض (≤ 5)</option>
                      </>
                    )}
                  </select>
                </div>

                {/* 3. Size Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-amber-500" />
                    <span>المقاس</span>
                  </label>
                  <select
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    className={`w-full bg-slate-50 text-xs font-bold rounded-xl px-2.5 py-2 border outline-none cursor-pointer transition-all ${
                      selectedSize !== 'all'
                        ? 'border-amber-500 bg-amber-50/50 text-amber-900 font-black ring-1 ring-amber-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-amber-500 focus:bg-white'
                    }`}
                  >
                    <option value="all">كل المقاسات ({availableSizes.length})</option>
                    {availableSizes.map((sz) => (
                      <option key={sz} value={sz}>
                        مقاس {sz}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Color Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-purple-500" />
                    <span>اللون</span>
                  </label>
                  <select
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className={`w-full bg-slate-50 text-xs font-bold rounded-xl px-2.5 py-2 border outline-none cursor-pointer transition-all ${
                      selectedColor !== 'all'
                        ? 'border-purple-500 bg-purple-50/50 text-purple-900 font-black ring-1 ring-purple-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-purple-500 focus:bg-white'
                    }`}
                  >
                    <option value="all">كل الألوان ({availableColors.length})</option>
                    {availableColors.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Sort Dropdown */}
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-black text-slate-500 flex items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-sky-500" />
                    <span>الترتيب</span>
                  </label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className={`w-full bg-slate-50 text-xs font-bold rounded-xl px-2.5 py-2 border outline-none cursor-pointer transition-all ${
                      sortBy !== 'default'
                        ? 'border-sky-500 bg-sky-50/50 text-sky-900 font-black ring-1 ring-sky-300'
                        : 'border-slate-200 text-slate-700 hover:border-slate-300 focus:border-sky-500 focus:bg-white'
                    }`}
                  >
                    <option value="default">الافتراضي (الأحدث)</option>
                    <option value="stock_desc">الأعلى توفراً بالمخزن</option>
                    <option value="stock_asc">الأقل توفراً بالمخزن</option>
                    <option value="price_asc">السعر: الأقل أولاً</option>
                    <option value="price_desc">السعر: الأعلى أولاً</option>
                    <option value="name_asc">الاسم أبجدياً (أ - ي)</option>
                  </select>
                </div>
              </div>

              {/* Status & Active Filter Badges Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-slate-500 font-bold ml-1">
                    النتائج: <strong className="text-slate-900 font-black">{filteredProducts.length}</strong> موديل
                    <span className="text-slate-400 font-medium mr-1.5">({totalMatchingPieces} قطعة بالمخزون)</span>
                  </span>

                  {/* Active filter badges */}
                  {selectedCategory !== 'الكل' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[11px] font-bold">
                      التصنيف: {selectedCategory}
                      <button onClick={() => setSelectedCategory('الكل')} className="hover:text-rose-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {stockFilter !== defaultStockFilter && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                      {stockFilter === 'in_branch'
                        ? (activeBranch?.name ? `المتوفر في (${activeBranch.name})` : 'المتوفر بالفرع')
                        : stockFilter === 'in_any_branch'
                        ? 'المتوفر بأي فرع'
                        : stockFilter === 'out_of_stock'
                        ? 'نفد بالمخزن'
                        : stockFilter === 'low_stock'
                        ? 'رصيد منخفض'
                        : 'كل حالات المخزن'}
                      <button onClick={() => setStockFilter(defaultStockFilter)} className="hover:text-rose-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedSize !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold">
                      مقاس: {selectedSize}
                      <button onClick={() => setSelectedSize('all')} className="hover:text-rose-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {selectedColor !== 'all' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-bold">
                      لون: {selectedColor}
                      <button onClick={() => setSelectedColor('all')} className="hover:text-rose-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  {sortBy !== 'default' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 border border-sky-200 text-sky-700 text-[11px] font-bold">
                      ترتيب مخصص
                      <button onClick={() => setSortBy('default')} className="hover:text-rose-600 transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                </div>

                {/* Reset Filters button */}
                {hasActiveFilters && (
                  <button
                    onClick={resetAllFilters}
                    className="inline-flex items-center gap-1.5 text-[11px] font-black text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 px-2.5 py-1 rounded-xl transition-all"
                    title="إعادة ضبط جميع الفلاتر للوضع الافتراضي"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>إعادة ضبط الفلاتر</span>
                  </button>
                )}
              </div>
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
                    const isAll = !activeBranchId || activeBranchId === 'all';
                    const activeBranchObj = branches.find((b) => b.id.toString() === activeBranchId?.toString());
                    const activeBranchName = activeBranchObj?.name || 'فرعك';

                    const currentBranchStock = isAll
                      ? Number(product.total_stock ?? product.stock_level ?? 0)
                      : Number(product.stock_level ?? 0);

                    const isOutOfStock = currentBranchStock <= 0;
                    const isLow = !isOutOfStock && currentBranchStock <= (product.min_stock_level ?? 5);

                    const availableBranches = Array.isArray(product.available_branches) ? product.available_branches : [];

                    return (
                      <div
                        key={product.id}
                        onClick={() => handleProductCardClick(product)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between relative ${
                          isOutOfStock
                            ? 'bg-slate-50/80 border-slate-200 hover:border-rose-300'
                            : 'bg-white border-slate-200/80 shadow-sm hover:shadow-md hover:border-indigo-400'
                        }`}
                      >
                        {/* Thumbnail */}
                        <div className="aspect-square bg-slate-100 rounded-xl mb-3 overflow-hidden relative flex items-center justify-center">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className={`w-full h-full object-cover transition-transform group-hover:scale-105 ${
                                isOutOfStock ? 'grayscale opacity-70' : ''
                              }`}
                            />
                          ) : (
                            <Tag className="w-8 h-8 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                          )}
                          <span className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md backdrop-blur-sm">
                            {product.category || 'ملابس'}
                          </span>
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-slate-900/30 flex items-center justify-center backdrop-blur-[1px]">
                              <span className="bg-rose-600 text-white text-[11px] font-black px-2.5 py-1 rounded-lg shadow-md border border-rose-400">
                                {isAll ? 'نفد من المخزون' : 'غير متوفر بفرعك'}
                              </span>
                            </div>
                          )}
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
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] font-bold">
                            {product.color && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {product.color}
                              </span>
                            )}
                            {Array.isArray(product.sizes) && product.sizes.length > 1 ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black flex items-center gap-1">
                                <Layers className="w-3 h-3 text-indigo-500" />
                                {product.sizes.length} مقاسات
                              </span>
                            ) : Array.isArray(product.sizes) && product.sizes.length === 1 ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
                                مقاس: {product.sizes[0].size_name}
                              </span>
                            ) : (
                              (product.size_cut || product.size) && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-black">
                                  مقاس: {product.size_cut || product.size}
                                </span>
                              )
                            )}
                          </div>

                          {/* Multi-Sizes Pills Shown Directly on Outside of Card */}
                          {Array.isArray(product.sizes) && product.sizes.length > 1 && (
                            <div className="mt-2 bg-indigo-50/50 rounded-xl p-1.5 border border-indigo-100 flex flex-col gap-1">
                              <div className="text-[10px] font-black text-indigo-900 flex items-center justify-between">
                                <span className="flex items-center gap-1">
                                  <Layers className="w-3 h-3 text-indigo-600" />
                                  المقاسات:
                                </span>
                                {product.sizes.length > 4 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingProduct(product);
                                      setShowSizeModal(true);
                                    }}
                                    className="text-[10px] font-extrabold text-indigo-600 hover:text-indigo-800 hover:underline cursor-pointer"
                                  >
                                    عرض الكل ({product.sizes.length})
                                  </button>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {(() => {
                                  // Show in-stock first, capped at 4
                                  const sortedSizes = [...product.sizes].sort((a, b) => {
                                    const aStock = Number(a.stock_level || 0) > 0 ? 1 : 0;
                                    const bStock = Number(b.stock_level || 0) > 0 ? 1 : 0;
                                    return bStock - aStock;
                                  });
                                  const visibleSizes = sortedSizes.slice(0, 4);
                                  const remainingCount = sortedSizes.length - 4;

                                  return (
                                    <>
                                      {visibleSizes.map((s) => {
                                        const hasStock = Number(s.stock_level || 0) > 0;
                                        return (
                                          <span
                                            key={s.size_name}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (hasStock) {
                                                addToCart(product, s.size_name, s);
                                              } else {
                                                playErrorSound();
                                                toast.warning(`المقاس ${s.size_name} غير متوفر بالفرع حالياً`);
                                              }
                                            }}
                                            className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 transition-all ${
                                              hasStock
                                                ? 'bg-white text-indigo-700 border border-indigo-200 shadow-xs hover:bg-indigo-600 hover:text-white cursor-pointer'
                                                : 'bg-slate-100 text-slate-400 border border-slate-200 line-through opacity-60 cursor-not-allowed'
                                            }`}
                                            title={`مقاس ${s.size_name}: ${hasStock ? `متوفر ${s.stock_level} قطعة (اضغط للإضافة مباشرة)` : 'نفذت الكمية'}`}
                                          >
                                            <span>{s.size_name}</span>
                                            {hasStock && (
                                              <span className="text-[9px] font-mono opacity-75">
                                                ({s.stock_level})
                                              </span>
                                            )}
                                          </span>
                                        );
                                      })}
                                      {remainingCount > 0 && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPendingProduct(product);
                                            setShowSizeModal(true);
                                          }}
                                          className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100/80 hover:bg-indigo-200 text-indigo-700 border border-indigo-200 transition-colors cursor-pointer"
                                          title="عرض باقي المقاسات"
                                        >
                                          +{remainingCount} أخرى
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Stock & Inter-Branch Request */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold">
                          {isOutOfStock ? (
                            <span className="text-rose-600 font-black flex items-center gap-1 text-[11px]">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              {isAll ? 'غير متوفر (0)' : `غير متوفر بـ ${activeBranchName} (0)`}
                            </span>
                          ) : (
                            <span className={isLow ? 'text-amber-600 font-black' : 'text-emerald-600 font-black'}>
                              {isAll ? `المتوفر: ${currentBranchStock}` : `متوفر بـ ${activeBranchName}: ${currentBranchStock}`}
                            </span>
                          )}
                          {branches.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openStockRequestModal(product);
                              }}
                              className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-lg border border-indigo-100 transition-colors cursor-pointer shrink-0"
                              title="طلب بضاعة من الفروع الأخرى"
                            >
                              طلب من فرع 🚚
                            </button>
                          )}
                        </div>

                        {/* Available Branches Outside Pill - توضيح الفروع المتاح بها من برا */}
                        {availableBranches.length > 0 ? (
                          <div className="mt-2 bg-slate-50/90 rounded-xl p-2 border border-slate-200/80 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-indigo-600 shrink-0" />
                              متاح في:
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              {availableBranches.map((b) => {
                                const isCurrent = !isAll && b.branch_id.toString() === activeBranchId?.toString();
                                return (
                                  <span
                                    key={b.branch_id}
                                    className={`text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-1 ${
                                      isCurrent
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200/70'
                                    }`}
                                    title={`فرع ${b.branch_name}: متوفر ${b.stock_level} قطعة`}
                                  >
                                    <span>{b.branch_name}</span>
                                    <span className="font-mono bg-white/80 px-1 rounded text-[9px]">
                                      ({b.stock_level})
                                    </span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 bg-rose-50/60 rounded-xl p-1.5 border border-rose-100 text-[10px] text-rose-600 font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            غير متاح في أي فرع
                          </div>
                        )}

                        {/* Price & Add Button */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-sm font-black text-indigo-600">
                            {Number(product.price || 0).toLocaleString()} ج.م
                          </span>
                          <button
                            type="button"
                            disabled={isOutOfStock}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleProductCardClick(product);
                            }}
                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all shadow-sm ${
                              isOutOfStock
                                ? 'bg-slate-100 text-slate-300 border border-slate-200 cursor-not-allowed'
                                : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white cursor-pointer'
                            }`}
                            title={isOutOfStock ? 'الصنف غير متوفر بالمخزون ولا يمكن ضربه بالفاتورة' : 'إضافة للفاتورة'}
                          >
                            <Plus className={`w-4 h-4 ${isOutOfStock ? 'opacity-40' : ''}`} />
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
                  const itemKey = item.cartItemId || `${item.id}_${item.size || ''}`;
                  const isEditingDisc = activeDiscountItemId === itemKey;
                  const unitNet = Math.max(0, item.price - (itemDiscAmt / item.quantity));

                  return (
                    <div key={itemKey} className="pt-2.5 first:pt-0 pb-2.5 border-b border-slate-100 last:border-b-0 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">
                              #{item.productId || (findProductForCartItem(item)?.id) || item.id}
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
                            {item.size && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-100">
                                مقاس: {item.size}
                              </span>
                            )}
                            {!isEditingDisc && itemDisc === 0 && (
                              <button
                                type="button"
                                onClick={() => setActiveDiscountItemId(itemKey)}
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
                            onClick={() => updateQuantity(itemKey, -1)}
                            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-slate-700 hover:bg-slate-200 shadow-sm"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-slate-900 font-mono">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(itemKey, 1)}
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
                            onClick={() => removeFromCart(itemKey)}
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
                            onChange={(e) => updateItemDiscount(itemKey, e.target.value, item.discount_type || 'amount')}
                            className="w-20 bg-white border border-slate-300 rounded-lg px-2 py-0.5 text-center font-bold text-xs outline-none focus:border-indigo-600"
                          />
                          <select
                            value={item.discount_type || 'amount'}
                            onChange={(e) => updateItemDiscount(itemKey, item.discount, e.target.value)}
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
                              updateItemDiscount(itemKey, 0, 'amount');
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
              onChange={(e) => updateHistoryFilter('id', e.target.value)}
            />
            <Input
              placeholder="اسم العميل..."
              value={historyFilters.customer}
              onChange={(e) => updateHistoryFilter('customer', e.target.value)}
            />
            <Input
              placeholder="رقم الهاتف..."
              value={historyFilters.phone}
              onChange={(e) => updateHistoryFilter('phone', e.target.value)}
            />
            <input
              type="date"
              value={historyFilters.date}
              onChange={(e) => updateHistoryFilter('date', e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-indigo-600"
            />
            <select
              value={historyFilters.status}
              onChange={(e) => updateHistoryFilter('status', e.target.value)}
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
                    {(!activeBranchId || activeBranchId === 'all') && <th className="py-3.5">الفرع</th>}
                    <th className="py-3.5">العميل</th>
                    <th className="py-3.5">الهاتف</th>
                    <th className="py-3.5">البائع</th>
                    <th className="py-3.5">الإجمالي</th>
                    <th className="py-3.5">طريقة الدفع</th>
                    <th className="py-3.5">المتبقي</th>
                    <th className="py-3.5">الحالة</th>
                    <th className="py-3.5 pl-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {historyOrders.map((order) => {
                    const remaining = Math.max(0, Number(order.total_amount || 0) - Number(order.paid_amount || 0));
                    const isReturned = order.status === 'returned';
                    const isPartiallyReturned = order.status === 'partially_returned';

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
                        {(!activeBranchId || activeBranchId === 'all') && (
                          <td className="py-3.5 text-xs font-bold text-slate-700">
                            {order.branch_name || `فرع #${order.branch_id}`}
                          </td>
                        )}
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
                        <td className="py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              order.payment_method === 'split'
                                ? 'bg-purple-100 text-purple-800'
                                : order.payment_method === 'bank_transfer'
                                ? 'bg-indigo-100 text-indigo-800'
                                : order.payment_method === 'card'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {getPaymentMethodArabic(order.payment_method, order.payment_splits || order)}
                          </span>
                        </td>
                        <td className="py-3.5 font-bold text-xs">
                          {isReturned ? (
                            <span className="text-slate-400">0 ج.م</span>
                          ) : isPartiallyReturned ? (
                            <span className="text-amber-600 font-black">
                              {order.remainder !== undefined ? `${Number(order.remainder).toLocaleString()} ج.م` : `${remaining.toLocaleString()} ج.م`}
                            </span>
                          ) : remaining > 0 ? (
                            <span className="text-amber-600 font-black">{remaining.toLocaleString()} ج.م</span>
                          ) : (
                            <span className="text-emerald-600">تم الدفع بالكامل</span>
                          )}
                        </td>
                        <td className="py-3.5">
                          {isReturned ? (
                            <Badge variant="danger">مرتجع بالكامل</Badge>
                          ) : isPartiallyReturned ? (
                            <Badge variant="warning">مرتجع جزئياً</Badge>
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

                                const orderBranch = branches.find((b) => b.id?.toString() === order.branch_id?.toString() || b.name === order.branch_name);
                                setCompletedOrder({
                                  order_number: order.branch_invoice_number || order.id,
                                  created_at: order.created_at || order.order_date,
                                  customer_name: order.customer_name,
                                  customer_phone: order.customer_phone,
                                  seller_name: order.seller_name,
                                  branch_id: order.branch_id,
                                  branch_name: order.branch_name || orderBranch?.name,
                                  branch_logo: order.branch_logo_url || order.branch_logo || orderBranch?.logo_url,
                                  items: orderItems,
                                  subtotal: calculatedSub,
                                  discount: totalDisc,
                                  total_amount: Number(order.total_amount || 0),
                                  paid_amount: Number(order.paid_amount || order.total_amount || 0),
                                  change_amount: Number(order.change_amount || 0),
                                  payment_method: order.payment_method || 'cash',
                                  payment_splits: order.payment_splits,
                                  cash_amount: order.cash_amount,
                                  bank_transfer_amount: order.bank_transfer_amount,
                                  card_amount: order.card_amount,
                                  wallet_amount: order.wallet_amount,
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

          {/* History Pagination Bar */}
          {historyPagination.total > 0 && (
            <div className="p-4 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50 rounded-b-2xl">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
                <span>
                  عرض{' '}
                  <span className="text-slate-900 font-black">
                    {(historyPagination.page - 1) * historyPagination.limit + 1} -{' '}
                    {Math.min(historyPagination.page * historyPagination.limit, historyPagination.total)}
                  </span>{' '}
                  من إجمالي{' '}
                  <span className="text-slate-900 font-black">
                    {Number(historyPagination.total).toLocaleString()}
                  </span>{' '}
                  فاتورة
                </span>

                <div className="flex items-center gap-1.5 mr-2">
                  <span className="text-slate-400">لكل صفحة:</span>
                  {[30, 50, 100].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => setHistoryPagination((prev) => ({ ...prev, limit: lim, page: 1 }))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        historyPagination.limit === lim
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {lim}
                    </button>
                  ))}
                </div>
              </div>

              {historyPagination.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPagination.page <= 1}
                    onClick={() => setHistoryPagination((prev) => ({ ...prev, page: 1 }))}
                    title="الصفحة الأولى"
                    className="!px-2"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPagination.page <= 1}
                    onClick={() => setHistoryPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    className="!text-xs !py-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    السابق
                  </Button>
                  <span className="px-3 text-xs font-bold text-slate-600">
                    صفحة {historyPagination.page} من {historyPagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPagination.page >= historyPagination.totalPages}
                    onClick={() => setHistoryPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    className="!text-xs !py-1"
                  >
                    التالي
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={historyPagination.page >= historyPagination.totalPages}
                    onClick={() => setHistoryPagination((prev) => ({ ...prev, page: prev.totalPages }))}
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
              onChange={(e) => updateReturnFilter('returnId', e.target.value)}
            />
            <Input
              placeholder="رقم الطلب الأصلي..."
              value={returnFilters.orderId}
              onChange={(e) => updateReturnFilter('orderId', e.target.value)}
            />
            <Input
              placeholder="اسم العميل..."
              value={returnFilters.customer}
              onChange={(e) => updateReturnFilter('customer', e.target.value)}
            />
            <Input
              placeholder="رقم الهاتف..."
              value={returnFilters.phone}
              onChange={(e) => updateReturnFilter('phone', e.target.value)}
            />
            <input
              type="date"
              value={returnFilters.date}
              onChange={(e) => updateReturnFilter('date', e.target.value)}
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
                    {(!activeBranchId || activeBranchId === 'all') && <th className="py-3.5">الفرع</th>}
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
                        #{ret.original_branch_invoice_number || ret.original_order_id || ret.order_id}
                      </td>
                      <td className="py-3.5 text-xs text-slate-500" dir="ltr">
                        {new Date(ret.return_date || ret.created_at).toLocaleString('ar-EG', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      {(!activeBranchId || activeBranchId === 'all') && (
                        <td className="py-3.5 text-xs font-bold text-slate-700">
                          {ret.branch_name || `فرع #${ret.branch_id}`}
                        </td>
                      )}
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
                              const retBranch = branches.find((b) => b.id?.toString() === ret.branch_id?.toString() || b.name === ret.branch_name);
                              setCompletedReturn({
                                return_id: ret.id,
                                original_order_id: ret.original_order_id || ret.order_id,
                                created_at: ret.return_date || ret.created_at,
                                customer_name: ret.customer_name,
                                customer_phone: ret.customer_phone,
                                seller_name: ret.seller_name,
                                branch_id: ret.branch_id,
                                branch_name: ret.branch_name || retBranch?.name,
                                branch_logo: ret.branch_logo_url || ret.branch_logo || retBranch?.logo_url,
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

          {/* Returns Pagination Bar */}
          {returnsPagination.total > 0 && (
            <div className="p-4 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50 rounded-b-2xl">
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
                <span>
                  عرض{' '}
                  <span className="text-slate-900 font-black">
                    {(returnsPagination.page - 1) * returnsPagination.limit + 1} -{' '}
                    {Math.min(returnsPagination.page * returnsPagination.limit, returnsPagination.total)}
                  </span>{' '}
                  من إجمالي{' '}
                  <span className="text-slate-900 font-black">
                    {Number(returnsPagination.total).toLocaleString()}
                  </span>{' '}
                  مرتجع
                </span>

                <div className="flex items-center gap-1.5 mr-2">
                  <span className="text-slate-400">لكل صفحة:</span>
                  {[30, 50, 100].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => setReturnsPagination((prev) => ({ ...prev, limit: lim, page: 1 }))}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        returnsPagination.limit === lim
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {lim}
                    </button>
                  ))}
                </div>
              </div>

              {returnsPagination.totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={returnsPagination.page <= 1}
                    onClick={() => setReturnsPagination((prev) => ({ ...prev, page: 1 }))}
                    title="الصفحة الأولى"
                    className="!px-2"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={returnsPagination.page <= 1}
                    onClick={() => setReturnsPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    className="!text-xs !py-1"
                  >
                    <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    السابق
                  </Button>
                  <span className="px-3 text-xs font-bold text-slate-600">
                    صفحة {returnsPagination.page} من {returnsPagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={returnsPagination.page >= returnsPagination.totalPages}
                    onClick={() => setReturnsPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    className="!text-xs !py-1"
                  >
                    التالي
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={returnsPagination.page >= returnsPagination.totalPages}
                    onClick={() => setReturnsPagination((prev) => ({ ...prev, page: prev.totalPages }))}
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
      )}

      {/* 4. EXPENSES VIEW */}
      {activeTab === 'expenses' && (
        <ExpensesManager isCashierTab={true} />
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
              <option value="cash">نقدي (كاش بالدرج)</option>
              <option value="bank_transfer">انستاباي / تحويل بنكي</option>
              <option value="card">بطاقة (فيزا)</option>
              <option value="wallet">فودافون كاش</option>
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
        maxWidth="max-w-sm"
        hideHeader={true}
        plain={true}
        bodyClassName="p-2 sm:p-4 flex justify-center overflow-visible"
      >
        {completedReturn && (
          <ThermalReceipt
            id="printable-return-receipt"
            type="return"
            branchId={completedReturn.branch_id || (activeBranchId !== 'all' ? activeBranchId : null) || user?.branch_id}
            branchLogo={completedReturn.branch_logo || completedReturn.branch_logo_url}
            orderNumber={`RET-${completedReturn.return_id}`}
            originalOrderId={completedReturn.original_order_id}
            date={completedReturn.created_at}
            customerName={completedReturn.customer_name}
            customerPhone={completedReturn.customer_phone}
            sellerName={completedReturn.seller_name}
            paymentMethod="كاش"
            branchName={
              completedReturn.branch_name ||
              (activeBranchId && activeBranchId !== 'all'
                ? branches.find((b) => b.id.toString() === activeBranchId.toString())?.name
                : '') ||
              settings.store_name ||
              settings.store_address
            }
            storePhone={
              branches.find((b) => b.name === completedReturn.branch_name || b.id?.toString() === completedReturn.branch_id?.toString())?.phone ||
              settings.store_phone ||
              ''
            }
            storeAddress={
              branches.find((b) => b.name === completedReturn.branch_name || b.id?.toString() === completedReturn.branch_id?.toString())?.location ||
              settings.store_address ||
              ''
            }
            items={completedReturn.items}
            subtotal={completedReturn.total_return_amount}
            totalReturnAmount={completedReturn.total_return_amount}
            totalAmount={completedReturn.total_return_amount}
            paidAmount={completedReturn.total_return_amount}
            changeAmount={0}
            remainingAmount={0}
            footerMessage="تم تسجيل الإرجاع وإعادة الأصناف للمخزون • شكراً لتعاملكم معنا"
            onPrint={() => printElement('printable-return-receipt', `إيصال مرتجع #${completedReturn.return_id}`)}
            onClose={() => setShowReturnReceiptModal(false)}
          />
        )}
      </Modal>

      {/* SIZE SELECTION MODAL */}
      <Modal
        isOpen={showSizeModal}
        onClose={() => {
          setShowSizeModal(false);
          setPendingProduct(null);
        }}
        title="اختيار اللون والمقاس 🎨📏"
        subtitle="اختر اللون والمقاس المطلوب لإضافته للفاتورة"
        maxWidth="max-w-md"
      >
        {pendingProduct && (
          <div className="space-y-4">
            {/* Product preview */}
            <div className="flex items-center gap-3.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center">
                {pendingProduct.image_url ? (
                  <img
                    src={pendingProduct.image_url}
                    alt={pendingProduct.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Tag className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-slate-900 text-sm truncate">{pendingProduct.name}</h4>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mt-0.5">
                  {pendingProduct.color && (
                    <span className="text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {pendingProduct.color}
                    </span>
                  )}
                  <span className="font-mono text-indigo-600 font-bold" dir="ltr">
                    {pendingProduct.barcode || `#${pendingProduct.id}`}
                  </span>
                </div>
                <p className="text-indigo-600 font-black text-xs mt-1">
                  {Number(pendingProduct.price || 0).toLocaleString()} ج.م
                </p>
              </div>
            </div>

            {/* Sizes and Colors selection */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 block">
                اختر اللون والمقاس المطلوب لإضافته للفاتورة:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
                {(pendingProduct.sizes || []).map((s, idx) => {
                  const qty = Number(s.stock_level ?? 0);
                  const isOutOfStock = qty <= 0;

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => {
                        addToCart(pendingProduct, s.size_name, s);
                        setShowSizeModal(false);
                        setPendingProduct(null);
                      }}
                      className={`p-3 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                        isOutOfStock
                          ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                          : 'bg-white border-slate-200 hover:border-indigo-600 hover:bg-indigo-50/50 hover:shadow-sm'
                      }`}
                    >
                      {s.color_name && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {s.color_name}
                        </span>
                      )}
                      <span className="text-base font-black text-slate-900">{s.size_name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isOutOfStock
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {isOutOfStock ? 'نفذت الكمية (0)' : `${qty} متوفر`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowSizeModal(false);
                  setPendingProduct(null);
                }}
              >
                إلغاء
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

          {isAdmin && (!activeBranchId || activeBranchId === 'all') && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">فرع إصدار الفاتورة *</label>
              <select
                value={checkoutBranchId}
                onChange={(e) => {
                  setCheckoutBranchId(e.target.value);
                  setSellerId('');
                }}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 transition-colors"
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الموظف البائع *</label>
            <select
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600 transition-colors"
              required
            >
              <option value="">اختر الموظف البائع...</option>
              {checkoutEmployees.map((emp) => (
                <option key={emp.id} value={emp.id.toString()}>
                  {emp.name} {emp.job_title ? `(${emp.job_title})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">طريقة الدفع</label>
              {/* Split Payment Toggle */}
              <button
                type="button"
                onClick={() => {
                  const next = !isSplitPayment;
                  setIsSplitPayment(next);
                  if (next) {
                    const half = Math.round(grandTotal / 2);
                    setSplitMethod1('cash');
                    setSplitAmount1(half > 0 ? half.toString() : '');
                    setSplitMethod2('bank_transfer');
                    setSplitAmount2((grandTotal - half) > 0 ? (grandTotal - half).toString() : '');
                  }
                }}
                className={`px-3 py-1 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                  isSplitPayment
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>{isSplitPayment ? 'دفع مجزأ مفعل ✓' : 'دفع مجزأ بطريقتين (Split)'}</span>
              </button>
            </div>

            {!isSplitPayment ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'cash', label: 'نقدي (كاش بالدرج)', icon: DollarSign },
                  { id: 'bank_transfer', label: 'انستاباي / بنكي', icon: Building2 },
                  { id: 'card', label: 'بطاقة (فيزا)', icon: CreditCard },
                  { id: 'wallet', label: 'فودافون كاش', icon: Phone },
                  { id: 'debt', label: 'آجل / مديونية', icon: Clock },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border-2 font-bold text-xs transition-all ${
                      paymentMethod === m.id
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <m.icon className="w-4 h-4 mb-1" />
                    <span className="text-[11px] text-center leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3 p-3.5 bg-purple-50/50 border border-purple-200 rounded-2xl">
                <div className="text-xs font-black text-purple-950 flex items-center justify-between">
                  <span>توزيع الدفع المجزأ بين وسيلتين:</span>
                  <span className="text-[11px] font-bold text-slate-500">
                    الإجمالي المطلوب: {grandTotal.toLocaleString()} ج.م
                  </span>
                </div>

                {/* Method 1 */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">الوسيلة الأولى:</span>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'cash', label: 'كاش (بالدرج)' },
                        { id: 'bank_transfer', label: 'انستاباي / بنكي' },
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
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-colors ${
                            splitMethod1 === m.id
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="any"
                      value={splitAmount1}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSplitAmount1(val);
                        const num = Number(val) || 0;
                        if (num >= 0 && grandTotal > num) {
                          setSplitAmount2((grandTotal - num).toString());
                        }
                      }}
                      placeholder="المبلغ للوسيلة الأولى..."
                      className="font-black text-base"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur2 = Number(splitAmount2) || 0;
                        setSplitAmount1(Math.max(0, grandTotal - cur2).toString());
                      }}
                      className="px-2.5 py-2.5 whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      تكملة الإجمالي
                    </button>
                  </div>
                </div>

                {/* Method 2 */}
                <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">الوسيلة الثانية:</span>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { id: 'cash', label: 'كاش (بالدرج)' },
                        { id: 'bank_transfer', label: 'انستاباي / بنكي' },
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
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-colors ${
                            splitMethod2 === m.id
                              ? 'bg-purple-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="any"
                      value={splitAmount2}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSplitAmount2(val);
                        const num = Number(val) || 0;
                        if (num >= 0 && grandTotal > num) {
                          setSplitAmount1((grandTotal - num).toString());
                        }
                      }}
                      placeholder="المبلغ للوسيلة الثانية..."
                      className="font-black text-base"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur1 = Number(splitAmount1) || 0;
                        setSplitAmount2(Math.max(0, grandTotal - cur1).toString());
                      }}
                      className="px-2.5 py-2.5 whitespace-nowrap bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                    >
                      تكملة الإجمالي
                    </button>
                  </div>
                </div>

                {/* Accounting Drawer Balance Note */}
                {(() => {
                  const a1 = Number(splitAmount1) || 0;
                  const a2 = Number(splitAmount2) || 0;
                  const totalPaidSplit = a1 + a2;
                  const grossDrawerCash = (splitMethod1 === 'cash' ? a1 : 0) + (splitMethod2 === 'cash' ? a2 : 0);
                  const splitChange = Math.max(0, totalPaidSplit - grandTotal);
                  const netDrawerCash = Math.max(0, grossDrawerCash - splitChange);
                  const electronicTotal = totalPaidSplit - grossDrawerCash;

                  return (
                    <div className="p-2.5 bg-white rounded-xl border border-purple-200 space-y-1 text-xs">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-slate-600">إجمالي المدفوع المجزأ:</span>
                        <span className="font-black text-slate-900">{totalPaidSplit.toLocaleString()} ج.م</span>
                      </div>
                      <div className="flex justify-between items-center font-bold text-emerald-700">
                        <span>يدخل درج الكاشير (صافي كاش):</span>
                        <span className="font-black">
                          {netDrawerCash.toLocaleString()} ج.م
                          {splitChange > 0 && grossDrawerCash > netDrawerCash && (
                            <span className="text-[10px] text-slate-500 font-normal mr-1">
                              (مستلم: {grossDrawerCash.toLocaleString()} - باقي: {splitChange.toLocaleString()})
                            </span>
                          )}
                        </span>
                      </div>
                      {electronicTotal > 0 && (
                        <div className="flex justify-between items-center font-bold text-indigo-700">
                          <span>تحصيل إلكتروني (خارج درج الكاشير):</span>
                          <span className="font-black">{electronicTotal.toLocaleString()} ج.م</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center font-bold text-slate-500 pt-1 border-t border-slate-100">
                        <span>حالة الفاتورة:</span>
                        <span className={`font-black ${totalPaidSplit >= grandTotal ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {totalPaidSplit >= grandTotal
                            ? `خالصة بالكامل ${splitChange > 0 ? `(باقي للعميل: ${splitChange.toLocaleString()} ج.م)` : '✓'}`
                            : `غير خالصة (متبقي على العميل: ${(grandTotal - totalPaidSplit).toLocaleString()} ج.م)`}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {!isSplitPayment && (
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
          )}

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
      {/* 80mm THERMAL RECEIPT MODAL */}
      <Modal
        isOpen={showInvoiceModal}
        onClose={() => setShowInvoiceModal(false)}
        maxWidth="max-w-sm"
        hideHeader={true}
        plain={true}
        bodyClassName="p-2 sm:p-4 flex justify-center overflow-visible"
      >
        {completedOrder && (
          <ThermalReceipt
            id="printable-receipt"
            type="sale"
            branchId={completedOrder.branch_id || (activeBranchId !== 'all' ? activeBranchId : null) || user?.branch_id}
            branchLogo={completedOrder.branch_logo || completedOrder.branch_logo_url}
            orderNumber={completedOrder.order_number}
            date={completedOrder.created_at}
            customerName={completedOrder.customer_name}
            customerPhone={completedOrder.customer_phone}
            sellerName={completedOrder.seller_name}
            paymentMethod={completedOrder.payment_method}
            paymentSplits={completedOrder.payment_splits}
            cashAmount={completedOrder.cash_amount}
            bankTransferAmount={completedOrder.bank_transfer_amount}
            cardAmount={completedOrder.card_amount}
            walletAmount={completedOrder.wallet_amount}
            branchName={
              completedOrder.branch_name ||
              (activeBranchId && activeBranchId !== 'all'
                ? branches.find((b) => b.id.toString() === activeBranchId.toString())?.name
                : '') ||
              settings.store_name ||
              ''
            }
            storePhone={
              branches.find((b) => b.name === completedOrder.branch_name)?.phone ||
              (activeBranchId && activeBranchId !== 'all'
                ? branches.find((b) => b.id.toString() === activeBranchId.toString())?.phone
                : '') ||
              settings.store_phone ||
              ''
            }
            storeAddress={
              branches.find((b) => b.name === completedOrder.branch_name)?.location ||
              (activeBranchId && activeBranchId !== 'all'
                ? branches.find((b) => b.id.toString() === activeBranchId.toString())?.location
                : '') ||
              settings.store_address ||
              ''
            }
            items={completedOrder.items}
            subtotal={completedOrder.subtotal}
            discount={completedOrder.discount}
            taxRate={Number(settings.tax_rate || 0)}
            totalAmount={completedOrder.total_amount}
            paidAmount={completedOrder.paid_amount}
            changeAmount={completedOrder.change_amount}
            remainingAmount={Math.max(0, (completedOrder.total_amount || 0) - (completedOrder.paid_amount || 0))}
            footerMessage={settings.cashier_footer}
            onPrint={() => printElement('printable-receipt', `فاتورة #${completedOrder.order_number}`)}
            onClose={() => setShowInvoiceModal(false)}
          />
        )}
      </Modal>
    </div>
  );
}

export default POS;
