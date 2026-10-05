import React, { useState, useEffect, useCallback, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../api/client';
import {
  Barcode,
  Printer,
  Search,
  CheckSquare,
  Square,
  Tag,
  RotateCcw,
  Package,
  Layers,
  Sparkles,
} from 'lucide-react';

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
  const [showVariants, setShowVariants] = useState(false);

  // Selection & Print Settings per item
  const [selectedIds, setSelectedIds] = useState([]);
  const [printCounts, setPrintCounts] = useState({});
  const [discountPrices, setDiscountPrices] = useState({});

  // Active Print Queue
  const [printQueue, setPrintQueue] = useState([]);
  const [isPrinting, setIsPrinting] = useState(false);

  // Fetch Inventory
  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      const endpoint = inventoryType === 'rental' ? '/rental-inventory' : '/inventory';
      const params = new URLSearchParams({ page: 1, limit: 100 });

      if (search.trim()) params.set('search', search.trim());
      if (barcodeSearch.trim()) params.set('barcode', barcodeSearch.trim());

      const res = await client.get(`${endpoint}?${params.toString()}`);
      const list = Array.isArray(res) ? res : Array.isArray(res?.items) ? res.items : Array.isArray(res?.data) ? res.data : [];
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

  // Build Print Queue & Draw Barcodes
  const preparePrintQueue = (itemsToPrint) => {
    const queue = [];
    itemsToPrint.forEach((p) => {
      const copies = Number(printCounts[p.id]) || 1;
      const discount = discountPrices[p.id];
      const hasDiscount = discount && Number(discount) > 0 && Number(discount) < Number(p.price);

      for (let i = 0; i < copies; i++) {
        queue.push({
          key: `${p.id}-${i}-${Date.now()}`,
          id: p.id,
          name: p.name,
          barcode: p.barcode || String(p.id).padStart(6, '0'),
          color: p.color,
          size: p.size_cut || p.size,
          originalPrice: Number(p.price || p.rental_price || 0),
          discountPrice: hasDiscount ? Number(discount) : null,
          price: hasDiscount ? Number(discount) : Number(p.price || p.rental_price || 0),
        });
      }
    });
    return queue;
  };

  // Render Barcodes on canvas elements
  useEffect(() => {
    if (printQueue.length === 0) return;

    printQueue.forEach((item) => {
      const canvas = document.getElementById(`barcode-canvas-${item.key}`);
      if (!canvas) return;

      try {
        JsBarcode(canvas, String(item.barcode), {
          format: 'CODE128',
          width: 1.2,
          height: 40,
          displayValue: false,
          margin: 0,
          lineColor: '#000000',
          background: '#ffffff',
        });
      } catch (err) {
        console.warn('JsBarcode render error for:', item.barcode, err);
      }
    });

    if (isPrinting) {
      setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 300);
    }
  }, [printQueue, isPrinting]);

  // Handle Print Action
  const handlePrintSelected = () => {
    if (selectedIds.length === 0) {
      toast({ title: 'تنبيه', message: 'يرجى تحديد منتج واحد على الأقل للطباعة', variant: 'warning' });
      return;
    }

    const selectedProducts = products.filter((p) => selectedIds.includes(p.id));
    const queue = preparePrintQueue(selectedProducts);
    setPrintQueue(queue);
    setIsPrinting(true);
  };

  const handlePrintSingle = (prod) => {
    const queue = preparePrintQueue([prod]);
    setPrintQueue(queue);
    setIsPrinting(true);
  };

  return (
    <div className="space-y-6">
      {/* Printable Area - Only Visible on Thermal Print */}
      <div className="hidden print:block print:w-full print:m-0 print:p-0">
        <style>{`
          @media print {
            @page {
              size: 38mm 25mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background: white !important;
            }
            .barcode-label-ticket {
              width: 38mm;
              height: 25mm;
              page-break-after: always;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: space-between;
              padding: 1.5mm;
              box-sizing: border-box;
              text-align: center;
              font-family: 'Cairo', sans-serif;
              color: black;
            }
          }
        `}</style>

        {printQueue.map((item) => (
          <div key={item.key} className="barcode-label-ticket">
            {/* Header: Store Name */}
            <div className="text-[7pt] font-black tracking-tight leading-none">
              Bebyoon Center
            </div>

            {/* Product Name & Variant */}
            <div className="text-[6.5pt] font-black leading-tight max-w-full truncate px-1">
              {item.name}
            </div>

            {(item.color || item.size) && (
              <div className="text-[5pt] font-bold leading-none text-slate-800">
                {[item.color, item.size ? `مقاس ${item.size}` : ''].filter(Boolean).join(' - ')}
              </div>
            )}

            {/* Barcode Canvas */}
            <div className="my-0.5">
              <canvas id={`barcode-canvas-${item.key}`} className="w-[28mm] h-[8mm]" />
            </div>

            {/* Barcode Number */}
            <div className="text-[6pt] font-mono font-black tracking-wider leading-none">
              {item.barcode}
            </div>

            {/* Price */}
            <div className="text-[7.5pt] font-black leading-none flex items-center justify-center gap-1">
              {item.discountPrice ? (
                <>
                  <span className="line-through text-[5.5pt] font-normal">{item.originalPrice} ج.م</span>
                  <span>{item.discountPrice} ج.م</span>
                </>
              ) : (
                <span>{item.originalPrice} ج.م</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Screen View */}
      <div className="print:hidden space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
                  توليد وطباعة ملصقات الباركود والأسعار للطابعات الحرارية (مقاس 38×25 مم)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              icon={Printer}
              onClick={handlePrintSelected}
              disabled={selectedIds.length === 0}
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

              <div className="text-xs font-bold text-slate-500">
                تم اختيار <span className="text-slate-900 font-black">{selectedIds.length}</span> من{' '}
                <span className="text-slate-900 font-black">{products.length}</span> منتج
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
                      {selectedIds.length > 0 && selectedIds.length === products.length ? (
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
                    <td colSpan={7} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل المنتجات...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-400 font-bold">
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
                            <span className="font-mono text-indigo-600 font-bold">كود: #{p.id}</span>
                            {p.category && <span>• {p.category}</span>}
                            {p.color && <span>• لون: {p.color}</span>}
                            {(p.size_cut || p.size) && <span>• مقاس: {p.size_cut || p.size}</span>}
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
                              setDiscountPrices({ ...discountPrices, [p.id]: e.target.value })
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
                              setPrintCounts({ ...printCounts, [p.id]: Math.max(1, Number(e.target.value)) })
                            }
                          />
                        </td>

                        <td className="py-3 px-4 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Printer}
                            onClick={() => handlePrintSingle(p)}
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
    </div>
  );
}

export default Barcodes;
