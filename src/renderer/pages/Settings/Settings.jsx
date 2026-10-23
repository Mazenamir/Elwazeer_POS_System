import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import {
  Settings as SettingsIcon,
  Save,
  Building,
  Users,
  Database,
  Receipt,
  Plus,
  Edit,
  Trash2,
  Lock,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Store,
} from 'lucide-react';

const PRESET_LOGOS = [
  { id: 'antalya', label: 'فرع أنطاليا (Antalya)', url: '/logos/Antalya logo.png' },
  { id: 'elwazer', label: 'فرع الوزير (El Wazer)', url: '/logos/elwazer.png' },
  { id: 'app-icon', label: 'الشعار الرئيسي (ببيون BEBYOON)', url: '/logos/app-icon.png' },
  { id: 'men', label: 'فرع رجالي (بدل رجالي)', url: '/logos/men.png' },
  { id: 'women', label: 'فرع حريمي (فساتين حريمي)', url: '/logos/women.png' },
];

export function Settings() {
  const { user } = useAuth();
  const { branches, reloadBranches } = useBranch();
  const { toast } = useToast();

  const isAhmedUser = Boolean(
    user?.username &&
    (user.username.trim().toLowerCase() === 'احمد' ||
     user.username.trim().toLowerCase() === 'ahmed' ||
     user.username.includes('احمد') ||
     user.username.toLowerCase().includes('ahmed'))
  );

  const [activeTab, setActiveTab] = useState('store'); // 'store' | 'branches' | 'users' | 'backup'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Store & Invoice Settings
  const [settings, setSettings] = useState({
    store_name: 'Bebyoon Center',
    tax_rate: '0',
    store_email: '',
    store_phone: '',
    store_address: '',
    show_email: 'true',
    show_phone: 'true',
    show_address: 'true',
    cashier_footer: 'شكراً لزيارتكم',
    rental_footer: 'شكراً لزيارتكم',
    rental_fine_per_day: '50',
    currency: 'ج.م',
    salary_password: '',
    profit_password: '',
    invoice_edit_password: '',
  });

  // Users List & Modal
  const [branchUsers, setBranchUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '',
    password: '',
    role: 'cashier',
    branch_id: '',
  });

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [branchForm, setBranchForm] = useState({
    name: '',
    phone: '',
    address: '',
    location: '',
    logo_url: '',
    is_main_warehouse: false,
    invoice_logo_height: 160,
    invoice_logo_spacing: 8,
  });

  // Backup & Restore
  const [backupGroups, setBackupGroups] = useState({
    settings: true,
    users: true,
    customers: true,
    inventory: true,
    suppliers: true,
    sales: true,
    rentals: true,
  });
  const [restoring, setRestoring] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);

  // System Wipe / Reset Modal
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [wipeWord, setWipeWord] = useState('');
  const [wipePassword, setWipePassword] = useState('');
  const [wipeSubmitting, setWipeSubmitting] = useState(false);

  // Load General Settings
  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await client.get('/settings');
      if (res.data) {
        setSettings((prev) => ({ ...prev, ...res.data }));
      }
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل الإعدادات',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Load Branch Users
  const loadBranchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const res = await client.get('/users/branch');
      setBranchUsers(Array.isArray(res.data) ? res.data : []);
    } catch {
      setBranchUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (activeTab === 'users') {
      loadBranchUsers();
    }
  }, [activeTab, loadBranchUsers]);

  // Save Settings
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const payload = { ...settings };
      if (!isAhmedUser) {
        delete payload.profit_password;
      }
      await client.post('/settings', payload);
      toast({
        title: 'تم الحفظ',
        message: 'تم حفظ وتحديث إعدادات النظام بنجاح',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ في الحفظ',
        message: err.message || 'تعذر حفظ الإعدادات',
        variant: 'danger',
      });
    } finally {
      setSaving(false);
    }
  };

  // Branch CRUD
  const handleOpenAddBranch = () => {
    setIsEditingBranch(false);
    setEditingBranchId(null);
    setBranchForm({
      name: '',
      phone: '',
      address: '',
      location: '',
      logo_url: '',
      is_main_warehouse: false,
      invoice_logo_height: 160,
      invoice_logo_spacing: 8,
    });
    setShowBranchModal(true);
  };

  const handleOpenEditBranch = (b) => {
    setIsEditingBranch(true);
    setEditingBranchId(b.id);
    const loc = b.location || b.address || '';
    setBranchForm({
      name: b.name || '',
      phone: b.phone || '',
      address: loc,
      location: loc,
      logo_url: b.logo_url || '',
      is_main_warehouse: Boolean(b.is_main_warehouse),
      invoice_logo_height: b.invoice_logo_height || 160,
      invoice_logo_spacing: b.invoice_logo_spacing || 8,
    });
    setShowBranchModal(true);
  };

  const handleLogoFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'خطأ', message: 'يرجى اختيار ملف صورة صالح', variant: 'danger' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Proportionally downscale large logos to fit nicely within 600x300
        const maxW = 600;
        const maxH = 300;
        let w = img.width;
        let h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = canvas.toDataURL('image/png', 0.92);
        setBranchForm((prev) => ({ ...prev, logo_url: compressedDataUrl }));
      };
      img.onerror = () => {
        setBranchForm((prev) => ({ ...prev, logo_url: reader.result }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveBranch = async (e) => {
    e.preventDefault();
    if (!branchForm.name.trim()) return;

    try {
      const payload = {
        ...branchForm,
        location: branchForm.location || branchForm.address || '',
        address: branchForm.location || branchForm.address || '',
        logo_url: branchForm.logo_url || null,
      };

      if (isEditingBranch) {
        await client.put(`/branches/${editingBranchId}`, payload);
        toast({ title: 'تم التحديث', message: 'تم تحديث الفرع بنجاح', variant: 'success' });
      } else {
        await client.post('/branches', payload);
        toast({ title: 'تمت الإضافة', message: 'تم إضافة الفرع الجديد بنجاح', variant: 'success' });
      }
      setShowBranchModal(false);
      reloadBranches();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حفظ بيانات الفرع', variant: 'danger' });
    }
  };

  const handleDeleteBranch = async (id, name) => {
    if (!window.confirm(`هل أنت متأكد من حذف فرع "${name}"؟`)) return;
    try {
      await client.delete(`/branches/${id}`);
      toast({ title: 'تم الحذف', message: 'تم حذف الفرع بنجاح', variant: 'success' });
      reloadBranches();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حذف الفرع', variant: 'danger' });
    }
  };

  // Users CRUD
  const handleOpenAddUser = () => {
    setIsEditingUser(false);
    setEditingUserId(null);
    setUserForm({
      username: '',
      password: '',
      role: 'cashier',
      branch_id: branches[0]?.id ? String(branches[0].id) : '1',
    });
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u) => {
    setIsEditingUser(true);
    setEditingUserId(u.id);
    setUserForm({
      username: u.username || '',
      password: '',
      role: u.role || 'cashier',
      branch_id: String(u.branch_id || branches[0]?.id || '1'),
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.username.trim()) return;
    if (!isEditingUser && !userForm.password) {
      toast({ title: 'تنبيه', message: 'كلمة المرور مطلوبة للمستخدم الجديد', variant: 'warning' });
      return;
    }

    try {
      const payload = {
        username: userForm.username.trim(),
        role: userForm.role,
        branch_id: Number(userForm.branch_id),
      };
      if (userForm.password) payload.password = userForm.password;

      if (isEditingUser) {
        await client.put(`/users/branch/${editingUserId}`, payload);
        toast({ title: 'تم التحديث', message: 'تم تحديث بيانات المستخدم', variant: 'success' });
      } else {
        await client.post('/users/branch', payload);
        toast({ title: 'تمت الإضافة', message: 'تم إنشاء المستخدم بنجاح', variant: 'success' });
      }
      setShowUserModal(false);
      loadBranchUsers();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حفظ المستخدم', variant: 'danger' });
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم "${username}"؟`)) return;
    try {
      await client.delete(`/users/branch/${id}`);
      toast({ title: 'تم الحذف', message: 'تم حذف المستخدم بنجاح', variant: 'success' });
      loadBranchUsers();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حذف المستخدم', variant: 'danger' });
    }
  };

  // Export Backup
  const handleExportBackup = () => {
    const selected = Object.entries(backupGroups)
      .filter(([_, checked]) => checked)
      .map(([key]) => key)
      .join(',');

    if (!selected) {
      toast({ title: 'تنبيه', message: 'يرجى تحديد قسم واحد على الأقل للنسخ', variant: 'warning' });
      return;
    }

    window.open(`/api/backup/export?groups=${selected}`, '_blank');
    toast({
      title: 'جاري التحميل',
      message: 'تم بدء تصدير النسخة الاحتياطية وتنزيل الملف',
      variant: 'info',
    });
  };

  // Restore Backup
  const handleRestoreBackup = async (e) => {
    e.preventDefault();
    if (!restoreFile) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار ملف النسخة الاحتياطية أولاً', variant: 'warning' });
      return;
    }

    if (!window.confirm('تحذير: سيتم استرجاع البيانات من الملف. هل ترغب في الاستمرار؟')) {
      return;
    }

    try {
      setRestoring(true);
      const text = await restoreFile.text();
      const backupData = JSON.parse(text);

      await client.post('/backup/restore', backupData);
      toast({
        title: 'تم الاسترجاع بنجاح',
        message: 'تمت استعادة قاعدة البيانات بنجاح',
        variant: 'success',
      });
      setRestoreFile(null);
      loadSettings();
      reloadBranches();
    } catch (err) {
      toast({
        title: 'فشل الاسترجاع',
        message: err.message || 'ملف النسخة الاحتياطية غير صالح أو حدث خطأ',
        variant: 'danger',
      });
    } finally {
      setRestoring(false);
    }
  };

  // System Wipe / Reset
  const handleWipeSystem = async (e) => {
    e.preventDefault();
    if (wipeWord.trim() !== 'مسح') {
      toast({ title: 'تنبيه', message: 'يرجى كتابة كلمة "مسح" للتأكيد', variant: 'warning' });
      return;
    }
    if (!wipePassword) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال كلمة المرور', variant: 'warning' });
      return;
    }

    try {
      setWipeSubmitting(true);
      await client.post('/reset', { password: wipePassword, confirmation: wipeWord, full_wipe: true });
      toast({
        title: 'تم التصفير بنجاح',
        message: 'تم مسح وتصفير كافة بيانات النظام وإعادة التهيئة',
        variant: 'success',
      });
      setShowWipeModal(false);
      setWipeWord('');
      setWipePassword('');
      window.location.reload();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'فشل مسح البيانات', variant: 'danger' });
    } finally {
      setWipeSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#151515] border border-[#24221F] flex items-center justify-center text-white shadow-sm">
              <SettingsIcon className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                إعدادات النظام والتهيئة
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                تخصيص بيانات المتجر، الفروع، المستخدمين، والنسخ الاحتياطي
              </p>
            </div>
          </div>
        </div>

        {activeTab === 'store' && (
          <Button
            variant="primary"
            icon={Save}
            onClick={handleSaveSettings}
            loading={saving}
          >
            حفظ التغييرات
          </Button>
        )}
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-[#E6DECD] pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('store')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'store'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>بيانات المتجر والفواتير</span>
        </button>

        <button
          onClick={() => setActiveTab('branches')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'branches'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>إدارة الفروع ({branches.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المستخدمين والصلاحيات</span>
        </button>

        <button
          onClick={() => setActiveTab('backup')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'backup'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>النسخ الاحتياطي والصيانة</span>
        </button>
      </div>

      {/* Tab 1: Store & Invoice Settings */}
      {activeTab === 'store' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="المعلومات الأساسية للمتجر"
              subtitle="البيانات التي تظهر على الفواتير والإيصالات الحرارية للعملاء"
            />
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  اسم المتجر / النشاط
                </label>
                <Input
                  value={settings.store_name}
                  onChange={(e) => setSettings({ ...settings, store_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  رقم الهاتف الرئيسي
                </label>
                <div className="space-y-1">
                  <Input
                    placeholder="01xxxxxxxxx"
                    value={settings.store_phone}
                    onChange={(e) => setSettings({ ...settings, store_phone: e.target.value })}
                  />
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      className="rounded text-slate-900 focus:ring-slate-900"
                      checked={settings.show_phone === 'true'}
                      onChange={(e) =>
                        setSettings({ ...settings, show_phone: String(e.target.checked) })
                      }
                    />
                    <span className="text-[11px] font-bold text-slate-500">
                      إظهار رقم الهاتف في الفاتورة
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  العنوان الرئيسي
                </label>
                <div className="space-y-1">
                  <Input
                    placeholder="الشارع، المدينة..."
                    value={settings.store_address}
                    onChange={(e) => setSettings({ ...settings, store_address: e.target.value })}
                  />
                  <label className="flex items-center gap-2 cursor-pointer mt-1">
                    <input
                      type="checkbox"
                      className="rounded text-slate-900 focus:ring-slate-900"
                      checked={settings.show_address === 'true'}
                      onChange={(e) =>
                        setSettings({ ...settings, show_address: String(e.target.checked) })
                      }
                    />
                    <span className="text-[11px] font-bold text-slate-500">
                      إظهار العنوان في الفاتورة
                    </span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  نسبة ضريبة القيمة المضافة (%)
                </label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.tax_rate}
                  onChange={(e) => setSettings({ ...settings, tax_rate: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  غرامة تأخير التأجير اليومية (ج.م)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={settings.rental_fine_per_day}
                  onChange={(e) =>
                    setSettings({ ...settings, rental_fine_per_day: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  العملة المعروضة
                </label>
                <Input
                  value={settings.currency || 'ج.م'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="كلمات مرور الحماية والصلاحيات الحساسة"
              subtitle="حماية كشوفات الرواتب وعمليات تعديل فواتير الكاشير وعرض صافي الأرباح"
            />
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  الرقم السري لكشوف الرواتب والموظفين
                </label>
                <Input
                  type="password"
                  placeholder="كلمة المرور الحالية أو الجديدة"
                  value={settings.salary_password}
                  onChange={(e) => setSettings({ ...settings, salary_password: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  كلمة مرور تعديل أو حذف الفواتير
                </label>
                <Input
                  type="password"
                  placeholder="كلمة المرور الحالية أو الجديدة"
                  value={settings.invoice_edit_password}
                  onChange={(e) =>
                    setSettings({ ...settings, invoice_edit_password: e.target.value })
                  }
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>كلمة سر عرض صافي الأرباح</span>
                  {!isAhmedUser && (
                    <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md font-black border border-amber-200">
                      لحساب (احمد) فقط 🔒
                    </span>
                  )}
                </label>
                <Input
                  type="password"
                  placeholder={isAhmedUser ? "كلمة المرور الحالية أو الجديدة" : "محمية - متاح تعديلها لحساب أحمد فقط"}
                  value={isAhmedUser ? (settings.profit_password || '') : '••••••••'}
                  disabled={!isAhmedUser}
                  onChange={(e) => {
                    if (isAhmedUser) {
                      setSettings({ ...settings, profit_password: e.target.value });
                    }
                  }}
                />
                <p className="text-[11px] text-slate-400 mt-1 font-medium">
                  {isAhmedUser
                    ? "كلمة المرور المستخدمة لإلغاء قفل وإظهار صافي الأرباح في التقارير"
                    : "تعديل كلمة سر الأرباح متاح حصرياً للمستخدم (احمد)"}
                </p>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader
                title="تذييل فاتورة البيع (الكاشير)"
                subtitle="الرسالة الترحيبية أو شروط الاسترجاع في أسفل الإيصال الحراري"
              />
              <div className="p-6 space-y-4">
                <textarea
                  className="w-full p-3 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] min-h-[100px] focus:outline-none focus:border-[#151515]"
                  value={settings.cashier_footer}
                  onChange={(e) => setSettings({ ...settings, cashier_footer: e.target.value })}
                />

                <div className="p-4 rounded-xl bg-[#FAF6ED] border border-dashed border-[#E6DECD] text-center">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">
                    معاينة شكل الكعب على الإيصال:
                  </span>
                  <p className="text-xs font-black text-slate-800 whitespace-pre-line">
                    {settings.cashier_footer || 'شكراً لزيارتكم'}
                  </p>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader
                title="تذييل إيصال التأجير"
                subtitle="شروط التأجير والاستلام ومواعيد إعادة القطع"
              />
              <div className="p-6 space-y-4">
                <textarea
                  className="w-full p-3 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] min-h-[100px] focus:outline-none focus:border-[#151515]"
                  value={settings.rental_footer}
                  onChange={(e) => setSettings({ ...settings, rental_footer: e.target.value })}
                />

                <div className="p-4 rounded-xl bg-[#FAF6ED] border border-dashed border-[#E6DECD] text-center">
                  <span className="text-[10px] font-bold text-slate-400 block mb-1">
                    معاينة شكل الكعب على الإيصال:
                  </span>
                  <p className="text-xs font-black text-slate-800 whitespace-pre-line">
                    {settings.rental_footer || 'شكراً لزيارتكم'}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Branches Management */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="primary" icon={Plus} onClick={handleOpenAddBranch}>
              إضافة فرع جديد
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => (
              <Card key={b.id}>
                <div className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#FAF6ED] border border-[#E6DECD] flex items-center justify-center text-[#24221F] font-black overflow-hidden shrink-0 shadow-xs">
                        {b.logo_url ? (
                          <img
                            src={b.logo_url}
                            alt=""
                            className="w-full h-full object-contain p-1"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Building className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 text-base">{b.name}</h3>
                        <p className="text-xs font-bold text-slate-400">كود الفرع: #{b.id}</p>
                      </div>
                    </div>

                    {b.is_main_warehouse && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                        مخزن رئيسي
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-xs font-bold text-slate-600 border-t border-slate-100 pt-3">
                    <p className="flex justify-between">
                      <span className="text-slate-400">الهاتف:</span>
                      <span>{b.phone || '-'}</span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">العنوان:</span>
                      <span className="max-w-[180px] truncate">{b.location || b.address || '-'}</span>
                    </p>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Edit}
                      onClick={() => handleOpenEditBranch(b)}
                    >
                      تعديل
                    </Button>
                    {!b.is_main_warehouse && branches.length > 1 && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={Trash2}
                        onClick={() => handleDeleteBranch(b.id, b.name)}
                      >
                        حذف
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Users Management */}
      {activeTab === 'users' && (
        <Card>
          <div className="p-4 flex items-center justify-between border-b border-slate-100">
            <div>
              <h3 className="font-black text-slate-900">حسابات مستخدمي النظام</h3>
              <p className="text-xs font-bold text-slate-400 mt-0.5">
                إدارة الكاشيرات وصلاحيات الدخول للفروع
              </p>
            </div>
            <Button variant="primary" icon={Plus} onClick={handleOpenAddUser}>
              مستخدم جديد
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#151515] text-white text-xs font-bold">
                  <th className="py-3 px-4 rounded-r-xl">اسم المستخدم</th>
                  <th className="py-3 px-4">نوع الصلاحية</th>
                  <th className="py-3 px-4">الفرع المخصص</th>
                  <th className="py-3 px-4 text-center rounded-l-xl">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/60 text-sm">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل المستخدمين...
                    </td>
                  </tr>
                ) : branchUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 font-bold">
                      لا يوجد مستخدمون مسجلون
                    </td>
                  </tr>
                ) : (
                  branchUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-900">{u.username}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-black ${
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700'
                              : u.role === 'tailor'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-indigo-50 text-indigo-700'
                          }`}
                        >
                          {u.role === 'admin'
                            ? 'مدير نظام'
                            : u.role === 'tailor'
                            ? 'ترزي / تفصيل'
                            : 'كاشير'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {u.branch_name || 'الفرع الرئيسي'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEditUser(u)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors"
                            title="تعديل"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          {u.username !== user?.username && (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 transition-colors"
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab 4: Backup & Database Maintenance */}
      {activeTab === 'backup' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="تصدير نسخة احتياطية من قاعدة البيانات"
              subtitle="حفظ نسخة كاملة من البيانات على جهازك للاحتياط والحماية من الفقدان"
            />
            <div className="p-6 space-y-4">
              <p className="text-xs font-black text-slate-700">اختر الأقسام المراد تصديرها:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.keys(backupGroups).map((key) => {
                  const labels = {
                    settings: 'الإعدادات والفروع',
                    users: 'المستخدمين والصلاحيات',
                    customers: 'دليل العملاء',
                    inventory: 'المخزون وحركات الجرد',
                    suppliers: 'الموردون والمشتريات',
                    sales: 'فواتير المبيعات',
                    rentals: 'عقود التأجير والقطع',
                  };

                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 p-3 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] cursor-pointer hover:bg-[#FAF6ED] transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="rounded text-slate-900 focus:ring-slate-900"
                        checked={backupGroups[key]}
                        onChange={(e) =>
                          setBackupGroups({ ...backupGroups, [key]: e.target.checked })
                        }
                      />
                      <span className="text-xs font-black text-slate-800">{labels[key]}</span>
                    </label>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <Button variant="primary" icon={Download} onClick={handleExportBackup}>
                  تصدير وتحميل ملف النسخة الاحتياطية (.JSON)
                </Button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="استرجاع نسخة احتياطية سابقة"
              subtitle="رفع ملف نسخة احتياطية (.json) تم تصديره مسبقاً لاستعادة البيانات"
            />
            <form onSubmit={handleRestoreBackup} className="p-6 space-y-4">
              <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-center">
                <Upload className="w-10 h-10 text-slate-400 mb-2" />
                <p className="text-xs font-black text-slate-700 mb-1">
                  اختر ملف النسخة الاحتياطية من حاسوبك
                </p>
                <input
                  type="file"
                  accept=".json"
                  className="text-xs font-bold text-slate-500 mt-2"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="danger"
                  icon={Database}
                  loading={restoring}
                  disabled={!restoreFile}
                >
                  بدء استرجاع النسخة الاحتياطية
                </Button>
              </div>
            </form>
          </Card>

          {/* Danger Zone */}
          <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  منطقة الخطر: تصفير ومسح كافة بيانات النظام
                </h4>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  حذف كافة المبيعات، المخزون، الموردين، والمصروفات نهائياً وإعادة ضبط المصنع
                </p>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setShowWipeModal(true)}>
                مسح كل البيانات
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Modal */}
      <Modal
        isOpen={showBranchModal}
        onClose={() => setShowBranchModal(false)}
        title={isEditingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد'}
        size="md"
      >
        <form onSubmit={handleSaveBranch} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">اسم الفرع *</label>
            <Input
              required
              placeholder="مثال: فرع وسط البلد، فرع النزهة..."
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">رقم هاتف الفرع</label>
            <Input
              placeholder="01xxxxxxxxx"
              value={branchForm.phone}
              onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">عنوان الفرع</label>
            <Input
              placeholder="العنوان التفصيلي"
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value, location: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center justify-between">
              <span>شعار الفرع (للفواتير وملصقات الباركود)</span>
              {branchForm.logo_url && (
                <button
                  type="button"
                  onClick={() => setBranchForm({ ...branchForm, logo_url: '' })}
                  className="text-[10px] text-red-600 hover:underline font-bold"
                >
                  إزالة الشعار (استخدام الافتراضي)
                </button>
              )}
            </label>

            {/* Live Logo Preview Box */}
            <div className="p-3 mb-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center gap-3">
              <div className="w-14 h-14 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                {branchForm.logo_url ? (
                  <img
                    src={branchForm.logo_url}
                    alt="معاينة الشعار"
                    className="w-full h-full object-contain p-1"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <Store className="w-6 h-6 text-slate-400" />
                )}
              </div>
              <div className="text-xs">
                <div className="font-bold text-slate-800">
                  {branchForm.logo_url ? 'تم تحديد شعار خاص بالفرع' : 'يتم استخدام الشعار الافتراضي للنظام'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  يظهر هذا الشعار تلقائياً على فواتير الكاشير وملصقات الباركود الخاصة بهذا الفرع
                </div>
              </div>
            </div>

            {/* Presets */}
            <div className="space-y-1.5 mb-2">
              <div className="text-[11px] font-bold text-slate-500">اختر شعار جاهز أو ارفع صورة خاصة:</div>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESET_LOGOS.map((p) => {
                  const isSelected = branchForm.logo_url === p.url;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setBranchForm({ ...branchForm, logo_url: p.url })}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-right text-xs font-bold transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <img
                        src={p.url}
                        alt=""
                        className="w-5 h-5 object-contain rounded"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                      <span className="truncate">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Upload or Custom Path */}
            <div className="flex gap-2">
              <Input
                placeholder="رابط أو مسار الشعار (اختياري)..."
                value={branchForm.logo_url}
                onChange={(e) => setBranchForm({ ...branchForm, logo_url: e.target.value })}
                className="text-xs"
              />
              <label className="cursor-pointer shrink-0 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                <span>رفع صورة</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoFileUpload}
                />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
            <input
              type="checkbox"
              className="rounded text-slate-900 focus:ring-slate-900"
              checked={branchForm.is_main_warehouse}
              onChange={(e) =>
                setBranchForm({ ...branchForm, is_main_warehouse: e.target.checked })
              }
            />
            <span className="text-xs font-black text-slate-800">
              تعيين هذا الفرع كمخزن رئيسي للمخزون
            </span>
          </label>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowBranchModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary">
              {isEditingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* User Modal */}
      <Modal
        isOpen={showUserModal}
        onClose={() => setShowUserModal(false)}
        title={isEditingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
        size="md"
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              اسم المستخدم (للدخول) *
            </label>
            <Input
              required
              placeholder="username"
              value={userForm.username}
              onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              {isEditingUser ? 'كلمة المرور الجديدة (اتركه فارغاً للإبقاء على الحالية)' : 'كلمة المرور *'}
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              نوع الصلاحية / الدور
            </label>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
            >
              <option value="cashier">كاشير (مبيعات واستلامات فقط)</option>
              <option value="tailor">ترزي (تفصيل وتعديلات فقط)</option>
              <option value="admin">مدير فرع / مدير عام</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">الفرع المخصص</label>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={userForm.branch_id}
              onChange={(e) => setUserForm({ ...userForm, branch_id: e.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowUserModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary">
              {isEditingUser ? 'تحديث المستخدم' : 'إنشاء المستخدم'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Wipe / Reset Modal */}
      <Modal
        isOpen={showWipeModal}
        onClose={() => setShowWipeModal(false)}
        title="تأكيد مسح وتصفير كافة بيانات النظام"
        size="md"
      >
        <form onSubmit={handleWipeSystem} className="space-y-4">
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold leading-relaxed">
            <p className="font-black mb-1">⚠️ تحذير شديد الخطورة:</p>
            هذه العملية لا يمكن الرجوع عنها. سيتم حذف جميع الفواتير والمخزون والعملاء وعقود التأجير وإعادة النظام إلى حالته الأولى تماماً.
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              لتأكيد المسح، اكتب كلمة <span className="text-red-600 font-black">"مسح"</span> في الحقل أدناه:
            </label>
            <Input
              required
              placeholder='اكتب كلمة "مسح" هنا'
              value={wipeWord}
              onChange={(e) => setWipeWord(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              كلمة مرور المشرف (Admin Password) *
            </label>
            <Input
              type="password"
              required
              placeholder="••••••••"
              value={wipePassword}
              onChange={(e) => setWipePassword(e.target.value)}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowWipeModal(false)}
            >
              إلغاء وتراجع
            </Button>
            <Button
              type="submit"
              variant="danger"
              icon={Trash2}
              loading={wipeSubmitting}
              disabled={wipeWord.trim() !== 'مسح' || !wipePassword}
            >
              تأكيد المسح النهائي
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Settings;
