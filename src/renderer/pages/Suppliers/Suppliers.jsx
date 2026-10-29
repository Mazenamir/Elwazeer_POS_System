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
import ProductBarcodePrintModal from '../../components/modals/ProductBarcodePrintModal';
import MatrixVariantGenerator, { generate12DigitBarcode } from '../../components/forms/MatrixVariantGenerator';
import BranchStockMatrix from './BranchStockMatrix';
import BranchTransferLogs from './BranchTransferLogs';

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

const getCairoDateString = (dateVal) => {
  try {
    if (!dateVal) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    }
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
      return dateVal.trim();
    }
    const normalized = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal.trim())
      ? `${dateVal.trim().replace(' ', 'T')}Z`
      : dateVal;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

const formatSupplierDate = (dateVal) => {
  if (!dateVal) return '-';
  try {
    if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
      const [y, m, day] = dateVal.trim().split('-');
      return `${day}/${m}/${y}`;
    }
    const normalized = typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(dateVal.trim())
      ? `${dateVal.trim().replace(' ', 'T')}Z`
      : dateVal;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(dateVal).slice(0, 10);
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return String(dateVal).slice(0, 10);
  }
};

const getPaginationItems = (current, total) => {
  if (!total || total <= 1) return [];
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
};

export function Suppliers() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches, selectBranch } = useBranch();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const getValidTab = (tab) => {
    if (tab === 'suppliers') return 'suppliers';
    if (tab === 'branch_matrix') return 'branch_matrix';
    if (tab === 'transfer_logs' || tab === 'transfers') return 'transfer_logs';
    return 'inventory';
  };
  const initialTab = getValidTab(searchParams.get('tab'));
  const initialSearch = searchParams.get('search') || '';

  const [activeTab, setActiveTab] = useState(initialTab); // 'inventory' | 'suppliers' | 'branch_matrix' | 'transfer_logs'

  // INVENTORY STATE
  const [products, setProducts] = useState([]);
  const [categoriesList, setCategoriesList] = useState(['الكل']);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState(initialTab === 'inventory' ? initialSearch : '');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [stockStatusFilter, setStockStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('latest');
  const [supplierFilter, setSupplierFilter] = useState('all');
  const [inventoryGenderFilter, setInventoryGenderFilter] = useState('all'); // 'all' | 'men' | 'women'
  const [inventoryBranchFilter, setInventoryBranchFilter] = useState(() => (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all'));
  const [inventoryPagination, setInventoryPagination] = useState({
    page: 1,
    limit: 100,
total: 0,
    totalPages: 1,
  });

  // Sync inventoryBranchFilter with active branch selected in Header
  useEffect(() => {
    if (activeBranchId) {
      setInventoryBranchFilter(activeBranchId);
      setInventoryPagination((prev) => ({ ...prev, page: 1 }));
    }
  }, [activeBranchId]);

  const defaultBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all';

  const hasActiveFilters = useMemo(() => {
    return (
      selectedCategory !== 'الكل' ||
      stockStatusFilter !== 'all' ||
      supplierFilter !== 'all' ||
      inventoryBranchFilter !== defaultBranch ||
      inventoryGenderFilter !== 'all' ||
      sortOrder !== 'latest' ||
      productSearch.trim().length > 0
    );
  }, [selectedCategory, stockStatusFilter, supplierFilter, inventoryBranchFilter, inventoryGenderFilter, sortOrder, productSearch, defaultBranch]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (selectedCategory !== 'الكل') count++;
    if (stockStatusFilter !== 'all') count++;
    if (supplierFilter !== 'all') count++;
    if (inventoryBranchFilter !== defaultBranch) count++;
    if (inventoryGenderFilter !== 'all') count++;
    if (sortOrder !== 'latest') count++;
    if (productSearch.trim().length > 0) count++;
    return count;
  }, [selectedCategory, stockStatusFilter, supplierFilter, inventoryBranchFilter, inventoryGenderFilter, sortOrder, productSearch, defaultBranch]);

  const handleResetInventoryFilters = () => {
    setSelectedCategory('الكل');
    setStockStatusFilter('all');
    setSupplierFilter('all');
    setInventoryGenderFilter('all');
    setInventoryBranchFilter(defaultBranch);
    setSortOrder('latest');
    setProductSearch('');
    setInventoryPagination((prev) => ({ ...prev, page: 1 }));
  };

  // Load Metadata categories and real counts for active branch
  const fetchMetadata = useCallback(async (branchId) => {
    try {
      const branchParam = branchId && branchId !== 'all' ? `?branch_id=${branchId}` : '';
      const meta = await api.get(`/inventory/metadata${branchParam}`);
      const counts = meta?.categoryCounts || {};
      setCategoryCounts(counts);

      // Extract active categories strictly with count > 0
      const activeCats = (meta?.categories || []).filter((c) => {
        if (!c || c === 'الكل') return false;
        const count = counts[c] ?? counts[CATEGORY_DISPLAY_MAP[c]];
        return typeof count === 'number' ? count > 0 : true;
      });

      // Also pick up any categories present in counts > 0
      const countCats = Object.keys(counts).filter((cat) => {
        if (!cat || cat === 'الكل' || cat === 'all' || cat === 'كل التصنيفات' || cat === 'كل الأصناف') return false;
        if (cat === 'بدل (جميع الأنواع)' || cat === 'بدل (جميع الانواع)' || cat === 'بدون تصنيف' || cat === 'بدون تصنيف / أخرى') return false;
        if (cat === 'بدل رسمية' || cat === 'بدل سموكن' || cat === 'بدل عادية' || cat === 'بدل كاجوال' || cat === 'أطفال' || cat === 'محافظ') return false;
        return typeof counts[cat] === 'number' && counts[cat] > 0;
      });

      const allActive = Array.from(new Set([...activeCats, ...countCats]));
      const hasSuits = (counts['بدل'] || 0) > 0 || allActive.some((c) => c.toLowerCase().includes('suit') || c.includes('بدل'));
      const nonSuits = allActive.filter((c) => c !== 'بدل');

      const ordered = ['الكل'];
      if (hasSuits) {
        ordered.push('بدل');
      }
      ordered.push(...nonSuits);

      setCategoriesList(ordered);

      // Auto-fallback if currently selected category has 0 items or no longer exists
      setSelectedCategory((prev) => {
        if (prev === 'الكل') return prev;
        const c = counts[prev] ?? counts[CATEGORY_DISPLAY_MAP[prev]];
        if (typeof c === 'number' && c > 0) return prev;
        return 'الكل';
      });
    } catch {}
  }, []);

  useEffect(() => {
    const branchToUse = isAdmin ? inventoryBranchFilter : activeBranchId;
    fetchMetadata(branchToUse);
  }, [fetchMetadata, isAdmin, inventoryBranchFilter, activeBranchId]);

  // Add / Edit Product Modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productSubmitting, setProductSubmitting] = useState(false);

  // Barcode Print Modal State
  const [showBarcodePrintModal, setShowBarcodePrintModal] = useState(false);
  const [selectedProductForBarcode, setSelectedProductForBarcode] = useState(null);
  const [isBarcodeNewlyCreated, setIsBarcodeNewlyCreated] = useState(false);
  const [pName, setPName] = useState('');
  const [productGender, setProductGender] = useState('men'); // 'men' (رجالي) | 'women' (حريمي)
  const [isNewProductName, setIsNewProductName] = useState(false);
  const [pCategory, setPCategory] = useState('بدل');
  const [pNewCategory, setPNewCategory] = useState('');
  const [isNewCategory, setIsNewCategory] = useState(false);
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


  // Stock Transfer Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferProduct, setTransferProduct] = useState(null);
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [transferQty, setTransferQty] = useState('1');
  const [transferDirect, setTransferDirect] = useState(true);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferLoadingDetails, setTransferLoadingDetails] = useState(false);
  const [transferBranchStock, setTransferBranchStock] = useState(0);
  const [transferSizes, setTransferSizes] = useState([]);
  const [transferVariantQtys, setTransferVariantQtys] = useState({});

  // Incoming Shipments (Pending receiving)
  const [incomingShipments, setIncomingShipments] = useState([]);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [receivingTransferId, setReceivingTransferId] = useState(null);

  // Transfer to Rental Modal
  const [showRentalTransferModal, setShowRentalTransferModal] = useState(false);
  const [rentalProduct, setRentalProduct] = useState(null);
  const [rentalQuantity, setRentalQuantity] = useState('1');
  const [rentalFromBranch, setRentalFromBranch] = useState('');
  const [rentalToBranch, setRentalToBranch] = useState('');
  const [rentalPrice, setRentalPrice] = useState('');
  const [rentalDeposit, setRentalDeposit] = useState('');
  const [rentalCondition, setRentalCondition] = useState('ممتاز');
  const [rentalNotes, setRentalNotes] = useState('');
  const [rentalSubmitting, setRentalSubmitting] = useState(false);
  const [rentalTransferMode, setRentalTransferMode] = useState('full_suit');
  const [rentalSelectedSize, setRentalSelectedSize] = useState('');
  const [rentalPartType, setRentalPartType] = useState('بدلة كاملة');
  const [rentalProductSizes, setRentalProductSizes] = useState([]);

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
  const [supplierSort, setSupplierSort] = useState('latest');
  const [supplierCategoryFilter, setSupplierCategoryFilter] = useState('all'); // 'all' | 'رجالي' | 'حريمي' | 'كلاهما'
  const [supplierStats, setSupplierStats] = useState({ totalBalance: 0, menBalance: 0, womenBalance: 0, bothBalance: 0 });
  const [exportingExcel, setExportingExcel] = useState(false);
  const [supplierPagination, setSupplierPagination] = useState({
    page: 1,
    limit: 100,
total: 0,
    totalPages: 1,
  });
  const lastFetchedSupplierQueryRef = useRef('');

  // Sync when searchParams change from header navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const searchParam = searchParams.get('search');
    if (tabParam === 'suppliers') {
      setActiveTab('suppliers');
      if (searchParam !== null && searchParam !== undefined) {
        setSupplierSearch(searchParam);
      }
    } else if (tabParam === 'branch_matrix') {
      setActiveTab('branch_matrix');
    } else if (tabParam === 'transfer_logs' || tabParam === 'transfers') {
      setActiveTab('transfer_logs');
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
  const [sGenderCategory, setSGenderCategory] = useState('رجالي'); // 'رجالي' | 'حريمي' | 'كلاهما'
  const [sCreatedAt, setSCreatedAt] = useState(() => getCairoDateString());

  // Supplier Statement Modal
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [statementData, setStatementData] = useState(null);
  const [loadingStatement, setLoadingStatement] = useState(false);

  // Supplier Payment Transaction Modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paidFromDrawer, setPaidFromDrawer] = useState(true);
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
  const [supplyProductGenderFilter, setSupplyProductGenderFilter] = useState('all'); // 'all' | 'men' | 'women'

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
    let base = supplyProductsList.length > 0 ? supplyProductsList : products;

    // Filter by selected supplier if specified
    if (supplySupplierId) {
      const sId = Number(supplySupplierId);
      const supplierMatches = base.filter(
        (p) => Number(p.preferred_supplier_id || p.supplier_id) === sId
      );
      if (supplierMatches.length > 0) {
        base = supplierMatches;
      }
    }

    // Filter by goods department (gender) if selected
    if (supplyProductGenderFilter && supplyProductGenderFilter !== 'all') {
      base = base.filter((p) => {
        if (supplyProductGenderFilter === 'men') {
          return p.gender === 'men' || p.gender === 'رجالي';
        }
        if (supplyProductGenderFilter === 'women') {
          return p.gender === 'women' || p.gender === 'حريمي';
        }
        return true;
      });
    }

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
  }, [supplyProductsList, products, supplySupplierId, supplyProductGenderFilter, supplyProductSearch]);

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
      if (inventoryGenderFilter !== 'all') query.append('gender', inventoryGenderFilter);

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
  }, [isAdmin, inventoryBranchFilter, activeBranchId, productSearch, selectedCategory, stockStatusFilter, sortOrder, supplierFilter, inventoryGenderFilter, inventoryPagination.page, inventoryPagination.limit]);

  // Load Suppliers
  const fetchSuppliers = useCallback(async (overrides) => {
    try {
      setLoadingSuppliers(true);
      const isPlainObj = overrides && typeof overrides === 'object' && !('nativeEvent' in overrides) && !('preventDefault' in overrides);
      const opts = isPlainObj ? overrides : {};
      const activeSearch = opts.search !== undefined ? opts.search : supplierSearch;
      const activeSort = opts.sort !== undefined ? opts.sort : supplierSort;
      const activeGenderCategory = opts.gender_category !== undefined ? opts.gender_category : supplierCategoryFilter;
      const activePage = opts.page !== undefined ? opts.page : supplierPagination.page;
      const activeLimit = opts.limit !== undefined ? opts.limit : supplierPagination.limit;

      const query = new URLSearchParams();
      if (activeSearch && activeSearch.trim()) query.append('search', activeSearch.trim());
      if (activeSort) query.append('sort', activeSort);
      if (activeGenderCategory && activeGenderCategory !== 'all') query.append('gender_category', activeGenderCategory);

      if (activeLimit === 'all') {
        query.append('all', 'true');
      } else {
        query.append('page', activePage.toString());
        query.append('limit', activeLimit.toString());
      }

      const queryString = query.toString();
      if (!opts.force && queryString === lastFetchedSupplierQueryRef.current) {
        setLoadingSuppliers(false);
        return;
      }
      lastFetchedSupplierQueryRef.current = queryString;

      const data = await api.get(`/suppliers?${queryString}`);
      const list = Array.isArray(data) ? data : (data?.suppliers || data?.data || data?.items || []);
      setSuppliers(list);

      if (data?.total_balance !== undefined) {
        setSupplierStats({
          totalBalance: Number(data.total_balance || 0),
          menBalance: Number(data.total_men_balance || 0),
          womenBalance: Number(data.total_women_balance || 0),
          bothBalance: Number(data.total_both_balance || 0),
        });
      }

      if (data?.pagination) {
        setSupplierPagination((prev) => ({
          ...prev,
          page: activePage,
          limit: activeLimit,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setSupplierPagination((prev) => ({
          ...prev,
          page: activePage,
          limit: activeLimit,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (activeLimit === 'all' ? data.total || 1 : activeLimit))),
        }));
      } else {
        setSupplierPagination((prev) => ({
          ...prev,
          page: activePage,
          limit: activeLimit,
          total: list.length,
          totalPages: 1,
        }));
      }
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoadingSuppliers(false);
    }
  }, [supplierSearch, supplierSort, supplierCategoryFilter, supplierPagination.page, supplierPagination.limit]);

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

  // Load Incoming Shipments pending confirmation
  const fetchIncomingShipments = useCallback(async () => {
    try {
      setLoadingShipments(true);
      const branchParam = activeBranchId && activeBranchId !== 'all' ? `?branch_id=${activeBranchId}` : '';
      const data = await api.get(`/inventory/transfers/incoming${branchParam}`).catch(() => []);
      setIncomingShipments(Array.isArray(data) ? data : []);
    } catch {
      setIncomingShipments([]);
    } finally {
      setLoadingShipments(false);
    }
  }, [activeBranchId]);

  // Handle Receive Shipment
  const handleReceiveShipment = async (transferId) => {
    try {
      setReceivingTransferId(transferId);
      await api.post(`/inventory/transfers/${transferId}/receive`);
      toast.success('تم تأكيد استلام الشحنة وإضافتها لمخزون ومقاسات الفرع بنجاح! 📦✅');
      fetchIncomingShipments();
      fetchProducts();
    } catch (err) {
      toast.error(err.message || 'فشل تأكيد استلام الشحنة');
    } finally {
      setReceivingTransferId(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'inventory') {
      const timer = setTimeout(() => {
        fetchProducts();
        fetchRequests();
        fetchIncomingShipments();
      }, 200);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        lastFetchedSupplierQueryRef.current = '';
        fetchSuppliers({ force: true });
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [activeTab, fetchProducts, fetchSuppliers, fetchRequests, fetchIncomingShipments]);

  // Ensure suppliers list is loaded once on initial mount for dropdowns across tabs
  useEffect(() => {
    fetchSuppliers();
  }, []);

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
    fetchSuppliers({ page: pageNum, force: true });
  };

  const handleSupplierLimitChange = (newLimit) => {
    const lim = newLimit === 'all' ? 'all' : Number(newLimit);
    setSupplierPagination((prev) => ({
      ...prev,
      limit: lim,
      page: 1,
    }));
    fetchSuppliers({ page: 1, limit: lim, force: true });
  };

  // Open Create Product Modal
  const openCreateProduct = () => {
    setEditingProduct(null);
    setPName('');
    setProductGender('men');
    setIsNewProductName(false);
    const defaultCat = categoriesList.find((c) => c !== 'الكل') || '';
    setPCategory(defaultCat);
    setPNewCategory('');
    setIsNewCategory(!defaultCat);
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
    setProductSizes([]);
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
    setProductGender(p.gender === 'women' || p.gender === 'حريمي' ? 'women' : 'men');
    setIsNewProductName(false);
    const prodCat = (p.category || '').trim();
    if (prodCat) {
      setPCategory(prodCat);
      if (!categoriesList.includes(prodCat)) {
        setCategoriesList((prev) => [...prev, prodCat]);
      }
    } else {
      setPCategory(categoriesList.find((c) => c !== 'الكل') || '');
    }
    setPNewCategory('');
    setIsNewCategory(false);
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
          barcode: s.barcode || '',
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

    if (pBarcode && pBarcode.trim()) {
      const cleanBarcode = pBarcode.trim().toLowerCase();
      const duplicateProduct = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === cleanBarcode && p.id !== editingProduct?.id
      );
      if (duplicateProduct) {
        toast.error(`الباركود "${pBarcode.trim()}" موجود قبل كده ومسجل للمنتج (${duplicateProduct.name})، لا يمكن تكرار الباركود منعاً لتشابه وتكرار القطع!`);
        return;
      }
    }

    const cleanedSizes = productSizes
      .filter((s) => s.size_name && s.size_name.trim())
      .map((s) => ({
        size_name: s.size_name.trim(),
        color_name: String(s.color_name || '').trim(),
        stock_level: Math.max(0, Number(s.stock_level) || 0),
        barcode: String(s.barcode || '').trim() || generate12DigitBarcode(),
      }));

    if (cleanedSizes.length === 0) {
      toast.error('يرجى تحديد مقاس واحد على الأقل مع إدخال الكمية');
      return;
    }

    if (cleanedSizes.some((s) => !s.color_name)) {
      toast.error('يرجى تحديد لون لكل مقاس');
      return;
    }

    // Prevent the same size + color from being entered twice: the backend keeps one row per
    // (size, color) and a duplicated row would make the total disagree with the size rows.
    const seenSizeColor = new Set();
    const duplicateSizeColors = [];
    for (const s of cleanedSizes) {
      const key = `${s.size_name.trim().toLowerCase()}|${s.color_name.trim().toLowerCase()}`;
      if (seenSizeColor.has(key)) {
        duplicateSizeColors.push(`${s.size_name} / ${s.color_name}`);
      } else {
        seenSizeColor.add(key);
      }
    }
    if (duplicateSizeColors.length > 0) {
      toast.error(`المقاس مكرر بنفس اللون: ${[...new Set(duplicateSizeColors)].join('، ')} — اجمع الكمية في سطر واحد`);
      return;
    }

    const finalStock = cleanedSizes.reduce((sum, s) => sum + s.stock_level, 0);
    const finalSizeCut = cleanedSizes.map((s) => s.size_name).join(', ');

    setProductSubmitting(true);
    try {
      const selectedSupId = Number(pSupplierId) || suppliers[0]?.id || 1;
      const targetBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : branches[0]?.id || 1;
      const finalColor = (pColor === '__OTHER__' ? pNewColor.trim() : pColor.trim()) || cleanedSizes[0].color_name;
      const finalMinStock = (pMinStock === '' || pMinStock === null || isNaN(Number(pMinStock))) ? 5 : Math.max(0, Number(pMinStock));
      const finalGender = productGender || 'men';
      const finalCategory = (isNewCategory || pCategory === '__NEW_CATEGORY__' || pCategory === '__OTHER__'
        ? pNewCategory.trim()
        : pCategory.trim()) || 'عام';

      if ((isNewCategory || pCategory === '__NEW_CATEGORY__' || pCategory === '__OTHER__') && !pNewCategory.trim()) {
        toast.error('يرجى إدخال اسم القسم أو التصنيف الجديد');
        setProductSubmitting(false);
        return;
      }

        let createdProductResult = null;
        if (selectedImageFile) {
          // Method 2: Local Upload via Multipart FormData
          const formData = new FormData();
          formData.append('image', selectedImageFile);
          formData.append('name', finalName);
          formData.append('category', finalCategory);
          formData.append('color', finalColor);
          if (pColor === '__OTHER__') formData.append('new_color', pNewColor.trim());
          formData.append('size_cut', finalSizeCut);
          formData.append('sizes', JSON.stringify(cleanedSizes));
          formData.append('price', Number(pPrice) || 0);
          formData.append('cost_price', Number(pCost) || 0);
          formData.append('barcode', pBarcode.trim());
          formData.append('stock', finalStock);
          formData.append('stock_level', finalStock);
          formData.append('min_stock_level', finalMinStock);
          formData.append('supplier_id', selectedSupId);
          formData.append('preferred_supplier_id', selectedSupId);
          formData.append('branch_id', targetBranchId);
          formData.append('gender', finalGender);

          if (editingProduct) {
            await api.put(`/inventory/${editingProduct.id}`, formData);
            toast.success('تم تحديث بيانات المنتج والمقاسات بنجاح! 📦');
          } else {
            createdProductResult = await api.post('/inventory', formData);
            toast.success('تمت إضافة المنتج ومقاساته للمخزون بنجاح! 📦');
          }
        } else {
          // Method 1 / URL or Text payload
          const payload = {
            name: finalName,
            category: finalCategory,
            color: finalColor,
            new_color: pColor === '__OTHER__' ? pNewColor.trim() : '',
            size_cut: finalSizeCut,
            sizes: cleanedSizes,
            price: Number(pPrice) || 0,
            cost_price: Number(pCost) || 0,
            barcode: pBarcode.trim(),
            stock: finalStock,
            stock_level: finalStock,
            min_stock_level: finalMinStock,
            supplier_id: selectedSupId,
            preferred_supplier_id: selectedSupId,
            image_url: pImage.trim(),
            branch_id: targetBranchId,
            gender: finalGender,
          };

          if (editingProduct) {
            await api.put(`/inventory/${editingProduct.id}`, payload);
            toast.success('تم تحديث بيانات المنتج والمقاسات بنجاح! 📦');
          } else {
            createdProductResult = await api.post('/inventory', payload);
            toast.success('تمت إضافة المنتج ومقاساته للمخزون بنجاح! 📦');
          }
        }

        setShowProductModal(false);
        if (finalCategory && !categoriesList.includes(finalCategory)) {
          setCategoriesList((prev) => [...prev, finalCategory]);
        }
        fetchProducts();
        fetchDropdownOptions();
        fetchMetadata(activeBranchId);

        if (!editingProduct) {
          // Immediately show barcode print modal for the newly added product
          const newlyAddedProduct = {
            ...(createdProductResult || {}),
            id: createdProductResult?.id || Date.now(),
            name: createdProductResult?.name || finalName,
            barcode: createdProductResult?.barcode || pBarcode.trim(),
            price: createdProductResult?.price ?? (Number(pPrice) || 0),
            color: createdProductResult?.color || finalColor,
            sizes:
              createdProductResult?.sizes && createdProductResult.sizes.length > 0
                ? createdProductResult.sizes
                : cleanedSizes,
            size_cut: createdProductResult?.size_cut || finalSizeCut,
            category: createdProductResult?.category || finalCategory,
          };
          setSelectedProductForBarcode(newlyAddedProduct);
          setIsBarcodeNewlyCreated(true);
          setShowBarcodePrintModal(true);
        }
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
      fetchMetadata(isAdmin ? inventoryBranchFilter : activeBranchId);
      fetchDropdownOptions();
    } catch (err) {
      toast.error(err.message || 'فشل حذف المنتج');
    }
  };

  // Load branch product details for transfer modal
  const loadTransferDetails = useCallback(async (productId, branchId) => {
    if (!productId || !branchId) return;
    try {
      setTransferLoadingDetails(true);
      const data = await api.get(`/inventory/${productId}?branch_id=${branchId}`);
      const branchStock = Number(data.branch_stock_level ?? data.stock_level ?? 0);
      const sizes = Array.isArray(data.sizes) ? data.sizes : [];
      setTransferBranchStock(branchStock);
      setTransferSizes(sizes);
      setTransferVariantQtys({});
      if (sizes.length === 0) {
        setTransferQty(branchStock > 0 ? '1' : '0');
      }
    } catch (err) {
      console.error('Failed to load branch product details for transfer:', err);
      toast.error('تعذر جلب تفاصيل رصيد ومقاسات الفرع المحدد');
    } finally {
      setTransferLoadingDetails(false);
    }
  }, [toast]);

  // Open Transfer Modal
  const openTransferModal = (p) => {
    setTransferProduct(p);

    let srcBranch = activeBranchId && activeBranchId !== 'all' ? activeBranchId.toString() : '';
    if (!srcBranch && inventoryBranchFilter && inventoryBranchFilter !== 'all') {
      srcBranch = inventoryBranchFilter.toString();
    }
    if (!srcBranch) {
      const branchWithStock = p.branch_stocks?.find((bs) => Number(bs.stock_level) > 0);
      srcBranch = branchWithStock ? branchWithStock.branch_id.toString() : branches[0]?.id?.toString() || '1';
    }

    setFromBranchId(srcBranch);

    const otherBranches = branches.filter((b) => b.id.toString() !== srcBranch);
    if (otherBranches.length > 0) {
      setToBranchId(otherBranches[0].id.toString());
    } else {
      setToBranchId('');
    }

    setTransferDirect(true);
    setTransferVariantQtys({});
    setTransferQty('1');
    setShowTransferModal(true);
    loadTransferDetails(p.id, srcBranch);
  };

  const handleSourceBranchChange = (newSrcId) => {
    setFromBranchId(newSrcId);
    if (toBranchId === newSrcId) {
      const other = branches.find((b) => b.id.toString() !== newSrcId);
      if (other) setToBranchId(other.id.toString());
    }
    if (transferProduct?.id) {
      loadTransferDetails(transferProduct.id, newSrcId);
    }
  };

  const handleVariantQtyChange = (key, val, maxAvailable) => {
    const raw = Number(val);
    const num = isNaN(raw) ? 0 : Math.max(0, Math.min(maxAvailable, raw));
    setTransferVariantQtys((prev) => ({
      ...prev,
      [key]: num,
    }));
  };

  const handleFillOneOfEach = () => {
    const updated = {};
    transferSizes.forEach((s, idx) => {
      const maxAvail = Number(s.stock_level || 0);
      if (maxAvail > 0) {
        const key = s.id ? `id_${s.id}` : `${s.size_name}___${s.color_name || ''}___${idx}`;
        updated[key] = 1;
      }
    });
    setTransferVariantQtys(updated);
  };

  const handleTransferAllAvailable = () => {
    const updated = {};
    transferSizes.forEach((s, idx) => {
      const maxAvail = Number(s.stock_level || 0);
      if (maxAvail > 0) {
        const key = s.id ? `id_${s.id}` : `${s.size_name}___${s.color_name || ''}___${idx}`;
        updated[key] = maxAvail;
      }
    });
    setTransferVariantQtys(updated);
  };

  const handleResetVariantQtys = () => {
    setTransferVariantQtys({});
  };

  const totalTransferQty = useMemo(() => {
    if (transferSizes.length > 0) {
      return Object.values(transferVariantQtys).reduce((sum, q) => sum + (Number(q) || 0), 0);
    }
    return Number(transferQty) || 0;
  }, [transferSizes, transferVariantQtys, transferQty]);

  // Submit Stock Transfer
  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!transferProduct || !fromBranchId || !toBranchId) {
      toast.error('الرجاء تحديد المنتج، الفرع المصدر، والفرع الوجهة');
      return;
    }

    if (fromBranchId === toBranchId) {
      toast.error('لا يمكن التحويل لنفس الفرع');
      return;
    }

    if (totalTransferQty <= 0) {
      toast.error('الرجاء تحديد كمية صالحة للتحويل (أكبر من صفر)');
      return;
    }

    if (totalTransferQty > transferBranchStock) {
      toast.error(`عفواً، إجمالي الكمية المحولة (${totalTransferQty}) يتجاوز الرصيد المتوفر في الفرع المصدر (${transferBranchStock})`);
      return;
    }

    setTransferSubmitting(true);
    try {
      const payload = {
        inventory_id: transferProduct.id,
        from_branch_id: Number(fromBranchId),
        to_branch_id: Number(toBranchId),
        quantity: totalTransferQty,
        direct_transfer: transferDirect,
      };

      if (transferSizes.length > 0) {
        payload.sizes = transferSizes
          .map((s, idx) => {
            const key = s.id ? `id_${s.id}` : `${s.size_name}___${s.color_name || ''}___${idx}`;
            const qty = Number(transferVariantQtys[key] || 0);
            return {
              id: s.id,
              size_name: s.size_name,
              color_name: s.color_name,
              size_id: s.size_id,
              barcode: s.barcode,
              quantity: qty,
            };
          })
          .filter((s) => s.quantity > 0);
      }

      const res = await api.post('/inventory/transfer', payload);

      toast.success(res?.message || 'تم تحويل كمية المخزون للفرع الآخر بنجاح! 🚚');
      setShowTransferModal(false);
      fetchProducts();
      fetchRequests();
      fetchIncomingShipments();
    } catch (err) {
      toast.error(err.message || 'فشل تحويل المخزون');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // Open Transfer to Rental Modal
  const openRentalTransferModal = async (p) => {
    setRentalProduct(p);
    const defaultBranchId = (activeBranchId && activeBranchId !== 'all') ? activeBranchId : (user?.branch_id || branches[0]?.id || 1);
    setRentalFromBranch(defaultBranchId ? defaultBranchId.toString() : '1');
    setRentalToBranch(defaultBranchId ? defaultBranchId.toString() : '1');
    setRentalQuantity('1');
    setRentalPrice(p.price ? (Number(p.price) * 0.4).toFixed(0) : '200');
    setRentalDeposit(p.price ? (Number(p.price) * 0.5).toFixed(0) : '300');
    setRentalCondition('ممتاز');
    setRentalNotes('');
    setRentalTransferMode('full_suit');
    setRentalPartType('بدلة كاملة');
    setRentalSelectedSize('');

    const pSizes = Array.isArray(p.sizes) ? p.sizes : [];
    setRentalProductSizes(pSizes);
    if (pSizes.length > 0) {
      setRentalSelectedSize(pSizes[0].size_name);
    }

    try {
      const data = await api.get(`/inventory/${p.id}?branch_id=${defaultBranchId}`);
      if (Array.isArray(data?.sizes) && data.sizes.length > 0) {
        setRentalProductSizes(data.sizes);
        setRentalSelectedSize(data.sizes[0].size_name);
      }
    } catch {}

    setShowRentalTransferModal(true);
  };

  // Submit Transfer to Rental
  const handleRentalTransferSubmit = async (e) => {
    e.preventDefault();
    if (!rentalProduct) return;

    try {
      setRentalSubmitting(true);
      const targetFromBranch = Number(rentalFromBranch || activeBranchId || user?.branch_id || branches[0]?.id || 1);
      const targetToBranch = Number(rentalToBranch || targetFromBranch);
      const transferQty = Math.max(1, parseInt(rentalQuantity, 10) || 1);

      const res = await api.post('/rental-inventory/transfer-from-sales', {
        inventory_id: rentalProduct.id,
        from_branch: targetFromBranch,
        to_branch: targetToBranch,
        branch_id: targetToBranch,
        quantity: transferQty,
        rental_price: Number(rentalPrice) || 0,
        price: Number(rentalPrice) || 0,
        deposit: Number(rentalDeposit) || 0,
        transfer_mode: rentalTransferMode,
        size: rentalTransferMode !== 'full_suit' ? rentalSelectedSize : null,
        part_type: rentalPartType,
        condition: rentalCondition || 'ممتاز',
        notes: rentalNotes || '',
      });

      toast.success(res?.message || `تم تحويل ${transferQty} قطعة إلى مخزون التأجير بنجاح! ✨`);
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

      const createdDup = await api.post('/inventory', payload);
      toast.success('تم تكرار المنتج بنجاح! 📋');
      setShowDuplicateModal(false);
      fetchProducts();

      // Show barcode print modal for the duplicated product
      const newlyDuplicatedProduct = {
        ...(createdDup || {}),
        id: createdDup?.id || Date.now(),
        name: createdDup?.name || payload.name,
        barcode: createdDup?.barcode || payload.barcode,
        price: createdDup?.price ?? payload.price,
        color: createdDup?.color || payload.color,
        size_cut: createdDup?.size_cut || payload.size_cut,
        size: createdDup?.size_cut || payload.size_cut,
        category: createdDup?.category || payload.category,
      };
      setSelectedProductForBarcode(newlyDuplicatedProduct);
      setIsBarcodeNewlyCreated(true);
      setShowBarcodePrintModal(true);
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
        if (inventoryGenderFilter !== 'all') query.append('gender', inventoryGenderFilter);
        query.append('all', 'true');

        const res = await api.get(`/inventory?${query.toString()}`);
        const exportItems = Array.isArray(res) ? res : res?.items || res?.data || products;

        filename = `inventory_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent += 'الرقم,اسم المنتج,قسم البضاعة,القسم,اللون,المقاس,الباركود,سعر البيع,سعر التكلفة,الكمية المتاحة\n';
        exportItems.forEach((p) => {
          const gLabel = p.gender === 'women' || p.gender === 'حريمي' ? 'حريمي' : (p.gender === 'both' ? 'مشترك' : 'رجالي');
          csvContent += `"${p.id}","${p.name || ''}","${gLabel}","${p.category || ''}","${p.color || ''}","${p.size_cut || p.size || ''}","${p.barcode || ''}","${p.price || 0}","${p.cost_price || 0}","${p.stock_level ?? p.stock ?? 0}"\n`;
        });
      } else {
        toast.info('جاري تجهيز سجل الموردين للتصدير... 📊');
        const query = new URLSearchParams();
        if (supplierSearch.trim()) query.append('search', supplierSearch.trim());
        if (supplierSort) query.append('sort', supplierSort);
        if (supplierCategoryFilter !== 'all') query.append('gender_category', supplierCategoryFilter);
        query.append('all', 'true');

        const res = await api.get(`/suppliers?${query.toString()}`);
        const exportSuppliers = Array.isArray(res) ? res : res?.suppliers || res?.data || res?.items || suppliers;

        filename = `suppliers_${new Date().toISOString().split('T')[0]}.csv`;
        csvContent += 'الرقم,اسم المورد,الشركة,قسم المورد,رقم الهاتف,العنوان,إجمالي المشتريات,الرصيد المستحق,تاريخ الإضافة\n';
        exportSuppliers.forEach((s) => {
          let cat = 'رجالي';
          if (s.gender_category === 'حريمي' || s.gender_category === 'women') cat = 'حريمي';
          else if (s.gender_category === 'كلاهما' || s.gender_category === 'مشترك' || s.gender_category === 'both') cat = 'كلاهما';
          csvContent += `"${s.id}","${s.name || ''}","${s.company_name || s.company || ''}","${cat}","${s.phone || ''}","${s.address || ''}","${s.total_purchases || 0}","${s.balance || 0}","${s.created_at ? formatSupplierDate(s.created_at) : ''}"\n`;
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

  // Real Excel (.xlsx) Export
  const handleExportRealExcel = async (tab = activeTab) => {
    try {
      setExportingExcel(true);
      toast.info('جاري توليد ملف Excel وتنسيقه... ⏳');
      const params = new URLSearchParams();
      if (tab === 'inventory') {
        params.set('type', 'inventory');
        if (inventoryGenderFilter !== 'all') params.set('gender', inventoryGenderFilter);
        if (selectedCategory !== 'الكل') params.set('category', selectedCategory);
        const branchToUse = isAdmin ? inventoryBranchFilter : activeBranchId;
        if (branchToUse && branchToUse !== 'all') params.set('branch_id', branchToUse);
      } else if (tab === 'branch_matrix') {
        params.set('type', 'branch_matrix');
        const branchToUse = activeBranchId;
        if (branchToUse && branchToUse !== 'all') params.set('branch_id', branchToUse);
        if (inventoryGenderFilter !== 'all') params.set('gender', inventoryGenderFilter);
        if (selectedCategory !== 'الكل') params.set('category', selectedCategory);
      } else if (tab === 'transfer_logs') {
        params.set('type', 'transfer_logs');
        const branchToUse = isAdmin ? inventoryBranchFilter : activeBranchId;
        if (branchToUse && branchToUse !== 'all') params.set('branch_id', branchToUse);
      } else {
        params.set('type', 'suppliers');
        if (supplierCategoryFilter !== 'all') params.set('gender_category', supplierCategoryFilter);
        if (supplierSearch.trim()) params.set('search', supplierSearch.trim());
        if (supplierSort) params.set('sort', supplierSort);
      }

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
      const fileName = tab === 'inventory'
        ? `تقرير-المخزون-${new Date().toISOString().split('T')[0]}.xlsx`
        : tab === 'branch_matrix'
          ? `تقرير-أرصدة-الفروع-والمخزن-${new Date().toISOString().split('T')[0]}.xlsx`
          : tab === 'transfer_logs'
            ? `سجل-تحويلات-الفروع-${new Date().toISOString().split('T')[0]}.xlsx`
            : `سجل-الموردين-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = fileName;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('تم تصدير ملف Excel بنجاح! 📊');
    } catch (err) {
      toast.error(err.message || 'فشل تصدير ملف Excel');
    } finally {
      setExportingExcel(false);
    }
  };

  // Export single supplier statement to Excel
  const handleExportSupplierStatement = async (supplier = selectedSupplier) => {
    if (!supplier?.id) return;
    try {
      setExportingExcel(true);
      toast.info('جاري تصدير كشف حساب المورد بصيغة Excel... ⏳');
      const res = await api.get(`/reports/export/excel?type=supplier_statement&supplier_id=${supplier.id}`, {
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
      const fileName = `كشف-حساب-${supplier.name || 'مورد'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = fileName;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('تم تصدير كشف الحساب بنجاح! 📊');
    } catch (err) {
      toast.error(err.message || 'فشل تصدير كشف الحساب');
    } finally {
      setExportingExcel(false);
    }
  };

  // PDF / Print Report
  const handlePrintPDF = (tab = activeTab) => {
    try {
      if (tab === 'suppliers') {
        printElement('suppliers-print-area', 'سجل الموردين والحسابات');
      } else if (tab === 'branch_matrix') {
        printElement('branch-matrix-print-area', 'تقرير أرصدة الفروع والمخزن الرئيسي');
      } else if (tab === 'transfer_logs') {
        printElement('transfer-logs-print-area', 'سجل وحالات التحويلات بين الفروع');
      } else {
        printElement('inventory-print-area', 'تقرير جرد المخزون والأصناف');
      }
    } catch (err) {
      toast.error('فشل فتح أمر الطباعة / PDF');
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
    setSGenderCategory('رجالي');
    setSCreatedAt(getCairoDateString());
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
    const mappedGc = (s.gender_category === 'مشترك' || s.gender_category === 'both')
      ? 'كلاهما'
      : (s.gender_category || 'رجالي');
    setSGenderCategory(mappedGc);
    setSCreatedAt(s.created_at ? getCairoDateString(s.created_at) : getCairoDateString());
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
        gender_category: sGenderCategory,
      };

      if (editingSupplier) {
        await api.put(`/suppliers/${editingSupplier.id}`, payload);
        toast.success('تم تحديث بيانات المورد بنجاح! 🏭');
        setShowSupplierModal(false);
        lastFetchedSupplierQueryRef.current = '';
        fetchSuppliers({ force: true });
      } else {
        payload.created_at = sCreatedAt || getCairoDateString();
        await api.post('/suppliers', payload);
        toast.success('تمت إضافة المورد بنجاح! 🏭');
        setShowSupplierModal(false);
        setSupplierSearch('');
        setSupplierSort('latest');
        setSupplierPagination((prev) => ({ ...prev, page: 1 }));
        lastFetchedSupplierQueryRef.current = '';
        fetchSuppliers({ search: '', sort: 'latest', page: 1, force: true });
      }
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
      lastFetchedSupplierQueryRef.current = '';
      fetchSuppliers({ force: true });
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
        transaction_type: 'payment',
        payment_method: paymentMethod,
        paid_from_drawer: paymentMethod === 'cash' ? paidFromDrawer : false,
        notes: paymentNotes,
      });

      toast.success('تم تسجيل سداد الدفعة بنجاح! 💵');
      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentNotes('');
      setPaymentMethod('cash');
      setPaidFromDrawer(true);
      lastFetchedSupplierQueryRef.current = '';
      fetchSuppliers({ force: true });
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
      lastFetchedSupplierQueryRef.current = '';
      fetchSuppliers({ force: true });
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
      <div className="flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 bg-[#FFFDF9] p-2.5 sm:p-3 rounded-2xl sm:rounded-3xl border border-[#E6DECD] shadow-[0_2px_10px_rgba(36,34,31,0.03)] no-print">
        {/* Navigation Tabs Segmented Bar */}
        <div className="flex items-center gap-1 p-1 bg-[#FAF6ED] rounded-2xl border border-[#E6DECD] overflow-x-auto scrollbar-none shrink-0 max-w-full">
          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-[#151515] text-white shadow-xs'
                : 'text-[#777266] hover:bg-white/80 hover:text-[#24221F]'
            }`}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>إدارة المخزون</span>
            <span className="hidden 2xl:inline"> والمنتجات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('suppliers')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'suppliers'
                ? 'bg-[#151515] text-white shadow-xs'
                : 'text-[#777266] hover:bg-white/80 hover:text-[#24221F]'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>سجل الموردين</span>
            <span className="hidden 2xl:inline"> والشركات</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('branch_matrix')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'branch_matrix'
                ? 'bg-[#151515] text-white shadow-xs'
                : 'text-[#777266] hover:bg-white/80 hover:text-[#24221F]'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>أرصدة الفروع</span>
            <span className="hidden 2xl:inline"> والمخزن</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transfer_logs')}
            className={`flex items-center gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              activeTab === 'transfer_logs'
                ? 'bg-[#151515] text-white shadow-xs'
                : 'text-[#777266] hover:bg-white/80 hover:text-[#24221F]'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 shrink-0" />
            <span>سجل التحويلات</span>
            {(incomingRequests.length > 0 || incomingShipments.length > 0) && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-black leading-none text-white bg-amber-600 rounded-full animate-pulse">
                {incomingRequests.length + incomingShipments.length}
              </span>
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            isLoading={exportingExcel}
            onClick={() => handleExportRealExcel(activeTab)}
            className="whitespace-nowrap font-black text-xs !px-2.5 sm:!px-3.5"
          >
            تصدير Excel
          </Button>

          <Button
            variant="outline"
            size="sm"
            icon={Printer}
            onClick={() => handlePrintPDF(activeTab)}
            className="whitespace-nowrap font-black text-xs !px-2.5 sm:!px-3.5"
          >
            تقرير PDF
          </Button>

          {activeTab === 'inventory' ? (
            <>
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={Truck}
                  onClick={() => setShowSupplyModal(true)}
                  className="whitespace-nowrap font-black text-xs !px-2.5 sm:!px-3.5"
                >
                  توريدة مشتريات
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={openCreateProduct}
                className="whitespace-nowrap font-black text-xs shadow-xs !px-3 sm:!px-4"
              >
                <span>إضافة منتج</span>
                <span className="hidden xl:inline"> جديد</span>
              </Button>
            </>
          ) : activeTab === 'suppliers' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={Undo2}
                onClick={() => {
                  setReturnSupplierId(suppliers[0]?.id ? suppliers[0].id.toString() : '');
                  setShowReturnModal(true);
                }}
                className="whitespace-nowrap font-black text-xs !px-2.5 sm:!px-3.5"
              >
                مرتجع لمورد
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={openCreateSupplier}
                className="whitespace-nowrap font-black text-xs shadow-xs !px-3 sm:!px-4"
              >
                <span>إضافة مورد</span>
                <span className="hidden xl:inline"> جديد</span>
              </Button>
            </>
          ) : null}
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

          {/* Incoming Shipments Pending Receiving Banner */}
          {incomingShipments.length > 0 && (
            <div className="bg-indigo-50 border-2 border-indigo-300 rounded-3xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-indigo-900 font-black">
                  <Package className="w-5 h-5 text-indigo-600" />
                  <span>شحنات بضاعة واردة لفرعك في الطريق ({incomingShipments.length}) 🚚</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-indigo-100/70 font-black text-indigo-900">
                    <tr>
                      <th className="p-2.5">رقم الشحنة</th>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5">المرسل من فرع</th>
                      <th className="p-2.5">الكمية</th>
                      <th className="p-2.5">تفاصيل المقاسات</th>
                      <th className="p-2.5 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-indigo-200/50 font-bold">
                    {incomingShipments.map((shipment) => {
                      let parsedSizes = [];
                      if (shipment.sizes_data) {
                        try {
                          parsedSizes = typeof shipment.sizes_data === 'string' ? JSON.parse(shipment.sizes_data) : shipment.sizes_data;
                        } catch {}
                      }
                      return (
                        <tr key={shipment.id} className="hover:bg-indigo-100/40 transition-colors">
                          <td className="p-2.5 font-mono">#{shipment.id}</td>
                          <td className="p-2.5 font-black text-indigo-950">
                            {shipment.inventory_name || shipment.name}
                            {shipment.inventory_barcode && (
                              <span className="text-[10px] text-slate-400 font-mono block">
                                #{shipment.inventory_barcode}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold">{shipment.from_branch_name}</div>
                            {shipment.sender_name && (
                              <div className="text-[10px] text-indigo-700 font-bold mt-0.5">
                                سلّمها: {shipment.sender_name}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-sm font-black text-indigo-700">
                            {shipment.quantity} قطعة
                          </td>
                          <td className="p-2.5 text-slate-600">
                            {parsedSizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {parsedSizes.map((sz, sidx) => (
                                  <span key={sidx} className="px-1.5 py-0.5 rounded bg-white border border-indigo-200 text-[10px] font-bold">
                                    {sz.color_name ? `${sz.color_name} ` : ''}{sz.size_name}: <strong>{sz.quantity}</strong>
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span>—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-center">
                            <Button
                              size="sm"
                              variant="primary"
                              isLoading={receivingTransferId === shipment.id}
                              onClick={() => handleReceiveShipment(shipment.id)}
                              className="!bg-emerald-600 hover:!bg-emerald-700 font-black text-xs py-1 px-3 shadow-xs"
                            >
                              تأكيد الاستلام ✅
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
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
                {categoriesList
                  .filter((cat) => {
                    if (cat === 'الكل') return true;
                    const c = categoryCounts[cat] ?? categoryCounts[CATEGORY_DISPLAY_MAP[cat]];
                    return typeof c === 'number' && c > 0;
                  })
                  .map((cat) => {
                    const isSelected = selectedCategory === cat;
                    const displayName = CATEGORY_DISPLAY_MAP[cat] || cat;
                    const count = categoryCounts[cat] ?? categoryCounts[displayName];
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
                    {categoriesList
                      .filter((cat) => {
                        if (cat === 'الكل') return true;
                        const c = categoryCounts[cat] ?? categoryCounts[CATEGORY_DISPLAY_MAP[cat]];
                        return typeof c === 'number' && c > 0;
                      })
                      .map((cat) => {
                        const displayName = CATEGORY_DISPLAY_MAP[cat] || cat;
                        const count = categoryCounts[cat] ?? categoryCounts[displayName];
                        const label = cat === 'الكل' ? 'كل الأصناف' : displayName;
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

                {/* Department (Gender) Dropdown */}
                <div className="relative">
                  <select
                    value={inventoryGenderFilter}
                    onChange={(e) => {
                      setInventoryGenderFilter(e.target.value);
                      setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                    }}
                    className="w-full h-10 pr-9 pl-8 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] focus:outline-none focus:border-[#151515] transition-all appearance-none cursor-pointer text-right"
                    aria-label="قسم البضاعة"
                  >
                    <option value="all">كل الأقسام (رجالي وحريمي)</option>
                    <option value="men">👔 قسم الرجالي فقط</option>
                    <option value="women">👗 قسم الحريمي فقط</option>
                  </select>
                  <Users className="w-4 h-4 text-[#151515] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                        const val = e.target.value;
                        setInventoryBranchFilter(val);
                        if (typeof selectBranch === 'function') {
                          selectBranch(val);
                        }
                        setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className="w-full h-10 pr-9 pl-8 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 shadow-2xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all appearance-none cursor-pointer text-right"
                      aria-label="نطاق الرصيد"
                    >
                      <option value="all">كل الفروع والمخازن (الإجمالي)</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id.toString()}>
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
                    {inventoryGenderFilter !== 'all' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                        <span>القسم: {inventoryGenderFilter === 'men' ? 'رجالي 👔' : 'حريمي 👗'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setInventoryGenderFilter('all');
                            setInventoryPagination((prev) => ({ ...prev, page: 1 }));
                          }}
                          className="hover:text-blue-900 cursor-pointer"
                          title="إلغاء فلتر القسم"
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
                    {inventoryBranchFilter !== defaultBranch && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span>
                          الفرع: {inventoryBranchFilter === 'all' ? 'كل الفروع والمخازن' : branches.find((b) => String(b.id) === String(inventoryBranchFilter))?.name || inventoryBranchFilter}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setInventoryBranchFilter(defaultBranch);
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
              <div className="overflow-x-auto" id="inventory-print-area">
                <table className="w-full text-right text-sm">
                  <thead>
                    <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                      <th className="pb-3 pr-4">الصورة</th>
                      <th className="pb-3">الاسم والكود</th>
                      <th className="pb-3">التصنيف والقسم</th>
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="neutral">{p.category || 'عام'}</Badge>
                              {p.gender === 'women' || p.gender === 'حريمي' ? (
                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-black">
                                  👗 حريمي
                                </span>
                              ) : p.gender === 'both' ? (
                                <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-black">
                                  🚻 مشترك
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-black">
                                  👔 رجالي
                                </span>
                              )}
                            </div>
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

                              {/* Print Barcode Button */}
                              <button
                                onClick={() => {
                                  setSelectedProductForBarcode(p);
                                  setIsBarcodeNewlyCreated(false);
                                  setShowBarcodePrintModal(true);
                                }}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="طباعة باركود المنتج"
                              >
                                <Barcode className="w-4 h-4" />
                              </button>

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

                    <div className="flex items-center gap-1 mx-1">
                      {getPaginationItems(inventoryPagination.page, inventoryPagination.totalPages).map((p, idx) => (
                        p === '...' ? (
                          <span key={`inv-ellipsis-${idx}`} className="px-1 text-xs text-[#777266] font-bold">...</span>
                        ) : (
                          <button
                            key={`inv-p-${p}`}
                            onClick={() => handleInventoryPageChange(p)}
                            className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-black transition-colors ${
                              inventoryPagination.page === p
                                ? 'bg-[#151515] text-white shadow-sm'
                                : 'bg-white border border-[#E6DECD] text-[#565147] hover:bg-[#FAF6ED] hover:text-[#151515]'
                            }`}
                          >
                            {p}
                          </button>
                        )
                      ))}
                    </div>

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
              <div className="flex flex-wrap items-center gap-2">
                {/* Search Input */}
                <div className="relative w-56">
                  <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                  <input
                    type="text"
                    value={supplierSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSupplierSearch(val);
                      setSupplierPagination((prev) => ({ ...prev, page: 1 }));
                      fetchSuppliers({ search: val, page: 1 });
                    }}
                    placeholder="ابحث باسم المورد أو الشركة..."
                    className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
                  />
                </div>

                {/* Supplier Category Filter */}
                <div className="relative min-w-[150px]">
                  <select
                    value={supplierCategoryFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSupplierCategoryFilter(val);
                      setSupplierPagination((prev) => ({ ...prev, page: 1 }));
                      fetchSuppliers({ gender_category: val, page: 1 });
                    }}
                    className="w-full h-[34px] pr-8 pl-7 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] outline-none focus:border-[#151515] transition-colors appearance-none cursor-pointer text-right shadow-2xs"
                    aria-label="قسم المورد"
                  >
                    <option value="all">كل الأقسام</option>
                    <option value="رجالي">👔 موردين رجالي</option>
                    <option value="حريمي">👗 موردين حريمي</option>
                    <option value="كلاهما">🚻 موردين مشترك (كلاهما)</option>
                  </select>
                  <Users className="w-3.5 h-3.5 text-[#777266] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-3.5 h-3.5 text-[#777266] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {/* Sort Dropdown */}
                <div className="relative min-w-[170px]">
                  <select
                    value={supplierSort}
                    onChange={(e) => {
                      const newSort = e.target.value;
                      setSupplierSort(newSort);
                      setSupplierPagination((prev) => ({ ...prev, page: 1 }));
                      fetchSuppliers({ sort: newSort, page: 1 });
                    }}
                    className="w-full h-[34px] pr-8 pl-7 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] outline-none focus:border-[#151515] transition-colors appearance-none cursor-pointer text-right shadow-2xs"
                    aria-label="ترتيب الموردين"
                  >
                    <option value="latest">الأحدث أولاً (الافتراضي)</option>
                    <option value="oldest">الأقدم أولاً</option>
                    <option value="balance_desc">الأعلى رصيداً / مديونية</option>
                    <option value="purchases_desc">الأكثر مشتريات</option>
                    <option value="name_asc">الاسم (أ - ي)</option>
                  </select>
                  <ArrowUpDown className="w-3.5 h-3.5 text-[#777266] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <ChevronDown className="w-3.5 h-3.5 text-[#777266] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                <Button variant="outline" onClick={() => { lastFetchedSupplierQueryRef.current = ''; fetchSuppliers({ force: true }); }} icon={RotateCcw}>
                  تحديث
                </Button>
              </div>
            }
          />

          {/* Supplier Department Balance Statistics Cards */}
          <div className="p-4 border-b border-[#E6DECD] bg-[#FAF6ED]/50 grid grid-cols-2 lg:grid-cols-4 gap-3 no-print">
            <div className="bg-[#FFFDF9] p-3 rounded-2xl border border-[#E6DECD] shadow-2xs">
              <div className="text-[11px] font-bold text-[#777266]">إجمالي الرصيد المستحق للموردين</div>
              <div className="text-base font-black text-rose-600 mt-1 font-mono">
                {Number(supplierStats.totalBalance || 0).toLocaleString()} ج.م
              </div>
            </div>
            <div className="bg-blue-50/60 p-3 rounded-2xl border border-blue-200 shadow-2xs">
              <div className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
                <span>👔 رصيد قسم الرجالي</span>
              </div>
              <div className="text-base font-black text-blue-900 mt-1 font-mono">
                {Number(supplierStats.menBalance || 0).toLocaleString()} ج.م
              </div>
            </div>
            <div className="bg-rose-50/60 p-3 rounded-2xl border border-rose-200 shadow-2xs">
              <div className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
                <span>👗 رصيد قسم الحريمي</span>
              </div>
              <div className="text-base font-black text-rose-900 mt-1 font-mono">
                {Number(supplierStats.womenBalance || 0).toLocaleString()} ج.م
              </div>
            </div>
            <div className="bg-purple-50/60 p-3 rounded-2xl border border-purple-200 shadow-2xs">
              <div className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
                <span>🚻 رصيد المشترك (كلاهما)</span>
              </div>
              <div className="text-base font-black text-purple-900 mt-1 font-mono">
                {Number(supplierStats.bothBalance || 0).toLocaleString()} ج.م
              </div>
            </div>
          </div>

          {loadingSuppliers ? (
            <div className="py-20 text-center text-[#777266] font-bold text-sm">
              جاري تحميل الموردين...
            </div>
          ) : suppliers.length === 0 ? (
            <div className="py-20 text-center text-[#777266] font-bold text-sm">
              لا يوجد موردين مسجلين
            </div>
          ) : (
            <div className="overflow-x-auto" id="suppliers-print-area">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                    <th className="pb-3 pr-4">اسم المورد والكود</th>
                    <th className="pb-3">الشركة / المصنع</th>
                    <th className="pb-3">قسم المورد</th>
                    <th className="pb-3">الهاتف</th>
                    <th className="pb-3">العنوان</th>
                    <th className="pb-3">إجمالي المشتريات</th>
                    <th className="pb-3">الرصيد المستحق له</th>
                    <th className="pb-3 pl-4 text-center no-print">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                  {suppliers.map((s) => {
                    const isWomen = s.gender_category === 'حريمي' || s.gender_category === 'women';
                    const isBoth = s.gender_category === 'كلاهما' || s.gender_category === 'مشترك' || s.gender_category === 'both';

                    return (
                      <tr key={s.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                        <td className="py-3.5 pr-4">
                          <div className="font-bold text-[#24221F]">{s.name}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-mono text-[#777266] font-bold">كود: #{s.code || s.id}</span>
                            <span className="text-[10px] text-[#777266] flex items-center gap-1 font-medium bg-[#FAF6ED] px-1.5 py-0.5 rounded border border-[#E6DECD]/60">
                              <span>📅 تاريخ الإضافة:</span>
                              <span className="font-mono font-bold text-[#24221F]">{formatSupplierDate(s.created_at)}</span>
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 text-[#565147] font-bold text-xs">{s.company_name || s.company || '-'}</td>
                        <td className="py-3.5">
                          {isWomen ? (
                            <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-black inline-flex items-center gap-1">
                              <span>👗</span>
                              <span>حريمي</span>
                            </span>
                          ) : isBoth ? (
                            <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-xs font-black inline-flex items-center gap-1">
                              <span>🚻</span>
                              <span>كلاهما</span>
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-black inline-flex items-center gap-1">
                              <span>👔</span>
                              <span>رجالي</span>
                            </span>
                          )}
                        </td>
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
                        <td className="py-3.5 pl-4 text-center no-print">
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
                              setPaymentAmount(s.balance ? Math.abs(Number(s.balance)).toString() : '');
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
                  );
                })}
                </tbody>
              </table>
            </div>
          )}

          {/* Suppliers Pagination Bar */}
          {supplierPagination.total > 0 && (
            <div className="p-4 border-t border-[#E6DECD] flex flex-col md:flex-row items-center justify-between gap-3 bg-[#FFFDF9] rounded-b-2xl">
              {/* Info summary & Page size */}
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#777266]">
                <span>
                  عرض{' '}
                  <span className="text-[#24221F] font-black">
                    {supplierPagination.limit === 'all'
                      ? `1 - ${supplierPagination.total}`
                      : `${(supplierPagination.page - 1) * supplierPagination.limit + 1} - ${Math.min(
                          supplierPagination.page * supplierPagination.limit,
                          supplierPagination.total
                        )}`}
                  </span>{' '}
                  من إجمالي{' '}
                  <span className="text-[#24221F] font-black">
                    {Number(supplierPagination.total).toLocaleString()}
                  </span>{' '}
                  مورد
                </span>

                <div className="flex items-center gap-1.5 mr-2">
                  <span className="text-[#777266]">لكل صفحة:</span>
                  {[30, 50, 100, 200, 'الكل'].map((lim) => (
                    <button
                      key={lim}
                      onClick={() => handleSupplierLimitChange(lim)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        supplierPagination.limit === lim || (lim === 'الكل' && supplierPagination.limit === 'all')
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

                  <div className="flex items-center gap-1 mx-1">
                    {getPaginationItems(supplierPagination.page, supplierPagination.totalPages).map((p, idx) => (
                      p === '...' ? (
                        <span key={`sup-ellipsis-${idx}`} className="px-1 text-xs text-[#777266] font-bold">...</span>
                      ) : (
                        <button
                          key={`sup-p-${p}`}
                          onClick={() => handleSupplierPageChange(p)}
                          className={`min-w-[32px] h-8 px-2.5 rounded-lg text-xs font-black transition-colors ${
                            supplierPagination.page === p
                              ? 'bg-[#151515] text-white shadow-sm'
                              : 'bg-white border border-[#E6DECD] text-[#565147] hover:bg-[#FAF6ED] hover:text-[#151515]'
                          }`}
                        >
                          {p}
                        </button>
                      )
                    ))}
                  </div>

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
      )}

      {activeTab === 'branch_matrix' && (
        <BranchStockMatrix isAdmin={isAdmin} />
      )}

      {activeTab === 'transfer_logs' && (
        <BranchTransferLogs
          isAdmin={isAdmin}
          onRefreshBanners={() => {
            fetchRequests();
            fetchIncomingShipments();
          }}
        />
      )}

      {/* ADD / EDIT PRODUCT MODAL */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title={editingProduct ? 'تعديل بيانات المنتج ✏️' : 'إضافة منتج جديد للمخزون 📦'}
        maxWidth="max-w-4xl"
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

            {/* CATEGORY / CLASSIFICATION */}
            <div className="space-y-1 sm:col-span-1">
              {!isNewCategory && pCategory !== '__NEW_CATEGORY__' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">القسم / التصنيف *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewCategory(true);
                        setPNewCategory('');
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      كتابة تصنيف جديد ➕
                    </button>
                  </div>
                  <SearchableCombobox
                    value={pCategory}
                    onChange={(val) => {
                      if (val === '__NEW_CATEGORY__') {
                        setIsNewCategory(true);
                        setPNewCategory('');
                      } else {
                        setPCategory(val);
                      }
                    }}
                    options={categoriesList.filter((c) => c !== 'الكل')}
                    placeholder="اختر أو ابحث عن قسم/تصنيف..."
                    searchPlaceholder="ابحث في الأقسام والتصنيفات..."
                    isLoading={loadingDropdowns}
                    customOptionLabel="تصنيف جديد (إضافة قسم جديد) ➕"
                    customOptionValue="__NEW_CATEGORY__"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700">اسم القسم / التصنيف الجديد *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewCategory(false);
                        setPNewCategory('');
                        if (pCategory === '__NEW_CATEGORY__') {
                          setPCategory(categoriesList.find((c) => c !== 'الكل') || '');
                        }
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                    >
                      اختيار من الأقسام المسجلة 📋
                    </button>
                  </div>
                  <Input
                    value={pNewCategory}
                    onChange={(e) => setPNewCategory(e.target.value)}
                    placeholder="أدخل اسم القسم الجديد (مثال: قمصان، بدل، أحذية، فساتين...)"
                    autoFocus
                    required
                  />
                  {/* Quick Category Suggestions */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] text-slate-400 font-bold">اقتراحات سريعة:</span>
                    {['بدل', 'قميص', 'بنطلون', 'بليزر', 'تيشيرت', 'حذاء', 'إكسسوارات', 'سواريه', 'ترنج', 'أخرى'].map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => setPNewCategory(sug)}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors border border-slate-200 cursor-pointer"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* DEPARTMENT (GENDER) - MANDATORY: MEN OR WOMEN ONLY */}
            <div className="space-y-1.5 sm:col-span-1">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>قسم البضاعة *</span>
                <span className="text-[11px] text-indigo-600 font-bold">(رجالي أو حريمي فقط)</span>
              </label>
              <div className="grid grid-cols-2 gap-2 h-[42px]">
                <button
                  type="button"
                  onClick={() => setProductGender('men')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                    productGender === 'men'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>👔 رجالي</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProductGender('women')}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                    productGender === 'women'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <span>👗 حريمي</span>
                </button>
              </div>
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
            <div className="space-y-1 sm:col-span-1">
              <Input
                label="الباركود الموحد للصنف (Barcode)"
                value={pBarcode}
                onChange={(e) => setPBarcode(e.target.value)}
                placeholder="امسح أو اترك فارغاً للإنشاء التلقائي (نفس الباركود لكل المقاسات)"
              />
              {pBarcode.trim() && products.some((p) => p.barcode && p.barcode.trim().toLowerCase() === pBarcode.trim().toLowerCase() && p.id !== editingProduct?.id) && (
                <p className="text-[11px] text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg mt-1 border border-rose-200 font-semibold flex items-center gap-1">
                  <span>⚠️ تنبيه: هذا الباركود مسجل مسبقاً للصنف ({products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === pBarcode.trim().toLowerCase() && p.id !== editingProduct?.id)?.name || ''}). لا يمكن تكراره منعاً لتشابه القطع!</span>
                </p>
              )}
            </div>

            {/* MIN STOCK LEVEL */}
            <Input
              label="حد التنبيه الأدنى للمخزون"
              type="number"
              value={pMinStock}
              onChange={(e) => setPMinStock(e.target.value)}
              placeholder="5"
            />

            {/* FAST MATRIX VARIANT GENERATOR (COLORS X SIZES X BARCODES) */}
            <div className="sm:col-span-2">
              <MatrixVariantGenerator
                productSizes={productSizes}
                setProductSizes={setProductSizes}
                existingColors={colorsList}
                existingSizes={sizesList}
              />
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
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleRentalTransferSubmit} className="space-y-4">
          {/* Transfer Mode Selection */}
          <div className="space-y-1.5 p-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
            <label className="text-xs font-black text-indigo-900">نوع التحويل المطلوب:</label>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRentalTransferMode('full_suit')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                  rentalTransferMode === 'full_suit'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                👔 البدلة كاملة
              </button>
              <button
                type="button"
                onClick={() => setRentalTransferMode('specific_size')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                  rentalTransferMode === 'specific_size'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                📏 مقاس محدد
              </button>
              <button
                type="button"
                onClick={() => setRentalTransferMode('part_piece')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                  rentalTransferMode === 'part_piece'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ✂️ جزء / قطعة معينة
              </button>
            </div>
          </div>

          {/* Part Type Selection (if part_piece) */}
          {rentalTransferMode === 'part_piece' && (
            <div className="space-y-1.5 p-3 bg-purple-50/60 border border-purple-100 rounded-xl">
              <label className="text-xs font-bold text-purple-900">القطعة أو الجزء المراد تحويله:</label>
              <select
                value={rentalPartType}
                onChange={(e) => setRentalPartType(e.target.value)}
                className="w-full bg-white border border-purple-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-purple-600"
              >
                <option value="جاكيت">جاكيت منفصل</option>
                <option value="بنطلون">بنطلون منفصل</option>
                <option value="سديري">سديري / صديرية</option>
                <option value="قميص">قميص</option>
                <option value="بيبيون / كرافت">بيبيون / كرافت</option>
                <option value="أخرى">قطعة أخرى</option>
              </select>
            </div>
          )}

          {/* Specific Size Selection (if specific_size or part_piece) */}
          {rentalTransferMode !== 'full_suit' && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">المقاس المراد نقله *</label>
              {rentalProductSizes.length > 0 ? (
                <select
                  value={rentalSelectedSize}
                  onChange={(e) => setRentalSelectedSize(e.target.value)}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
                  required
                >
                  {rentalProductSizes.map((s, idx) => (
                    <option key={idx} value={s.size_name}>
                      مقاس: {s.size_name} {s.color_name ? `(${s.color_name})` : ''} - المتوفر: {s.stock_level ?? 0} قطعة
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  label="اكتب المقاس يدوياً"
                  value={rentalSelectedSize}
                  onChange={(e) => setRentalSelectedSize(e.target.value)}
                  placeholder="مثال: 52، 54، XL..."
                  required
                />
              )}
            </div>
          )}
          {branches && branches.length > 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">من فرع</label>
                <select
                  value={rentalFromBranch}
                  onChange={(e) => setRentalFromBranch(e.target.value)}
                  disabled={!isAdmin && user?.role === 'branch_user'}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 disabled:bg-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">إلى فرع التأجير</label>
                <select
                  value={rentalToBranch}
                  onChange={(e) => setRentalToBranch(e.target.value)}
                  disabled={!isAdmin && user?.role === 'branch_user'}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 disabled:bg-slate-100"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="الكمية المراد تحويلها للتأجير *"
              type="number"
              min="1"
              required
              value={rentalQuantity}
              onChange={(e) => setRentalQuantity(e.target.value)}
              placeholder="1"
            />
            <Input
              label="سعر التأجير لليوم/الحجز (ج.م) *"
              type="number"
              min="0"
              required
              value={rentalPrice}
              onChange={(e) => setRentalPrice(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="مبلغ التأمين المطلوب (ج.م) *"
              type="number"
              min="0"
              required
              value={rentalDeposit}
              onChange={(e) => setRentalDeposit(e.target.value)}
            />

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">حالة القطعة</label>
              <select
                value={rentalCondition}
                onChange={(e) => setRentalCondition(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
              >
                <option value="جديد">جديد تماماً (زيرو)</option>
                <option value="ممتاز">ممتاز</option>
                <option value="جيد جداً">جيد جداً</option>
                <option value="جيد">جيد</option>
              </select>
            </div>
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
        subtitle={transferProduct ? `الصنف: ${transferProduct.name} ${transferProduct.barcode ? `• باركود: ${transferProduct.barcode}` : ''}` : ''}
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleTransferSubmit} className="space-y-4 text-slate-800">
          {/* PRODUCT SUMMARY CARD */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {transferProduct?.image_url ? (
                <img
                  src={transferProduct.image_url}
                  alt={transferProduct.name}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-black">
                  <Package className="w-6 h-6" />
                </div>
              )}
              <div>
                <h4 className="font-black text-sm text-slate-900">{transferProduct?.name}</h4>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 font-mono">
                  {transferProduct?.barcode && <span>#{transferProduct.barcode}</span>}
                  {transferProduct?.category && <span className="text-slate-400">• {transferProduct.category}</span>}
                </div>
              </div>
            </div>

            {/* Branch Stock Badge */}
            <div className="text-left bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-[11px] font-bold text-slate-500 block">المتوفر في الفرع المصدر</span>
              <span className={`text-base font-black font-mono ${transferBranchStock > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {transferLoadingDetails ? '...' : `${transferBranchStock} قطعة`}
              </span>
            </div>
          </div>

          {/* BRANCH SELECTION: FROM & TO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-indigo-50/40 p-3.5 rounded-2xl border border-indigo-100/80">
            {/* FROM BRANCH */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                الفرع المحول منه (المصدر) *
              </label>
              {isAdmin ? (
                <select
                  value={fromBranchId}
                  onChange={(e) => handleSourceBranchChange(e.target.value)}
                  className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 shadow-2xs"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id.toString()}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-700 shadow-2xs">
                  {branches.find((b) => b.id.toString() === fromBranchId)?.name || `فرع #${fromBranchId}`}
                </div>
              )}
            </div>

            {/* TO BRANCH */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                الفرع المحول إليه (الوجهة) *
              </label>
              <select
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600 shadow-2xs"
                required
              >
                {branches
                  .filter((b) => b.id.toString() !== fromBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id.toString()}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* STOCK STATUS / ALERT */}
          {transferLoadingDetails ? (
            <div className="text-center py-6 text-xs font-bold text-slate-400">
              جاري فحص كميات ومقاسات الصنف في الفرع... ⏳
            </div>
          ) : transferBranchStock <= 0 ? (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-center space-y-1">
              <p className="text-xs font-black text-rose-700">⚠️ رصيد هذا الصنف منعدم (0 قطعة) في الفرع المصدر المحدد!</p>
              <p className="text-[11px] text-rose-600">لا يمكن إجراء عملية نقل دون وجود مخزون متوفر في هذا الفرع.</p>
            </div>
          ) : (
            <>
              {/* IF PRODUCT HAS SIZES/COLORS VARIANTS */}
              {transferSizes && transferSizes.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="text-xs font-black text-slate-800">
                        تحديد الكميات حسب المقاس واللون 🏷️
                      </span>
                      <span className="text-[11px] text-slate-400 font-bold block">
                        حدد عدد القطع المراد نقلها من كل مقاس متوفر
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleFillOneOfEach}
                        className="px-2.5 py-1 text-[11px] font-black bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-colors"
                      >
                        +1 من كل متوفر
                      </button>
                      <button
                        type="button"
                        onClick={handleTransferAllAvailable}
                        className="px-2.5 py-1 text-[11px] font-black bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors"
                      >
                        نقل كل المتاح
                      </button>
                      <button
                        type="button"
                        onClick={handleResetVariantQtys}
                        className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                      >
                        تصفير
                      </button>
                    </div>
                  </div>

                  {/* SIZES BREAKDOWN TABLE / CARDS */}
                  <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white shadow-2xs">
                    {transferSizes.map((s, idx) => {
                      const key = s.id ? `id_${s.id}` : `${s.size_name}___${s.color_name || ''}___${idx}`;
                      const avail = Number(s.stock_level || 0);
                      const currentVal = transferVariantQtys[key] ?? 0;
                      const isDepleted = avail <= 0;

                      return (
                        <div
                          key={key || idx}
                          className={`flex items-center justify-between p-2.5 transition-colors ${
                            isDepleted
                              ? 'bg-slate-50/60 opacity-60'
                              : currentVal > 0
                              ? 'bg-indigo-50/30'
                              : 'hover:bg-slate-50/50'
                          }`}
                        >
                          {/* Variant Details */}
                          <div className="flex items-center gap-2.5 min-w-0">
                            {s.color_name && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black bg-slate-100 text-slate-700 border border-slate-200">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                {s.color_name}
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {s.size_name}
                            </span>
                            {s.barcode && (
                              <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                                ({s.barcode})
                              </span>
                            )}
                          </div>

                          {/* Available & Transfer Input */}
                          <div className="flex items-center gap-3">
                            <span className={`text-xs font-bold font-mono ${isDepleted ? 'text-rose-500' : 'text-slate-600'}`}>
                              المتاح: <strong className={avail > 0 ? 'text-slate-900 font-black' : 'text-rose-600'}>{avail}</strong>
                            </span>

                            {/* Qty Input Control */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={isDepleted || currentVal <= 0}
                                onClick={() => handleVariantQtyChange(key, currentVal - 1, avail)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                -
                              </button>
                              <input
                                type="number"
                                min="0"
                                max={avail}
                                value={currentVal || ''}
                                placeholder="0"
                                disabled={isDepleted}
                                onChange={(e) => handleVariantQtyChange(key, e.target.value, avail)}
                                className="w-14 text-center bg-white border border-slate-300 rounded-lg py-1 text-xs font-black text-slate-800 outline-none focus:border-indigo-600 disabled:bg-slate-100 shadow-2xs font-mono"
                              />
                              <button
                                type="button"
                                disabled={isDepleted || currentVal >= avail}
                                onClick={() => handleVariantQtyChange(key, currentVal + 1, avail)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                disabled={isDepleted || currentVal === avail}
                                onClick={() => handleVariantQtyChange(key, avail, avail)}
                                className="px-1.5 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 rounded border border-indigo-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors ml-1"
                              >
                                الكل
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* SIMPLE PRODUCT (NO SIZES) */
                <div className="space-y-3 bg-slate-50/50 p-3.5 rounded-2xl border border-slate-200/80">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-700">الكمية المراد تحويلها *</label>
                    <span className="text-xs font-bold text-slate-500">
                      الرصيد المتاح: <strong className="text-emerald-700 font-black font-mono">{transferBranchStock} قطعة</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max={transferBranchStock}
                      value={transferQty}
                      onChange={(e) => setTransferQty(e.target.value)}
                      className="text-center font-mono font-black text-sm"
                      required
                    />
                    <div className="flex items-center gap-1">
                      {[1, 5, 10].map((num) => (
                        <button
                          key={num}
                          type="button"
                          disabled={transferBranchStock < num}
                          onClick={() => setTransferQty(String(num))}
                          className="px-2.5 py-2 text-xs font-bold bg-white hover:bg-slate-100 rounded-xl border border-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed shadow-2xs"
                        >
                          {num}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTransferQty(String(transferBranchStock))}
                        className="px-2.5 py-2 text-xs font-black bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 text-indigo-700 shadow-2xs"
                      >
                        كل الكمية ({transferBranchStock})
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TRANSFER SUMMARY BAR */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-3.5 flex items-center justify-between shadow-2xs">
                <div>
                  <span className="text-xs font-black text-indigo-950 block">ملخص عملية التحويل</span>
                  <span className="text-[11px] text-slate-500 font-bold">
                    سيتم خصمها من {branches.find((b) => b.id.toString() === fromBranchId)?.name} وإضافتها إلى {branches.find((b) => b.id.toString() === toBranchId)?.name}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-slate-500 block">إجمالي المحول</span>
                    <span className="text-lg font-black font-mono text-indigo-700">
                      {totalTransferQty} قطعة
                    </span>
                  </div>
                  <div className="text-center border-r border-indigo-200 pr-4">
                    <span className="text-[10px] font-bold text-slate-500 block">المتبقي في المصدر</span>
                    <span className="text-lg font-black font-mono text-slate-700">
                      {Math.max(0, transferBranchStock - totalTransferQty)} قطعة
                    </span>
                  </div>
                </div>
              </div>

              {/* TRANSFER DIRECT/PENDING OPTION */}
              <div className="flex items-center gap-4 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="transfer_type"
                    checked={transferDirect}
                    onChange={() => setTransferDirect(true)}
                    className="accent-indigo-600"
                  />
                  <span>تحويل مباشر وفوري (مكتمل) ⚡</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="transfer_type"
                    checked={!transferDirect}
                    onChange={() => setTransferDirect(false)}
                    className="accent-indigo-600"
                  />
                  <span>إرسال شحنة بانتظار استلام الفرع 📦</span>
                </label>
              </div>
            </>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={transferBranchStock <= 0 || totalTransferQty <= 0 || totalTransferQty > transferBranchStock}
              isLoading={transferSubmitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {totalTransferQty > 0
                ? `تأكيد تحويل (${totalTransferQty}) قطعة 🚚`
                : 'تأكيد النقل'}
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
            label="تاريخ الإنشاء / الإضافة"
            type="date"
            value={sCreatedAt}
            onChange={(e) => setSCreatedAt(e.target.value)}
            helperText={editingSupplier ? 'تاريخ إضافة المورد الأصلي' : 'تاريخ إضافة المورد (تلقائي تاريخ اليوم ويمكن تعديله)'}
            disabled={Boolean(editingSupplier)}
          />

          <Input
            label="اسم الشركة / المصنع"
            value={sCompany}
            onChange={(e) => setSCompany(e.target.value)}
            placeholder="مثال: مصنع النور للملابس"
          />

          {/* SUPPLIER DEPARTMENT (GENDER CATEGORY) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">قسم المورد *</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSGenderCategory('رجالي')}
                className={`py-2 px-3 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                  sGenderCategory === 'رجالي'
                    ? 'border-blue-600 bg-blue-50 text-blue-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                👔 رجالي
              </button>
              <button
                type="button"
                onClick={() => setSGenderCategory('حريمي')}
                className={`py-2 px-3 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                  sGenderCategory === 'حريمي'
                    ? 'border-rose-500 bg-rose-50 text-rose-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                👗 حريمي
              </button>
              <button
                type="button"
                onClick={() => setSGenderCategory('كلاهما')}
                className={`py-2 px-3 rounded-xl border-2 text-xs font-black transition-all cursor-pointer ${
                  sGenderCategory === 'كلاهما' || sGenderCategory === 'مشترك'
                    ? 'border-purple-600 bg-purple-50 text-purple-800 shadow-xs'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                🚻 كلاهما
              </button>
            </div>
          </div>

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

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">طريقة الدفع *</label>
            <select
              value={paymentMethod}
              onChange={(e) => {
                const val = e.target.value;
                setPaymentMethod(val);
                if (val !== 'cash') {
                  setPaidFromDrawer(false);
                }
              }}
              className="w-full bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-600"
            >
              <option value="cash">نقداً (كاش)</option>
              <option value="bank_transfer">انستاباي / تحويل بنكي</option>
              <option value="card">فيزا / بطاقة بنكية</option>
            </select>
          </div>

          {paymentMethod === 'cash' && (
            <label className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs font-bold text-amber-900 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={paidFromDrawer}
                onChange={(e) => setPaidFromDrawer(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-0 border-slate-300"
              />
              <span>سداد نقدي من درج الكاش بالفرع (يخصم من تقفيل كاش اليومية)</span>
            </label>
          )}

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

            {/* Goods Department Selector for Supply */}
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setSupplyProductGenderFilter('all')}
                className={`py-1.5 rounded-lg text-xs font-black transition-all ${
                  supplyProductGenderFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                كل الأقسام
              </button>
              <button
                type="button"
                onClick={() => setSupplyProductGenderFilter('men')}
                className={`py-1.5 rounded-lg text-xs font-black transition-all ${
                  supplyProductGenderFilter === 'men'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-blue-700'
                }`}
              >
                👔 رجالي
              </button>
              <button
                type="button"
                onClick={() => setSupplyProductGenderFilter('women')}
                className={`py-1.5 rounded-lg text-xs font-black transition-all ${
                  supplyProductGenderFilter === 'women'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-rose-700'
                }`}
              >
                👗 حريمي
              </button>
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
              {activeSupplyProducts.map((p) => {
                const gTag = p.gender === 'women' || p.gender === 'حريمي' ? '[حريمي 👗]' : '[رجالي 👔]';
                return (
                  <option key={p.id} value={p.id.toString()}>
                    #{p.id} - {p.name} {gTag} {p.category ? `(${p.category})` : ''} {p.color ? `(${p.color})` : ''} {p.size_cut ? `[${p.size_cut}]` : ''}
                  </option>
                );
              })}
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

      {/* SUPPLIER STATEMENT MODAL (WITH PRINTING & EXCEL EXPORT) */}
      <Modal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        title={`كشف حساب تفصيلي: ${selectedSupplier?.name || ''}`}
        subtitle={`كود المورد: ${selectedSupplier?.code || `#${selectedSupplier?.id || ''}`} | هاتف: ${selectedSupplier?.phone || '-'} | الرصيد المستحق: ${Math.abs(Number(statementData?.summary?.balance ?? statementData?.summary?.current_balance ?? selectedSupplier?.balance ?? 0)).toLocaleString()} ج.م`}
        maxWidth="max-w-6xl"
      >
        {loadingStatement ? (
          <div className="py-20 text-center text-slate-400 font-bold text-sm">
            جاري تحميل كشف الحساب...
          </div>
        ) : (
          <div className="space-y-4" id="supplier-statement-area">
            {/* Header KPIs & Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-xs text-slate-500 font-bold block">إجمالي التوريدات</span>
                  <span className="text-base font-black text-slate-900">
                    {Number(statementData?.summary?.total_purchases ?? selectedSupplier?.total_purchases ?? 0).toLocaleString()} ج.م
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-bold block">إجمالي المرتجعات</span>
                  <span className="text-base font-black text-rose-600">
                    {Number(statementData?.summary?.total_returns ?? 0).toLocaleString()} ج.م
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-bold block">إجمالي المسدد</span>
                  <span className="text-base font-black text-emerald-600">
                    {Number(statementData?.summary?.total_paid ?? statementData?.summary?.total_payments ?? selectedSupplier?.total_paid ?? 0).toLocaleString()} ج.م
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 font-bold block">الرصيد النهائي المستحق</span>
                  <span className={`text-lg font-black ${
                    Math.abs(Number(statementData?.summary?.balance ?? statementData?.summary?.current_balance ?? selectedSupplier?.balance ?? 0)) > 0 ? 'text-rose-600' : 'text-slate-900'
                  }`}>
                    {Math.abs(Number(statementData?.summary?.balance ?? statementData?.summary?.current_balance ?? selectedSupplier?.balance ?? 0)).toLocaleString()} ج.م
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={Download}
                  isLoading={exportingExcel}
                  onClick={() => handleExportSupplierStatement(selectedSupplier)}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs"
                >
                  تصدير إكسيل
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Printer}
                  onClick={() => printElement('supplier-statement-area', `كشف حساب المورد: ${selectedSupplier?.name || ''}`)}
                >
                  طباعة الكشف
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const rawBal = statementData?.summary?.balance ?? statementData?.summary?.current_balance ?? selectedSupplier?.balance ?? 0;
                    setPaymentAmount(rawBal ? Math.abs(Number(rawBal)).toString() : '');
                    setShowPaymentModal(true);
                  }}
                  className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold"
                >
                  سداد دفعة
                </Button>
              </div>
            </div>

            {/* 11-Column Statement Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl max-h-[60vh]">
              <table className="w-full text-right text-xs">
                <thead className="sticky top-0 bg-slate-900 text-white font-black border-b border-slate-800 z-10">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3">رقم المرجع / الإذن</th>
                    <th className="p-3">الصنف / البيان</th>
                    <th className="p-3">الكمية</th>
                    <th className="p-3">سعر الوحدة</th>
                    <th className="p-3">مشتريات (مدين)</th>
                    <th className="p-3">مرتجع (دائن)</th>
                    <th className="p-3">مدفوعات (دائن)</th>
                    <th className="p-3">صافي الحركة</th>
                    <th className="p-3 text-emerald-400">الرصيد التراكمي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {statementData?.transactions && statementData.transactions.length > 0 ? (
                    statementData.transactions.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-3 text-slate-600 font-mono text-[11px]">
                          {tx.date || (tx.created_at ? String(tx.created_at).slice(0, 10) : '-')}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant={
                              tx.transaction_type === 'payment' || tx.type === 'payment'
                                ? 'success'
                                : tx.transaction_type === 'return' || tx.type === 'return'
                                ? 'danger'
                                : 'info'
                            }
                          >
                            {tx.transaction_type === 'payment' || tx.type === 'payment'
                              ? 'سداد دفعة'
                              : tx.transaction_type === 'return' || tx.type === 'return'
                              ? 'مرتجع بضاعة'
                              : 'توريد مشتريات'}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono font-bold text-slate-800">
                          {tx.reference_no || '-'}
                        </td>
                        <td className="p-3 text-slate-800 max-w-xs truncate" title={tx.description || tx.notes}>
                          {tx.description || tx.notes || '-'}
                        </td>
                        <td className="p-3 font-mono font-black text-indigo-600">
                          {tx.quantity !== null && tx.quantity !== undefined ? tx.quantity : '-'}
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {tx.price !== null && tx.price !== undefined ? `${Number(tx.price).toLocaleString()} ج.م` : '-'}
                        </td>
                        <td className="p-3 font-black text-slate-900">
                          {tx.purchases > 0 ? `${Number(tx.purchases).toLocaleString()} ج.م` : '-'}
                        </td>
                        <td className="p-3 font-bold text-rose-600">
                          {tx.returns > 0 ? `${Number(tx.returns).toLocaleString()} ج.م` : '-'}
                        </td>
                        <td className="p-3 font-black text-emerald-600">
                          {tx.payments > 0 ? `${Number(tx.payments).toLocaleString()} ج.م` : '-'}
                        </td>
                        <td className={`p-3 font-black font-mono ${
                          Number(tx.movement || 0) > 0 ? 'text-slate-900' : 'text-emerald-700'
                        }`}>
                          {Number(tx.movement || 0).toLocaleString()} ج.م
                        </td>
                        <td className="p-3 font-black text-sm text-indigo-700 bg-indigo-50/40 font-mono">
                          {Number(tx.cumulative_balance || 0).toLocaleString()} ج.م
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={11} className="p-12 text-center text-slate-400 font-bold">
                        لا توجد حركات مسجلة لهذا المورد
                      </td>
                    </tr>
                  )}
                </tbody>
                {statementData?.transactions && statementData.transactions.length > 0 && (
                  <tfoot className="bg-slate-100 font-black text-xs border-t-2 border-slate-300">
                    <tr>
                      <td colSpan={6} className="p-3 text-left pl-4 font-black text-slate-800">الإجمالي:</td>
                      <td className="p-3 font-black text-slate-900">
                        {Number(statementData?.summary?.total_purchases || 0).toLocaleString()} ج.م
                      </td>
                      <td className="p-3 font-black text-rose-600">
                        {Number(statementData?.summary?.total_returns || 0).toLocaleString()} ج.م
                      </td>
                      <td className="p-3 font-black text-emerald-600">
                        {Number(statementData?.summary?.total_paid ?? statementData?.summary?.total_payments ?? 0).toLocaleString()} ج.م
                      </td>
                      <td className="p-3 font-mono font-black text-slate-900">
                        {Number((statementData?.summary?.total_purchases || 0) - (statementData?.summary?.total_returns || 0) - (statementData?.summary?.total_paid ?? statementData?.summary?.total_payments ?? 0)).toLocaleString()} ج.م
                      </td>
                      <td className="p-3 font-mono font-black text-indigo-800 bg-indigo-100/50">
                        {Number(statementData?.summary?.balance ?? statementData?.summary?.current_balance ?? 0).toLocaleString()} ج.م
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* PRODUCT BARCODE PRINT MODAL */}
      <ProductBarcodePrintModal
        isOpen={showBarcodePrintModal}
        onClose={() => {
          setShowBarcodePrintModal(false);
          setSelectedProductForBarcode(null);
          setIsBarcodeNewlyCreated(false);
        }}
        product={selectedProductForBarcode}
        storeName={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.name || ''}
        logoUrl={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.logo_url}
        branchLogo={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.logo_url}
        branchId={activeBranchId}
        isNewlyCreated={isBarcodeNewlyCreated}
      />
    </div>
  );
}

export default Suppliers;
