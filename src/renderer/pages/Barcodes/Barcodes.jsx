import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { PAPER_TYPES, printBarcodes } from '../../utils/barcodePrint';

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

  // Paper / Label Type selection
  const [paperType, setPaperType] = useState(() => {
    try {
      return localStorage.getItem('barcode_paper_type') || 'thermal-80mm';
    } catch {
      return 'thermal-80mm';
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
  const [isPrinting, setIsPrinting] = useState(false);

  // Current store / branch name
  const currentBranch = branches?.find((b) => b.id === currentBranchId);
  const storeName = currentBranch?.name || 'Bebyoon Center';

  // Fetch Inventory
  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = inventoryType === 'rental' ? '/rental-inventory' : '/inventory';
      const params = new URLSearchParams({ page: 1, limit: 100 });

      if (search.trim()) params.set('search', search.trim());
      if (barcodeSearch.trim()) params.set('barcode', barcodeSearch.trim());

      const res = await client.get(`${endpoint}?${params.toString()}`);
      const list = Array.isArray(res)
        ? res
        : Array.isArray(res?.items)
        ? res.items
        : Array.isArray(res?.data)
        ? res.data
        : [];
      setProducts(list);

      // Default print counts
      setPrintCounts((prev) => {
        const next = { ...prev };
        list.forEach((p) => {
          if (!next[p.id]) next[p.id] = 1;
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
  }, [inventoryType, search, barcodeSearch, toast]);

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

  // Build Print Queue respecting copies & discounts
  const preparePrintQueue = (itemsToPrint) => {
    const queue = [];
    itemsToPrint.forEach((p) => {
      const copies = Math.max(1, Number(printCounts[p.id]) || 1);
      const discount = discountPrices[p.id];
      const basePrice = Number(p.price ?? p.rental_price ?? 0);
      const hasDiscount =
        discount && Number(discount) > 0 && Number(discount) < basePrice;
      const barcodeValue = String(p.barcode || String(p.id).padStart(6, '0')).trim();

      for (let i = 0; i < copies; i++) {
        queue.push({
          key: `${p.id}-${i}-${Date.now()}`,
          id: p.id,
          name: p.name || 'منتج بدون اسم',
          barcode: barcodeValue,
          color: p.color || '',
          size: p.size_cut || p.size || '',
          category: p.category || '',
          originalPrice: basePrice,
          discountPrice: hasDiscount ? Number(discount) : null,
          price: hasDiscount ? Number(discount) : basePrice,
        });
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

  // Handle batch print
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
    executePrint(selectedProducts);
  };

  // Handle single row print
  const handlePrintSingle = (prod) => {
    executePrint([prod]);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-white shadow-sm">
              <Barcode className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                طباعة باركود المنتجات
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                توليد وطباعة ملصقات الباركود والأسعار للطابعات الحرارية (ورق 80 مم واستيكرات)
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Paper / Label Type Selector */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm">
            <Printer className="w-4 h-4 text-indigo-600" />
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

          <Button
            variant="primary"
            icon={Printer}
            onClick={handlePrintSelected}
            disabled={selectedIds.length === 0 || isPrinting}
            loading={isPrinting}
          >
            طباعة المحدد ({selectedIds.length})
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
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  inventoryType === 'sales'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                بضاعة البيع
              </button>
              <button
                type="button"
                onClick={() => setInventoryType('rental')}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  inventoryType === 'rental'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                قطع التأجير
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                <Printer className="w-3.5 h-3.5" />
                <span>
                  النوع الحالي:{' '}
                  {PAPER_TYPES.find((pt) => pt.id === paperType)?.shortLabel ||
                    'حراري 80 مم'}
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
          </div>
        </div>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader
          title="قائمة المنتجات المتاحة للطباعة"
          subtitle="حدد المنتجات وحدد عدد الملصقات وسعر الخصم المطلوب طباعته"
        />

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white text-xs font-black">
                <th className="py-3.5 px-4 w-12 text-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="p-1 hover:text-slate-300 transition-colors"
                  >
                    {selectedIds.length > 0 &&
                    selectedIds.length === products.length ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">المنتج والتفاصيل</th>
                <th className="py-3.5 px-4">رقم الباركود</th>
                <th className="py-3.5 px-4">السعر الحالي</th>
                <th className="py-3.5 px-4 w-36">السعر بعد الخصم</th>
                <th className="py-3.5 px-4 w-32">عدد الملصقات</th>
                <th className="py-3.5 px-4 text-center">طباعة فردية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
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

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
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
                          {(p.size_cut || p.size) && (
                            <span>• مقاس: {p.size_cut || p.size}</span>
                          )}
                        </div>
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
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Printer}
                          onClick={() => handlePrintSingle(p)}
                          disabled={isPrinting}
                        >
                          طباعة
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default Barcodes;
