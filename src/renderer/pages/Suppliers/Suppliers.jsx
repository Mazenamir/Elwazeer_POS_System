import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Package,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  Building2,
  Phone,
  DollarSign,
  ArrowRightLeft,
  FileText,
  Tag,
  Receipt,
  Download,
  Barcode,
  Layers,
  CheckCircle2,
  Sparkles,
  Copy,
  Printer,
  Undo2,
  Check,
  X,
  Truck,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Upload,
  Image as ImageIcon,
  ArrowUpDown,
  Filter,
  ChevronDown,
  Users,
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
import SearchableCombobox from '../../components/forms/SearchableCombobox';
import { printElement } from '../../utils/print';

const BASE_CATEGORIES = ['الكل', 'بدل', 'بنطلون', 'FORMAL SUIT', 'TUXEDO SUIT', 'KIDS', 'قميص', 'تيشيرت', 'SUIT', 'WALLET', 'ترنج', 'CASUAL SUIT', 'أخرى'];

const CATEGORY_DISPLAY_MAP = {
  'الكل': 'كل التصنيفات',
  'بدل': 'بدل (جميع الأنواع)',
  'FORMAL SUIT': 'بدل رسمية (FORMAL SUIT)',
  'TUXEDO SUIT': 'بدل سموكن (TUXEDO SUIT)',
  'SUIT': 'بدل عادية (SUIT)',
  'CASUAL SUIT': 'بدل كاجوال (CASUAL SUIT)',
  'KIDS': 'أطفال (KIDS)',
  'بنطلون': 'بنطلون',
  'قميص': 'قميص',
  'تيشيرت': 'تيشيرت',
  'ترنج': 'ترنج',
  'WALLET': 'محافظ (WALLET)',
  'أخرى': 'بدون تصنيف / أخرى',
};

