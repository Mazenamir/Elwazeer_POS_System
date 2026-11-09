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
  Shield,
  User as UserIcon,
  MapPin,
  CheckSquare,
  Square,
  Key,
  ChevronDown,
  ChevronRight,
  Search,
  Check,
  RefreshCw,
  Copy,
} from 'lucide-react';
import {
  HIERARCHICAL_CATALOG,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESETS,
  ALL_PERMISSIONS,
  LEGACY_TO_GRANULAR_MAP,
  SENSITIVE_OR_PRIVILEGED_PERMISSIONS,
  normalizePermissions,
  expandPermissionsWithLegacy,
} from '../../constants/permissions';

const PRESET_LOGOS = [
  { id: 'antalya', label: 'فرع أنطاليا (Antalya)', url: '/logos/Antalya logo.png' },
  { id: 'elwazer', label: 'فرع الوزير (El Wazer)', url: '/logos/elwazer.png' },
  { id: 'app-icon', label: 'الشعار الرئيسي (ببيون BEBYOON)', url: '/logos/app-icon.png' },
  { id: 'men', label: 'فرع رجالي (بدل رجالي)', url: '/logos/men.png' },
  { id: 'women', label: 'فرع حريمي (فساتين حريمي)', url: '/logos/women.png' },
];

const SENSITIVE_OPERATIONS = [
  {
    type: 'profit',
    title: 'عرض صافي الأرباح والتكلفة (Profit Analytics)',
    description: 'حماية بيانات تكلفة البضاعة المباعة (COGS) وصافي الأرباح وهوامش الربح في شاشات التقارير ولوحة التحكم.',
    icon: Shield,
    badgeColor: 'indigo',
  },
  {
    type: 'invoice_edit',
    title: 'تعديل وحذف الفواتير (Invoice Editing)',
    description: 'حماية تعديل الأصناف والأسعار والخصومات والكميات بعد إصدار واعتماد الفاتورة للعميل.',
    icon: Edit,
    badgeColor: 'blue',
  },
  {
    type: 'return',
    title: 'المرتجعات والاسترداد النقدي (Returns & Refunds)',
    description: 'حماية استرجاع فواتير المبيعات وصرف النقدية المستردة من درج الكاشير للعميل.',
    icon: Receipt,
    badgeColor: 'rose',
  },
  {
    type: 'inventory',
    title: 'إدارة وتعديل المخزون (Inventory Management)',
    description: 'حماية إضافة وتعديل وحذف أصناف المخزون وضبط أسعار البيع والشراء والكميات.',
    icon: Database,
    badgeColor: 'amber',
  },
  {
    type: 'salary',
    title: 'مسير الرواتب والموظفين (Salary & Payroll)',
    description: 'حماية كشوف رواتب الموظفين والسلف وساعات العمل والخصومات الشهرية وحسابات القبض.',
    icon: Users,
    badgeColor: 'purple',
  },
];

