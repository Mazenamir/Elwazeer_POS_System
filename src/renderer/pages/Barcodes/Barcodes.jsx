// src/renderer/pages/Barcodes/Barcodes.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import {
  Barcode,
  Printer,
  Search,
  CheckSquare,
  Square,
  Package,
  Layers,
  Sliders,
  Eye,
  Cpu,
} from 'lucide-react';
import {
  PAPER_TYPES,
  printBarcodes,
  extractProductSizes,
} from '../../utils/barcodePrint';
import ProductBarcodePrintModal from '../../components/modals/ProductBarcodePrintModal';
import VirtualThermalPrinterModal from '../../components/modals/VirtualThermalPrinterModal';

export function Barcodes() {
  const { user } = useAuth();
  const { branches, currentBranchId } = useBranch();
  const { toast } = useToast();

  const [inventoryType, setInventoryType] = useState('sales'); // 'sales' | 'rental'
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [barcodeSearch, setBarcodeSearch] = useState('');

  // Paper / Label Type selection (default to 38x25mm sticker)
  const [paperType, setPaperType] = useState(() => {
    try {
      const saved = localStorage.getItem('barcode_paper_type');
      if (saved && saved !== 'thermal-80mm' && PAPER_TYPES.some((pt) => pt.id === saved)) {
        return saved;
      }
      return 'sticker-38x25mm';
    } catch {
      return 'sticker-38x25mm';
    }
  });

  const handlePaperTypeChange = (newType) => {
    setPaperType(newType);
    try {
      localStorage.setItem('barcode_paper_type', newType);
    } catch {}
  };

  // Selection & Print Settings per item
  const [selectedIds, setSelectedIds] = useState([]);
  const [printCounts, setPrintCounts] = useState({});
  const [discountPrices, setDiscountPrices] = useState({});
  const [selectedRowSizes, setSelectedRowSizes] = useState({}); // productId -> '__ALL_SEPARATE__' | 'size_name'
  const [isPrinting, setIsPrinting] = useState(false);

  // Detailed Modal for individual product size customization
  const [modalProduct, setModalProduct] = useState(null);

  // Virtual Thermal Printer Simulator State
  const [isVirtualMode, setIsVirtualMode] = useState(() => {
    try {
      const saved = localStorage.getItem('barcode_virtual_mode');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [simulatorQueue, setSimulatorQueue] = useState([]);

  const handleToggleVirtualMode = (val) => {
    setIsVirtualMode(val);
    try {
      localStorage.setItem('barcode_virtual_mode', String(val));
    } catch {}
  };

  // Current store / branch selection & logo
  const [selectedBranchId, setSelectedBranchId] = useState(() => {
    return (currentBranchId && currentBranchId !== 'all')
      ? currentBranchId
      : (user?.branch_id ? user.branch_id.toString() : 'default');
  });

  // Sync when currentBranchId or user branch changes
  useEffect(() => {
    if (currentBranchId && currentBranchId !== 'all') {
      setSelectedBranchId(currentBranchId.toString());
    } else if (user?.branch_id) {
      setSelectedBranchId(user.branch_id.toString());
    }
  }, [currentBranchId, user?.branch_id]);

  const selectedBranch = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== 'default' && selectedBranchId !== 'all') {
      const found = branches?.find((b) => b.id?.toString() === selectedBranchId?.toString());
      if (found) return found;
    }
    return (
      (currentBranchId && currentBranchId !== 'all' ? branches?.find((b) => b.id?.toString() === currentBranchId?.toString()) : null) ||
      (user?.branch_id ? branches?.find((b) => b.id?.toString() === user.branch_id.toString()) : null) ||
      branches?.find((b) => b.is_main_warehouse) ||
      branches?.[0] ||
      null
    );
  }, [branches, selectedBranchId, currentBranchId, user?.branch_id]);

  const effectiveBranchId = useMemo(() => {
    if (selectedBranchId && selectedBranchId !== 'default' && selectedBranchId !== 'all') {
      return selectedBranchId;
    }
    if (currentBranchId && currentBranchId !== 'all') {
      return currentBranchId;
    }
    if (user?.branch_id) {
      return user.branch_id.toString();
    }
    if (selectedBranch?.id) {
      return selectedBranch.id.toString();
    }
    return null;
  }, [selectedBranchId, currentBranchId, user?.branch_id, selectedBranch]);

  // Strict branch stock filtering toggle (default: true - only show products belonging to the branch)
  const [onlyBranchStock, setOnlyBranchStock] = useState(true);

  const storeName = selectedBranch?.name || 'Bebyoon Center';
  const branchLogo = selectedBranch?.logo_url || '/logos/app-icon.png';

  // Fetch Inventory
  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = inventoryType === 'rental' ? '/rental-inventory' : '/inventory';
      const params = new URLSearchParams({ page: 1, limit: 200 });

      if (effectiveBranchId) {
        params.set('branch_id', effectiveBranchId);
        if (onlyBranchStock) {
          params.set('stock_status', 'in_stock');
          params.set('branch_only', 'true');
        }
      }

      if (search.trim()) params.set('search', search.trim());
      if (barcodeSearch.trim()) params.set('barcode', barcodeSearch.trim());

      const res = await client.get(`${endpoint}?${params.toString()}`);
      let list = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : [];

      // Additional safeguard: verify branch stock if filtering by branch
      if (effectiveBranchId && onlyBranchStock) {
        list = list.filter((p) => {
          const st = Number(p.stock_level ?? 0);
          if (st > 0) return true;
          if (Array.isArray(p.sizes) && p.sizes.some((s) => Number(s.stock_level ?? 0) > 0)) {
            return true;
          }
          return false;
        });
      }

      setProducts(list);

      // Default print counts and size selections
      setPrintCounts((prev) => {
        const next = { ...prev };
        list.forEach((p) => {
          if (!next[p.id]) next[p.id] = 1;
        });
        return next;
      });

      setSelectedRowSizes((prev) => {
        const next = { ...prev };
        list.forEach((p) => {
          if (!next[p.id]) next[p.id] = '__ALL_SEPARATE__';
        });
        return next;
      });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل المنتجات',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [inventoryType, search, barcodeSearch, effectiveBranchId, onlyBranchStock, toast]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Toggle Selection
  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  // Build Print Queue respecting specific size selection, copies & discounts
  // Strictly prints individual stickers per size, never concatenating multiple sizes onto one sticker
  const preparePrintQueue = (itemsToPrint) => {
    const queue = [];

    itemsToPrint.forEach((p) => {
      const pSizes = extractProductSizes(p);
      const chosenSizeOption = selectedRowSizes[p.id] || '__ALL_SEPARATE__';
      const copies = Math.max(1, Number(printCounts[p.id]) || 1);
      const discount = discountPrices[p.id];
      const basePrice = Number(p.price ?? p.rental_price ?? 0);
      const hasDiscount =
        discount && Number(discount) > 0 && Number(discount) < basePrice;
      const finalDiscount = hasDiscount ? Number(discount) : null;
      const effectivePrice = hasDiscount ? Number(discount) : basePrice;
      const barcodeValue = String(p.barcode || String(p.id).padStart(6, '0')).trim();

      if (pSizes.length > 0) {
        if (chosenSizeOption === '__ALL_SEPARATE__') {
          // Print copies for EACH individual size separately
          pSizes.forEach((sz) => {
            for (let i = 0; i < copies; i++) {
              queue.push({
                key: `${p.id}-${sz.size_name}-${i}-${Date.now()}`,
                id: p.id,
                name: p.name || 'منتج بدون اسم',
                barcode: barcodeValue,
                color: sz.color_name || p.color || '',
                size: sz.size_name, // SINGLE SIZE ONLY!
                category: p.category || '',
                originalPrice: basePrice,
                discountPrice: finalDiscount,
                price: effectivePrice,
              });
            }
          });
        } else {
          // Print copies ONLY for the specifically chosen size
          const targetObj = pSizes.find((s) => s.size_name === chosenSizeOption);
          const sizeColor = targetObj?.color_name || p.color || '';

          for (let i = 0; i < copies; i++) {
            queue.push({
              key: `${p.id}-${chosenSizeOption}-${i}-${Date.now()}`,
              id: p.id,
              name: p.name || 'منتج بدون اسم',
              barcode: barcodeValue,
              color: sizeColor,
              size: chosenSizeOption, // ONLY THIS EXACT SIZE!
              category: p.category || '',
              originalPrice: basePrice,
              discountPrice: finalDiscount,
              price: effectivePrice,
            });
          }
        }
      } else {
        // Single size or no sizes
        const rawSize = String(p.size_cut || p.size || '').trim();
        for (let i = 0; i < copies; i++) {
          queue.push({
            key: `${p.id}-${i}-${Date.now()}`,
            id: p.id,
            name: p.name || 'منتج بدون اسم',
            barcode: barcodeValue,
            color: p.color || '',
            size: rawSize,
            category: p.category || '',
            originalPrice: basePrice,
            discountPrice: finalDiscount,
            price: effectivePrice,
          });
        }
      }
    });

    return queue;
  };

  // Execute printing via isolated hidden iframe
  const executePrint = async (items) => {
    if (!items || items.length === 0) return;

    try {
      setIsPrinting(true);
      const queue = preparePrintQueue(items);

      if (queue.length === 0) {
        toast({
          title: 'تنبيه',
          message: 'لا توجد ملصقات صالحة للطباعة',
          variant: 'warning',
        });
        return;
      }

      const activePaper =
        PAPER_TYPES.find((pt) => pt.id === paperType) || PAPER_TYPES[0];

      await printBarcodes(queue, paperType, {
        storeName,
        logoUrl: branchLogo,
        iframeId: 'barcode-print-frame',
      });

      toast({
        title: 'تم الإرسال للطباعة',
        message: `تم تجهيز ${queue.length} ملصق (${activePaper.label}) وإرسالها للطابعة`,
        variant: 'success',
      });
    } catch (err) {
      console.error('Barcode print error:', err);
      toast({
        title: 'خطأ أثناء الطباعة',
        message: err.message || 'تعذر إتمام عملية طباعة الباركود',
        variant: 'danger',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  // Handle batch print (respects virtual simulator mode)
  const handlePrintSelected = () => {
    if (selectedIds.length === 0) {
      toast({
        title: 'تنبيه',
        message: 'يرجى تحديد منتج واحد على الأقل للطباعة',
        variant: 'warning',
      });
      return;
    }

    const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
    if (isVirtualMode) {
      const queue = preparePrintQueue(selectedProducts);
      if (queue.length === 0) {
        toast({
          title: 'تنبيه',
          message: 'لا توجد ملصقات صالحة للمعاينة',
          variant: 'warning',
        });
        return;
      }
      setSimulatorQueue(queue);
      setIsSimulatorOpen(true);
    } else {
      executePrint(selectedProducts);
    }
  };

  // Handle single row print (respects virtual simulator mode)
  const handlePrintSingle = (prod) => {
    if (isVirtualMode) {
      const queue = preparePrintQueue([prod]);
      if (queue.length === 0) {
        toast({
          title: 'تنبيه',
          message: 'لا توجد ملصقات صالحة للمعاينة',
          variant: 'warning',
        });
        return;
      }
      setSimulatorQueue(queue);
      setIsSimulatorOpen(true);
    } else {
      executePrint([prod]);
    }
  };

  return (
    <div className="space-y-6 select-none" style={{ direction: 'rtl' }}>
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#151515] border border-[#24221F] flex items-center justify-center text-white shadow-sm">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                طباعة باركود المنتجات
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                توليد وطباعة ملصقات الباركود والأسعار للطابعات الحرارية مع اختيار المقاسات الفردية
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Paper / Label Type Selector */}
          <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3 py-2 shadow-sm">
            <Printer className="w-4 h-4 text-[#24221F]" />
            <label
              htmlFor="barcode-paper-select"
              className="text-xs font-bold text-slate-600 whitespace-nowrap"
            >
              نوع الورق:
            </label>
            <select
              id="barcode-paper-select"
              value={paperType}
              onChange={(e) => handlePaperTypeChange(e.target.value)}
              className="text-xs font-black text-slate-900 bg-transparent border-0 focus:ring-0 cursor-pointer pr-1"
            >
              {PAPER_TYPES.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Branch & Logo Selector */}
          {branches && branches.length > 0 && (
            <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3 py-2 shadow-sm">
              {branchLogo && (
                <img
                  src={branchLogo}
                  alt=""
                  className="w-4 h-4 object-contain rounded shrink-0"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <label
                htmlFor="barcode-branch-select"
                className="text-xs font-bold text-slate-600 whitespace-nowrap"
              >
                فرع الطباعة:
              </label>
              <select
                id="barcode-branch-select"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="text-xs font-black text-slate-900 bg-transparent border-0 focus:ring-0 cursor-pointer pr-1"
              >
                <option value="default">الفرع الافتراضي</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name} {b.is_main_warehouse ? '(رئيسي)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Virtual Thermal Printer Simulator Toggle */}
          <div className="flex items-center gap-2 bg-[#FFFDF9] border border-[#E6DECD] rounded-xl px-3 py-1.5 shadow-sm">
            <label
              htmlFor="barcode-virtual-toggle"
              className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none"
            >
              <div className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  id="barcode-virtual-toggle"
                  checked={isVirtualMode}
                  onChange={(e) => handleToggleVirtualMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-violet-600"></div>
              </div>
              <span className="flex items-center gap-1.5">
                <Cpu className={`w-3.5 h-3.5 ${isVirtualMode ? 'text-violet-600' : 'text-slate-400'}`} />
                <span className={isVirtualMode ? 'text-violet-900 font-black' : 'text-slate-600 font-bold'}>
                  معاينة الطابعة الافتراضية
                </span>
                {isVirtualMode && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-black bg-violet-100 text-violet-700 border border-violet-200">
                    نشط
                  </span>
                )}
              </span>
            </label>
          </div>

          <Button
            variant="primary"
            icon={isVirtualMode ? Eye : Printer}
            onClick={handlePrintSelected}
            disabled={selectedIds.length === 0 || isPrinting}
            loading={isPrinting}
            className={isVirtualMode ? "!bg-violet-700 hover:!bg-violet-800 shadow-md shadow-violet-900/10" : ""}
          >
            {isVirtualMode
              ? `معاينة الطباعة الافتراضية (${selectedIds.length})`
              : `طباعة المحدد (${selectedIds.length})`}
          </Button>
        </div>
      </div>

      {/* Mode Switch & Search Filter */}
      <Card>
        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setInventoryType('sales')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  inventoryType === 'sales'
                    ? 'bg-[#151515] text-white shadow-sm'
                    : 'bg-[#FAF6ED] text-[#777266] hover:bg-[#F3ECE0]'
                }`}
              >
                بضاعة البيع
              </button>
              <button
                type="button"
                onClick={() => setInventoryType('rental')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${
                  inventoryType === 'rental'
                    ? 'bg-[#151515] text-white shadow-sm'
                    : 'bg-[#FAF6ED] text-[#777266] hover:bg-[#F3ECE0]'
                }`}
              >
                قطع التأجير
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#FFF9EC] text-[#24221F] font-bold border border-[#E6DECD]">
                <Printer className="w-3.5 h-3.5" />
                <span>
                  النوع الحالي:{' '}
                  {PAPER_TYPES.find((pt) => pt.id === paperType)?.shortLabel ||
                    'ستيكر 38×25'}
                </span>
              </span>
              <span className="text-slate-500 font-bold">
                تم اختيار{' '}
                <span className="text-slate-900 font-black">{selectedIds.length}</span>{' '}
                من{' '}
                <span className="text-slate-900 font-black">{products.length}</span>{' '}
                منتج
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <Input
              placeholder="ابحث باسم المنتج أو الموديل..."
              icon={Search}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <Input
              placeholder="ابحث برقم الباركود..."
              icon={Barcode}
              value={barcodeSearch}
              onChange={(e) => setBarcodeSearch(e.target.value)}
            />

            <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none bg-[#FAF6ED] border border-[#E6DECD] px-3 py-1.5 rounded-xl hover:bg-[#F3ECE0] transition-colors">
                <input
                  type="checkbox"
                  checked={onlyBranchStock}
                  onChange={(e) => setOnlyBranchStock(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>إظهار منتجات هذا الفرع المتوفرة فقط (رصيد &gt; 0)</span>
              </label>

              {effectiveBranchId && selectedBranch && (
                <span className="text-xs font-semibold text-slate-500">
                  فرع الطباعة النشط:{' '}
                  <span className="font-black text-slate-800">{selectedBranch.name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader
          title={
            selectedBranch
              ? `قائمة منتجات فرع ${selectedBranch.name}`
              : 'قائمة المنتجات المتاحة للطباعة'
          }
          subtitle={
            onlyBranchStock && selectedBranch
              ? `يتم عرض المنتجات المتوفرة بمخزون فرع "${selectedBranch.name}". يمكنك إلغاء تفعيل الخيار أعلاه لعرض كامل المنتجات.`
              : 'يمكنك تحديد المقاس المطلوب طباعته تحديداً لكل منتج، أو فتح تخصيص المقاسات لضبط الكمية لكل مقاس'
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-[#151515] text-white text-xs font-bold">
                <th className="py-3 px-4 w-12 text-center rounded-r-xl">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="p-1 hover:text-slate-300 transition-colors cursor-pointer"
                  >
                    {selectedIds.length > 0 &&
                    selectedIds.length === products.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4">المنتج والمقاس المطلوب</th>
                <th className="py-3 px-4">رقم الباركود</th>
                <th className="py-3 px-4">السعر الحالي</th>
                <th className="py-3 px-4 w-36">السعر بعد الخصم</th>
                <th className="py-3 px-4 w-32">عدد الملصقات</th>
                <th className="py-3 px-4 text-center rounded-l-xl">طباعة فردية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6DECD]/60 text-sm">
              {loading ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-slate-400 font-bold"
                  >
                    جارِ تحميل المنتجات...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-16 text-center text-slate-400 font-bold"
                  >
                    <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    لا توجد منتجات مسجلة مطابقة للبحث
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const isSelected = selectedIds.includes(p.id);
                  const pSizes = extractProductSizes(p);
                  const hasMultiSizes = pSizes.length > 0;

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-[#FAF6ED]' : 'hover:bg-[#FAF6ED]/60'
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-black text-slate-900">{p.name}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span className="font-mono text-indigo-600 font-bold">
                            كود: #{p.id}
                          </span>
                          {p.category && <span>• {p.category}</span>}
                          {p.color && <span>• لون: {p.color}</span>}
                          {p.stock_level !== undefined && (
                            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px]">
                              رصيد الفرع: {p.stock_level}
                            </span>
                          )}
                        </div>

                        {/* SELECTIVE SIZE DROPDOWN & CUSTOMIZE BUTTON */}
                        {hasMultiSizes ? (
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                              المقاس:
                            </span>
                            <select
                              value={selectedRowSizes[p.id] || '__ALL_SEPARATE__'}
                              onChange={(e) =>
                                setSelectedRowSizes({
                                  ...selectedRowSizes,
                                  [p.id]: e.target.value,
                                })
                              }
                              className="text-xs font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1 focus:ring-1 focus:ring-indigo-600 cursor-pointer"
                            >
                              <option value="__ALL_SEPARATE__">
                                ⚡ جميع المقاسات ({pSizes.length} مقاسات - ملصق لكل مقاس)
                              </option>
                              {pSizes.map((sz) => (
                                <option key={sz.id || `${sz.size_name}-${sz.color_name}`} value={sz.size_name}>
                                  مقاس {sz.size_name}{' '}
                                  {sz.color_name ? `(${sz.color_name})` : ''}{' '}
                                  {sz.stock_level > 0 ? `[رصيد: ${sz.stock_level}]` : ''}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => setModalProduct(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                              title="تخصيص كميات كل مقاس على حدة"
                            >
                              <Sliders className="w-3 h-3" />
                              <span>تخصيص المقاسات</span>
                            </button>
                          </div>
                        ) : (
                          (p.size_cut || p.size) && (
                            <div className="text-xs text-slate-500 font-bold mt-1">
                              المقاس: {p.size_cut || p.size}
                            </div>
                          )
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-xs font-bold text-slate-700">
                        {p.barcode ? `#${p.barcode}` : '-'}
                      </td>

                      <td className="py-3 px-4 font-black text-slate-900 whitespace-nowrap">
                        {Number(p.price || p.rental_price || 0)} ج.م
                      </td>

                      <td className="py-3 px-4">
                        <Input
                          type="number"
                          min="0"
                          placeholder="سعر مخفض"
                          value={discountPrices[p.id] || ''}
                          onChange={(e) =>
                            setDiscountPrices({
                              ...discountPrices,
                              [p.id]: e.target.value,
                            })
                          }
                        />
                      </td>

                      <td className="py-3 px-4">
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={printCounts[p.id] || 1}
                          onChange={(e) =>
                            setPrintCounts({
                              ...printCounts,
                              [p.id]: Math.max(1, Number(e.target.value)),
                            })
                          }
                        />
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={isVirtualMode ? Eye : Printer}
                            onClick={() => handlePrintSingle(p)}
                            disabled={isPrinting}
                            className={isVirtualMode ? "hover:!border-violet-400 hover:!text-violet-700" : ""}
                          >
                            {isVirtualMode ? 'معاينة' : 'طباعة'}
                          </Button>
                          {hasMultiSizes && (
                            <button
                              type="button"
                              onClick={() => setModalProduct(p)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              title="تخصيص كميات المقاسات وطباعتها"
                            >
                              <Sliders className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* DETAIL PRODUCT BARCODE PRINT MODAL */}
      <ProductBarcodePrintModal
        isOpen={!!modalProduct}
        onClose={() => setModalProduct(null)}
        product={modalProduct}
        storeName={storeName}
        logoUrl={branchLogo}
        branchLogo={branchLogo}
        branchId={selectedBranch?.id || currentBranchId}
        isNewlyCreated={false}
      />

      {/* VIRTUAL THERMAL PRINTER SIMULATOR MODAL */}
      <VirtualThermalPrinterModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        queue={simulatorQueue}
        paperType={paperType}
        storeName={storeName}
        logoUrl={branchLogo}
        onPrintPhysical={async () => {
          await printBarcodes(simulatorQueue, paperType, {
            storeName,
            logoUrl: branchLogo,
            iframeId: 'barcode-print-frame',
          });
        }}
      />
    </div>
  );
}

export default Barcodes;