export function Suppliers() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const initialTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'inventory';
  const initialSearch = searchParams.get('search') || '';

  const [activeTab, setActiveTab] = useState(initialTab); // 'inventory' | 'suppliers'

  // INVENTORY STATE
  const [products, setProducts] = useState([]);
  const [categoriesList, setCategoriesList] = useState(BASE_CATEGORIES);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState(initialTab === 'inventory' ? initialSearch : '');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [inventoryBranchFilter, setInventoryBranchFilter] = useState('all');
  const [inventoryPagination, setInventoryPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  const hasActiveFilters = useMemo(() => {
    return (
      selectedCategory !== 'الكل' ||
      stockStatusFilter !== 'all' ||
      supplierFilter !== 'all' ||
      inventoryBranchFilter !== 'all' ||
      sortOrder !== 'latest' ||
      productSearch.trim().length > 0
    );
  }, [selectedCategory, stockStatusFilter, supplierFilter, inventoryBranchFilter, sortOrder, productSearch]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'الكل') count++;
    if (stockStatusFilter !== 'all') count++;
    if (supplierFilter !== 'all') count++;
    if (inventoryBranchFilter !== 'all') count++;
    if (sortOrder !== 'latest') count++;
    if (productSearch.trim().length > 0) count++;
    return count;
  }, [selectedCategory, stockStatusFilter, supplierFilter, inventoryBranchFilter, sortOrder, productSearch]);

  const handleResetInventoryFilters = () => {
    setSelectedCategory('الكل');
    setStockStatusFilter('all');
    setSupplierFilter('all');
    setInventoryBranchFilter('all');
    setSortOrder('latest');
    setProductSearch('');
    setInventoryPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Load Metadata categories and real counts
  useEffect(() => {
    api.get('/inventory/metadata')
      .then((meta) => {
        if (meta?.categories && Array.isArray(meta.categories)) {
          const trimmed = meta.categories.map((c) => (typeof c === 'string' ? c.trim() : c)).filter(Boolean);
          const ordered = Array.from(new Set(['الكل', 'بدل', ...trimmed]));
          setCategoriesList(ordered);
        }
        if (meta?.categoryCounts) {
          setCategoryCounts(meta.categoryCounts);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch dynamic Product Names, Colors, and Sizes from PostgreSQL
  const fetchDropdownOptions = useCallback(async () => {
    try {
      setLoadingDropdowns(true);
      const [namesRes, colorsRes, sizesRes] = await Promise.all([
        api.get('/inventory/names').catch(() => []),
        api.get('/colors').catch(() => []),
        api.get('/sizes').catch(() => []),
      ]);
      if (Array.isArray(namesRes)) {
        setProductNamesList(namesRes);
      }
      if (Array.isArray(colorsRes)) {
        setColorsList(colorsRes.map((c) => (typeof c === 'object' ? c.name : c)));
      }
      if (Array.isArray(sizesRes)) {
        setSizesList(sizesRes.map((s) => (typeof s === 'object' ? s.name : s)));
      }
    } catch (err) {
      console.error('Failed to load dropdown options:', err);
    } finally {
      setLoadingDropdowns(false);
    }
  }, []);

  useEffect(() => {
    fetchDropdownOptions();
  }, [fetchDropdownOptions]);

  // Image Upload Handlers
  const handleImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('صيغة الصورة غير مدعومة. يرجى اختيار صورة JPG أو PNG أو WEBP.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('حجم الصورة كبير جداً (أكثر من 10 ميجابايت).');
      return;
    }

    setSelectedImageFile(file);
    const objectUrl = URL.createObjectURL(file);
    setImagePreviewUrl(objectUrl);
  };

  const handleRemoveImageFile = () => {
    setSelectedImageFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setImagePreviewUrl(pImage.trim() || null);
  };

  // Add / Edit Product Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [pName, setPName] = useState('');
  const [isNewProductName, setIsNewProductName] = useState(false);
  const [pCategory, setPCategory] = useState('FORMAL SUIT');
  const [pColor, setPColor] = useState('');
  const [pNewColor, setPNewColor] = useState('');
  const [pSize, setPSize] = useState('');
  const [pNewSize, setPNewSize] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pCost, setPCost] = useState('');
  const [pBarcode, setPBarcode] = useState('');
  const [pStock, setPStock] = useState('0');
  const [pMinStock, setPMinStock] = useState('5');
  const [pImage, setPImage] = useState('');
  const [pSupplierId, setPSupplierId] = useState('');

  // Multi-Size Inventory Management (same barcode, multiple sizes with individual quantities)
  const [productSizes, setProductSizes] = useState([
    { id: 1, size_name: '48', color_name: '', stock_level: '5' },
    { id: 2, size_name: '50', color_name: '', stock_level: '5' },
    { id: 3, size_name: '52', color_name: '', stock_level: '5' },
    { id: 4, size_name: '54', color_name: '', stock_level: '5' },
  ]);

  const addSizeRow = (defaultName = '', defaultStock = '0') => {
    setProductSizes((prev) => [
      ...prev,
      { id: Date.now() + Math.random(), size_name: defaultName, color_name: '', stock_level: defaultStock },
    ]);
  };

  const removeSizeRow = (id) => {
    setProductSizes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
  };

  const updateSizeRow = (id, field, value) => {
    setProductSizes((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const applySizesPreset = (type) => {
    let sizes = [];
    if (type === 'suits_men') {
      sizes = ['46', '48', '50', '52', '54', '56', '58'];
    } else if (type === 'suits_slim') {
      sizes = ['48', '50', '52', '54'];
    } else if (type === 'standard') {
      sizes = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
    } else if (type === 'shoes') {
      sizes = ['40', '41', '42', '43', '44', '45'];
    } else if (type === 'men_pants') {
      sizes = ['30', '32', '34', '36', '38', '40'];
    } else if (type === 'kids_boys') {
      sizes = ['2', '4', '6', '8', '10', '12'];
    } else if (type === 'kids_girls') {
      sizes = ['2', '4', '6', '8', '10', '12'];
    } else if (type === 'single') {
      sizes = ['حر'];
    }
    setProductSizes(
      sizes.map((s, idx) => ({ id: Date.now() + idx, size_name: s, color_name: '', stock_level: '5' }))
    );
  };

  const calculatedTotalStock = useMemo(() => {
    return productSizes.reduce((sum, s) => sum + (Number(s.stock_level) || 0), 0);
  }, [productSizes]);

  // Dynamic Combobox data loaded from PostgreSQL
  const [productNamesList, setProductNamesList] = useState([]);
  const [colorsList, setColorsList] = useState([]);
  const [sizesList, setSizesList] = useState([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  // Local image upload state
  const fileInputRef = useRef(null);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);

  // Stock Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState(null);
  const [toBranchId, setToBranchId] = useState('');
  const [transferQty, setTransferQty] = useState('1');
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // Transfer to Rental Modal
  const [showRentalTransferModal, setShowRentalTransferModal] = useState(false);
  const [rentalProduct, setRentalProduct] = useState(null);
  const [rentalPrice, setRentalPrice] = useState('');
  const [rentalDeposit, setRentalDeposit] = useState('');
  const [rentalCondition, setRentalCondition] = useState('ممتاز');
  const [rentalNotes, setRentalNotes] = useState('');
  const [rentalSubmitting, setRentalSubmitting] = useState(false);

  // Duplicate Product Modal
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [dupSourceProduct, setDupSourceProduct] = useState(null);
  const [dupColor, setDupColor] = useState('');
  const [dupSize, setDupSize] = useState('');
  const [dupBarcode, setDupBarcode] = useState('');
  const [dupStock, setDupStock] = useState('1');
  const [dupSubmitting, setDupSubmitting] = useState(false);

  // Inter-Branch Requests
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  // SUPPLIERS STATE
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState(initialTab === 'suppliers' ? initialSearch : '');
  const [supplierPagination, setSupplierPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  // Sync when searchParams change from header navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const searchParam = searchParams.get('search');
    if (tabParam === 'suppliers') {
      setActiveTab('suppliers');
      if (searchParam !== null && searchParam !== undefined) {
        setSupplierSearch(searchParam);
      }
    } else if (tabParam === 'inventory' || searchParam !== null) {
      if (tabParam) setActiveTab('inventory');
      if (searchParam !== null && searchParam !== undefined) {
        setProductSearch(searchParam);
      }
    }
  }, [searchParams]);

  // Add / Edit Supplier Modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);
  const [sName, setSName] = useState('');
  const [sCompany, setSCompany] = useState('');
  const [sPhone, setSPhone] = useState('');
  const [sAddress, setSAddress] = useState('');
  const [sNotes, setSNotes] = useState('');

  // Supplier Statement Modal
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Supplier Payment Transaction Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Purchase Return to Supplier Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSupplierId, setReturnSupplierId] = useState('');
  const [returnProductName, setReturnProductName] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnUnitPrice, setReturnUnitPrice] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Supply Batch / Restock Modal
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [supplySupplierId, setSupplySupplierId] = useState('');
  const [supplyProductId, setSupplyProductId] = useState('');
  const [supplyQuantity, setSupplyQuantity] = useState('10');
  const [supplyCostPrice, setSupplyCostPrice] = useState('');
  const [supplyPaidAmount, setSupplyPaidAmount] = useState('0');
  const [supplyNotes, setSupplyNotes] = useState('');
  const [supplySubmitting, setSupplySubmitting] = useState(false);
  const [supplyProductsList, setSupplyProductsList] = useState([]);
  const [loadingSupplyProducts, setLoadingSupplyProducts] = useState(false);
  const [supplyProductSearch, setSupplyProductSearch] = useState('');

  // Fetch all products for supply restock modal when opened
  useEffect(() => {
    if (showSupplyModal) {
      if (supplyProductsList.length === 0) {
        setLoadingSupplyProducts(true);
        api.get('/inventory?all=true')
          .then((res) => {
            const list = Array.isArray(res) ? res : res?.items || res?.data || [];
            setSupplyProductsList(list);
          })
          .catch(() => {})
          .finally(() => setLoadingSupplyProducts(false));
      }
    }
  }, [showSupplyModal, supplyProductsList.length]);

  const activeSupplyProducts = useMemo(() => {
    const base = supplyProductsList.length > 0 ? supplyProductsList : products;
    if (!supplyProductSearch.trim()) return base;
    const term = supplyProductSearch.trim().toLowerCase();
    return base.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.barcode && p.barcode.toLowerCase().includes(term)) ||
        (p.category && p.category.toLowerCase().includes(term)) ||
        (p.color && p.color.toLowerCase().includes(term)) ||
        String(p.id).includes(term)
    );
  }, [supplyProductsList, products, supplyProductSearch]);

  // Load Inventory Products
  const fetchProducts = useCallback(async () => {
    try {
      setLoadingProducts(true);
      const query = new URLSearchParams();
      const branchToUse = isAdmin ? inventoryBranchFilter : activeBranchId;
      if (branchToUse && branchToUse !== 'all') query.append('branch_id', branchToUse);
      if (productSearch.trim()) query.append('search', productSearch.trim());
      if (selectedCategory !== 'الكل') query.append('category', selectedCategory);
      if (stockStatusFilter !== 'all') query.append('stock_status', stockStatusFilter);
      if (sortOrder !== 'latest') query.append('sort', sortOrder);
      if (supplierFilter !== 'all') query.append('supplier_id', supplierFilter);

      if (inventoryPagination.limit === 'all') {
        query.append('all', 'true');
      } else {
        query.append('page', inventoryPagination.page.toString());
        query.append('limit', inventoryPagination.limit.toString());
      }

      const data = await api.get(`/inventory?${query.toString()}`);
      const items = Array.isArray(data) ? data : data?.items || [];
      setProducts(items);

      if (data?.pagination) {
        setInventoryPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setInventoryPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit === 'all' ? data.total || 1 : prev.limit))),
        }));
      } else {
        setInventoryPagination((prev) => ({
          ...prev,
          total: items.length,
          totalPages: 1,
        }));
      }
    } catch (err) {
      console.error('Failed to load inventory products:', err);
    } finally {
      setLoadingProducts(false);
    }
  }, [isAdmin, inventoryBranchFilter, activeBranchId, productSearch, selectedCategory, stockStatusFilter, sortOrder, supplierFilter, inventoryPagination.page, inventoryPagination.limit]);

  // Load Suppliers
  const fetchSuppliers = useCallback(async () => {
    try {
      setLoadingSuppliers(true);
      const query = new URLSearchParams();
      if (supplierSearch.trim()) query.append('search', supplierSearch.trim());

      if (supplierPagination.limit === 'all') {
        query.append('all', 'true');
      } else {
        query.append('page', supplierPagination.page.toString());
        query.append('limit', supplierPagination.limit.toString());
      }

      const data = await api.get(`/suppliers?${query.toString()}`);
      const list = Array.isArray(data) ? data : (data?.suppliers || data?.data || data?.items || []);
      setSuppliers(list);

      if (data?.pagination) {
        setSupplierPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setSupplierPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit === 'all' ? data.total || 1 : prev.limit))),
        }));
      } else {
        setSupplierPagination((prev) => ({
          ...prev,
          total: list.length,
          totalPages: 1,
        }));
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoadingSuppliers(false);
    }
  }, [supplierSearch, supplierPagination.page, supplierPagination.limit]);

  // Load Inter-branch transfer requests
  const fetchRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const data = await api.get('/inventory/transfers/requests').catch(() => []);
      setIncomingRequests(Array.isArray(data) ? data : data?.requests || []);
    } catch {
      setIncomingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'inventory') {
      const timer = setTimeout(() => {
        fetchProducts();
        fetchRequests();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(fetchSuppliers, 200);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchProducts, fetchSuppliers, fetchRequests]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Reset pagination when branch changes
  useEffect(() => {
    setInventoryPagination((prev) => ({ ...prev, page: 1 }));
    setSupplierPagination((prev) => ({ ...prev, page: 1 }));
  }, [activeBranchId]);

  const handleInventoryPageChange = (newPage) => {
    const pageNum = Math.max(1, Math.min(newPage, inventoryPagination.totalPages));
    setInventoryPagination((prev) => ({ ...prev, page: pageNum }));
  };

  const handleInventoryLimitChange = (newLimit) => {
    setInventoryPagination((prev) => ({
      ...prev,
      limit: newLimit === 'all' ? 'all' : Number(newLimit),
      page: 1,
    }));
  };

  const handleSupplierPageChange = (newPage) => {
    const pageNum = Math.max(1, Math.min(newPage, supplierPagination.totalPages));
    setSupplierPagination((prev) => ({ ...prev, page: pageNum }));
  };

  const handleSupplierLimitChange = (newLimit) => {
    setSupplierPagination((prev) => ({
      ...prev,
      limit: newLimit === 'all' ? 'all' : Number(newLimit),
      page: 1,
    }));
  };

  // Open Create Product Modal
  const openCreateProduct = () => {
    setEditingProduct(null);
    setPName('');
    setIsNewProductName(false);
    setPCategory('FORMAL SUIT');
    setPColor('');
    setPNewColor('');
    setPSize('');
    setPNewSize('');
    setPPrice('');
    setPCost('');
    setPBarcode('');
    setPStock('20');
    setPMinStock('5');
    setPImage('');
    setProductSizes([
      { id: 1, size_name: '48', color_name: '', stock_level: '5' },
      { id: 2, size_name: '50', color_name: '', stock_level: '5' },
      { id: 3, size_name: '52', color_name: '', stock_level: '5' },
      { id: 4, size_name: '54', color_name: '', stock_level: '5' },
    ]);
    setSelectedImageFile(null);
    setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPSupplierId(suppliers[0]?.id ? String(suppliers[0].id) : '');
    fetchDropdownOptions();
    setShowProductModal(true);
  };

  // Open Edit Product Modal
  const openEditProduct = (p) => {
    setEditingProduct(p);
    setPName(p.name || '');
    setIsNewProductName(false);
    setPCategory(p.category || 'FORMAL SUIT');
    setPColor(p.color || '');
    setPNewColor('');
    setPSize(p.size_cut || p.size || '');
    setPNewSize('');
    setPPrice(p.price ? p.price.toString() : '');
    setPCost(p.cost_price ? p.cost_price.toString() : '');
    setPBarcode(p.barcode || '');
    setPStock(p.stock_level ?? p.stock ?? '0');
    setPMinStock(p.min_stock_level ?? '5');
    setPImage(p.image_url || '');

    if (p.sizes && Array.isArray(p.sizes) && p.sizes.length > 0) {
      setProductSizes(
        p.sizes.map((s, idx) => ({
          id: s.id || idx + 1,
          size_name: s.size_name || '',
          color_name: s.color_name || p.color || '',
          stock_level: String(s.stock_level ?? 0),
        }))
      );
    } else if (p.size_cut || p.size) {
      const raw = (p.size_cut || p.size).toString();
      const parts = raw.split(/[,/]+/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        const total = Number(p.stock_level ?? p.stock ?? 0);
        const perSize = Math.max(0, Math.floor(total / parts.length));
        setProductSizes(
          parts.map((s, idx) => ({
            id: idx + 1,
            size_name: s,
            color_name: p.color || '',
            stock_level: String(perSize),
          }))
        );
      } else {
        setProductSizes([{ id: 1, size_name: raw, color_name: p.color || '', stock_level: String(p.stock_level ?? p.stock ?? 0) }]);
      }
    } else {
      setProductSizes([{ id: 1, size_name: 'حر', color_name: p.color || '', stock_level: String(p.stock_level ?? p.stock ?? 0) }]);
    }

    setSelectedImageFile(null);
    setImagePreviewUrl(p.image_url || null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPSupplierId(p.preferred_supplier_id ? String(p.preferred_supplier_id) : (suppliers[0]?.id ? String(suppliers[0].id) : ''));
    fetchDropdownOptions();
    setShowProductModal(true);
  };

  // Submit Save Product (Create / Update)
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    const finalName = pName.trim();
    if (!finalName) {
      toast.error('يرجى إدخال اسم المنتج أو اختياره');
      return;
    }

    if (pColor === '__OTHER__' && !pNewColor.trim()) {
      toast.error('يرجى إدخال اسم اللون الجديد');
      return;
    }

    const cleanedSizes = productSizes
      .filter((s) => s.size_name && s.size_name.trim())
      .map((s) => ({
        size_name: s.size_name.trim(),
        color_name: String(s.color_name || '').trim(),
        stock_level: Math.max(0, Number(s.stock_level) || 0),
      }));

    if (cleanedSizes.length === 0) {
      toast.error('يرجى تحديد مقاس واحد على الأقل مع إدخال الكمية');
      return;
    }

    if (cleanedSizes.some((s) => !s.color_name)) {
      toast.error('يرجى تحديد لون لكل مقاس');
      return;
    }

    const finalStock = cleanedSizes.reduce((sum, s) => sum + s.stock_level, 0);
    const finalSizeCut = cleanedSizes.map((s) => s.size_name).join(', ');

    setProductSubmitting(true);
    try {
      const selectedSupId = Number(pSupplierId) || suppliers[0]?.id || 1;
      const targetBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1;
      const finalColor = (pColor === '__OTHER__' ? pNewColor.trim() : pColor.trim()) || cleanedSizes[0].color_name;

      if (selectedImageFile) {
        // Method 2: Local Upload via Multipart FormData
        const formData = new FormData();
        formData.append('image', selectedImageFile);
        formData.append('name', finalName);
        formData.append('category', pCategory);
        formData.append('color', finalColor);
        if (pColor === '__OTHER__') formData.append('new_color', pNewColor.trim());
        formData.append('size_cut', finalSizeCut);
        formData.append('sizes', JSON.stringify(cleanedSizes));
        formData.append('price', Number(pPrice) || 0);
        formData.append('cost_price', Number(pCost) || 0);
        formData.append('barcode', pBarcode.trim());
        formData.append('stock', finalStock);
        formData.append('stock_level', finalStock);
        formData.append('min_stock_level', Number(pMinStock) || 5);
        formData.append('supplier_id', selectedSupId);
        formData.append('preferred_supplier_id', selectedSupId);
        formData.append('branch_id', targetBranchId);

        if (editingProduct) {
          await api.put(`/inventory/${editingProduct.id}`, formData);
          toast.success('تم تحديث بيانات المنتج والمقاسات بنجاح! 📦');
        } else {
          await api.post('/inventory', formData);
          toast.success('تمت إضافة المنتج ومقاساته للمخزون بنجاح! 📦');
        }
      } else {
        // Method 1 / URL or Text payload
        const payload = {
          name: finalName,
          category: pCategory,
          color: finalColor,
          new_color: pColor === '__OTHER__' ? pNewColor.trim() : '',
          size_cut: finalSizeCut,
          sizes: cleanedSizes,
          price: Number(pPrice) || 0,
          cost_price: Number(pCost) || 0,
          barcode: pBarcode.trim(),
          stock: finalStock,
          stock_level: finalStock,
          min_stock_level: Number(pMinStock) || 5,
          supplier_id: selectedSupId,
          preferred_supplier_id: selectedSupId,
          image_url: pImage.trim(),
          branch_id: targetBranchId,
        };

        if (editingProduct) {
          await api.put(`/inventory/${editingProduct.id}`, payload);
          toast.success('تم تحديث بيانات المنتج والمقاسات بنجاح! 📦');
        } else {
          await api.post('/inventory', payload);
          toast.success('تمت إضافة المنتج ومقاساته للمخزون بنجاح! 📦');
        }
      }

      setShowProductModal(false);
      fetchProducts();
      fetchDropdownOptions();
    } catch (err) {
      toast.error(err.message || 'فشل حفظ المنتج');
    } finally {
      setProductSubmitting(false);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المنتج نهائياً من المخزون؟')) return;
    try {
      await api.delete(`/inventory/${id}`);
      toast.success('تم حذف المنتج من المخزون');
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل حذف المنتج');
    }
  };

  // Open Transfer Modal
  const openTransferModal = (p) => {
    setTransferProduct(p);
    setTransferQty('1');
    const otherBranches = branches.filter((b) => b.id.toString() !== activeBranchId?.toString());
    if (otherBranches.length > 0) {
      setToBranchId(otherBranches[0].id.toString());
    }
    setShowTransferModal(true);
  };

  // Submit Stock Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferProduct || !toBranchId) return;

    setTransferSubmitting(true);
    try {
      await api.post('/inventory/transfer', {
        inventory_id: transferProduct.id,
        from_branch_id: activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1,
        to_branch_id: Number(toBranchId),
        quantity: Number(transferQty),
      });

      toast.success('تم تحويل كمية المخزون للفرع الآخر بنجاح! 🚚');
      setShowTransferModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل تحويل المخزون');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Open Transfer to Rental Modal
  const openRentalTransferModal = (p) => {
    setRentalProduct(p);
    setRentalPrice(p.price ? (Number(p.price) * 0.4).toFixed(0) : '200');
    setRentalDeposit(p.price ? (Number(p.price) * 0.5).toFixed(0) : '300');
    setRentalCondition('ممتاز');
    setRentalNotes('');
    setShowRentalTransferModal(true);
  };

  // Submit Transfer to Rental
  const handleRentalTransferSubmit = async (e) => {
    e.preventDefault();
    if (!rentalProduct) return;

    try {
      setRentalSubmitting(true);
      await api.post('/rental-inventory/transfer-from-sales', {
        inventory_id: rentalProduct.id,
        rental_price: Number(rentalPrice),
        deposit: Number(rentalDeposit),
        condition: rentalCondition,
        notes: rentalNotes,
        branch_id: activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1,
      });

      toast.success('تم تحويل المنتج إلى مخزون التأجير بنجاح! ✨');
      setShowRentalTransferModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل تحويل المنتج لمخزون التأجير');
    } finally {
      setRentalSubmitting(false);
    }
  };

  // Open Duplicate Product Modal
  const openDuplicateModal = (p) => {
    setDupSourceProduct(p);
    setDupColor(p.color || '');
    setDupSize(p.size_cut || p.size || '');
    setDupBarcode(p.barcode ? `${p.barcode}-1` : '');
    setDupStock('1');
    setShowDuplicateModal(true);
  };

  // Submit Duplicate Product
  const handleDuplicateSubmit = async (e) => {
    e.preventDefault();
    if (!dupSourceProduct) return;

    try {
      setDupSubmitting(true);
      const supId = dupSourceProduct.preferred_supplier_id || suppliers[0]?.id || 1;
      const payload = {
        name: dupSourceProduct.name,
        category: dupSourceProduct.category,
        color: dupColor.trim(),
        size_cut: dupSize.trim(),
        price: Number(dupSourceProduct.price || 0),
        cost_price: Number(dupSourceProduct.cost_price || 0),
        barcode: dupBarcode.trim(),
        stock: Number(dupStock) || 1,
        stock_level: Number(dupStock) || 1,
        min_stock_level: Number(dupSourceProduct.min_stock_level || 5),
        supplier_id: supId,
        preferred_supplier_id: supId,
        image_url: dupSourceProduct.image_url || '',
        branch_id: activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1,
      };

      await api.post('/inventory', payload);
      toast.success('تم تكرار المنتج بنجاح! 📋');
      setShowDuplicateModal(false);
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل تكرار المنتج');
    } finally {
      setDupSubmitting(false);
    }
  };

  // Inter-branch Request Actions
  const handleApproveRequest = async (requestId) => {
    try {
      await api.post(`/inventory/transfers/${requestId}/approve`);
      toast.success('تمت الموافقة على طلب التحويل بنجاح! ✅');
      fetchRequests();
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل الموافقة على الطلب');
    }
  };

  const handleRejectRequest = async (requestId) => {
    if (!window.confirm('هل أنت متأكد من رفض هذا الطلب؟')) return;
    try {
      await api.post(`/inventory/transfers/${requestId}/reject`);
      toast.info('تم رفض طلب التحويل');
      fetchRequests();
    } catch (err) {
      toast.error(err.message || 'فشل رفض الطلب');
    }
  };

  // Export to Excel / CSV
  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async (type) => {
    try {
      setExporting(true);
      let csvContent = '\uFEFF'; // UTF-8 BOM for Arabic in Excel
      let filename = 'export.csv';

      if (type === 'inventory') {
        toast.info('جاري تجهيز بيانات المخزون للتصدير... 📊');
        const query = new URLSearchParams();
        if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
        if (productSearch.trim()) query.append('search', productSearch.trim());
        if (selectedCategory !== 'الكل') query.append('category', selectedCategory);
        query.append('all', 'true');

        const res = await api.get(`/inventory?${query.toString()}`);
        const exportItems = Array.isArray(res) ? res : res?.items || res?.data || products;

        filename = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent += 'الرقم,اسم المنتج,القسم,اللون,المقاس,الباركود,سعر البيع,سعر التكلفة,الكمية المتاحة\n';
        exportItems.forEach((p) => {
          csvContent += `"${p.id}","${p.name || ''}","${p.category || ''}","${p.color || ''}","${p.size_cut || p.size || ''}","${p.barcode || ''}","${p.price || 0}","${p.cost_price || 0}","${p.stock_level ?? p.stock ?? 0}"\n`;
        });
      } else {
        toast.info('جاري تجهيز سجل الموردين للتصدير... 📊');
        const query = new URLSearchParams();
        if (supplierSearch.trim()) query.append('search', supplierSearch.trim());
        query.append('all', 'true');

        const res = await api.get(`/suppliers?${query.toString()}`);
        const exportSuppliers = Array.isArray(res) ? res : res?.suppliers || res?.data || res?.items || suppliers;

        filename = `suppliers_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent += 'الرقم,اسم المورد,الشركة,رقم الهاتف,العنوان,إجمالي المشتريات,الرصيد المستحق\n';
        exportSuppliers.forEach((s) => {
          csvContent += `"${s.id}","${s.name || ''}","${s.company || ''}","${s.phone || ''}","${s.address || ''}","${s.total_purchases || 0}","${s.balance || 0}"\n`;
        });
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('تم تصدير وتحميل الملف بنجاح! 📊');
    } catch (err) {
      toast.error('فشل تصدير الملف');
    } finally {
      setExporting(false);
    }
  };

  // Open Create Supplier Modal
  const openCreateSupplier = () => {
    setEditingSupplier(null);
    setSName('');
    setSCompany('');
    setSPhone('');
    setSAddress('');
    setSNotes('');
    setShowSupplierModal(true);
  };

  // Open Edit Supplier Modal
  const openEditSupplier = (s) => {
    setEditingSupplier(s);
    setSName(s.name || '');
    setSCompany(s.company_name || s.company || '');
    setSPhone(s.phone || '');
    setSAddress(s.address || '');
    setSNotes(s.notes || '');
    setShowSupplierModal(true);
  };

  // Submit Save Supplier
  const handleSaveSupplier = async (e) => {
    e.preventDefault();
    if (!sName.trim()) {
      toast.error('يرجى إدخال اسم المورد');
      return;
    }

    setSupplierSubmitting(true);
    try {
      const payload = {
        name: sName.trim(),
        company_name: sCompany.trim(),
        company: sCompany.trim(),
        phone: sPhone.trim(),
        address: sAddress.trim(),
        notes: sNotes.trim(),
      };

      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, payload);
        toast.success('تم تحديث بيانات المورد بنجاح! 🏭');
      } else {
        await api.post('/suppliers', payload);
        toast.success('تمت إضافة المورد بنجاح! 🏭');
      }

      setShowSupplierModal(false);
      fetchSuppliers();
    } catch (err) {
      toast.error(err.message || 'فشل حفظ بيانات المورد');
    } finally {
      setSupplierSubmitting(false);
    }
  };

  // Delete Supplier
  const handleDeleteSupplier = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    try {
      await api.delete(`/suppliers/${id}`);
      toast.success('تم حذف المورد بنجاح');
      fetchSuppliers();
    } catch (err) {
      toast.error(err.message || 'فشل حذف المورد');
    }
  };

  // Open Supplier Statement
  const openStatement = async (supplier) => {
    setSelectedSupplier(supplier);
    setShowStatementModal(true);
    setLoadingStatement(true);
    try {
      const data = await api.get(`/suppliers/${supplier.id}/statement`);
      setStatementData(data);
    } catch (err) {
      console.error('Failed to load statement:', err);
    } finally {
      setLoadingStatement(false);
    }
  };

  // Submit Supplier Payment
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(paymentAmount);
    if (!amount || amount <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }

    setPaymentSubmitting(true);
    try {
      await api.post('/suppliers/transactions', {
        supplier_id: selectedSupplier.id,
        amount,
        type: 'payment',
        notes: paymentNotes,
      });

      toast.success('تم تسجيل سداد الدفعة بنجاح! 💵');
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      fetchSuppliers();
      if (showStatementModal) {
        openStatement(selectedSupplier);
      }
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل السداد');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // Purchase Return to Supplier Submit
  const handlePurchaseReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnSupplierId) {
      toast.warning('يرجى اختيار المورد');
      return;
    }
    const qty = Number(returnQuantity);
    const unitPrice = Number(returnUnitPrice);
    if (!qty || qty <= 0 || !unitPrice || unitPrice <= 0) {
      toast.warning('يرجى إدخال كمية وسعر صالحين');
      return;
    }

    try {
      setReturnSubmitting(true);
      await api.post('/suppliers/returns', {
        supplier_id: Number(returnSupplierId),
        product_name: returnProductName.trim(),
        quantity: qty,
        unit_price: unitPrice,
        notes: returnNotes.trim(),
      });

      toast.success('تم تسجيل مرتجع المشتريات للمورد بنجاح! 🔄');
      setShowReturnModal(false);
      setReturnProductName('');
      setReturnQuantity('1');
      setReturnUnitPrice('');
      setReturnNotes('');
      fetchSuppliers();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل مرتجع المشتريات');
    } finally {
      setReturnSubmitting(false);
    }
  };

  // Supply Batch (Restock) Submit
  const handleSupplySubmit = async (e) => {
    e.preventDefault();
    if (!supplySupplierId || !supplyProductId) {
      toast.warning('يرجى اختيار المورد والمنتج');
      return;
    }

    try {
      setSupplySubmitting(true);
      await api.post('/supply-records', {
        supplier_id: Number(supplySupplierId),
        inventory_id: Number(supplyProductId),
        quantity: Number(supplyQuantity),
        cost_price: Number(supplyCostPrice),
        paid_amount: Number(supplyPaidAmount || 0),
        notes: supplyNotes.trim(),
        branch_id: activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1,
      });

      toast.success('تم تسجيل فاتورة التوريد وتحديث المخزون بنجاح! 📥');
      setShowSupplyModal(false);
      fetchProducts();
      fetchSuppliers();
    } catch (err) {
      toast.error(err.message || 'فشل تسجيل فاتورة التوريد');
    } finally {
      setSupplySubmitting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-[1700px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFDF9] p-4 rounded-3xl border border-[#E6DECD] shadow-[0_2px_10px_rgba(36,34,31,0.03)] no-print">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'inventory'
                ? 'bg-[#151515] text-white shadow-md'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>إدارة المخزون والمنتجات</span>
          </button>

          <button
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all ${
              activeTab === 'suppliers'
                ? 'bg-[#151515] text-white shadow-md'
                : 'text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>سجل الموردين والشركات</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            icon={Download}
            onClick={() => handleExportCSV(activeTab)}
          >
            تصدير Excel
          </Button>

          {activeTab === 'inventory' ? (
            <>
              {isAdmin && (
                <Button
                  variant="outline"
                  icon={Truck}
                  onClick={() => setShowSupplyModal(true)}
                >
                  توريدة مشتريات
                </Button>
              )}
              <Button
                variant="primary"
                icon={Plus}
                onClick={openCreateProduct}
              >
                إضافة منتج جديد
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                icon={Undo2}
                onClick={() => {
                  setReturnSupplierId(suppliers[0]?.id ? suppliers[0].id.toString() : '');
                  setShowReturnModal(true);
                }}
              >
                مرتجع لمورد
              </Button>
              <Button
                variant="primary"
                icon={Plus}
                onClick={openCreateSupplier}
              >
                إضافة مورد جديد
              </Button>
            </>
          )}
        </div>
      </div>

      {/* TAB 1: INVENTORY MANAGEMENT */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          {/* Pending Transfer Requests Banner */}
          {incomingRequests.length > 0 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-amber-900 font-black">
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                  <span>طلبات نقل بضاعة واردة من فروع أخرى ({incomingRequests.length})</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-amber-100/70 font-black text-amber-900">
                    <tr>
                      <th className="p-2.5">رقم الطلب</th>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5">الفرع الطالب</th>
                      <th className="p-2.5">الكمية</th>
                      <th className="p-2.5">التاريخ</th>
                      <th className="p-2.5 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200/50 font-bold">
                    {incomingRequests.map((req) => (
                      <tr key={req.id}>
                        <td className="p-2.5">#{req.id}</td>
                        <td className="p-2.5">{req.product_name || req.inventory_name}</td>
                        <td className="p-2.5">{req.from_branch_name || req.target_branch_name}</td>
                        <td className="p-2.5 font-mono text-sm">{req.quantity}</td>
                        <td className="p-2.5" dir="ltr">{new Date(req.created_at).toLocaleDateString('ar-EG')}</td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleApproveRequest(req.id)}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-xs"
                            >
                              موافقة وإرسال
                            </button>
                            <button
                              onClick={() => handleRejectRequest(req.id)}
                              className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg font-black text-xs"
                            >
                              رفض
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Card>
            <CardHeader
              title="قائمة أصناف المخزون"
              subtitle={`إجمالي الأصناف: ${Number(inventoryPagination.total || products.length).toLocaleString()} صنف${
                inventoryPagination.totalPages > 1 && inventoryPagination.limit !== 'all'
                  ? ` (صفحة ${inventoryPagination.page} من ${inventoryPagination.totalPages})`
                  : ''
              }`}
              action={
                <div className="flex items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266] pointer-events-none" />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      placeholder="ابحث بالاسم، الكود، الباركود..."
                      className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-8 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-all"
                    />
                    {productSearch.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setProductSearch('');
                          setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777266] hover:text-[#24221F] cursor-pointer"
                        title="مسح البحث"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Button variant="outline" onClick={fetchProducts} icon={RotateCcw}>
                    تحديث
                  </Button>
                </div>
              }
            />

            {/* Inventory Filter Bar */}
            <div className="border-b border-[#E6DECD] bg-[#FAF6ED]/70 p-4 space-y-3">
              {/* Row 1: Horizontal Quick Category Pills with Real Counts */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                {categoriesList.map((cat) => {
                  const isSelected = selectedCategory === cat;
                  const count = categoryCounts[cat];
                  const displayName = CATEGORY_DISPLAY_MAP[cat] || cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        isSelected
                          ? 'bg-[#151515] text-white shadow-sm ring-2 ring-[#151515]/20'
                          : 'bg-[#FFFDF9] text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F] border border-[#E6DECD]'
                      }`}
                    >
                      <span>{cat === 'الكل' ? 'كل الأصناف' : displayName}</span>
                      {typeof count === 'number' && (
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                            isSelected ? 'bg-white/20 text-white' : 'bg-[#FAF6ED] text-[#777266] border border-[#E6DECD]/70'
                          }`}
                        >
                          {count.toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Row 2: Filter Selectors Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 items-center">
                {/* Category Dropdown */}
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => {
                      setSelectedCategory(e.target.value);
                      setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className="w-full h-10 pr-9 pl-8 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] focus:outline-none focus:border-[#151515] transition-all appearance-none cursor-pointer text-right"
                    aria-label="التصنيف / الفئة"
                  >
                    {categoriesList.map((cat) => {
                      const count = categoryCounts[cat];
                      const label = CATEGORY_DISPLAY_MAP[cat] || cat;
                      return (
                        <option key={cat} value={cat}>
                          {label}{typeof count === 'number' ? ` (${count.toLocaleString()})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <Tag className="w-4 h-4 text-[#151515] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-4 h-4 text-[#777266] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Stock Status Dropdown */}
                <div className="relative">
                  <select
                    value={stockStatusFilter}
                    onChange={(e) => {
                      setStockStatusFilter(e.target.value);
                      setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className="w-full h-10 pr-9 pl-8 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] focus:outline-none focus:border-[#151515] transition-all appearance-none cursor-pointer text-right"
                    aria-label="حالة المخزون"
                  >
                    <option value="all">كل حالات التوفر</option>
                    <option value="in_stock">متوفر بالمخزن (&gt; 0)</option>
                    <option value="in_stock_safe">متوفر بوفرة (&gt; حد الأمان)</option>
                    <option value="all_low">كل النواقص والمنتهي (≤ حد الأمان)</option>
                    <option value="low_stock">نواقص وشيكة (1 إلى حد الأمان)</option>
                    <option value="out_of_stock">منتهي تماماً من المخزن (0)</option>
                    <option value="broken_sizes">أصناف بها مقاسات نافدة (0 قطعة)</option>
                  </select>
                  <Package className="w-4 h-4 text-indigo-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Branch Scope Dropdown (Admin only) */}
                {isAdmin && Array.isArray(branches) && branches.length > 0 && (
                  <div className="relative">
                    <select
                      value={inventoryBranchFilter}
                      onChange={(e) => {
                        setInventoryBranchFilter(e.target.value);
                        setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className="w-full h-10 pr-9 pl-8 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all appearance-none cursor-pointer text-right"
                      aria-label="نطاق الرصيد"
                    >
                      <option value="all">كل الفروع والمخازن (الإجمالي)</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <Building2 className="w-4 h-4 text-indigo-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}

                {/* Supplier Filter Dropdown (Admin only) */}
                {isAdmin && suppliers.length > 0 && (
                  <div className="relative">
                    <select
                      value={supplierFilter}
                      onChange={(e) => {
                        setSupplierFilter(e.target.value);
                        setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className="w-full h-10 pr-9 pl-8 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all appearance-none cursor-pointer text-right"
                      aria-label="المورد"
                    >
                      <option value="all">كل الموردين</option>
                      <option value="none">أصناف بدون مورد محدد</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <Users className="w-4 h-4 text-indigo-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}

                {/* Sort Order Dropdown */}
                <div className="relative">
                  <select
                    value={sortOrder}
                    onChange={(e) => {
                      setSortOrder(e.target.value);
                      setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className="w-full h-10 pr-9 pl-8 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all appearance-none cursor-pointer text-right"
                    aria-label="الترتيب"
                  >
                    <option value="latest">الأحدث إضافة</option>
                    <option value="price_asc">سعر البيع: من الأقل للأعلى</option>
                    <option value="price_desc">سعر البيع: من الأعلى للأقل</option>
                    <option value="stock_desc">الكمية: الأكثر توفراً</option>
                    <option value="stock_asc">الكمية: الأقل توفراً</option>
                    <option value="name_asc">الاسم (أ - ي)</option>
                  </select>
                  <ArrowUpDown className="w-4 h-4 text-indigo-600 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Active Filter Badges & Reset Filters Row */}
              {hasActiveFilters && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60 animate-fade-in">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">الفلاتر المطبقة:</span>
                    {selectedCategory !== 'الكل' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <span>الفئة: {CATEGORY_DISPLAY_MAP[selectedCategory] || selectedCategory}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategory('الكل');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-indigo-900 cursor-pointer"
                          title="إلغاء فلتر الفئة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {stockStatusFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-amber-50 text-amber-700 border border-amber-200">
                        <span>
                          الحالة: {
                            stockStatusFilter === 'in_stock'
                              ? 'متوفر بالمخزن'
                              : stockStatusFilter === 'in_stock_safe'
                              ? 'متوفر بوفرة'
                              : stockStatusFilter === 'all_low'
                              ? 'كل النواقص والمنتهي'
                              : stockStatusFilter === 'low_stock'
                              ? 'نواقص وشيكة'
                              : stockStatusFilter === 'broken_sizes'
                              ? 'مقاسات نافدة'
                              : 'منتهي تماماً'
                          }
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setStockStatusFilter('all');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-amber-900 cursor-pointer"
                          title="إلغاء فلتر الحالة"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {inventoryBranchFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span>
                          الفرع: {branches.find((b) => String(b.id) === String(inventoryBranchFilter))?.name || inventoryBranchFilter}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setInventoryBranchFilter('all');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-emerald-900 cursor-pointer"
                          title="إلغاء فلتر الفرع"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {supplierFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">
                        <span>
                          المورد: {supplierFilter === 'none' ? 'بدون مورد' : suppliers.find((s) => String(s.id) === String(supplierFilter))?.name || supplierFilter}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSupplierFilter('all');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-purple-900 cursor-pointer"
                          title="إلغاء فلتر المورد"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {sortOrder !== 'latest' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                        <span>
                          الترتيب: {
                            sortOrder === 'price_asc'
                              ? 'سعر البيع: الأقل للأعلى'
                              : sortOrder === 'price_desc'
                              ? 'سعر البيع: الأعلى للأقل'
                              : sortOrder === 'stock_desc'
                              ? 'الأكثر توفراً'
                              : sortOrder === 'stock_asc'
                              ? 'الأقل توفراً'
                              : sortOrder === 'name_asc'
                              ? 'الاسم (أ - ي)'
                              : sortOrder
                          }
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSortOrder('latest');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-blue-900 cursor-pointer"
                          title="إلغاء الترتيب"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                    {productSearch.trim() && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-700 border border-slate-300">
                        <span>البحث: "{productSearch.trim()}"</span>
                        <button
                          type="button"
                          onClick={() => {
                            setProductSearch('');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-slate-900 cursor-pointer"
                          title="مسح البحث"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleResetInventoryFilters}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                    title="إعادة ضبط كافة الفلاتر"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>مسح الفلاتر {activeFiltersCount > 0 ? `(${activeFiltersCount})` : ''}</span>
                  </button>
                </div>
              )}
            </div>

            {loadingProducts ? (
              <div className="py-20 text-center text-slate-400 font-bold text-sm">
                جاري تحميل منتجات المخزون...
              </div>
            ) : products.length === 0 ? (
              <div className="py-20 text-center text-slate-400 font-bold text-sm">
                لا توجد منتجات مسجلة مطابقة للبحث
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                      <th className="pb-3 pr-4">الصورة</th>
                      <th className="pb-3">الاسم والكود</th>
                      <th className="pb-3">التصنيف</th>
                      <th className="pb-3">الخصائص</th>
                      <th className="pb-3">الباركود</th>
                      <th className="pb-3">سعر البيع</th>
                      {isAdmin && <th className="pb-3">سعر التكلفة</th>}
                      {isAdmin && <th className="pb-3">المورد التابع له</th>}
                      <th className="pb-3">الرصيد</th>
                      <th className="pb-3 pl-4 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                    {products.map((p) => {
                      const stock = Number(p.stock_level ?? p.stock_quantity ?? p.stock ?? 0);
                      const minStock = Number(p.min_stock_level ?? 5);
                      const isZero = stock <= 0;
                      const isLow = stock > 0 && stock <= minStock;
                      const isSafe = stock > minStock;
                      const hasDepletedSizes = Array.isArray(p.sizes) && p.sizes.length > 0 && p.sizes.some((s) => Number(s.stock_level ?? 0) <= 0);

                      return (
                        <tr key={p.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="w-10 h-10 rounded-xl bg-[#FAF6ED] border border-[#E6DECD] overflow-hidden flex items-center justify-center">
                              {p.image_url ? (
                                <img
                                  src={p.image_url}
                                  alt={p.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <Tag className="w-4 h-4 text-[#777266]" />
                              )}
                            </div>
                          </td>
                          <td className="py-3">
                            <div className="font-bold text-[#24221F]">{p.name}</div>
                            <div className="text-[11px] font-mono text-[#777266] mt-0.5 flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-[#FAF6ED] text-[#24221F] font-bold border border-[#E6DECD]">
                                كود: #{p.id}
                              </span>
                            </div>
                          </td>
                          <td className="py-3">
                            <Badge variant="neutral">{p.category || 'عام'}</Badge>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-col gap-1.5">
                              {p.color && (
                                <div className="flex items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-md bg-[#FAF6ED] text-[#24221F] text-xs font-bold border border-[#E6DECD]">
                                    {p.color}
                                  </span>
                                </div>
                              )}
                              {Array.isArray(p.sizes) && p.sizes.length > 0 ? (
                                <div className="flex flex-wrap items-center gap-1.5 max-w-xs">
                                  {p.sizes.map((s, sIdx) => {
                                    const qty = Number(s.stock_level ?? 0);
                                    return (
                                      <span
                                        key={sIdx}
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border transition-colors ${
                                          qty > 0
                                            ? 'bg-[#FAF6ED] text-[#24221F] border-[#E6DECD]'
                                            : 'bg-rose-50/70 text-rose-600 border-rose-200'
                                        }`}
                                        title={`المقاس: ${s.size_name} | الرصيد: ${qty} قطعة`}
                                      >
                                        <span className="font-extrabold">{s.size_name}</span>
                                        <span
                                          className={`px-1.5 py-0.5 rounded text-[11px] font-black ${
                                            qty > 0 ? 'bg-[#FFFDF9] text-[#24221F] border border-[#E6DECD]' : 'bg-rose-100 text-rose-700'
                                          }`}
                                        >
                                          {qty}
                                        </span>
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                (p.size_cut || p.size) && (
                                  <span className="text-xs text-[#777266] font-bold">
                                    {p.size_cut || p.size}
                                  </span>
                                )
                              )}
                            </div>
                          </td>
                          <td className="py-3 font-mono text-xs text-[#777266]" dir="ltr">
                            {p.barcode || '-'}
                          </td>
                          <td className="py-3 font-black text-[#24221F]">
                            {Number(p.price || 0).toLocaleString()} ج.م
                          </td>
                          {isAdmin && (
                            <td className="py-3 text-slate-500 font-bold text-xs">
                              {Number(p.cost_price || 0).toLocaleString()} ج.م
                            </td>
                          )}
                          {isAdmin && (
                            <td className="py-3 text-slate-600 font-bold text-xs">
                              {p.supplier_name || '-'}
                            </td>
                          )}
                          <td className="py-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-black border inline-flex items-center gap-1 ${
                                isZero
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : isLow
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : hasDepletedSizes
                                  ? 'bg-amber-50/90 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isZero
                                ? 'منتهي (0 قطعة)'
                                : isLow
                                ? `نواقص (${stock} قطعة)`
                                : hasDepletedSizes
                                ? `متوفر (${stock} قطعة) • مقاسات نافدة`
                                : `متوفر (${stock} قطعة)`}
                            </span>
                            {Array.isArray(p.sizes) && p.sizes.length > 1 && (
                              <div className="text-[10px] text-slate-400 font-bold mt-1">
                                {p.sizes.length} مقاسات
                              </div>
                            )}
                          </td>
                          <td className="py-3 pl-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Transfer to Rental Button */}
                              <button
                                onClick={() => openRentalTransferModal(p)}
                                className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                                title="تحويل لمخزون التأجير"
                              >
                                <Sparkles className="w-4 h-4" />
                              </button>

                              {/* Duplicate Product Button */}
                              <button
                                onClick={() => openDuplicateModal(p)}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                title="تكرار المنتج (نسخ)"
                              >
                                <Copy className="w-4 h-4" />
                              </button>

                              {/* Transfer Between Branches */}
                              {branches.length > 1 && (
                                <button
                                  onClick={() => openTransferModal(p)}
                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                  title="تحويل مخزون لفرع آخر"
                                >
                                  <ArrowRightLeft className="w-4 h-4" />
                                </button>
                              )}

                              {/* Edit Button */}
                              <button
                                onClick={() => openEditProduct(p)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="تعديل المنتج"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>

                              {/* Delete Button */}
                              {isAdmin && (
                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                  title="حذف المنتج"
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

            {/* Inventory Pagination Bar */}
            {inventoryPagination.total > 0 && (
              <div className="p-4 border-t border-[#E6DECD] flex flex-col md:flex-row items-center justify-between gap-3 bg-[#FAF6ED]/60 rounded-b-3xl">
                {/* Info summary & Page size */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#777266]">
                  <span>
                    عرض{' '}
                    <span className="text-[#24221F] font-black">
                      {inventoryPagination.limit === 'all'
                        ? `1 - ${inventoryPagination.total}`
                        : `${(inventoryPagination.page - 1) * inventoryPagination.limit + 1} - ${Math.min(
                            inventoryPagination.page * inventoryPagination.limit,
                            inventoryPagination.total
                          )}`}
                    </span>{' '}
                    من إجمالي{' '}
                    <span className="text-[#24221F] font-black">
                      {Number(inventoryPagination.total).toLocaleString()}
                    </span>{' '}
                    صنف
                  </span>

                  <div className="flex items-center gap-1.5 mr-2">
                    <span className="text-[#777266]">لكل صفحة:</span>
                    {[30, 50, 100, 200, 'الكل'].map((lim) => (
                      <button
                        key={lim}
                        onClick={() => handleInventoryLimitChange(lim)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                          inventoryPagination.limit === lim || (lim === 'الكل' && inventoryPagination.limit === 'all')
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
                {inventoryPagination.totalPages > 1 && inventoryPagination.limit !== 'all' && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={inventoryPagination.page <= 1}
                      onClick={() => handleInventoryPageChange(1)}
                      title="الصفحة الأولى"
                      className="!px-2"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={inventoryPagination.page <= 1}
                      onClick={() => handleInventoryPageChange(inventoryPagination.page - 1)}
                      className="!text-xs !py-1"
                    >
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      السابق
                    </Button>

                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800">
                      صفحة {inventoryPagination.page} من {inventoryPagination.totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={inventoryPagination.page >= inventoryPagination.totalPages}
                      onClick={() => handleInventoryPageChange(inventoryPagination.page + 1)}
                      className="!text-xs !py-1"
                    >
                      التالي
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={inventoryPagination.page >= inventoryPagination.totalPages}
                      onClick={() => handleInventoryPageChange(inventoryPagination.totalPages)}
                      title="الصفحة الأخيرة"
                      className="!px-2"
                    >
                      <ChevronsLeft className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Suppliers Pagination Bar */}
            {supplierPagination.total > 0 && (
              <div className="p-4 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-50/50 rounded-b-2xl">
                {/* Info summary & Page size */}
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                  <span>
                    عرض{' '}
                    <span className="text-indigo-600 font-black">
                      {supplierPagination.limit === 'all'
                        ? `1 - ${supplierPagination.total}`
                        : `${(supplierPagination.page - 1) * supplierPagination.limit + 1} - ${Math.min(
                            supplierPagination.page * supplierPagination.limit,
                            supplierPagination.total
                          )}`}
                    </span>{' '}
                    من إجمالي{' '}
                    <span className="text-slate-900 font-black">
                      {Number(supplierPagination.total).toLocaleString()}
                    </span>{' '}
                    مورد
                  </span>

                  <div className="flex items-center gap-1.5 mr-2">
                    <span className="text-slate-400">لكل صفحة:</span>
                    {[30, 50, 100, 200, 'الكل'].map((lim) => (
                      <button
                        key={lim}
                        onClick={() => handleSupplierLimitChange(lim)}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-colors ${
                          supplierPagination.limit === lim || (lim === 'الكل' && supplierPagination.limit === 'all')
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {lim}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Navigation Controls */}
                {supplierPagination.totalPages > 1 && supplierPagination.limit !== 'all' && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={supplierPagination.page <= 1}
                      onClick={() => handleSupplierPageChange(1)}
                      title="الصفحة الأولى"
                      className="!px-2"
                    >
                      <ChevronsRight className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={supplierPagination.page <= 1}
                      onClick={() => handleSupplierPageChange(supplierPagination.page - 1)}
                      className="!text-xs !py-1"
                    >
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                      السابق
                    </Button>

                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-800">
                      صفحة {supplierPagination.page} من {supplierPagination.totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={supplierPagination.page >= supplierPagination.totalPages}
                      onClick={() => handleSupplierPageChange(supplierPagination.page + 1)}
                      className="!text-xs !py-1"
                    >
                      التالي
                      <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={supplierPagination.page >= supplierPagination.totalPages}
                      onClick={() => handleSupplierPageChange(supplierPagination.totalPages)}
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
        </div>
      )}

      {/* TAB 2: SUPPLIERS DIRECTORY */}
      {activeTab === 'suppliers' && (
        <Card>
          <CardHeader
            title="سجل الموردين والشركات"
            subtitle={`إجمالي الموردين: ${Number(supplierPagination.total || suppliers.length).toLocaleString()} مورد${
              supplierPagination.totalPages > 1 && supplierPagination.limit !== 'all'
                ? ` (صفحة ${supplierPagination.page} من ${supplierPagination.totalPages})`
                : ''
            }`}
            action={
              <div className="flex items-center gap-2">
                <div className="relative w-64">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => {
                      setSupplierSearch(e.target.value);
                      setSupplierPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    placeholder="ابحث باسم المورد أو الشركة..."
                    className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
                  />
                </div>
                <Button variant="outline" onClick={fetchSuppliers} icon={RotateCcw}>
                  تحديث
                </Button>
              </div>
            }
          />

          {loadingSuppliers ? (
            <div className="py-20 text-center text-[#777266] font-bold text-sm">
              جاري تحميل الموردين...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="py-20 text-center text-[#777266] font-bold text-sm">
              لا يوجد موردين مسجلين
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                    <th className="pb-3 pr-4">اسم المورد والكود</th>
                    <th className="pb-3">الشركة / المصنع</th>
                    <th className="pb-3">الهاتف</th>
                    <th className="pb-3">العنوان</th>
                    <th className="pb-3">إجمالي المشتريات</th>
                    <th className="pb-3">الرصيد المستحق له</th>
                    <th className="pb-3 pl-4 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                  {suppliers.map((s) => (
                    <tr key={s.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                      <td className="py-3.5 pr-4">
                        <div className="font-bold text-[#24221F]">{s.name}</div>
                        <div className="text-[10px] font-mono text-[#777266] font-bold">كود: #{s.code || s.id}</div>
                      </td>
                      <td className="py-3.5 text-[#565147] font-bold text-xs">{s.company_name || s.company || '-'}</td>
                      <td className="py-3.5 text-[#777266] font-mono text-xs" dir="ltr">
                        {s.phone || '-'}
                      </td>
                      <td className="py-3.5 text-[#777266] text-xs">{s.address || '-'}</td>
                      <td className="py-3.5 font-bold text-[#24221F]">
                        {Number(s.total_purchases || 0).toLocaleString()} ج.م
                      </td>
                      <td className="py-3.5 font-black text-rose-600">
                        {Number(s.balance || 0).toLocaleString()} ج.م
                      </td>
                      <td className="py-3.5 pl-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Statement / Ledger */}
                          <button
                            onClick={() => openStatement(s)}
                            className="p-1.5 text-[#777266] hover:text-[#151515] hover:bg-[#FAF6ED] rounded-lg transition-colors"
                            title="كشف حساب المورد"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* Pay Supplier */}
                          <button
                            onClick={() => {
                              setSelectedSupplier(s);
                              setPaymentAmount(s.balance ? s.balance.toString() : '');
                              setShowPaymentModal(true);
                            }}
                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="سداد دفعة للمورد"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>

                          {/* Purchase Return */}
                          <button
                            onClick={() => {
                              setReturnSupplierId(s.id.toString());
                              setShowReturnModal(true);
                            }}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="مرتجع مشتريات للمورد"
                          >
                            <Undo2 className="w-4 h-4" />
                          </button>

                          {/* Edit Supplier */}
                          <button
                            onClick={() => openEditSupplier(s)}
                            className="p-1.5 text-[#777266] hover:text-[#151515] hover:bg-[#FAF6ED] rounded-lg transition-colors"
                            title="تعديل بيانات المورد"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Delete Supplier */}
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteSupplier(s.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="حذف المورد"
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
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? 'تعديل بيانات المنتج ✏️' : 'إضافة منتج جديد للمخزون 📦'}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {editingProduct && (
            <div className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
              <span>كود الصنف الداخلي: #{editingProduct.id}</span>
              <span>الباركود: {editingProduct.barcode || 'غير محدد'}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. PRODUCT NAME: SEARCHABLE COMBOBOX OR NEW PRODUCT INPUT */}
            <div className="space-y-1 sm:col-span-1">
              {!isNewProductName ? (
                <div>
                  <SearchableCombobox
                    label="اسم المنتج *"
                    value={pName}
                    onChange={(val) => {
                      if (val === '__NEW_PRODUCT__') {
                        setIsNewProductName(true);
                        setPName('');
                      } else {
                        setPName(val);
                      }
                    }}
                    options={productNamesList}
                    placeholder="اختر أو ابحث عن صنف مسجل..."
                    searchPlaceholder="ابحث في أسماء الأصناف..."
                    isLoading={loadingDropdowns}
                    customOptionLabel="منتج جديد ➕"
                    customOptionValue="__NEW_PRODUCT__"
                    required
                  />
                  {pName && productNamesList.includes(pName) && (
                    <p className="text-[11px] text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg mt-1 border border-indigo-100 flex items-center gap-1 font-semibold">
                      <span>ℹ️ صنف مسجل مسبقاً (سيتم إضافة مقاس أو لون جديد له دون تعديل بقية الأصناف)</span>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">اسم المنتج الجديد *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewProductName(false);
                        setPName('');
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      اختيار من الأصناف المسجلة 📋
                    </button>
                  </div>
                  <Input
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="أدخل اسم المنتج الجديد..."
                    autoFocus
                    required
                  />
                  {pName.trim() && productNamesList.some((n) => n.trim().toLowerCase() === pName.trim().toLowerCase()) && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg mt-1 border border-amber-200 font-semibold">
                      ⚠️ تنبيه: يوجد صنف مسجل مسبقاً بهذا الاسم في قاعدة البيانات.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* SUPPLIER */}
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-bold text-slate-700">المورد التابع له</label>
              <select
                value={pSupplierId}
                onChange={(e) => setPSupplierId(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 min-h-[42px]"
              >
                {suppliers.length === 0 ? (
                  <option value="">لا يوجد موردين مسجلين</option>
                ) : (
                  suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.company ? `(${s.company})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* CATEGORY */}
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-bold text-slate-700">القسم / التصنيف</label>
              <select
                value={pCategory}
                onChange={(e) => setPCategory(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 min-h-[42px]"
              >
                {categoriesList.filter((c) => c !== 'الكل').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* 2. COLOR: DYNAMIC SEARCHABLE DROPDOWN WITH 'OTHER' OPTION */}
            <div className="space-y-2 sm:col-span-1">
              <SearchableCombobox
                label="لون عام للمنتج (اختياري)"
                value={pColor}
                onChange={(val) => {
                  setPColor(val);
                  if (val !== '__OTHER__') setPNewColor('');
                }}
                options={colorsList}
                placeholder="يُستخدم فقط كبيان عام؛ أدخل لون كل مقاس بالجدول..."
                searchPlaceholder="ابحث في الألوان المسجلة..."
                isLoading={loadingDropdowns}
                customOptionLabel="أخرى (إضافة لون جديد) ➕"
                customOptionValue="__OTHER__"
              />
              {pColor === '__OTHER__' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                  <Input
                    label="اللون الجديد *"
                    value={pNewColor}
                    onChange={(e) => setPNewColor(e.target.value)}
                    placeholder="مثال: بيج فاتح، كشمير، زيتي غامق..."
                    required
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* SELLING PRICE */}
            <Input
              label="سعر البيع (ج.م) *"
              type="number"
              value={pPrice}
              onChange={(e) => setPPrice(e.target.value)}
              required
            />

            {/* COST PRICE */}
            <Input
              label="سعر التكلفة (ج.م)"
              type="number"
              value={pCost}
              onChange={(e) => setPCost(e.target.value)}
            />

            {/* BARCODE */}
            <Input
              label="الباركود الموحد للصنف (Barcode)"
              value={pBarcode}
              onChange={(e) => setPBarcode(e.target.value)}
              placeholder="امسح أو اترك فارغاً للإنشاء التلقائي (نفس الباركود لكل المقاسات)"
            />

            {/* MIN STOCK LEVEL */}
            <Input
              label="حد التنبيه الأدنى للمخزون"
              type="number"
              value={pMinStock}
              onChange={(e) => setPMinStock(e.target.value)}
              placeholder="5"
            />

            {/* MULTI-SIZE INVENTORY MANAGER (FULL WIDTH) */}
            <div className="sm:col-span-2 bg-gradient-to-br from-slate-50 to-indigo-50/40 p-4 rounded-2xl border-2 border-indigo-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    📐
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900">
                      مقاسات المنتج ورصيد كل مقاس بالمخزن
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium">
                      لكل مقاس لون وكمية مستقلان، بينما يظل الباركود واحدًا للمنتج كله
                    </p>
                  </div>
                </div>

                {/* Live Total Stock Badge */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600">إجمالي المخزون:</span>
                  <span className="px-3 py-1 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-sm">
                    {calculatedTotalStock} قطعة
                  </span>
                </div>
              </div>

              {/* Quick Size Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-bold text-slate-500 ml-1">قوالب مقاسات سريعة:</span>
                <button
                  type="button"
                  onClick={() => applySizesPreset('suits_men')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  بدل رجالي (46-58)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('suits_slim')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  بدل سليم (48-54)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('standard')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  قمصان/كاجوال (S-3XL)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('shoes')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  أحذية (40-45)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('men_pants')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  بنطلونات رجالي (30-40)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('kids_boys')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  أطفال أولادي (2-12)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('kids_girls')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] border border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  أطفال بناتي (2-12)
                </button>
                <button
                  type="button"
                  onClick={() => applySizesPreset('single')}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-indigo-50 text-slate-700 font-bold text-[11px] border border-slate-200 transition-colors shadow-2xs cursor-pointer"
                >
                  مقاس موحد (حر)
                </button>
              </div>

              {/* Datalist for fast auto-complete of size names */}
              <datalist id="sizes-autocomplete-list">
                {sizesList.map((s, idx) => (
                  <option key={idx} value={s} />
                ))}
              </datalist>
              <datalist id="colors-autocomplete-list">
                {colorsList.map((color, idx) => (
                  <option key={idx} value={color} />
                ))}
              </datalist>

              {/* Size Rows Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <tr>
                      <th className="py-2 px-3 w-[35%]">المقاس (Size)</th>
                      <th className="py-2 px-3 w-[35%]">اللون</th>
                      <th className="py-2 px-3 w-[25%]">الكمية بالمخزن (قطعة)</th>
                      <th className="py-2 px-3 text-center w-16">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productSizes.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-2">
                          <input
                            type="text"
                            list="sizes-autocomplete-list"
                            value={row.size_name}
                            onChange={(e) => updateSizeRow(row.id, 'size_name', e.target.value)}
                            placeholder="مثال: 48، 50، L..."
                            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            list="colors-autocomplete-list"
                            value={row.color_name || ''}
                            onChange={(e) => updateSizeRow(row.id, 'color_name', e.target.value)}
                            placeholder="مثال: كحلي، أسود..."
                            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all"
                            required
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            value={row.stock_level}
                            onChange={(e) => updateSizeRow(row.id, 'stock_level', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-600 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none transition-all"
                            required
                          />
                        </td>
                        <td className="p-2 text-center">
                          {productSizes.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeSizeRow(row.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="حذف هذا المقاس"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add Size Row Button */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => addSizeRow('', '5')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs transition-colors shadow-2xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة مقاس آخر للبدلة</span>
                </button>
                <span className="text-[11px] text-slate-400 font-medium">
                  {productSizes.length} مقاسات محددة
                </span>
              </div>
            </div>
          </div>

          {/* 4. PRODUCT IMAGE: URL OR LOCAL UPLOAD */}
          <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">صورة المنتج (رابط إنترنت أو رفع من الكمبيوتر)</span>
              <span className="text-[11px] text-slate-400 font-semibold">اختياري</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
              {/* Method 1: URL */}
              <div className="space-y-1">
                <Input
                  label="طريقة 1: رابط الصورة (Image URL)"
                  value={pImage}
                  onChange={(e) => {
                    setPImage(e.target.value);
                    if (!selectedImageFile) {
                      setImagePreviewUrl(e.target.value.trim() || null);
                    }
                  }}
                  placeholder="https://example.com/image.jpg"
                  disabled={!!selectedImageFile}
                />
                {selectedImageFile && (
                  <p className="text-[10px] text-amber-700 font-bold">
                    * تم تعطيل الرابط لأنك قمت باختيار صورة محلية من الكمبيوتر
                  </p>
                )}
              </div>

              {/* Method 2: Local upload from computer */}
              <div className="space-y-1.5 flex flex-col justify-start">
                <label className="text-xs font-bold text-slate-700">طريقة 2: رفع صورة من الكمبيوتر</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageFileSelect}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={Upload}
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white border-dashed border-2 hover:border-indigo-500 hover:text-indigo-600 font-bold text-xs"
                  >
                    {selectedImageFile ? 'تغيير الصورة المحددة' : 'اختيار صورة من الجهاز 📁'}
                  </Button>
                  {selectedImageFile && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveImageFile}
                      className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-bold"
                    >
                      إلغاء الملف
                    </Button>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  الصيغ المسموحة: JPG, PNG, WEBP (بحد أقصى 10 ميجابايت)
                </p>
              </div>
            </div>

            {/* Image Preview */}
            {imagePreviewUrl && (
              <div className="flex items-center gap-3 p-2 bg-white rounded-xl border border-slate-200 animate-in fade-in duration-150">
                <img
                  src={imagePreviewUrl}
                  alt="معاينة الصورة"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0 bg-slate-50"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';
                  }}
                />
                <div className="flex-1 min-w-0 text-xs">
                  {selectedImageFile ? (
                    <>
                      <p className="font-bold text-slate-800 truncate">{selectedImageFile.name}</p>
                      <p className="text-slate-500 font-mono text-[10px]">
                        {(selectedImageFile.size / 1024).toFixed(1)} KB • {selectedImageFile.type}
                      </p>
                      <p className="text-emerald-700 font-bold text-[10px]">جاهز للرفع والتخزين بالخادم ✅</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-slate-800 truncate">معاينة رابط الصورة</p>
                      <p className="text-slate-500 text-[10px] truncate font-mono">{pImage}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={productSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              {editingProduct ? 'حفظ التعديلات' : 'إضافة المنتج'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowProductModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* TRANSFER TO RENTAL MODAL */}
      <Modal
        isOpen={showRentalTransferModal}
        onClose={() => setShowRentalTransferModal(false)}
        title="تحويل المنتج إلى مخزون التأجير ✨"
        subtitle={`الصنف: ${rentalProduct?.name} (${rentalProduct?.color || ''} ${rentalProduct?.size_cut || ''})`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleRentalTransferSubmit} className="space-y-4">
          <Input
            label="سعر التأجير لليوم/الحجز (ج.م) *"
            type="number"
            required
            value={rentalPrice}
            onChange={(e) => setRentalPrice(e.target.value)}
          />

          <Input
            label="مبلغ التأمين المطلوب (ج.م) *"
            type="number"
            required
            value={rentalDeposit}
            onChange={(e) => setRentalDeposit(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">حالة القطعة</label>
            <select
              value={rentalCondition}
              onChange={(e) => setRentalCondition(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
            >
              <option value="جديد">جديد تماماً (زيرو)</option>
              <option value="ممتاز">ممتاز</option>
              <option value="جيد جداً">جيد جداً</option>
              <option value="جيد">جيد</option>
            </select>
          </div>

          <Input
            label="ملاحظات إضافية"
            value={rentalNotes}
            onChange={(e) => setRentalNotes(e.target.value)}
            placeholder="ملاحظات حول القطعة..."
          />

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={rentalSubmitting}
              className="flex-1 !rounded-2xl"
            >
              تأكيد التحويل للتأجير
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowRentalTransferModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* DUPLICATE PRODUCT MODAL */}
      <Modal
        isOpen={showDuplicateModal}
        onClose={() => setShowDuplicateModal(false)}
        title="تكرار المنتج (نسخ بمقاس أو لون جديد) 📋"
        subtitle={`الصنف الأصلي: ${dupSourceProduct?.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleDuplicateSubmit} className="space-y-4">
          <Input
            label="اللون الجديد"
            value={dupColor}
            onChange={(e) => setDupColor(e.target.value)}
          />

          <Input
            label="المقاس الجديد"
            value={dupSize}
            onChange={(e) => setDupSize(e.target.value)}
          />

          <Input
            label="الباركود الجديد"
            value={dupBarcode}
            onChange={(e) => setDupBarcode(e.target.value)}
            placeholder="اتركه فارغاً للتوليد التلقائي"
          />

          <Input
            label="الكمية الابتدائية *"
            type="number"
            required
            value={dupStock}
            onChange={(e) => setDupStock(e.target.value)}
          />

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={dupSubmitting}
              className="flex-1 !rounded-2xl"
            >
              إنشاء النسخة
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowDuplicateModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* STOCK TRANSFER TO ANOTHER BRANCH MODAL */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="تحويل مخزون لفرع آخر 🚚"
        subtitle={`الصنف: ${transferProduct?.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">الفرع المحول إليه *</label>
            <select
              value={toBranchId}
              onChange={(e) => setToBranchId(e.target.value)}
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
            label="الكمية المحولة *"
            type="number"
            min="1"
            value={transferQty}
            onChange={(e) => setTransferQty(e.target.value)}
            required
          />

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={transferSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              تأكيد النقل
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowTransferModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* ADD / EDIT SUPPLIER MODAL */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title={editingSupplier ? 'تعديل بيانات المورد 🏭' : 'إضافة مورد جديد 🏭'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-4">
          {editingSupplier && (
            <div className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 p-2.5 rounded-xl border border-indigo-100 flex items-center justify-between">
              <span>كود المورد الداخلي: #{editingSupplier.id}</span>
              {editingSupplier.code && <span>كود المورد: {editingSupplier.code}</span>}
            </div>
          )}

          <Input
            label="اسم المورد / جهة الاتصال *"
            value={sName}
            onChange={(e) => setSName(e.target.value)}
            placeholder="مثال: أحمد محمود"
            required
          />

          <Input
            label="اسم الشركة / المصنع"
            value={sCompany}
            onChange={(e) => setSCompany(e.target.value)}
            placeholder="مثال: مصنع النور للملابس"
          />

          <Input
            label="رقم الهاتف"
            value={sPhone}
            onChange={(e) => setSPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />

          <Input
            label="العنوان"
            value={sAddress}
            onChange={(e) => setSAddress(e.target.value)}
            placeholder="العنوان أو المحافظة..."
          />

          <Input
            label="ملاحظات"
            value={sNotes}
            onChange={(e) => setSNotes(e.target.value)}
            placeholder="ملاحظات عامة حول المورد..."
          />

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={supplierSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              {editingSupplier ? 'حفظ التعديلات' : 'إضافة المورد'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowSupplierModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* SUPPLIER PAYMENT MODAL */}
      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title={`تسجيل دفعة سداد للمورد: ${selectedSupplier?.name || ''} 💵`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          <Input
            label="المبلغ المسدد (ج.م) *"
            type="number"
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            required
          />

          <Input
            label="ملاحظات السداد (رقم الشيك أو الحوالة)"
            value={paymentNotes}
            onChange={(e) => setPaymentNotes(e.target.value)}
            placeholder="نقداً، تحويل بنكي..."
          />

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={paymentSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black"
            >
              تسجيل السداد
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowPaymentModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* PURCHASE RETURN TO SUPPLIER MODAL */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="مرتجع مشتريات لمورد 🔄"
        subtitle="إرجاع بضاعة لمورد وتخفيض رصيده المسجل"
        maxWidth="max-w-md"
      >
        <form onSubmit={handlePurchaseReturnSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">المورد *</label>
            <select
              value={returnSupplierId}
              onChange={(e) => setReturnSupplierId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} ({s.company || 'مورد'})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="اسم الصنف المرتجع *"
            required
            value={returnProductName}
            onChange={(e) => setReturnProductName(e.target.value)}
            placeholder="اسم الصنف المرتجع..."
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="الكمية المرتجعة *"
              type="number"
              min="1"
              required
              value={returnQuantity}
              onChange={(e) => setReturnQuantity(e.target.value)}
            />

            <Input
              label="سعر التكلفة للقطعة (ج.م) *"
              type="number"
              required
              value={returnUnitPrice}
              onChange={(e) => setReturnUnitPrice(e.target.value)}
            />
          </div>

          <Input
            label="ملاحظات وسبب الإرجاع"
            value={returnNotes}
            onChange={(e) => setReturnNotes(e.target.value)}
            placeholder="تلف، عيب صناعة، غير مطابق..."
          />

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={returnSubmitting}
              className="flex-1 !rounded-2xl !bg-rose-600 hover:!bg-rose-700 text-white"
            >
              تأكيد المرتجع للمورد
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

      {/* SUPPLY BATCH / RESTOCK MODAL */}
      <Modal
        isOpen={showSupplyModal}
        onClose={() => setShowSupplyModal(false)}
        title="تسجيل توريدة مشتريات جديدة 📥"
        subtitle="إضافة شحنة منتجات من مورد مع حساب التكاليف والرصيد"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSupplySubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">المورد *</label>
            <select
              value={supplySupplierId}
              onChange={(e) => setSupplySupplierId(e.target.value)}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              <option value="">اختر المورد...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id.toString()}>
                  {s.name} ({s.company || 'مورد'})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">المنتج المراد تزويده *</label>
              {loadingSupplyProducts && (
                <span className="text-[11px] text-indigo-600 font-bold animate-pulse">جاري تحميل الأصناف...</span>
              )}
            </div>
            <input
              type="text"
              value={supplyProductSearch}
              onChange={(e) => setSupplyProductSearch(e.target.value)}
              placeholder="تصفية سريعة بالاسم، الباركود أو الكود..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold outline-none focus:border-indigo-600"
            />
            <select
              value={supplyProductId}
              onChange={(e) => {
                setSupplyProductId(e.target.value);
                const list = supplyProductsList.length > 0 ? supplyProductsList : products;
                const found = list.find((p) => p.id.toString() === e.target.value);
                if (found && found.cost_price) {
                  setSupplyCostPrice(found.cost_price.toString());
                }
              }}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              required
            >
              <option value="">اختر الصنف من المخزون ({activeSupplyProducts.length} صنف متاح)...</option>
              {activeSupplyProducts.map((p) => (
                <option key={p.id} value={p.id.toString()}>
                  #{p.id} - {p.name} {p.category ? `(${p.category})` : ''} {p.color ? `(${p.color})` : ''} {p.size_cut ? `[${p.size_cut}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="الكمية الموردة *"
              type="number"
              min="1"
              required
              value={supplyQuantity}
              onChange={(e) => setSupplyQuantity(e.target.value)}
            />

            <Input
              label="سعر التكلفة للقطعة (ج.م) *"
              type="number"
              required
              value={supplyCostPrice}
              onChange={(e) => setSupplyCostPrice(e.target.value)}
            />
          </div>

          <Input
            label="المبلغ المسدد نقداً الآن من الفاتورة (ج.م)"
            type="number"
            value={supplyPaidAmount}
            onChange={(e) => setSupplyPaidAmount(e.target.value)}
          />

          <Input
            label="ملاحظات"
            value={supplyNotes}
            onChange={(e) => setSupplyNotes(e.target.value)}
            placeholder="رقم الفاتورة الورقية أو الشحنة..."
          />

          <div className="flex items-center gap-2 pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={supplySubmitting}
              className="flex-1 !rounded-2xl"
            >
              تسجيل التوريدة وإضافة المخزون
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowSupplyModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* SUPPLIER STATEMENT MODAL (WITH PRINTING) */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={`كشف حساب المورد: ${selectedSupplier?.name || ''}`}
        subtitle={`الرصيد المستحق له: ${Number(selectedSupplier?.balance || 0).toLocaleString()} ج.م`}
        maxWidth="max-w-3xl"
      >
        {loadingStatement ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل كشف الحساب...
          </div>
        ) : (
          <div className="space-y-4" id="supplier-statement-area">
            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div>
                <span className="text-xs text-slate-500 font-bold block">إجمالي التوريدات</span>
                <span className="text-lg font-black text-slate-900">
                  {Number(selectedSupplier?.total_purchases || 0).toLocaleString()} ج.م
                </span>
              </div>
              <div>
                <span className="text-xs text-slate-500 font-bold block">المتبقي له في ذمة المتجر</span>
                <span className="text-lg font-black text-rose-600">
                  {Number(selectedSupplier?.balance || 0).toLocaleString()} ج.م
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  icon={Printer}
                  onClick={() => printElement('supplier-statement-area', `كشف حساب المورد: ${selectedSupplier?.name || ''}`)}
                >
                  طباعة الكشف
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setPaymentAmount(selectedSupplier?.balance ? selectedSupplier.balance.toString() : '');
                    setShowPaymentModal(true);
                  }}
                >
                  سداد دفعة
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-500">
                  <tr>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3">المبلغ</th>
                    <th className="p-3">ملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {statementData?.transactions && statementData.transactions.length > 0 ? (
                    statementData.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="p-3" dir="ltr">
                          {new Date(t.created_at || t.date).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              t.type === 'supply'
                                ? 'info'
                                : t.type === 'return'
                                ? 'danger'
                                : 'success'
                            }
                          >
                            {t.type === 'supply'
                              ? 'فاتورة توريد'
                              : t.type === 'return'
                              ? 'مرتجع مشتريات'
                              : 'سداد دفعة'}
                          </Badge>
                        </td>
                        <td className="p-3 font-black">
                          {Number(t.amount || 0).toLocaleString()} ج.م
                        </td>
                        <td className="p-3 text-slate-500">{t.notes || '-'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                        لا توجد حركات مسجلة
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Suppliers;