export function Settings() {
  const { user, isAdmin, hasPermission } = useAuth();
  const { branches, reloadBranches } = useBranch();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('store');

  const canAccessBranches = Boolean(isAdmin || hasPermission('settings.branches.manage'));
  const canAccessUsers = Boolean(isAdmin || hasPermission('settings.users.manage'));
  const canAccessSensitive = Boolean(isAdmin || hasPermission('settings.passwords.manage'));
  const canAccessBackup = Boolean(isAdmin || hasPermission('settings.backup.export') || hasPermission('settings.backup.restore'));

  const isTabAccessible = useCallback((tab) => {
    if (tab === 'store' || tab === 'profile') return true;
    if (tab === 'branches') return canAccessBranches;
    if (tab === 'users') return canAccessUsers;
    if (tab === 'sensitive') return canAccessSensitive;
    if (tab === 'backup') return canAccessBackup;
    return false;
  }, [canAccessBranches, canAccessUsers, canAccessSensitive, canAccessBackup]); // 'store' | 'branches' | 'users' | 'sensitive' | 'profile' | 'backup'
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
  });

  // Sensitive Passwords Management State
  const [sensitiveStatus, setSensitiveStatus] = useState({});
  const [loadingSensitive, setLoadingSensitive] = useState(false);
  const [sensitiveForms, setSensitiveForms] = useState({
    profit: { new_password: '', confirm_password: '', show: false, loading: false },
    invoice_edit: { new_password: '', confirm_password: '', show: false, loading: false },
    return: { new_password: '', confirm_password: '', show: false, loading: false },
    inventory: { new_password: '', confirm_password: '', show: false, loading: false },
    salary: { new_password: '', confirm_password: '', show: false, loading: false },
  });

  // Sync profileForm with user state
  useEffect(() => {
    if (user) {
      setProfileForm((prev) => ({
        ...prev,
        full_name: user.full_name || user.name || '',
        username: user.username || '',
      }));
    }
  }, [user]);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    full_name: user?.full_name || '',
    username: user?.username || '',
    current_password: '',
    new_password: '',
    confirm_password: '',
    loading: false,
  });

  // Users List & Modal
  const [branchUsers, setBranchUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [permSearch, setPermSearch] = useState('');
  const [collapsedModules, setCollapsedModules] = useState({
    inventory: true,
    suppliers: true,
    alterations: true,
    tailoring: true,
    customers: true,
    employees: true,
    expenses: true,
    reports: true,
    barcodes: true,
    settings: true,
    system: true,
  });

  const [userForm, setUserForm] = useState({
    full_name: '',
    username: '',
    password: '',
    role: 'branch_user',
    branch_scope: 'single', // 'single' | 'selected' | 'all'
    branch_id: '',
    branch_ids: [],
    permissions: ['pos.sales.view', 'pos.sales.create'],
  });

  // Branch Modal
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [isEditingBranch, setIsEditingBranch] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState(null);
  const [copiedBranchId, setCopiedBranchId] = useState(null);
  const [showNewBranchSuccessModal, setShowNewBranchSuccessModal] = useState(false);
  const [newlyCreatedBranch, setNewlyCreatedBranch] = useState(null);
  const [branchForm, setBranchForm] = useState({
    name: '',
    phone: '',
    address: '',
    location: '',
    logo_url: '',
    is_main_warehouse: false,
    rentals_enabled: true,
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

  // Branch Reset Modal
  const [showBranchResetModal, setShowBranchResetModal] = useState(false);
  const [branchResetPassword, setBranchResetPassword] = useState('');
  const [branchResetSubmitting, setBranchResetSubmitting] = useState(false);

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
    if (!isAdmin) {
      setBranchUsers([]);
      return;
    }
    try {
      setLoadingUsers(true);
      const res = await client.get('/users/branch');
      const list = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
      setBranchUsers(list);
    } catch {
      setBranchUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin]);

  // Load Sensitive Passwords Status
  const loadSensitiveStatus = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadingSensitive(true);
      const res = await client.get('/sensitive-passwords/status');
      setSensitiveStatus(res.data || res || {});
    } catch (err) {
      console.error('Failed to load sensitive password status:', err);
    } finally {
      setLoadingSensitive(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (activeTab === 'users' && canAccessUsers) {
      loadBranchUsers();
    }
    if (activeTab === 'sensitive' && canAccessSensitive) {
      loadSensitiveStatus();
    }
  }, [activeTab, canAccessUsers, canAccessSensitive, loadBranchUsers, loadSensitiveStatus]);

  useEffect(() => {
    if (!isTabAccessible(activeTab)) {
      setActiveTab('store');
    }
  }, [activeTab, isTabAccessible]);

  // Save Settings (Store & Invoice)
  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const payload = { ...settings };
      delete payload.profit_password;
      delete payload.salary_password;
      delete payload.invoice_edit_password;
      delete payload.return_password;
      delete payload.inventory_password;
      await client.post('/settings', payload);
      toast({
        title: 'تم الحفظ',
        message: 'تم حفظ وتحديث إعدادات المتجر بنجاح',
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

  // Update Sensitive Operation Password
  const handleUpdateSensitivePassword = async (type) => {
    const form = sensitiveForms[type] || {};
    const cleanPass = String(form.new_password || '').trim();
    const cleanConfirm = String(form.confirm_password || '').trim();
    if (!cleanPass) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال كلمة المرور الجديدة', variant: 'warning' });
      return;
    }
    if (cleanPass.length < 3) {
      toast({ title: 'تنبيه', message: 'يجب ألا تقل كلمة المرور عن 3 أحرف', variant: 'warning' });
      return;
    }
    if (cleanPass !== cleanConfirm) {
      toast({ title: 'تنبيه', message: 'كلمة المرور وتأكيدها غير متطابقين', variant: 'warning' });
      return;
    }
    try {
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: true },
      }));
      await client.post('/sensitive-passwords', {
        type,
        password: cleanPass,
        new_password: cleanPass,
        confirm_password: cleanConfirm,
      });
      toast({ title: 'تم الحفظ', message: 'تم تحديث كلمة المرور للعملية بنجاح 🔒', variant: 'success' });
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { new_password: '', confirm_password: '', show: false, loading: false },
      }));
      // Instant optimistic UI update
      setSensitiveStatus((prev) => ({
        ...prev,
        [type]: {
          ...(typeof prev[type] === 'object' ? prev[type] : {}),
          configured: true,
        },
      }));
      loadSensitiveStatus();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر تحديث كلمة المرور', variant: 'danger' });
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: false },
      }));
    }
  };

  // Remove Sensitive Operation Password (Unprotect)
  const handleRemoveSensitivePassword = async (type) => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إلغاء كلمة المرور لهذه العملية وجعلها متاحة بدون حماية؟')) {
      return;
    }
    try {
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: true },
      }));
      await client.delete(`/sensitive-passwords/${type}`);
      toast({
        title: 'تم الإلغاء',
        message: 'تم إلغاء كلمة المرور للعملية وجعلها غير محمية 🔓',
        variant: 'info',
      });
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { new_password: '', confirm_password: '', show: false, loading: false },
      }));
      // Instant optimistic UI update
      setSensitiveStatus((prev) => ({
        ...prev,
        [type]: {
          ...(typeof prev[type] === 'object' ? prev[type] : {}),
          configured: false,
        },
      }));
      loadSensitiveStatus();
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر إلغاء كلمة المرور',
        variant: 'danger',
      });
      setSensitiveForms((prev) => ({
        ...prev,
        [type]: { ...prev[type], loading: false },
      }));
    }
  };

  // Update Personal Profile & Password
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (profileForm.new_password && profileForm.new_password !== profileForm.confirm_password) {
      toast({ title: 'تنبيه', message: 'كلمة المرور الجديدة وتأكيدها غير متطابقين', variant: 'warning' });
      return;
    }
    if (profileForm.new_password && !profileForm.current_password) {
      toast({ title: 'تنبيه', message: 'كلمة المرور الحالية مطلوبة لتأكيد التغيير', variant: 'warning' });
      return;
    }

    try {
      setProfileForm((prev) => ({ ...prev, loading: true }));
      const payload = {
        full_name: profileForm.full_name.trim(),
      };
      if (isAdmin && profileForm.username) {
        payload.username = profileForm.username.trim();
      }
      if (profileForm.new_password) {
        payload.current_password = profileForm.current_password;
        payload.new_password = profileForm.new_password;
        payload.confirm_password = profileForm.confirm_password;
      }
      await client.put('/users/me', payload);
      toast({ title: 'تم التحديث', message: 'تم تحديث بيانات الحساب الشخصي بنجاح', variant: 'success' });
      setProfileForm((prev) => ({
        ...prev,
        current_password: '',
        new_password: '',
        confirm_password: '',
        loading: false,
      }));
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'فشل تحديث بيانات الحساب', variant: 'danger' });
      setProfileForm((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleCopyBranchCode = (id) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(id));
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = String(id);
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedBranchId(id);
      toast({ title: 'تم النسخ', message: `تم نسخ كود الفرع (#${id}) إلى الحافظة`, variant: 'success' });
      setTimeout(() => {
        setCopiedBranchId(null);
      }, 2000);
    } catch (_) {}
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
      rentals_enabled: true,
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
      rentals_enabled: b.rentals_enabled !== false && b.rentals_enabled !== 0,
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
        rentals_enabled: branchForm.rentals_enabled !== false,
        location: branchForm.location || branchForm.address || '',
        address: branchForm.location || branchForm.address || '',
        logo_url: branchForm.logo_url || null,
      };

      if (isEditingBranch) {
        await client.put(`/branches/${editingBranchId}`, payload);
        toast({ title: 'تم التحديث', message: 'تم تحديث الفرع بنجاح', variant: 'success' });
      } else {
        const newBranchRes = await client.post('/branches', payload);
        toast({ title: 'تمت الإضافة', message: 'تم إضافة الفرع الجديد بنجاح', variant: 'success' });
        setShowBranchModal(false);
        if (newBranchRes && newBranchRes.id) {
          setNewlyCreatedBranch(newBranchRes);
          setShowNewBranchSuccessModal(true);
        }
      }
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
      full_name: '',
      username: '',
      password: '',
      role: 'branch_user',
      branch_scope: 'single',
      branch_id: branches[0]?.id ? String(branches[0].id) : '1',
      branch_ids: branches[0]?.id ? [Number(branches[0].id)] : [1],
      permissions: ['pos.sales.view', 'pos.sales.create'],
    });
    setPermSearch('');
    setShowUserModal(true);
  };

  const handleOpenEditUser = (u) => {
    setIsEditingUser(true);
    setEditingUserId(u.id);
    const scope = u.branch_scope || 'single';
    let bIds = [];
    if (Array.isArray(u.branch_ids)) bIds = u.branch_ids.map(Number);
    else if (u.branch_id) bIds = [Number(u.branch_id)];

    let userPermissions = normalizePermissions(u.permissions);
    const finalUserPermissions = new Set(userPermissions);
    const legacyTokens = userPermissions.filter(
      (p) => ALL_PERMISSIONS.includes(p) || (typeof p === 'string' && p.endsWith('.html'))
    );

    legacyTokens.forEach((legacy) => {
      const granularList = LEGACY_TO_GRANULAR_MAP[legacy] || [];
      const hasGranularInModule = granularList.some((gp) => userPermissions.includes(gp));
      if (!hasGranularInModule) {
        granularList.forEach((g) => {
          if (!SENSITIVE_OR_PRIVILEGED_PERMISSIONS.has(g)) {
            finalUserPermissions.add(g);
          }
        });
      }
      finalUserPermissions.delete(legacy);
    });

    userPermissions = Array.from(finalUserPermissions);

    setUserForm({
      full_name: u.full_name || u.name || '',
      username: u.username || '',
      password: '',
      role: u.role || 'branch_user',
      branch_scope: scope,
      branch_id: String(u.branch_id || branches[0]?.id || '1'),
      branch_ids: bIds,
      permissions: userPermissions,
    });
    setPermSearch('');
    setShowUserModal(true);
  };

  // Hierarchical Permission Tree Helpers
  const getModuleActionIds = (mod) => {
    return (mod.tabs || []).flatMap((t) => (t.actions || []).map((a) => a.id));
  };

  const getTabActionIds = (tab) => {
    return (tab.actions || []).map((a) => a.id);
  };

  const getModuleSelectionState = (mod) => {
    const actionIds = getModuleActionIds(mod);
    if (!actionIds.length) return { all: false, partial: false, count: 0, total: 0 };
    const perms = userForm.permissions || [];
    const selectedCount = actionIds.filter((id) => perms.includes(id)).length;
    return {
      all: selectedCount === actionIds.length,
      partial: selectedCount > 0 && selectedCount < actionIds.length,
      count: selectedCount,
      total: actionIds.length,
    };
  };

  const getTabSelectionState = (tab) => {
    const actionIds = getTabActionIds(tab);
    if (!actionIds.length) return { all: false, partial: false, count: 0, total: 0 };
    const perms = userForm.permissions || [];
    const selectedCount = actionIds.filter((id) => perms.includes(id)).length;
    return {
      all: selectedCount === actionIds.length,
      partial: selectedCount > 0 && selectedCount < actionIds.length,
      count: selectedCount,
      total: actionIds.length,
    };
  };

  const handleToggleModule = (mod) => {
    const actionIds = getModuleActionIds(mod);
    const state = getModuleSelectionState(mod);
    setUserForm((prev) => {
      const currentPerms = new Set(prev.permissions || []);
      if (state.all) {
        actionIds.forEach((id) => currentPerms.delete(id));
      } else {
        actionIds.forEach((id) => currentPerms.add(id));
      }
      return { ...prev, permissions: Array.from(currentPerms) };
    });
  };

  const handleToggleTab = (tab) => {
    const actionIds = getTabActionIds(tab);
    const state = getTabSelectionState(tab);
    setUserForm((prev) => {
      const currentPerms = new Set(prev.permissions || []);
      if (state.all) {
        actionIds.forEach((id) => currentPerms.delete(id));
      } else {
        actionIds.forEach((id) => currentPerms.add(id));
      }
      return { ...prev, permissions: Array.from(currentPerms) };
    });
  };

  const handleToggleAction = (actionId) => {
    setUserForm((prev) => {
      const currentPerms = new Set(prev.permissions || []);
      if (currentPerms.has(actionId)) {
        currentPerms.delete(actionId);
      } else {
        currentPerms.add(actionId);
      }
      return { ...prev, permissions: Array.from(currentPerms) };
    });
  };

  const handleSelectAllPermissions = () => {
    const allIds = HIERARCHICAL_CATALOG.flatMap(getModuleActionIds);
    setUserForm((prev) => ({
      ...prev,
      permissions: Array.from(new Set([...(prev.permissions || []), ...allIds])),
    }));
  };

  const handleDeselectAllPermissions = () => {
    setUserForm((prev) => ({
      ...prev,
      permissions: [],
    }));
  };

  const toggleModuleCollapse = (moduleId) => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const handleExpandAllModules = () => {
    const all = {};
    HIERARCHICAL_CATALOG.forEach((m) => {
      all[m.moduleId] = false;
    });
    setCollapsedModules(all);
  };

  const handleCollapseAllModules = () => {
    const all = {};
    HIERARCHICAL_CATALOG.forEach((m) => {
      all[m.moduleId] = true;
    });
    setCollapsedModules(all);
  };

  const filteredCatalog = React.useMemo(() => {
    if (!permSearch.trim()) return HIERARCHICAL_CATALOG;
    const q = permSearch.trim().toLowerCase();
    return HIERARCHICAL_CATALOG.map((mod) => {
      const modMatch = mod.label?.toLowerCase().includes(q) || mod.description?.toLowerCase().includes(q) || mod.moduleId?.toLowerCase().includes(q);
      const matchedTabs = (mod.tabs || []).map((tab) => {
        const tabMatch = tab.label?.toLowerCase().includes(q) || tab.tabId?.toLowerCase().includes(q);
        const matchedActions = (tab.actions || []).filter((a) =>
          modMatch || tabMatch || a.label?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q)
        );
        if (matchedActions.length > 0 || tabMatch || modMatch) {
          return { ...tab, actions: matchedActions.length > 0 ? matchedActions : tab.actions };
        }
        return null;
      }).filter(Boolean);

      if (matchedTabs.length > 0 || modMatch) {
        return { ...mod, tabs: matchedTabs.length > 0 ? matchedTabs : mod.tabs };
      }
      return null;
    }).filter(Boolean);
  }, [permSearch]);

  const handleApplyPreset = (presetPerms) => {
    setUserForm((prev) => ({
      ...prev,
      permissions: [...presetPerms],
    }));
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userForm.username.trim()) {
      toast({ title: 'تنبيه', message: 'اسم المستخدم مطلوب', variant: 'warning' });
      return;
    }
    if (!userForm.full_name.trim()) {
      toast({ title: 'تنبيه', message: 'اسم الشخص / الموظف مطلوب', variant: 'warning' });
      return;
    }
    if (!userForm.branch_id || Number(userForm.branch_id) <= 0) {
      toast({ title: 'تنبيه', message: 'الفرع المخصص مطلوب للحساب', variant: 'warning' });
      return;
    }
    if (userForm.branch_scope === 'selected' && (!userForm.branch_ids || userForm.branch_ids.length === 0)) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار فرع واحد على الأقل لنطاق الفروع المحددة', variant: 'warning' });
      return;
    }
    if (!userForm.permissions || userForm.permissions.length === 0) {
      toast({ title: 'تنبيه', message: 'يرجى تحديد صلاحية واحدة على الأقل للمستخدم', variant: 'warning' });
      return;
    }
    if (!isEditingUser && !userForm.password) {
      toast({ title: 'تنبيه', message: 'كلمة المرور مطلوبة للمستخدم الجديد', variant: 'warning' });
      return;
    }

    try {
      const payload = {
        full_name: userForm.full_name.trim(),
        username: userForm.username.trim(),
        role: userForm.role || 'branch_user',
        branch_scope: userForm.branch_scope || 'single',
        branch_id: Number(userForm.branch_id),
        branch_ids: userForm.branch_scope === 'selected'
          ? (Array.isArray(userForm.branch_ids) ? userForm.branch_ids.map(Number) : [Number(userForm.branch_id)])
          : (userForm.branch_scope === 'all' ? [] : [Number(userForm.branch_id)]),
        permissions: Array.isArray(userForm.permissions) ? expandPermissionsWithLegacy(userForm.permissions) : [],
      };
      if (userForm.password) payload.password = userForm.password;

      if (isEditingUser) {
        await client.put(`/users/branch/${editingUserId}`, payload);
        toast({ title: 'تم التحديث', message: 'تم تحديث بيانات المستخدم وصلاحياته بنجاح', variant: 'success' });
      } else {
        await client.post('/users/branch', payload);
        toast({ title: 'تمت الإضافة', message: 'تم إنشاء المستخدم وتعيين الصلاحيات بنجاح', variant: 'success' });
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
        message: 'تم مسح وتصفير كافة بيانات النظام، وسيتم تصفير أجهزة الفروع تلقائياً عند أول اتصال',
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

  // Branch Database Reset
  const handleResetBranches = async (e) => {
    e.preventDefault();
    if (!branchResetPassword) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال كلمة المرور', variant: 'warning' });
      return;
    }

    try {
      setBranchResetSubmitting(true);
      const res = await client.post('/reset-branches', { password: branchResetPassword });
      toast({
        title: 'تم الإرسال بنجاح',
        message: res.data?.message || 'تم إرسال أمر تصفير وإعادة مزامنة الفروع بنجاح',
        variant: 'success',
      });
      setShowBranchResetModal(false);
      setBranchResetPassword('');
    } catch (err) {
      toast({ title: 'خطأ', message: err.response?.data?.error || err.message || 'فشل إرسال أمر التصفير', variant: 'danger' });
    } finally {
      setBranchResetSubmitting(false);
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

        {canAccessBranches && (
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
        )}

        {canAccessUsers && (
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
        )}

        {canAccessSensitive && (
          <button
            onClick={() => setActiveTab('sensitive')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'sensitive'
                ? 'bg-[#151515] text-white shadow-sm'
                : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
            }`}
          >
            <Key className="w-4 h-4 text-amber-500" />
            <span>كلمات سر العمليات الحساسة 🔒</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('profile')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'profile'
              ? 'bg-[#151515] text-white shadow-sm'
              : 'bg-[#FFFDF9] text-[#777266] border border-[#E6DECD] hover:bg-[#FAF6ED]'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>حسابي الشخصي</span>
        </button>

        {canAccessBackup && (
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
        )}
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
              title="كلمات سر العمليات الحساسة"
              subtitle="إدارة كلمات المرور لحماية العمليات التشغيلية الهامة بالمنظومة"
            />
            <div className="p-6">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-900 flex items-center justify-center shrink-0">
                    <Key className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-amber-950">إدارة مركزية لكلمات سر العمليات الحساسة</h4>
                    <p className="text-[11px] font-semibold text-amber-850 mt-0.5">
                      تم نقل كلمات سر الأرباح وتعديل الفواتير وصرف المرتجعات وإدارة المخزون والرواتب إلى قسم أمني مخصص ومحمي بتشفير bcrypt
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    icon={Key}
                    onClick={() => setActiveTab('sensitive')}
                    className="whitespace-nowrap shrink-0 !bg-[#151515]"
                  >
                    إدارة كلمات السر الحساسة 🔒
                  </Button>
                )}
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
      {canAccessBranches && activeTab === 'branches' && (
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
                        <div className="mt-1 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-black bg-amber-50 text-amber-900 border border-amber-200 shadow-2xs">
                            <span className="text-[11px] text-amber-700 font-bold">كود الفرع:</span>
                            <span className="font-mono text-xs font-black">#{b.id}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyBranchCode(b.id)}
                            title="نسخ كود الفرع"
                            className="p-1 rounded-lg text-slate-400 hover:text-amber-800 hover:bg-amber-100/70 active:scale-95 transition-all cursor-pointer"
                          >
                            {copiedBranchId === b.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      {b.is_main_warehouse && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                          مخزن رئيسي
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          b.rentals_enabled !== false && b.rentals_enabled !== 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        {b.rentals_enabled !== false && b.rentals_enabled !== 0 ? 'التأجير مفعل' : 'التأجير معطل'}
                      </span>
                    </div>
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
      {canAccessUsers && activeTab === 'users' && (
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
                  <th className="py-3.5 px-4 rounded-r-xl">اسم الشخص / الموظف</th>
                  <th className="py-3.5 px-4">اسم المستخدم</th>
                  <th className="py-3.5 px-4">نطاق الفروع</th>
                  <th className="py-3.5 px-4">الفرع الرئيسي</th>
                  <th className="py-3.5 px-4">الصلاحيات الممنوحة</th>
                  <th className="py-3.5 px-4 text-center rounded-l-xl">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DECD]/60 text-sm">
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل المستخدمين...
                    </td>
                  </tr>
                ) : branchUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      لا يوجد مستخدمون مسجلون
                    </td>
                  </tr>
                ) : (
                  branchUsers.map((u) => {
                    const perms = normalizePermissions(u.permissions);
                    return (
                      <tr key={u.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                        <td className="py-3.5 px-4 font-black text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-[#C4823F] flex items-center justify-center font-black text-xs shrink-0">
                              <UserIcon className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-black text-slate-900">{u.full_name || u.name || 'بدون اسم'}</div>
                              <div className="text-[11px] text-slate-400 font-medium">#{u.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800 dir-ltr text-right">
                          @{u.username}
                        </td>
                        <td className="py-3.5 px-4">
                          {u.branch_scope === 'all' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-700 border border-blue-200">
                              <span>🌐 كافة الفروع</span>
                            </span>
                          ) : u.branch_scope === 'selected' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">
                              <span>🏢 فروع محددة ({Array.isArray(u.branch_ids) ? u.branch_ids.length : 0})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-200">
                              <span>📍 فرع واحد</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold bg-[#FAF6ED] border border-[#E6DECD] text-[#24221F]">
                            <MapPin className="w-3.5 h-3.5 text-[#C4823F]" />
                            <span>{u.branch_name || 'الفرع الرئيسي'}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {u.role === 'admin' ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">
                              كامل الصلاحيات (Admin)
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1 max-w-[280px]">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-slate-900 text-white">
                                {perms.length} صلاحيات
                              </span>
                              {perms.slice(0, 2).map((pid) => {
                                const def = PERMISSION_DEFINITIONS.find((d) => d.id === pid);
                                return (
                                  <span
                                    key={pid}
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF6ED] text-slate-700 border border-[#E6DECD] truncate max-w-[100px]"
                                    title={def?.label || pid}
                                  >
                                    {def?.label || pid}
                                  </span>
                                );
                              })}
                              {perms.length > 2 && (
                                <span className="text-[10px] font-extrabold text-slate-400">
                                  +{perms.length - 2} المزيد
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEditUser(u)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors"
                              title="تعديل المستخدم والصلاحيات"
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Sensitive Passwords Management */}
      {canAccessSensitive && activeTab === 'sensitive' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6 border-b border-[#E6DECD] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-black">
                    <Key className="w-4 h-4" />
                  </div>
                  <h3 className="font-black text-slate-900 text-base">إدارة كلمات سر العمليات الحساسة</h3>
                </div>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  حماية العمليات التشغيلية والمالية بكلمات مرور مستقلة مشفرة (bcrypt) مع حماية ضد التخمين (Rate Limiting)
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                icon={RefreshCw}
                onClick={loadSensitiveStatus}
                loading={loadingSensitive}
              >
                تحديث الحالة
              </Button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {SENSITIVE_OPERATIONS.map((op) => {
                const rawStatus = sensitiveStatus[op.type];
                const isConfigured = typeof rawStatus === 'object' && rawStatus !== null
                  ? Boolean(rawStatus.configured)
                  : Boolean(rawStatus);
                const isLocked = Boolean(rawStatus?.locked);
                const failedAttempts = Number(rawStatus?.failed_attempts || 0);
                const remainingSeconds = Number(rawStatus?.remaining_seconds || 0);
                const form = sensitiveForms[op.type] || { new_password: '', confirm_password: '', show: false, loading: false };
                const OpIcon = op.icon;

                return (
                  <div
                    key={op.type}
                    className="p-5 rounded-2xl border border-[#E6DECD] bg-[#FFFDF9] flex flex-col justify-between space-y-4 hover:shadow-xs transition-shadow"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-[#FAF6ED] border border-[#E6DECD] flex items-center justify-center text-[#24221F] shrink-0">
                            <OpIcon className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-black text-slate-900 text-sm">{op.title}</h4>
                            <p className="text-[11px] font-bold text-slate-400 mt-0.5">{op.description}</p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="shrink-0">
                          {isConfigured ? (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                              مفعلة بكلمة سر 🔒
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                              غير معينة ⚠️
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Lockout Warning Banner */}
                      {isLocked && (
                        <div className="p-3 mb-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-black flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                          <span>
                            تم إيقاف هذه العملية مؤقتاً بسبب تكرار المحاولات الخاطئة! متبقي {remainingSeconds} ثانية.
                          </span>
                        </div>
                      )}

                      {failedAttempts > 0 && !isLocked && (
                        <div className="text-[11px] font-bold text-amber-600 mb-2">
                          ⚠️ تنبيه: عدد المحاولات الخاطئة الأخيرة: {failedAttempts} من 5 محاولات قبل الإغلاق المؤقت.
                        </div>
                      )}
                    </div>

                    {/* Change / Set Form */}
                    <div className="space-y-3 pt-3 border-t border-[#E6DECD]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            كلمة المرور الجديدة
                          </label>
                          <Input
                            type={form.show ? 'text' : 'password'}
                            placeholder="كلمة مرور جديدة..."
                            value={form.new_password}
                            onChange={(e) =>
                              setSensitiveForms((prev) => ({
                                ...prev,
                                [op.type]: { ...prev[op.type], new_password: e.target.value },
                              }))
                            }
                            className="text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            تأكيد كلمة المرور
                          </label>
                          <Input
                            type={form.show ? 'text' : 'password'}
                            placeholder="تأكيد كلمة المرور..."
                            value={form.confirm_password}
                            onChange={(e) =>
                              setSensitiveForms((prev) => ({
                                ...prev,
                                [op.type]: { ...prev[op.type], confirm_password: e.target.value },
                              }))
                            }
                            className="text-xs"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-slate-500">
                          <input
                            type="checkbox"
                            className="rounded text-slate-900 focus:ring-slate-900"
                            checked={form.show || false}
                            onChange={(e) =>
                              setSensitiveForms((prev) => ({
                                ...prev,
                                [op.type]: { ...prev[op.type], show: e.target.checked },
                              }))
                            }
                          />
                          <span>إظهار النص</span>
                        </label>

                        <div className="flex items-center gap-2">
                          {isConfigured && (
                            <Button
                              variant="danger"
                              size="sm"
                              icon={Trash2}
                              loading={form.loading}
                              onClick={() => handleRemoveSensitivePassword(op.type)}
                              className="!bg-rose-50 !text-rose-700 !border-rose-200 hover:!bg-rose-100"
                              title="إلغاء كلمة المرور وجعل العملية بدون كلمة سر"
                            >
                              إلغاء الحماية
                            </Button>
                          )}

                          <Button
                            variant="primary"
                            size="sm"
                            icon={Save}
                            loading={form.loading}
                            onClick={() => handleUpdateSensitivePassword(op.type)}
                            disabled={!form.new_password || !form.confirm_password}
                            className="!bg-[#151515]"
                          >
                            {isConfigured ? 'تغيير كلمة السر' : 'تعيين كلمة السر'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Personal Profile & Admin Password */}
      {activeTab === 'profile' && (
        <Card>
          <CardHeader
            title="بيانات حسابي الشخصي وتغيير كلمة المرور"
            subtitle="تحديث الاسم وبيانات الحساب وتغيير كلمة المرور الخاصة بك"
          />
          <form onSubmit={handleUpdateProfile} className="p-6 max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">اسم المستخدم {isAdmin ? '*' : ''}</label>
              <Input
                value={profileForm.username}
                disabled={!isAdmin}
                onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value })}
                className={!isAdmin ? "bg-slate-100 font-mono text-slate-500 cursor-not-allowed" : "font-mono font-bold"}
              />
              {isAdmin && (
                <p className="text-[10px] text-slate-400 mt-1 font-semibold">
                  بصفتك مدير النظام، يمكنك تعديل اسم المستخدم الخاص بحسابك الشخصي
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">نوع الحساب / الدور</label>
              <Input
                value={user?.role === 'admin' ? 'مدير النظام (Administrator)' : 'مستخدم فرع (Branch User)'}
                disabled
                className="bg-slate-100 font-bold text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">الاسم الشخصي / الموظف *</label>
              <Input
                required
                value={profileForm.full_name}
                onChange={(e) => setProfileForm({ ...profileForm, full_name: e.target.value })}
                placeholder="اسمك الكامل"
              />
            </div>

            <div className="pt-4 border-t border-[#E6DECD] space-y-3">
              <h4 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>تغيير كلمة مرور الدخول (اختياري)</span>
              </h4>
              <p className="text-[11px] font-bold text-slate-500">
                اترك حقول كلمة المرور فارغة إذا كنت تريد تعديل الاسم فقط دون تغيير كلمة المرور.
              </p>

              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">كلمة المرور الحالية</label>
                <Input
                  type="password"
                  placeholder="كلمة المرور الحالية لتأكيد التغيير..."
                  value={profileForm.current_password}
                  onChange={(e) => setProfileForm({ ...profileForm, current_password: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
                  <Input
                    type="password"
                    placeholder="كلمة المرور الجديدة..."
                    value={profileForm.new_password}
                    onChange={(e) => setProfileForm({ ...profileForm, new_password: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">تأكيد كلمة المرور الجديدة</label>
                  <Input
                    type="password"
                    placeholder="إعادة إدخال كلمة المرور..."
                    value={profileForm.confirm_password}
                    onChange={(e) => setProfileForm({ ...profileForm, confirm_password: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" variant="primary" icon={Save} loading={profileForm.loading} className="!bg-[#151515]">
                حفظ التعديلات
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tab 4: Backup & Database Maintenance */}
      {canAccessBackup && activeTab === 'backup' && (
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
          <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-amber-800 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-amber-700" />
                  تصفير ومزامنة أجهزة الفروع فقط
                </h4>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  إرسال أمر تصفير لقواعد بيانات الفروع لمسح العمليات المحلية القديمة وتنزيل بيانات السيرفر الحالية بالكامل دون التأثير على بيانات السيرفر
                </p>
              </div>
              <Button
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100 font-black shrink-0"
                icon={RefreshCw}
                onClick={() => setShowBranchResetModal(true)}
              >
                تصفير بيانات الفروع
              </Button>
            </div>

            <div className="pt-4 border-t border-red-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-black text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                  منطقة الخطر: تصفير ومسح كافة بيانات النظام (السيرفر والفروع)
                </h4>
                <p className="text-xs text-slate-500 font-bold mt-1">
                  حذف كافة المبيعات، المخزون، الموردين، والمصروفات نهائياً مع تصفير الفروع التلقائي والحفاظ على الفروع وحساب المدير
                </p>
              </div>
              <Button variant="danger" icon={Trash2} onClick={() => setShowWipeModal(true)} className="shrink-0">
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
          {isEditingBranch ? (
            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-amber-900">كود الفرع الحالي:</span>
                <span className="px-2 py-0.5 rounded-md bg-amber-200/70 font-mono font-black text-amber-950 text-xs">
                  #{editingBranchId}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyBranchCode(editingBranchId)}
                className="inline-flex items-center gap-1 text-[11px] font-black text-amber-800 hover:text-amber-950 hover:underline cursor-pointer"
              >
                {copiedBranchId === editingBranchId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>نسخ الكود</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200 text-blue-900 text-xs font-bold flex items-center gap-2">
              <span className="text-sm">ℹ️</span>
              <span>سيتم تعيين كود فريد تلقائياً لهذا الفرع فور الحفظ، وسيظهر لك بوضوح لربط نقطة البيع.</span>
            </div>
          )}
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
              checked={branchForm.rentals_enabled !== false}
              onChange={(e) =>
                setBranchForm({ ...branchForm, rentals_enabled: e.target.checked })
              }
            />
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800">
                تفعيل قسم التأجير بالفرع
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                السماح بإنشاء عقود تأجير وإدارة فساتين/قطع التأجير بهذا الفرع
              </span>
            </div>
          </label>

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
        title={isEditingUser ? 'تعديل المستخدم وتخصيص الصلاحيات' : 'إضافة مستخدم جديد وتخصيص الصلاحيات'}
        subtitle="تحديد بيانات الموظف والفرع وتعيين صلاحيات الوصول يدوياً"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSaveUser} className="space-y-5">
          {/* Identity & Branch Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                <UserIcon className="w-3.5 h-3.5 text-[#C4823F]" />
                <span>اسم الشخص / الموظف المستخدم للحساب *</span>
              </label>
              <Input
                required
                placeholder="مثال: أحمد محمود (كاشير الفرع)"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                اسم المستخدم (لتسجيل الدخول) *
              </label>
              <Input
                required
                placeholder="ahmed_branch1"
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#C4823F]" />
                <span>الفرع الأساسي / الافتراضي للحساب *</span>
              </label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-xs text-[#24221F] focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={userForm.branch_id}
                onChange={(e) => {
                  const val = e.target.value;
                  setUserForm((prev) => {
                    const updated = { ...prev, branch_id: val };
                    if (prev.branch_scope === 'single') {
                      updated.branch_ids = [Number(val)];
                    } else if (prev.branch_scope === 'selected' && (!prev.branch_ids || !prev.branch_ids.includes(Number(val)))) {
                      updated.branch_ids = [...(prev.branch_ids || []), Number(val)];
                    }
                    return updated;
                  });
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.is_main_warehouse ? '(المخزن الرئيسي)' : ''}
                  </option>
                ))}
              </select>
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
          </div>

          {/* Branch Scoping & Multi-Branch Access */}
          <div className="pt-3 border-t border-[#E6DECD] space-y-3">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-[#C4823F]" />
                <span>نطاق فروع الحساب (Branch Access Scope) *</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'single',
                    label: 'فرع واحد محدد',
                    icon: '📍',
                    desc: 'تقييد الحساب بالفرع الافتراضي المحدد فقط دون إمكانية التبديل',
                  },
                  {
                    id: 'selected',
                    label: 'فروع مخصصة',
                    icon: '🏢',
                    desc: 'السماح بالتبديل بين قائمة فروع معينة يتم تحديدها أدناه',
                  },
                  {
                    id: 'all',
                    label: 'كافة الفروع',
                    icon: '🌐',
                    desc: 'الوصول الكامل لكافة فروع المنظومة الحالية وأي فروع جديدة',
                  },
                ].map((scope) => {
                  const isSelected = userForm.branch_scope === scope.id;
                  return (
                    <div
                      key={scope.id}
                      onClick={() => {
                        const newScope = scope.id;
                        let newIds = userForm.branch_ids || [];
                        if (newScope === 'single') {
                          newIds = [Number(userForm.branch_id || branches[0]?.id || 1)];
                        } else if (newScope === 'all') {
                          newIds = branches.map((b) => b.id);
                        } else if (newScope === 'selected' && (!newIds || !newIds.length)) {
                          newIds = [Number(userForm.branch_id || branches[0]?.id || 1)];
                        }
                        setUserForm((prev) => ({
                          ...prev,
                          branch_scope: newScope,
                          branch_ids: newIds,
                        }));
                      }}
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-[#151515] bg-[#FAF6ED] ring-1 ring-[#151515]'
                          : 'border-[#E6DECD] bg-[#FFFDF9] hover:bg-[#FAF6ED]/50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-black text-xs text-slate-900">
                        <span>{scope.icon}</span>
                        <span>{scope.label}</span>
                      </div>
                      <p className="text-[10px] font-medium text-slate-500 mt-1">{scope.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Checklist of branches when scope === 'selected' */}
            {userForm.branch_scope === 'selected' && (
              <div className="p-3.5 rounded-xl border border-purple-200 bg-purple-50/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-purple-950">
                    حدد الفروع المسموح لهذا المستخدم بالتبديل إليها:
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setUserForm((prev) => ({
                          ...prev,
                          branch_ids: branches.map((b) => b.id),
                        }))
                      }
                      className="text-[10px] font-bold text-purple-700 hover:underline"
                    >
                      تحديد الكل
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setUserForm((prev) => ({
                          ...prev,
                          branch_ids: [Number(prev.branch_id)],
                        }))
                      }
                      className="text-[10px] font-bold text-purple-700 hover:underline"
                    >
                      الفرع الأساسي فقط
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {branches.map((b) => {
                    const isChecked = (userForm.branch_ids || []).includes(b.id);
                    return (
                      <label
                        key={b.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-white border-purple-400 text-purple-950 shadow-xs'
                            : 'bg-white/60 border-purple-100 text-slate-600 hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="rounded text-purple-600 focus:ring-purple-500"
                          checked={isChecked}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setUserForm((prev) => {
                              const cur = new Set(prev.branch_ids || []);
                              if (checked) cur.add(b.id);
                              else {
                                if (cur.size > 1) cur.delete(b.id);
                              }
                              return { ...prev, branch_ids: Array.from(cur) };
                            });
                          }}
                        />
                        <span className="truncate">{b.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Hierarchical Granular Permissions Catalog */}
          <div className="pt-3 border-t border-[#E6DECD]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-black text-[#24221F] flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-[#C4823F]" />
                  <span>شجرة الصلاحيات التفاعلية (Hierarchical Permission Tree)</span>
                </h4>
                <p className="text-[11px] font-semibold text-[#777266]">
                  حدد الشاشات والأقسام والإجراءات الدقيقة المسموح لهذا المستخدم بتنفيذها:
                </p>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs font-black px-3 py-1.5 rounded-xl bg-slate-900 text-white shadow-xs">
                  تم تحديد {userForm.permissions?.length || 0} صلاحية
                </span>
              </div>
            </div>

            {/* Presets and Global Actions Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 p-2.5 rounded-2xl bg-[#FAF6ED] border border-[#E6DECD]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-500 ml-1">قوالب جاهزة:</span>
                {PERMISSION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset.permissions)}
                    className="px-2.5 py-1 text-xs font-bold rounded-xl border border-[#E6DECD] bg-[#FFFDF9] hover:bg-slate-100 text-slate-700 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleExpandAllModules}
                  className="text-xs !py-1 text-slate-700 font-bold"
                >
                  فتح كافة الأقسام
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCollapseAllModules}
                  className="text-xs !py-1 text-slate-700 font-bold"
                >
                  طي كافة الأقسام
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllPermissions}
                  className="text-xs !py-1"
                >
                  تحديد الكل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDeselectAllPermissions}
                  className="text-xs !py-1 text-rose-600 hover:text-rose-700"
                >
                  إلغاء الكل
                </Button>
              </div>
            </div>

            {/* Permissions Search Bar */}
            <div className="mb-3 relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث سريع في الصلاحيات بالاسم أو الكود (مثال: فواتير، تقارير، خصم)..."
                value={permSearch}
                onChange={(e) => setPermSearch(e.target.value)}
                className="w-full h-10 pr-9 pl-4 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Collapsible Module Tree */}
            <div className="space-y-3 max-h-[46vh] overflow-y-auto px-1 pr-2 custom-scrollbar">
              {filteredCatalog.map((mod) => {
                const modState = getModuleSelectionState(mod);
                const isCollapsed = Boolean(collapsedModules[mod.moduleId]);

                return (
                  <div
                    key={mod.moduleId}
                    className="rounded-2xl border border-[#E6DECD] bg-[#FFFDF9] overflow-hidden transition-all"
                  >
                    {/* Module Header */}
                    <div
                      onClick={() => toggleModuleCollapse(mod.moduleId)}
                      className="p-3 bg-[#FAF6ED]/70 flex items-center justify-between border-b border-[#E6DECD]/70 cursor-pointer select-none hover:bg-[#FAF6ED] transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={modState.all}
                          ref={(el) => {
                            if (el) el.indeterminate = modState.partial;
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => handleToggleModule(mod)}
                          className="rounded text-[#151515] focus:ring-[#151515] cursor-pointer"
                        />
                        <div>
                          <div className="text-xs font-black text-slate-900 flex items-center gap-2">
                            <span>{mod.label}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-[#E6DECD] text-slate-600">
                              {modState.count} / {modState.total}
                            </span>
                            {mod.branchFeature === 'rentals' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                ميزة فرع (Rentals)
                              </span>
                            )}
                          </div>
                          {mod.description && (
                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">{mod.description}</p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleModuleCollapse(mod.moduleId);
                        }}
                        className="p-1 rounded-lg hover:bg-[#E6DECD]/40 text-slate-600 transition-colors"
                      >
                        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Module Content (Tabs & Actions) */}
                    {!isCollapsed && (
                      <div className="p-3.5 space-y-4">
                        {(mod.tabs || []).map((tab) => {
                          const tabState = getTabSelectionState(tab);
                          return (
                            <div key={tab.tabId} className="space-y-2 border-r-2 border-amber-400/40 pr-3 mr-1">
                              {/* Tab Subheader */}
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={tabState.all}
                                    ref={(el) => {
                                      if (el) el.indeterminate = tabState.partial;
                                    }}
                                    onChange={() => handleToggleTab(tab)}
                                    className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                  />
                                  <span className="text-xs font-extrabold text-slate-800">{tab.label}</span>
                                </label>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {tabState.count} / {tabState.total}
                                </span>
                              </div>

                              {/* Actions Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {(tab.actions || []).map((act) => {
                                  const isChecked = (userForm.permissions || []).includes(act.id);
                                  return (
                                    <div
                                      key={act.id}
                                      onClick={() => handleToggleAction(act.id)}
                                      className={`flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none ${
                                        isChecked
                                          ? 'border-indigo-600 bg-indigo-50/60 shadow-xs ring-1 ring-indigo-500/20'
                                          : 'border-[#E6DECD] bg-[#FFFDF9] hover:bg-[#FAF6ED]'
                                      }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => {}}
                                        className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[11px] font-black ${
                                              isChecked ? 'text-indigo-950' : 'text-slate-900'
                                            }`}
                                          >
                                            {act.label}
                                          </span>
                                          {act.sensitive && (
                                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 border border-rose-200">
                                              محمي بكلمة سر 🔒
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 dir-ltr text-right">
                                          {act.id}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div className="pt-4 border-t border-[#E6DECD] flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowUserModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" icon={Save}>
              {isEditingUser ? 'حفظ وتحديث الصلاحيات' : 'إنشاء المستخدم وتعيين الصلاحيات'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Branch Reset Modal */}
      <Modal
        isOpen={showBranchResetModal}
        onClose={() => setShowBranchResetModal(false)}
        title="تصفير ومزامنة أجهزة الفروع فقط"
        size="md"
      >
        <form onSubmit={handleResetBranches} className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold leading-relaxed">
            <p className="font-black mb-1">⚠️ تنبيه هام:</p>
            سيتم إرسال أمر تصفير لجميع أجهزة الفروع المتصلة لمسح كافة العمليات والفواتير المحلية القديمة وتنزيل بيانات السيرفر الحالية بالكامل (المخزون، العملاء، المستخدمين الجدد) فور اتصالها، دون المساس ببيانات السيرفر المركزي الحالي.
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              كلمة مرور المشرف (Admin Password) *
            </label>
            <Input
              type="password"
              required
              placeholder="••••••••"
              value={branchResetPassword}
              onChange={(e) => setBranchResetPassword(e.target.value)}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowBranchResetModal(false)}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="danger"
              icon={RefreshCw}
              loading={branchResetSubmitting}
              disabled={!branchResetPassword}
            >
              تأكيد أمر تصفير الفروع
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
            هذه العملية لا يمكن الرجوع عنها. سيتم حذف جميع الفواتير والمخزون والعملاء وعقود التأجير وإعادة تصفير الحركات، مع تصفير كافة أجهزة الفروع المتصلة تلقائياً والحفاظ على الفروع وحساب المدير الحالي.
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
