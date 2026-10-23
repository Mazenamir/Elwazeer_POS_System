import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  Barcode,
  Tag,
  ArrowRightLeft,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
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
import ProductBarcodePrintModal from '../../components/modals/ProductBarcodePrintModal';

const BASE_CATEGORIES = ['الكل', 'TUXEDO SUIT', 'FORMAL SUIT', 'CASUAL SUIT', 'بليزر', 'بدل', 'بنطلون', 'قميص', 'كرافت', 'بيبيون', 'حذاء', 'نصف ياقة', 'أخرى'];

export function RentalInventory() {
  const { user, isAdmin } = useAuth();
  const { activeBranchId, branches } = useBranch();
  const toast = useToast();

  const [items, setItems] = useState([]);
  const [categoriesList, setCategoriesList] = useState(BASE_CATEGORIES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  });

  // Add / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Barcode Print Modal State
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [selectedRentalForBarcode, setSelectedRentalForBarcode] = useState(null);
  const [isBarcodeNewlyCreated, setIsBarcodeNewlyCreated] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('TUXEDO SUIT');
  const [color, setColor] = useState('');
  const [sizeCut, setSizeCut] = useState('');
  const [barcode, setBarcode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [stockLevel, setStockLevel] = useState('1');

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

  // Load Inventory
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const query = new URLSearchParams();
      if (activeBranchId && activeBranchId !== 'all') query.append('branch_id', activeBranchId);
      if (search.trim()) query.append('search', search.trim());
      if (selectedCategory !== 'الكل') query.append('category', selectedCategory);

      if (pagination.limit === 'all') {
        query.append('all', 'true');
      } else {
        query.append('page', pagination.page.toString());
        query.append('limit', pagination.limit.toString());
      }

      const data = await api.get(`/rental-inventory?${query.toString()}`);
      const list = Array.isArray(data) ? data : data?.items || [];
      setItems(list);

      if (data?.pagination) {
        setPagination((prev) => ({
          ...prev,
          total: data.pagination.total ?? prev.total,
          totalPages: data.pagination.totalPages || 1,
        }));
      } else if (typeof data?.total === 'number') {
        setPagination((prev) => ({
          ...prev,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / (prev.limit === 'all' ? data.total || 1 : prev.limit))),
        }));
      } else {
        setPagination((prev) => ({
          ...prev,
          total: list.length,
          totalPages: 1,
        }));
      }
    } catch (err) {
      console.error('Failed to load rental inventory:', err);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, search, selectedCategory, pagination.page, pagination.limit]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [activeBranchId]);

  const handlePageChange = (newPage) => {
    const pageNum = Math.max(1, Math.min(newPage, pagination.totalPages));
    setPagination((prev) => ({ ...prev, page: pageNum }));
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({
      ...prev,
      limit: newLimit === 'all' ? 'all' : Number(newLimit),
      page: 1,
    }));
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setName('');
    setCategory('TUXEDO SUIT');
    setColor('');
    setSizeCut('');
    setBarcode('');
    setImageUrl('');
    setStockLevel('1');
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setName(item.name || '');
    setCategory(item.category || 'TUXEDO SUIT');
    setColor(item.color || '');
    setSizeCut(item.size_cut || '');
    setBarcode(item.barcode || '');
    setImageUrl(item.image_url || '');
    setStockLevel(item.stock_level ? item.stock_level.toString() : '1');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('الرجاء إدخال اسم القطعة');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        category,
        color: color.trim(),
        size_cut: sizeCut.trim(),
        barcode: barcode.trim(),
        image_url: imageUrl.trim(),
        stock_level: Number(stockLevel) || 1,
        branch_stocks: [
          {
            branch_id: (activeBranchId && activeBranchId !== 'all') ? Number(activeBranchId) : (branches[0]?.id || 1),
            stock_level: Number(stockLevel) || 1,
          },
        ],
      };

      if (editingItem) {
        await api.put(`/rental-inventory/${editingItem.id}`, payload);
        toast.success('تم تحديث بيانات القطعة بنجاح! ✅');
      } else {
        const res = await api.post('/rental-inventory', payload);
        toast.success('تمت إضافة قطعة التأجير للمخزون بنجاح! 👗');

        const createdRental = {
          ...(res || {}),
          id: res?.id || Date.now(),
          name: name.trim(),
          category,
          color: color.trim(),
          size: sizeCut.trim(),
          size_cut: sizeCut.trim(),
          barcode: res?.barcode || barcode.trim() || '',
          rental_price: Number(res?.rental_price) || Number(rentalPrice) || 0,
          price: Number(res?.rental_price) || Number(rentalPrice) || Number(res?.price) || 0,
        };
        setSelectedRentalForBarcode(createdRental);
        setIsBarcodeNewlyCreated(true);
        setShowBarcodeModal(true);
      }

      setShowModal(false);
      fetchItems();
    } catch (err) {
      toast.error(err.message || 'فشل حفظ القطعة');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('هل أنت متأكد من حذف هذه القطعة من المخزون؟')) return;
    try {
      await api.delete(`/rental-inventory/${id}`);
      toast.success('تم حذف القطعة بنجاح');
      fetchItems();
    } catch (err) {
      toast.error(err.message || 'فشل حذف القطعة');
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto select-none" style={{ direction: 'rtl' }}>
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            مخزون بدل التأجير 🤵
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            سجل بدل الزفاف (عريس)، السموكنج، البدل الرسمية، ومتابعة توفرها والباركود
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon={Plus}
          onClick={openCreateModal}
        >
          إضافة بدلة جديدة للمخزون
        </Button>
      </div>

      {/* Categories Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        {categoriesList.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setSelectedCategory(cat);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-[#151515] text-white shadow-sm'
                : 'bg-[#FFFDF9] border border-[#E6DECD] text-[#777266] hover:bg-[#FAF6ED] hover:text-[#24221F]'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Table Card */}
      <Card>
        <CardHeader
          title="قطع وموديلات التأجير"
          subtitle={`إجمالي قطع التأجير: ${Number(pagination.total || items.length).toLocaleString()} قطعة${
            pagination.totalPages > 1 && pagination.limit !== 'all'
              ? ` (صفحة ${pagination.page} من ${pagination.totalPages})`
              : ''
          }`}
          action={
            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#777266]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPagination((prev) => ({ ...prev, page: 1 }));
                  }}
                  placeholder="ابحث بالاسم، اللون، الباركود..."
                  className="w-full bg-[#FFFDF9] border border-[#E6DECD] rounded-xl pr-9 pl-3 py-2 text-xs font-bold text-[#24221F] outline-none focus:border-[#151515] transition-colors"
                />
              </div>
              <Button variant="outline" size="sm" onClick={fetchItems} icon={RotateCcw}>
                تحديث
              </Button>
            </div>
          }
        />

        {loading ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            جاري تحميل قطع التأجير...
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-[#777266] font-bold text-sm">
            لا توجد قطع مطابقة للبحث في المخزون
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-[#E6DECD] text-[#777266] text-xs font-black uppercase">
                  <th className="pb-3 pr-2">الصورة</th>
                  <th className="pb-3">اسم القطعة والكود</th>
                  <th className="pb-3">التصنيف</th>
                  <th className="pb-3">اللون والمقاس</th>
                  <th className="pb-3">الباركود</th>
                  <th className="pb-3">الرصيد المتوفر</th>
                  <th className="pb-3 pl-2">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/70 font-medium">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                    <td className="py-3 pr-2">
                      <div className="w-12 h-12 rounded-xl bg-[#FAF6ED] border border-[#E6DECD] flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Tag className="w-5 h-5 text-[#777266]" />
                        )}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-100">
                          كود: #{item.id}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <Badge variant="neutral">{item.category || 'عام'}</Badge>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        {item.color && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {item.color}
                          </span>
                        )}
                        {item.size_cut && (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {item.size_cut}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 font-mono text-xs text-slate-500" dir="ltr">
                      {item.barcode || '-'}
                    </td>
                    <td className="py-3 font-black text-indigo-600">
                      {item.stock_level ?? 1} قطعة
                    </td>
                    <td className="py-3 pl-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedRentalForBarcode(item);
                            setIsBarcodeNewlyCreated(false);
                            setShowBarcodeModal(true);
                          }}
                          className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                          title="طباعة باركود القطعة"
                        >
                          <Barcode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="تعديل"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(item.id)}
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

        {/* Rental Pagination Bar */}
        {pagination.total > 0 && (
          <div className="p-4 border-t border-[#E6DECD] flex flex-col md:flex-row items-center justify-between gap-3 bg-[#FAF6ED]/60 rounded-b-3xl">
            {/* Info summary & Page size */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#777266]">
              <span>
                عرض{' '}
                <span className="text-[#24221F] font-black">
                  {pagination.limit === 'all'
                    ? `1 - ${pagination.total}`
                    : `${(pagination.page - 1) * pagination.limit + 1} - ${Math.min(
                        pagination.page * pagination.limit,
                        pagination.total
                      )}`}
                </span>{' '}
                من إجمالي{' '}
                <span className="text-[#24221F] font-black">
                  {Number(pagination.total).toLocaleString()}
                </span>{' '}
                قطعة
              </span>

              <div className="flex items-center gap-1.5 mr-2">
                <span className="text-[#777266]">لكل صفحة:</span>
                {[30, 50, 100, 200, 'الكل'].map((lim) => (
                  <button
                    key={lim}
                    onClick={() => handleLimitChange(lim)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      pagination.limit === lim || (lim === 'الكل' && pagination.limit === 'all')
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
            {pagination.totalPages > 1 && pagination.limit !== 'all' && (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(1)}
                  title="الصفحة الأولى"
                  className="!px-2"
                >
                  <ChevronsRight className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className="!text-xs !py-1"
                >
                  <ChevronRight className="w-3.5 h-3.5 ml-1" />
                  السابق
                </Button>

                <span className="px-3 py-1 bg-[#FFFDF9] border border-[#E6DECD] rounded-lg text-xs font-black text-[#24221F]">
                  صفحة {pagination.page} من {pagination.totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className="!text-xs !py-1"
                >
                  التالي
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => handlePageChange(pagination.totalPages)}
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

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingItem ? 'تعديل بدلة التأجير 🤵' : 'إضافة بدلة تأجير جديدة 🤵'}
        subtitle="أدخل تفاصيل ومواصفات البدلة"
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingItem && (
            <div className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
              <span>كود الصنف: #{editingItem.id}</span>
              <span>الباركود: {editingItem.barcode || 'غير محدد'}</span>
            </div>
          )}

          <Input
            label="اسم البدلة أو الموديل *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: كورشال شمواه خط ستان، دوران لميع، بدلة سموكنج شال كحلي..."
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">التصنيف</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-white border-2 border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-800 outline-none focus:border-indigo-600"
              >
                {categoriesList.filter((c) => c !== 'الكل').map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="اللون"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="أسود، كحلي، رمادي، كافيه، أبيض، نبيتي..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="المقاس"
              value={sizeCut}
              onChange={(e) => setSizeCut(e.target.value)}
              placeholder="S, M, L, XL, 42, 44..."
            />
            <Input
              label="الباركود (يترك فارغاً للتوليد التلقائي)"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="باركود القطعة..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="رابط صورة القطعة (اختياري)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
            <Input
              label="الكمية المتوفرة بالمخزن"
              type="number"
              min="1"
              value={stockLevel}
              onChange={(e) => setStockLevel(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              isLoading={submitting}
              className="flex-1 !bg-indigo-600 hover:!bg-indigo-700 font-black text-base"
            >
              {editingItem ? 'حفظ التعديلات' : 'إضافة إلى المخزون'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setShowModal(false)}
            >
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>

      {/* RENTAL PRODUCT BARCODE PRINT MODAL */}
      <ProductBarcodePrintModal
        isOpen={showBarcodeModal}
        onClose={() => {
          setShowBarcodeModal(false);
          setSelectedRentalForBarcode(null);
          setIsBarcodeNewlyCreated(false);
        }}
        product={selectedRentalForBarcode}
        storeName={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.name || ''}
        logoUrl={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.logo_url}
        branchLogo={branches?.find((b) => b.id?.toString() === activeBranchId?.toString())?.logo_url}
        branchId={activeBranchId}
        isNewlyCreated={isBarcodeNewlyCreated}
      />
    </div>
  );
}

export default RentalInventory;
