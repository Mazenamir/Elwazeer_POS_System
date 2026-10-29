import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import StatCard from '../../components/ui/StatCard';
import { useAuth } from '../../context/AuthContext';
import { useBranch } from '../../context/BranchContext';
import { useToast } from '../../context/ToastContext';
import client from '../../services/api/client';
import reportsService from '../../services/api/reports.service';
import { printHtml } from '../../utils/print';
import {
  BarChart3,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Download,
  Filter,
  Printer,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Package,
  Layers,
  ShoppingBag,
  Scissors,
  Repeat,
  Wallet,
  Eye,
  EyeOff,
  RotateCcw,
  Building2,
  CreditCard,
  Lock,
  AlertCircle,
  Users,
  Award,
  CheckCircle2,
  Clock,
  Save,
  Edit3,
  Target,
  Briefcase,
  FileCheck,
  Check,
} from 'lucide-react';
import { getPaymentMethodArabic } from '../../utils/receiptHelpers';

const BRANCH_NAME_ARABIC = {
  'elraml': 'الرمل',
  'el raml': 'الرمل',
  'raml': 'الرمل',
  'beshr': 'بشر',
  'moharm bek': 'محرم بك',
  'el amrya': 'العامرية',
  'al agamy': 'العجمي',
  'el agamy': 'العجمي',
  'damnhor man': 'دمنهور رجالي',
  'damnhor woman': 'دمنهور حريمي',
  'antalya': 'انطاليا',
  'el wazer': 'الوزير',
  'elwazer': 'الوزير',
  'main warehouse': 'المخزن الرئيسي',
};

function cleanBranchLabel(rawName) {
  if (!rawName) return '';
  const trimmed = String(rawName).trim();
  const lower = trimmed.toLowerCase();
  if (['all', 'all_branches', 'كل الفروع', 'كافة الفروع', 'كافة الفروع (مجمّع)'].includes(lower)) {
    return 'كل الفروع';
  }
  if (BRANCH_NAME_ARABIC[lower]) {
    return `فرع ${BRANCH_NAME_ARABIC[lower]}`;
  }
  let clean = trimmed
    .replace(/^نظام\s+الوزير(\s+المحاسبي)?(\s+المتكامل)?/gi, '')
    .replace(/^نظام\s+بيبيون(\s+والوزير)?/gi, '')
    .replace(/^بيبيون\s+والوزير(\s+لإدارة\s+الفروع)?/gi, '')
    .replace(/^بيبيون\s+للبدل\s+الرجالي(\s*[-–]\s*)?/gi, '')
    .replace(/^بيبيون\s+ب(ال)?/gi, '')
    .replace(/^بيبيون\s+فرع\s+/gi, '')
    .replace(/^بيبيون\s+/gi, '')
    .replace(/^فرع\s+/gi, '')
    .trim();
  const cleanLower = clean.toLowerCase();
  if (BRANCH_NAME_ARABIC[cleanLower]) {
    clean = BRANCH_NAME_ARABIC[cleanLower];
  }
  if (!clean || clean === 'كل الفروع' || clean === 'كافة الفروع') {
    return 'كل الفروع';
  }
  return clean.startsWith('فرع') ? clean : `فرع ${clean}`;
}

export function Reports() {
  const { user } = useAuth();
  const { branches, isMultiBranch, activeBranchId } = useBranch();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'monthly' | 'sales' | 'rentals' | 'expenses' | 'inventory' | 'top_products'
  const [selectedBranch, setSelectedBranch] = useState(() => (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all'));

  useEffect(() => {
    if (activeBranchId) {
      setSelectedBranch(activeBranchId);
    }
  }, [activeBranchId]);
  const [profitVisible, setProfitVisible] = useState(false);
  const [showProfitAuthModal, setShowProfitAuthModal] = useState(false);
  const [profitAuthInput, setProfitAuthInput] = useState('');
  const [profitAuthError, setProfitAuthError] = useState('');
  const [profitAuthLoading, setProfitAuthLoading] = useState(false);

  const handleToggleProfitVisibility = () => {
    if (profitVisible) {
      setProfitVisible(false);
      setProfitAuthInput('');
      toast({
        title: 'تم إخفاء وتأمين الأرباح',
        message: 'تم إخفاء صافي الأرباح وتكاليف المنتجات بنجاح 🔒',
        variant: 'info',
      });
    } else {
      setProfitAuthInput('');
      setProfitAuthError('');
      setShowProfitAuthModal(true);
    }
  };

  const handleConfirmProfitAuth = async (e) => {
    if (e) e.preventDefault();
    const pwd = profitAuthInput.trim();
    if (!pwd) {
      setProfitAuthError('يرجى إدخال كلمة سر الأرباح');
      return;
    }

    try {
      setProfitAuthLoading(true);
      setProfitAuthError('');
      const res = await client.post('/verify-profit-password', { password: pwd });
      if (res?.ok || res?.data?.ok) {
        setProfitVisible(true);
        setShowProfitAuthModal(false);
        setProfitAuthInput('');
        toast({
          title: 'تم التحقق بنجاح',
          message: 'تم فك القفل وإظهار صافي الأرباح 🔓',
          variant: 'success',
        });
      } else {
        setProfitAuthError(res?.error || res?.data?.error || 'كلمة المرور غير صحيحة');
      }
    } catch (err) {
      setProfitAuthError(err.response?.data?.error || err.message || 'كلمة المرور غير صحيحة');
    } finally {
      setProfitAuthLoading(false);
    }
  };

  // Daily reports history
  const [dailyHistory, setDailyHistory] = useState([]);
  const [dailyFrom, setDailyFrom] = useState('');
  const [dailyTo, setDailyTo] = useState('');
  const [loadingDaily, setLoadingDaily] = useState(false);
  const [expandedDate, setExpandedDate] = useState(null);
  const [expandedDetails, setExpandedDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Monthly reports
  const [monthlyHistory, setMonthlyHistory] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // Sales report
  const [salesReport, setSalesReport] = useState({ orders: [], summary: {} });
  const [loadingSales, setLoadingSales] = useState(false);

  // Rentals report
  const [rentalsReport, setRentalsReport] = useState({ rentals: [], summary: {} });
  const [loadingRentals, setLoadingRentals] = useState(false);

  // Expenses report
  const [expensesReport, setExpensesReport] = useState({ expenses: [], summary: {}, categories: [] });
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  // Inventory report
  const [inventoryReport, setInventoryReport] = useState({ items: [], summary: {} });
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryGender, setInventoryGender] = useState('all'); // 'all' | 'men' | 'women'

  // Top products
  const [topProducts, setTopProducts] = useState([]);
  const [loadingTopProducts, setLoadingTopProducts] = useState(false);

  // Overall profit summary
  const [profitSummary, setProfitSummary] = useState({
    revenue: 0,
    cogs: 0,
    gross_profit: 0,
    expenses: 0,
    net_profit: 0,
    profit_margin: 0,
  });

  // Exporting states for feedback spinners
  const [exportingPDF, setExportingPDF] = useState(false);
  const [exportingDayPDF, setExportingDayPDF] = useState(null);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingDayExcel, setExportingDayExcel] = useState(null);
  const [exportingConsolidated, setExportingConsolidated] = useState(false);
  const exportingPdf = exportingPDF;
  const setExportingPdf = setExportingPDF;

  // Consolidated branch workbook states (OHDA, Salary, KPI, Master)
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [masterReport, setMasterReport] = useState(null);
  const [loadingMaster, setLoadingMaster] = useState(false);
  const [masterSelectedDay, setMasterSelectedDay] = useState(1);
  const [ohdaReport, setOhdaReport] = useState(null);
  const [loadingOhda, setLoadingOhda] = useState(false);
  const [salaryReport, setSalaryReport] = useState(null);
  const [loadingSalary, setLoadingSalary] = useState(false);
  const [kpiReport, setKpiReport] = useState(null);
  const [loadingKpi, setLoadingKpi] = useState(false);

  const currentBranchLabel = useMemo(() => {
    if (selectedBranch === 'all' || !selectedBranch) return 'كل الفروع';
    const found = branches.find((b) => String(b.id) === String(selectedBranch));
    if (found?.name) {
      return cleanBranchLabel(found.name);
    }
    if (masterReport?.branch_clean_name && masterReport.branch_clean_name !== 'كل الفروع') {
      return cleanBranchLabel(masterReport.branch_clean_name);
    }
    if (masterReport?.branch_name && masterReport.branch_name !== 'كل الفروع') {
      return cleanBranchLabel(masterReport.branch_name);
    }
    return `فرع #${selectedBranch}`;
  }, [selectedBranch, branches, masterReport]);

  const currentReportTitle = useMemo(() => {
    if (selectedBranch === 'all' || !selectedBranch) {
      return 'كل الفروع';
    }
    return currentBranchLabel;
  }, [selectedBranch, currentBranchLabel]);

  const [attendanceEditState, setAttendanceEditState] = useState({});
  const [sectionsOpen, setSectionsOpen] = useState({
    revenue: true,
    advances: false,
    expenses: false,
    tailoring: false,
    attendance: false,
    suppliers: false,
  });

  const toggleSection = (sec) => {
    setSectionsOpen((prev) => ({ ...prev, [sec]: !prev[sec] }));
  };

  // Suppliers ledger state
  const [ledgerData, setLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerCategory, setLedgerCategory] = useState('all');
  const [selectedSupplierStatement, setSelectedSupplierStatement] = useState(null);
  const [loadingStatementModal, setLoadingStatementModal] = useState(false);

  const isBranchScoped = user?.role === 'branch_user' || user?.role === 'cashier' || user?.role === 'tailor';

  // Formatters
  const formatCurrency = (val) => {
    const parsed = Number(val);
    const num = Number.isFinite(parsed) ? parsed : 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    // In Arabic RTL, negative numbers like -2,979.5 get flipped to 2,979.5- ج.م because the minus
    // is treated as an RTL neutral punctuation mark. Wrapping with LTR mark (\u200E) isolates the
    // number so the minus sign renders cleanly on the left of the digits.
    return num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ar-EG-u-nu-latn', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Load Profit KPI
  const loadProfitSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/profit?${params.toString()}`);
      const data = res?.data || res;
      if (data) setProfitSummary(data.summary || data);
    } catch {
      // ignore
    }
  }, [selectedBranch, dailyFrom, dailyTo]);

  // Load Daily History
  const loadDailyHistory = useCallback(async () => {
    try {
      setLoadingDaily(true);
      const params = new URLSearchParams({ days: '30' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/daily-history?${params.toString()}`);
      const data = res?.data || res;
      setDailyHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل السجل اليومي',
        variant: 'danger',
      });
    } finally {
      setLoadingDaily(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Monthly History
  const loadMonthlyHistory = useCallback(async () => {
    try {
      setLoadingMonthly(true);
      const params = new URLSearchParams({ months: '12' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/monthly-history?${params.toString()}`);
      const data = res?.data || res;
      setMonthlyHistory(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل السجل الشهري',
        variant: 'danger',
      });
    } finally {
      setLoadingMonthly(false);
    }
  }, [selectedBranch, toast]);

  // Load Top Products
  const loadTopProducts = useCallback(async () => {
    try {
      setLoadingTopProducts(true);
      const params = new URLSearchParams({ limit: '20' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const res = await client.get(`/reports/top-products?${params.toString()}`);
      const list = Array.isArray(res.data)
        ? res.data
        : (res.data?.products || res.data?.top_sales || []);
      setTopProducts(list);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل المنتجات الأكثر مبيعاً',
        variant: 'danger',
      });
    } finally {
      setLoadingTopProducts(false);
    }
  }, [selectedBranch, toast]);

  // Load Sales Report
  const loadSalesReport = useCallback(async () => {
    try {
      setLoadingSales(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/sales?${params.toString()}`);
      setSalesReport(res.data || { orders: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المبيعات',
        variant: 'danger',
      });
    } finally {
      setLoadingSales(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Rentals Report
  const loadRentalsReport = useCallback(async () => {
    try {
      setLoadingRentals(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/rentals?${params.toString()}`);
      setRentalsReport(res.data || { rentals: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير التأجير',
        variant: 'danger',
      });
    } finally {
      setLoadingRentals(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Expenses Report
  const loadExpensesReport = useCallback(async () => {
    try {
      setLoadingExpenses(true);
      const params = new URLSearchParams({ limit: '1000' });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);

      const res = await client.get(`/reports/expenses?${params.toString()}`);
      setExpensesReport(res.data || { expenses: [], summary: {}, categories: [] });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المصروفات',
        variant: 'danger',
      });
    } finally {
      setLoadingExpenses(false);
    }
  }, [selectedBranch, dailyFrom, dailyTo, toast]);

  // Load Inventory Report
  const loadInventoryReport = useCallback(async () => {
    try {
      setLoadingInventory(true);
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);
      if (inventoryGender !== 'all') params.set('gender', inventoryGender);

      const res = await client.get(`/reports/inventory?${params.toString()}`);
      setInventoryReport(res.data || { items: [], summary: {} });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير المخزون',
        variant: 'danger',
      });
    } finally {
      setLoadingInventory(false);
    }
  }, [selectedBranch, inventoryGender, toast]);

  // Load Master Sheet Report
  const loadMasterReport = useCallback(async () => {
    try {
      setLoadingMaster(true);
      const params = { month: selectedMonth, branch_id: selectedBranch };
      const res = await reportsService.getMonthlyMaster(params);
      const data = res?.data || res;
      setMasterReport(data);
      if (data?.days && data.days.length > 0) {
        setMasterSelectedDay((prev) => {
          const maxDay = data.days.length;
          if (!prev || prev < 1 || prev > maxDay) return (data.days[0].day_number || data.days[0].day || 1);
          return prev;
        });
      }
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل المجمع الشهري MASTER SHEET',
        variant: 'danger',
      });
    } finally {
      setLoadingMaster(false);
    }
  }, [selectedMonth, selectedBranch, toast]);

  // Load OHDA Report
  const loadOhdaReport = useCallback(async () => {
    try {
      setLoadingOhda(true);
      const params = { month: selectedMonth, branch_id: selectedBranch };
      const res = await reportsService.getMonthlyOhda(params);
      setOhdaReport(res?.data || res);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل شيت العهدة والسلف',
        variant: 'danger',
      });
    } finally {
      setLoadingOhda(false);
    }
  }, [selectedMonth, selectedBranch, toast]);

  // Load Salary Sheet
  const loadSalaryReport = useCallback(async () => {
    try {
      setLoadingSalary(true);
      const params = { month: selectedMonth, branch_id: selectedBranch };
      const res = await reportsService.getMonthlySalarySheet(params);
      setSalaryReport(res?.data || res);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل مسير المرتبات',
        variant: 'danger',
      });
    } finally {
      setLoadingSalary(false);
    }
  }, [selectedMonth, selectedBranch, toast]);

  // Load Sales KPI Report
  const loadKpiReport = useCallback(async () => {
    try {
      setLoadingKpi(true);
      const params = { month: selectedMonth, branch_id: selectedBranch };
      const res = await reportsService.getSalesKpi(params);
      setKpiReport(res?.data || res);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل تقرير أداء البائعين',
        variant: 'danger',
      });
    } finally {
      setLoadingKpi(false);
    }
  }, [selectedMonth, selectedBranch, toast]);

  // Load Suppliers Ledger (File 1)
  const loadSuppliersLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);
      const params = {};
      if (selectedBranch !== 'all') params.branch_id = selectedBranch;
      if (ledgerSearch.trim()) params.search = ledgerSearch.trim();
      if (ledgerCategory !== 'all') params.gender_category = ledgerCategory;
      const res = await client.get('/reports/suppliers-ledger', { params });
      setLedgerData(res?.data || res);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل كشوف حسابات الموردين',
        variant: 'danger',
      });
    } finally {
      setLoadingLedger(false);
    }
  }, [selectedBranch, ledgerSearch, ledgerCategory, toast]);

  // Open Detailed Statement Modal for a Supplier
  const openSupplierStatementModal = async (supplierId) => {
    try {
      setLoadingStatementModal(true);
      const params = {};
      if (selectedBranch !== 'all') params.branch_id = selectedBranch;
      const res = await client.get(`/suppliers/${supplierId}/statement`, { params });
      setSelectedSupplierStatement(res?.data || res);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل كشف حساب المورد',
        variant: 'danger',
      });
    } finally {
      setLoadingStatementModal(false);
    }
  };

  // Initial and reactive fetch
  useEffect(() => {
    loadProfitSummary();
    if (activeTab === 'daily') {
      loadDailyHistory();
    } else if (activeTab === 'master') {
      loadMasterReport();
    } else if (activeTab === 'ohda') {
      loadOhdaReport();
    } else if (activeTab === 'salary') {
      loadSalaryReport();
    } else if (activeTab === 'kpi') {
      loadKpiReport();
    } else if (activeTab === 'suppliers_ledger') {
      loadSuppliersLedger();
    } else if (activeTab === 'monthly') {
      loadMonthlyHistory();
    } else if (activeTab === 'sales') {
      loadSalesReport();
    } else if (activeTab === 'rentals') {
      loadRentalsReport();
    } else if (activeTab === 'expenses') {
      loadExpensesReport();
    } else if (activeTab === 'inventory') {
      loadInventoryReport();
    } else if (activeTab === 'top_products') {
      loadTopProducts();
    }
  }, [
    activeTab,
    selectedBranch,
    selectedMonth,
    loadProfitSummary,
    loadDailyHistory,
    loadMasterReport,
    loadOhdaReport,
    loadSalaryReport,
    loadKpiReport,
    loadSuppliersLedger,
    loadMonthlyHistory,
    loadSalesReport,
    loadRentalsReport,
    loadExpensesReport,
    loadInventoryReport,
    loadTopProducts,
  ]);

  // Toggle Day Accordion & load day details (including extended 4-table report)
  const toggleDayAccordion = async (date) => {
    if (expandedDate === date) {
      setExpandedDate(null);
      setExpandedDetails(null);
      return;
    }

    setExpandedDate(date);
    setLoadingDetails(true);
    try {
      const params = new URLSearchParams({ date });
      if (selectedBranch !== 'all') params.set('branch_id', selectedBranch);

      const [legacyRes, extRes] = await Promise.all([
        client.get(`/reports/daily?${params.toString()}`).catch(() => null),
        reportsService.getExtendedDaily({ date, branch_id: selectedBranch }).catch(() => null),
      ]);

      const lData = legacyRes?.data || legacyRes || {};
      const eData = extRes?.data || extRes || null;

      setExpandedDetails({
        ...lData,
        extended: eData,
      });

      if (eData?.attendance) {
        const initialAttendance = {};
        eData.attendance.forEach((att) => {
          initialAttendance[att.employee_id] = {
            check_in: att.check_in_24 || (att.check_in ? att.check_in.replace(/\s*[AP]M/i, '').trim() : ''),
            check_out: att.check_out_24 || (att.check_out ? att.check_out.replace(/\s*[AP]M/i, '').trim() : ''),
            notes: att.notes || '',
            saving: false,
          };
        });
        setAttendanceEditState(initialAttendance);
      }
    } catch {
      setExpandedDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Quick Attendance Inline Save
  const handleSaveAttendance = async (employeeId, date) => {
    let edit = attendanceEditState[employeeId];
    if (!edit) {
      const attRow = expandedDetails?.extended?.attendance?.find((a) => a.employee_id === employeeId);
      if (attRow) {
        edit = {
          check_in: attRow.check_in_24 || (attRow.check_in ? attRow.check_in.replace(/\s*[AP]M/i, '').trim() : ''),
          check_out: attRow.check_out_24 || (attRow.check_out ? attRow.check_out.replace(/\s*[AP]M/i, '').trim() : ''),
          notes: attRow.notes || '',
        };
      }
    }
    if (!edit) return;

    setAttendanceEditState((prev) => ({
      ...prev,
      [employeeId]: { ...(prev[employeeId] || edit), saving: true },
    }));

    try {
      await reportsService.quickLogAttendance({
        employee_id: employeeId,
        date,
        check_in: edit.check_in || null,
        check_out: edit.check_out || null,
        notes: edit.notes || '',
      });

      toast({
        title: 'تم تسجيل الحضور',
        message: 'تم تحديث أوقات وساعات الحضور والملاحظات بنجاح',
        variant: 'success',
      });

      // Refresh extended daily data
      const extRes = await reportsService.getExtendedDaily({ date, branch_id: selectedBranch });
      const eData = extRes?.data || extRes;
      if (eData) {
        setExpandedDetails((prev) => ({
          ...(prev || {}),
          extended: eData,
        }));
        if (eData.attendance) {
          setAttendanceEditState((prev) => {
            const next = { ...prev };
            eData.attendance.forEach((a) => {
              if (a.employee_id === employeeId) {
                next[employeeId] = {
                  check_in: a.check_in_24 || (a.check_in ? a.check_in.replace(/\s*[AP]M/i, '').trim() : ''),
                  check_out: a.check_out_24 || (a.check_out ? a.check_out.replace(/\s*[AP]M/i, '').trim() : ''),
                  notes: a.notes || '',
                  saving: false,
                };
              }
            });
            return next;
          });
        }
      }
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.response?.data?.error || err.message || 'تعذر تحديث الحضور',
        variant: 'danger',
      });
    } finally {
      setAttendanceEditState((prev) => ({
        ...prev,
        [employeeId]: { ...(prev[employeeId] || {}), saving: false },
      }));
    }
  };

  // Export Consolidated Excel (36 Sheets matching branch workbook)
  const exportConsolidatedExcel = async () => {
    try {
      setExportingConsolidated(true);
      const params = { month: selectedMonth };
      let bName = 'كل_الفروع';
      if (selectedBranch !== 'all') {
        params.branch_id = selectedBranch;
        const cleanName = currentBranchLabel;
        params.branch_name = cleanName;
        bName = cleanName.replace(/\s+/g, '_');
      } else {
        params.branch_id = 'all';
        params.branch_name = 'كل الفروع';
      }

      const res = await reportsService.exportConsolidatedExcel(params);
      const blob = res instanceof Blob
        ? res
        : (res?.data instanceof Blob
            ? res.data
            : new Blob([res?.data || res], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));

      if (!blob || blob.size <= 200) {
        let errorMsg = 'الملف الناتج غير صالح أو فارغ';
        try {
          if (blob && typeof blob.text === 'function') {
            const txt = await blob.text();
            const parsed = JSON.parse(txt);
            if (parsed.error || parsed.message) errorMsg = parsed.error || parsed.message;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const downloadFileName = `مجمع_${bName}_${selectedMonth}.xlsx`;
      link.download = downloadFileName;
      link.setAttribute('download', downloadFileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => {
        try { window.URL.revokeObjectURL(url); } catch {}
      }, 60000);

      toast({
        title: 'تم تصدير شيت المجمع',
        message: `تم تصدير ملف الإكسيل المجمع (${selectedBranch === 'all' ? 'كل الفروع' : (params.branch_name || 'الفرع')}) (${selectedMonth}) بنجاح (36 شيت متكامل)`,
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تصدير ملف الإكسيل المجمع',
        variant: 'danger',
      });
    } finally {
      setExportingConsolidated(false);
    }
  };

  const exportMasterPdf = async () => {
    try {
      setExportingPDF(true);
      const params = { type: 'master', month: selectedMonth };
      let bName = 'كل_الفروع';
      if (selectedBranch !== 'all') {
        params.branch_id = selectedBranch;
        const cleanName = currentBranchLabel;
        params.branch_name = cleanName;
        bName = cleanName.replace(/\s+/g, '_');
      } else {
        params.branch_id = 'all';
        params.branch_name = 'كل الفروع';
      }

      const res = await reportsService.exportPdfHtml(params);
      const htmlContent = typeof res === 'string' ? res : (res?.data || res);
      const defaultName = `تقرير_المجمع_${bName}_${selectedMonth}.pdf`;

      if (window.electronAPI?.exportPdf) {
        const result = await window.electronAPI.exportPdf({ html: htmlContent, defaultFileName: defaultName });
        if (result?.success) {
          toast({
            title: 'تم الحفظ',
            message: 'تم حفظ ملف PDF بنجاح',
            variant: 'success',
          });
          return;
        } else if (result?.canceled) {
          return;
        }
      }

      if (!htmlContent || typeof htmlContent !== 'string' || !htmlContent.trim()) {
        throw new Error('لم يتم استلام محتوى التقرير من الخادم');
      }

      await printHtml(htmlContent, `تقرير_المجمع_${bName}_${selectedMonth}`, { iframeId: 'report-print-frame', isA4: true });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تصدير تقرير PDF المجمع',
        variant: 'danger',
      });
    } finally {
      setExportingPDF(false);
    }
  };

  // Real Excel .xlsx Export
  const exportToExcel = async (reportType = activeTab, extraParams = {}) => {
    const isDaySpecific = !!extraParams?.date;
    if (isDaySpecific) {
      setExportingDayExcel(extraParams.date);
    } else {
      setExportingExcel(true);
    }

    try {
      const mappedType =
        reportType === 'daily' && !extraParams.date
          ? 'daily_history'
          : reportType === 'monthly'
          ? 'monthly_history'
          : reportType;

      const params = new URLSearchParams({ type: mappedType, ...extraParams });
      let bName = 'كل_الفروع';
      if (selectedBranch !== 'all') {
        params.set('branch_id', selectedBranch);
        const cleanName = currentBranchLabel;
        params.set('branch_name', cleanName);
        bName = cleanName.replace(/\s+/g, '_');
      } else {
        params.set('branch_id', 'all');
        params.set('branch_name', 'كل الفروع');
      }
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);
      if (selectedMonth) params.set('month', selectedMonth);
      if (mappedType === 'inventory' && inventoryGender !== 'all') params.set('gender', inventoryGender);

      const res = await client.get(`/reports/export/excel?${params.toString()}`, {
        responseType: 'blob',
      });

      const blob = res instanceof Blob
        ? res
        : (res?.data instanceof Blob
            ? res.data
            : new Blob([res?.data || res], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              }));

      if (!blob || blob.size <= 200) {
        let errorMsg = 'الملف الناتج غير صالح أو فارغ';
        try {
          if (blob && typeof blob.text === 'function') {
            const txt = await blob.text();
            const parsed = JSON.parse(txt);
            if (parsed.error || parsed.message) errorMsg = parsed.error || parsed.message;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const typeLabel = reportType === 'daily' || reportType === 'daily_history'
        ? 'اليومي'
        : reportType === 'monthly' || reportType === 'monthly_history'
        ? 'الشهري'
        : reportType === 'profit'
        ? 'الأرباح'
        : reportType === 'daily_details'
        ? `تفاصيل-يوم-${extraParams.date || ''}`
        : reportType === 'sales'
        ? 'فواتير-المبيعات'
        : reportType === 'rentals'
        ? 'عقود-التأجير'
        : reportType === 'expenses'
        ? 'سجل-المصروفات'
        : reportType === 'inventory'
        ? 'جرد-المخزون'
        : reportType === 'summary'
        ? 'ملخص-الأعمال'
        : reportType === 'ohda'
        ? `العهدة-الشهرية-${selectedMonth}`
        : reportType === 'salary' || reportType === 'salary_sheet'
        ? `مسير-المرتبات-${selectedMonth}`
        : reportType === 'kpi'
        ? `أداء-البائعين-${selectedMonth}`
        : reportType === 'consolidated' || reportType === 'master' || reportType === 'master_sheet' || reportType === 'monthly_master'
        ? `المجمع-الشهري-${selectedMonth}`
        : reportType === 'suppliers_ledger' || reportType === 'suppliers'
        ? 'دفتر-الموردين'
        : reportType === 'supplier_statement'
        ? 'كشف-حساب-مورد'
        : reportType === 'branch_matrix'
        ? 'أرصدة-الفروع'
        : reportType === 'transfers' || reportType === 'transfer_logs'
        ? 'حركة-التحويلات'
        : reportType === 'top_products'
        ? 'الأكثر-مبيعاً'
        : (reportType || 'عام');
      const downloadFileName = `تقرير-${typeLabel}-${bName}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = downloadFileName;
      link.setAttribute('download', downloadFileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Defer URL revocation so the browser download manager can finish reading the blob
      setTimeout(() => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {}
      }, 60000);

      toast({
        title: 'تم التصدير',
        message: 'تم تصدير ملف الإكسيل (.xlsx) بنجاح',
        variant: 'success',
      });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تصدير ملف الإكسيل',
        variant: 'danger',
      });
    } finally {
      if (isDaySpecific) {
        setExportingDayExcel(null);
      } else {
        setExportingExcel(false);
      }
    }
  };

  // Printable / PDF Export
  const exportToPDF = async (reportType = activeTab, extraParams = {}) => {
    const isDaySpecific = !!extraParams?.date;
    if (isDaySpecific) {
      setExportingDayPDF(extraParams.date);
    } else {
      setExportingPDF(true);
    }

    try {
      const mappedType =
        reportType === 'daily' && !extraParams.date
          ? 'daily_history'
          : reportType === 'monthly'
          ? 'monthly_history'
          : reportType;

      const params = new URLSearchParams({ type: mappedType, ...extraParams });
      let bName = 'كل_الفروع';
      if (selectedBranch !== 'all') {
        params.set('branch_id', selectedBranch);
        const cleanName = currentBranchLabel;
        params.set('branch_name', cleanName);
        bName = cleanName.replace(/\s+/g, '_');
      } else {
        params.set('branch_id', 'all');
        params.set('branch_name', 'كل الفروع');
      }
      if (dailyFrom) params.set('date_from', dailyFrom);
      if (dailyTo) params.set('date_to', dailyTo);
      if (selectedMonth) params.set('month', selectedMonth);
      if (mappedType === 'inventory' && inventoryGender !== 'all') params.set('gender', inventoryGender);

      const res = await client.get(`/reports/export/pdf-html?${params.toString()}`);
      const html = typeof res === 'string' ? res : (res?.data || res);

      const typeLabel = reportType === 'daily' || reportType === 'daily_history'
        ? 'اليومي'
        : reportType === 'monthly' || reportType === 'monthly_history'
        ? 'الشهري'
        : reportType === 'profit'
        ? 'الأرباح'
        : reportType === 'daily_details'
        ? `تفاصيل-يوم-${extraParams.date || ''}`
        : reportType === 'sales'
        ? 'فواتير-المبيعات'
        : reportType === 'rentals'
        ? 'عقود-التأجير'
        : reportType === 'expenses'
        ? 'سجل-المصروفات'
        : reportType === 'inventory'
        ? 'جرد-المخزون'
        : reportType === 'summary'
        ? 'ملخص-الأعمال'
        : reportType === 'ohda'
        ? `العهدة-الشهرية-${selectedMonth}`
        : reportType === 'salary' || reportType === 'salary_sheet'
        ? `مسير-المرتبات-${selectedMonth}`
        : reportType === 'kpi'
        ? `أداء-البائعين-${selectedMonth}`
        : reportType === 'consolidated' || reportType === 'master' || reportType === 'master_sheet' || reportType === 'monthly_master'
        ? `المجمع-الشهري-${selectedMonth}`
        : reportType === 'suppliers_ledger' || reportType === 'suppliers'
        ? 'دفتر-الموردين'
        : reportType === 'supplier_statement'
        ? 'كشف-حساب-مورد'
        : reportType === 'branch_matrix'
        ? 'أرصدة-الفروع'
        : reportType === 'transfers' || reportType === 'transfer_logs'
        ? 'حركة-التحويلات'
        : reportType === 'top_products'
        ? 'الأكثر-مبيعاً'
        : (reportType || 'عام');

      if (window.electronAPI?.exportPdf) {
        const defaultName = `تقرير-${typeLabel}-${bName}-${new Date().toISOString().split('T')[0]}.pdf`;
        const result = await window.electronAPI.exportPdf({ html, defaultFileName: defaultName });
        if (result?.success) {
          toast({
            title: 'تم الحفظ',
            message: 'تم حفظ ملف PDF بنجاح',
            variant: 'success',
          });
          return;
        } else if (result?.canceled) {
          return;
        }
      }

      if (!html || typeof html !== 'string' || !html.trim()) {
        throw new Error('لم يتم استلام محتوى التقرير من الخادم');
      }

      // Browser fallback: invisible iframe print (never blocked by popup blockers)
      await printHtml(html, `تقرير-${typeLabel}`, { iframeId: 'report-print-frame' });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر إنشاء تقرير PDF',
        variant: 'danger',
      });
    } finally {
      if (isDaySpecific) {
        setExportingDayPDF(null);
      } else {
        setExportingPDF(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                التقارير المالية والتحليلية
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                متابعة حركة الإيرادات والمصروفات وصافي الأرباح وأداء الفروع
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isBranchScoped && (
            <select
              className="h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id.toString()}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          {/* Export to Excel & PDF first */}
          <Button
            variant="primary"
            icon={FileSpreadsheet}
            isLoading={exportingExcel}
            disabled={exportingExcel || exportingPDF || exportingConsolidated}
            onClick={() => exportToExcel()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-sm"
          >
            تصدير إكسيل (.xlsx)
          </Button>

          <Button
            variant="primary"
            icon={Printer}
            isLoading={exportingPDF}
            disabled={exportingPDF || exportingExcel || exportingConsolidated}
            onClick={() => exportToPDF()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-black shadow-sm"
          >
            طباعة / PDF
          </Button>

          <Button
            variant="outline"
            icon={FileSpreadsheet}
            isLoading={exportingConsolidated}
            disabled={exportingConsolidated || exportingExcel || exportingPDF}
            onClick={exportConsolidatedExcel}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/40 font-bold"
          >
            تصدير مجمع الفرع (36 شيت)
          </Button>

          <Button
            variant="outline"
            icon={profitVisible ? EyeOff : Eye}
            onClick={handleToggleProfitVisibility}
          >
            {profitVisible ? 'إخفاء الأرباح' : 'إظهار الأرباح 🔒'}
          </Button>
        </div>
      </div>

      {/* Top 5 KPI Cards Matching Consolidated Workbook Structure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Physical Cash in Drawer */}
        <StatCard
          title="الكاش الفعلي بالدرج 💵"
          value={formatCurrency(profitSummary.physical_cash_in_drawer ?? profitSummary.cash_drawer ?? 0)}
          icon={Wallet}
          variant="success"
          subtitle="المتحصل الفعلي بعد خصم السلف والمصاريف"
        />

        {/* Card 2: Visa, InstaPay & Bank Transfers */}
        <StatCard
          title="فيزا وانستاباي وتحويلات 💳"
          value={formatCurrency(profitSummary.electronic_collections || 0)}
          icon={CreditCard}
          variant="info"
          subtitle="تحصيلات بنكية وإلكترونية (خارج الدرج)"
        />

        {/* Card 3: Today's & Month's Profit (Locked) */}
        <StatCard
          title="أرباح اليوم والشهر 📈"
          value={
            profitVisible
              ? formatCurrency(profitSummary.today_profit ?? profitSummary.net_profit ?? 0)
              : '••••••'
          }
          icon={DollarSign}
          variant={(profitSummary.today_profit ?? profitSummary.net_profit ?? 0) >= 0 ? 'primary' : 'danger'}
          subtitle={
            profitVisible
              ? `أرباح الشهر: ${formatCurrency(profitSummary.month_profit ?? profitSummary.net_profit ?? 0)}`
              : 'صافي العائد (مقفل بكلمة السر)'
          }
        />

        {/* Card 4: Total Expenses & Advances */}
        <StatCard
          title="إجمالي المصروفات والسلف 💸"
          value={formatCurrency(
            profitSummary.total_expenses_and_advances ??
            (Number(profitSummary.expenses || 0) + Number(profitSummary.total_advances || 0))
          )}
          icon={TrendingDown}
          variant="danger"
          subtitle={`مصروفات: ${formatCurrency(profitSummary.expenses || 0)} | سلف: ${formatCurrency(profitSummary.total_advances || 0)}`}
        />

        {/* Card 5: Total Sales & Revenue */}
        <StatCard
          title="إجمالي المبيعات والإيرادات 📊"
          value={formatCurrency(profitSummary.total_sales_and_revenue ?? profitSummary.revenue ?? 0)}
          icon={TrendingUp}
          variant="default"
          subtitle="مبيعات الكاشير والتأجير والتفصيل"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('daily')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'daily'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>التقارير اليومية وحركة الدرج</span>
        </button>

        <button
          onClick={() => setActiveTab('master')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'master'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>المجمع الشهري (MASTER SHEET)</span>
        </button>

        <button
          onClick={() => setActiveTab('ohda')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'ohda'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>العهدة وسلف الشهر (OHDA)</span>
        </button>

        <button
          onClick={() => setActiveTab('salary')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'salary'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>مسير المرتبات الشامل (SALARY)</span>
        </button>

        <button
          onClick={() => setActiveTab('kpi')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'kpi'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>تقييم وأداء البائعين (KPI)</span>
        </button>

        <button
          onClick={() => setActiveTab('suppliers_ledger')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'suppliers_ledger'
              ? 'bg-emerald-800 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
          <span>كشوف حسابات الموردين (LEDGER)</span>
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>فواتير المبيعات</span>
        </button>

        <button
          onClick={() => setActiveTab('rentals')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'rentals'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>عقود التأجير</span>
        </button>

        <button
          onClick={() => setActiveTab('expenses')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          <span>سجل المصروفات</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>جرد وتقييم المخزون</span>
        </button>

        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'monthly'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>التقرير الشهري والمقارنات</span>
        </button>

        <button
          onClick={() => setActiveTab('top_products')}
          className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'top_products'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>الأكثر مبيعاً</span>
        </button>
      </div>

      {/* Month Filter Bar for Month-based Tabs */}
      {['ohda', 'salary', 'kpi'].includes(activeTab) && (
        <Card>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">الشهر المستهدف</label>
                <input
                  type="month"
                  className="h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                />
              </div>
              <div className="self-end">
                <Button
                  variant="primary"
                  icon={Filter}
                  onClick={() => {
                    if (activeTab === 'ohda') loadOhdaReport();
                    else if (activeTab === 'salary') loadSalaryReport();
                    else if (activeTab === 'kpi') loadKpiReport();
                  }}
                >
                  تحديث
                </Button>
              </div>
            </div>

            <div className="self-end">
              <Button
                variant="outline"
                icon={FileSpreadsheet}
                size="sm"
                isLoading={exportingConsolidated}
                onClick={exportConsolidatedExcel}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/20 font-bold"
              >
                تصدير شيت المجمع الشهري (36 شيت)
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Date Filter Bar for Date-based Tabs */}
      {['daily', 'sales', 'rentals', 'expenses'].includes(activeTab) && (
        <Card>
          <div className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">من تاريخ</label>
                <Input
                  type="date"
                  value={dailyFrom}
                  onChange={(e) => setDailyFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">إلى تاريخ</label>
                <Input
                  type="date"
                  value={dailyTo}
                  onChange={(e) => setDailyTo(e.target.value)}
                />
              </div>
              <div className="self-end">
                <Button
                  variant="primary"
                  icon={Filter}
                  onClick={() => {
                    loadProfitSummary();
                    if (activeTab === 'daily') loadDailyHistory();
                    else if (activeTab === 'sales') loadSalesReport();
                    else if (activeTab === 'rentals') loadRentalsReport();
                    else if (activeTab === 'expenses') loadExpensesReport();
                  }}
                >
                  تطبيق
                </Button>
              </div>
            </div>

            {(dailyFrom || dailyTo) && (
              <div className="self-end">
                <button
                  onClick={() => {
                    setDailyFrom('');
                    setDailyTo('');
                    loadProfitSummary();
                    if (activeTab === 'daily') loadDailyHistory();
                    else if (activeTab === 'sales') loadSalesReport();
                    else if (activeTab === 'rentals') loadRentalsReport();
                    else if (activeTab === 'expenses') loadExpensesReport();
                  }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  إلغاء الفلتر
                </button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Tab 1: Daily Reports History (Accordion) */}
      {activeTab === 'daily' && (
        <div className="space-y-4">

          {/* Daily Accordion List */}
          <div className="space-y-3">
            {loadingDaily ? (
              <Card>
                <div className="py-16 text-center text-slate-400 font-bold">
                  جارِ تحميل السجل اليومي...
                </div>
              </Card>
            ) : dailyHistory.length === 0 ? (
              <Card>
                <div className="py-16 text-center text-slate-400 font-bold">
                  لا توجد حركات مسجلة في هذه الفترة
                </div>
              </Card>
            ) : (
              dailyHistory.map((day) => {
                const isExpanded = expandedDate === day.date;

                return (
                  <div
                    key={day.date}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all"
                  >
                    {/* Accordion Header */}
                    <div
                      onClick={() => toggleDayAccordion(day.date)}
                      className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors ${
                        isExpanded ? 'bg-slate-50 border-b border-slate-100' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-black">
                          <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-900">{formatDate(day.date)}</p>
                          <p className="text-[11px] font-bold text-slate-400">{day.date}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-left hidden sm:block">
                          <span className="text-[10px] font-bold text-slate-400 block">الإيرادات</span>
                          <span className="text-sm font-black text-emerald-600">
                            {formatCurrency(day.revenue)}
                          </span>
                        </div>

                        <div className="text-left hidden sm:block">
                          <span className="text-[10px] font-bold text-slate-400 block">المصروفات</span>
                          <span className="text-sm font-black text-rose-600">
                            {formatCurrency(day.expenses)}
                          </span>
                        </div>

                        {profitVisible && (
                          <div className="text-left">
                            <span className="text-[10px] font-bold text-slate-400 block">صافي الربح</span>
                            <span
                              className={`text-sm font-black ${
                                Number(day.profit || 0) >= 0 ? 'text-slate-900' : 'text-rose-600'
                              }`}
                            >
                              {formatCurrency(day.profit)}
                            </span>
                          </div>
                        )}

                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Accordion Content */}
                    {isExpanded && (
                      <div className="p-6 bg-slate-50/50 space-y-6">
                        {loadingDetails ? (
                          <div className="py-8 text-center text-slate-400 font-bold">
                            جارِ تحميل تفاصيل اليوم...
                          </div>
                        ) : !expandedDetails ? (
                          <div className="py-8 text-center text-slate-400 font-bold">
                            تعذر تحميل تفاصيل اليوم
                          </div>
                        ) : (
                          <div className="space-y-6">
                            {/* Day Quick Actions Bar (Top) */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                  تصدير كشف اليومية الفعلي ليوم ({day.date}):
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="primary"
                                  icon={FileSpreadsheet}
                                  size="sm"
                                  isLoading={exportingDayExcel === day.date}
                                  disabled={exportingDayExcel === day.date || exportingDayPDF === day.date}
                                  onClick={() => exportToExcel('daily_details', { date: day.date })}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                                >
                                  تصدير إكسيل (.xlsx) لليوم
                                </Button>
                                <Button
                                  variant="primary"
                                  icon={Printer}
                                  size="sm"
                                  isLoading={exportingDayPDF === day.date}
                                  disabled={exportingDayPDF === day.date || exportingDayExcel === day.date}
                                  onClick={() => exportToPDF('daily_details', { date: day.date })}
                                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-black"
                                >
                                  طباعة / PDF لليوم
                                </Button>
                              </div>
                            </div>

                            {/* Extended 4 Parallel Tables + Row 76/77 Summary Bar matching Daily Sheets */}
                            {expandedDetails.extended && (
                              <div className="space-y-5">
                                {/* Table 1: All Daily Revenue Transactions (Collapsible) */}
                                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                  <div
                                    onClick={() => toggleSection('revenue')}
                                    className="p-3 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-200/70 transition-colors select-none"
                                  >
                                    <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                      <ShoppingBag className="w-4 h-4 text-indigo-600" />
                                      حركات وإيرادات اليوم (مبيعات / تأجير / تفصيل / مرتجعات) ({expandedDetails.extended.sales_invoices?.length || 0})
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[11px] font-bold text-slate-600">
                                        إجمالي الإيرادات: <span className="font-black text-slate-900">{formatCurrency(expandedDetails.extended.summary?.total_sales || 0)}</span> | المحصل: <span className="font-black text-emerald-700">{formatCurrency(expandedDetails.extended.summary?.total_paid || 0)}</span>
                                      </span>
                                      <div className="w-6 h-6 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                                        {sectionsOpen.revenue ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </div>
                                    </div>
                                  </div>
                                  {sectionsOpen.revenue && (
                                    <div className="overflow-x-auto max-h-80">
                                    <table className="w-full text-right text-xs">
                                      <thead className="sticky top-0 bg-slate-50 text-slate-700 font-black border-b border-slate-200 z-10">
                                        <tr>
                                          <th className="py-2.5 px-3">التاريخ</th>
                                          <th className="py-2.5 px-3">رقم الفاتورة</th>
                                          <th className="py-2.5 px-3">نوع الحركة</th>
                                          <th className="py-2.5 px-3">البيان</th>
                                          <th className="py-2.5 px-3">الإجمالي</th>
                                          <th className="py-2.5 px-3">المدفوع</th>
                                          <th className="py-2.5 px-3">الباقي</th>
                                          <th className="py-2.5 px-3">طريقة الدفع</th>
                                          <th className="py-2.5 px-3">اسم البائع</th>
                                          <th className="py-2.5 px-3">تاريخ الاستلام</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-bold">
                                        {expandedDetails.extended.sales_invoices?.length === 0 ? (
                                          <tr>
                                            <td colSpan={10} className="py-6 text-center text-slate-400">
                                              لا توجد حركات مسجلة في هذا اليوم
                                            </td>
                                          </tr>
                                        ) : (
                                          expandedDetails.extended.sales_invoices?.map((inv, idx) => (
                                            <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${inv.transaction_type === 'return' ? 'bg-rose-50/30' : ''}`}>
                                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{inv.invoice_date || inv.order_date_cairo || inv.date || day.date}</td>
                                              <td className="py-2 px-3 text-slate-900 font-black font-mono">#{inv.branch_invoice_number || inv.invoice_number}</td>
                                              <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                  inv.transaction_type === 'rental'
                                                    ? 'bg-indigo-100 text-indigo-800'
                                                    : inv.transaction_type === 'tailoring'
                                                    ? 'bg-purple-100 text-purple-800'
                                                    : inv.transaction_type === 'rental_fine'
                                                    ? 'bg-amber-100 text-amber-800'
                                                    : inv.transaction_type === 'return'
                                                    ? 'bg-rose-100 text-rose-800'
                                                    : 'bg-slate-100 text-slate-800'
                                                }`}>
                                                  {inv.type_label || (inv.transaction_type === 'rental' ? 'إيجار' : inv.transaction_type === 'tailoring' ? 'تفصيل' : inv.transaction_type === 'return' ? 'مرتجع' : 'بيع')}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-slate-700 max-w-xs truncate" title={inv.description}>{inv.description || '-'}</td>
                                              <td className={`py-2 px-3 font-black ${inv.total_amount < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatCurrency(inv.total_amount)}</td>
                                              <td className={`py-2 px-3 font-black ${inv.paid_amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatCurrency(inv.paid_amount)}</td>
                                              <td className="py-2 px-3 text-rose-600 font-black">{formatCurrency(inv.remaining_amount || 0)}</td>
                                              <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                                                  inv.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                                                }`}>
                                                  {getPaymentMethodArabic(inv.payment_method, inv.payment_splits || inv)}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-indigo-700 font-bold">{inv.seller_name || inv.cashier_name || '-'}</td>
                                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{inv.delivery_date || inv.pickup_date || '-'}</td>
                                            </tr>
                                          ))
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                  )}
                                </div>

                                {/* Table 2 & Table 3 Grid (Advances & Expenses) */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                  {/* Table 2: Employee Advances (Collapsible) */}
                                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                    <div
                                      onClick={() => toggleSection('advances')}
                                      className="p-3 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                                    >
                                      <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                        <Users className="w-4 h-4 text-amber-600" />
                                        سلف الموظفين اليومية ({expandedDetails.extended.advances?.length || 0})
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-800">
                                          الإجمالي: {formatCurrency(expandedDetails.extended.summary?.total_advances || 0)}
                                        </span>
                                        <div className="w-6 h-6 rounded-md bg-white border border-amber-200 flex items-center justify-center text-amber-700">
                                          {sectionsOpen.advances ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </div>
                                      </div>
                                    </div>
                                    {sectionsOpen.advances && (
                                    <div className="overflow-x-auto max-h-60">
                                      <table className="w-full text-right text-xs">
                                        <thead className="sticky top-0 bg-slate-50 text-slate-700 font-black border-b border-slate-200 z-10">
                                          <tr>
                                            <th className="py-2 px-3">اسم الموظف</th>
                                            <th className="py-2 px-3">مبلغ السلفة</th>
                                            <th className="py-2 px-3">ملاحظات</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-bold">
                                          {expandedDetails.extended.advances?.length === 0 ? (
                                            <tr>
                                              <td colSpan={3} className="py-6 text-center text-slate-400">
                                                لا توجد سلف موظفين في هذا اليوم
                                              </td>
                                            </tr>
                                          ) : (
                                            expandedDetails.extended.advances?.map((adv, idx) => (
                                              <tr key={idx} className="hover:bg-slate-50/80">
                                                <td className="py-2 px-3 text-slate-900 font-black">{adv.employee_name}</td>
                                                <td className="py-2 px-3 text-rose-600 font-black">{formatCurrency(adv.amount)}</td>
                                                <td className="py-2 px-3 text-slate-500">{adv.notes || '-'}</td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                    )}
                                  </div>

                                  {/* Table 3: Expenses (Collapsible) */}
                                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                    <div
                                      onClick={() => toggleSection('expenses')}
                                      className="p-3 bg-rose-50/70 border-b border-rose-200 flex items-center justify-between cursor-pointer hover:bg-rose-100/60 transition-colors select-none"
                                    >
                                      <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                                        <TrendingDown className="w-4 h-4 text-rose-600" />
                                        المصروفات وطرق السداد ({expandedDetails.extended.expenses?.length || 0})
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-rose-800">
                                          الإجمالي: {formatCurrency(expandedDetails.extended.summary?.total_expenses || 0)}
                                        </span>
                                        <div className="w-6 h-6 rounded-md bg-white border border-rose-200 flex items-center justify-center text-rose-700">
                                          {sectionsOpen.expenses ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </div>
                                      </div>
                                    </div>
                                    {sectionsOpen.expenses && (
                                    <div className="overflow-x-auto max-h-60">
                                      <table className="w-full text-right text-xs">
                                        <thead className="sticky top-0 bg-slate-50 text-slate-700 font-black border-b border-slate-200 z-10">
                                          <tr>
                                            <th className="py-2 px-3">مصروفات أخرى / البند</th>
                                            <th className="py-2 px-3">المبلغ</th>
                                            <th className="py-2 px-3">طريقة الدفع</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-bold">
                                          {expandedDetails.extended.expenses?.length === 0 ? (
                                            <tr>
                                              <td colSpan={3} className="py-6 text-center text-slate-400">
                                                لا توجد مصروفات مسجلة في هذا اليوم
                                              </td>
                                            </tr>
                                          ) : (
                                            expandedDetails.extended.expenses?.map((exp, idx) => (
                                              <tr key={idx} className="hover:bg-slate-50/80">
                                                <td className="py-2 px-3 text-slate-900 font-bold">{exp.description || exp.title || exp.category}</td>
                                                <td className="py-2 px-3 text-rose-600 font-black">{formatCurrency(exp.amount)}</td>
                                                <td className="py-2 px-3">
                                                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                                                    exp.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-indigo-100 text-indigo-800'
                                                  }`}>
                                                    {getPaymentMethodArabic(exp.payment_method)}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                    )}
                                  </div>
                                </div>

                                {/* Table: Tailoring Payments (Collapsible) */}
                                {(expandedDetails.tailoring?.items?.length > 0 || expandedDetails.tailoring_details?.items?.length > 0) && (
                                  <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                    <div
                                      onClick={() => toggleSection('tailoring')}
                                      className="p-3 bg-purple-50/70 border-b border-purple-200 flex items-center justify-between cursor-pointer hover:bg-purple-100/60 transition-colors select-none"
                                    >
                                      <span className="text-xs font-black text-purple-900 flex items-center gap-1.5">
                                        <Scissors className="w-4 h-4 text-purple-600" />
                                        متحصلات وعقود التفصيل ({(expandedDetails.tailoring?.items || expandedDetails.tailoring_details?.items || []).length})
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-purple-800">
                                          الإجمالي المحصل: {formatCurrency((expandedDetails.tailoring || expandedDetails.tailoring_details)?.total || (expandedDetails.tailoring?.items || expandedDetails.tailoring_details?.items || []).reduce((s, t) => s + Number(t.amount || 0), 0))}
                                        </span>
                                        <div className="w-6 h-6 rounded-md bg-white border border-purple-200 flex items-center justify-center text-purple-700">
                                          {sectionsOpen.tailoring ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </div>
                                      </div>
                                    </div>
                                    {sectionsOpen.tailoring && (
                                    <div className="overflow-x-auto max-h-60">
                                      <table className="w-full text-right text-xs">
                                        <thead className="sticky top-0 bg-slate-50 text-slate-700 font-black border-b border-slate-200 z-10">
                                          <tr>
                                            <th className="py-2.5 px-3">رقم الفاتورة</th>
                                            <th className="py-2.5 px-3">الوقت</th>
                                            <th className="py-2.5 px-3">اسم العميل</th>
                                            <th className="py-2.5 px-3">وصف القطعة والمقاسات</th>
                                            <th className="py-2.5 px-3">المبلغ المحصل</th>
                                            <th className="py-2.5 px-3">طريقة الدفع</th>
                                            <th className="py-2.5 px-3">المتبقي</th>
                                            <th className="py-2.5 px-3">نوع الدفعة</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-bold">
                                          {(expandedDetails.tailoring?.items || expandedDetails.tailoring_details?.items || []).map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/80">
                                              <td className="py-2 px-3 text-slate-900 font-black font-mono">#{item.invoice_number}</td>
                                              <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">{item.created_date || '-'}</td>
                                              <td className="py-2 px-3 text-slate-800">{item.customer_name}</td>
                                              <td className="py-2 px-3 text-slate-700 max-w-xs truncate" title={item.product_description}>{item.product_description || '-'}</td>
                                              <td className="py-2 px-3 text-emerald-600 font-black">{formatCurrency(item.amount)}</td>
                                              <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${
                                                  item.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-800' : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                  {getPaymentMethodArabic(item.payment_method)}
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-rose-600 font-black">{formatCurrency(item.remaining_amount || 0)}</td>
                                              <td className="py-2 px-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                  item.is_remainder ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                                                }`}>
                                                  {item.is_remainder ? 'سداد متبقي' : 'عربون / دفعة أولى'}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    )}
                                  </div>
                                )}

                                {/* Table 4: Employee Attendance & Hours with Inline Quick Editing (Collapsible) */}
                                <div className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                  <div
                                    onClick={() => toggleSection('attendance')}
                                    className="p-3 bg-indigo-50/80 border-b border-indigo-200 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-indigo-100/60 transition-colors select-none"
                                  >
                                    <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                                      <Clock className="w-4 h-4 text-indigo-600" />
                                      حضور وساعات الموظفين (تسجيل وتعديل سريع للدرج)
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-[11px] font-bold text-indigo-700">
                                        عدّل وقت الحضور/الانصراف أو الملاحظة واضغط "حفظ" لتحديث الساعات واليومية فوراً
                                      </span>
                                      <div className="w-6 h-6 rounded-md bg-white border border-indigo-200 flex items-center justify-center text-indigo-700">
                                        {sectionsOpen.attendance ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      </div>
                                    </div>
                                  </div>
                                  {sectionsOpen.attendance && (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-right text-xs">
                                      <thead className="bg-slate-50 text-slate-700 font-black border-b border-slate-200">
                                        <tr>
                                          <th className="py-2.5 px-3">اسم الموظف</th>
                                          <th className="py-2.5 px-3">وقت الحضور</th>
                                          <th className="py-2.5 px-3">وقت الانصراف</th>
                                          <th className="py-2.5 px-3">عداد الساعات</th>
                                          <th className="py-2.5 px-3">ملاحظات (كلية / إجازة / غياب / نص يوم)</th>
                                          <th className="py-2.5 px-3 text-center">إجراءات</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 font-bold">
                                        {expandedDetails.extended.attendance?.length === 0 ? (
                                          <tr>
                                            <td colSpan={6} className="py-6 text-center text-slate-400">
                                              لا يوجد موظفون نشطون بالفرع
                                            </td>
                                          </tr>
                                        ) : (
                                          expandedDetails.extended.attendance?.map((att) => {
                                            const edit = attendanceEditState[att.employee_id] || {
                                              check_in: att.check_in_24 || '',
                                              check_out: att.check_out_24 || '',
                                              notes: att.notes || '',
                                              saving: false,
                                            };

                                            return (
                                              <tr key={att.employee_id} className="hover:bg-slate-50/80">
                                                <td className="py-2.5 px-3 text-slate-900 font-black whitespace-nowrap">
                                                  {att.employee_name}
                                                </td>
                                                <td className="py-2 px-3">
                                                  <input
                                                    type="time"
                                                    className="h-8 px-2 rounded-lg border border-slate-200 font-mono text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none bg-white"
                                                    value={edit.check_in || ''}
                                                    onChange={(e) => {
                                                      const val = e.target.value;
                                                      setAttendanceEditState((prev) => {
                                                        const cur = prev[att.employee_id] || {
                                                          check_in: att.check_in_24 || '',
                                                          check_out: att.check_out_24 || '',
                                                          notes: att.notes || '',
                                                        };
                                                        return { ...prev, [att.employee_id]: { ...cur, check_in: val } };
                                                      });
                                                    }}
                                                  />
                                                </td>
                                                <td className="py-2 px-3">
                                                  <input
                                                    type="time"
                                                    className="h-8 px-2 rounded-lg border border-slate-200 font-mono text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none bg-white"
                                                    value={edit.check_out || ''}
                                                    onChange={(e) => {
                                                      const val = e.target.value;
                                                      setAttendanceEditState((prev) => {
                                                        const cur = prev[att.employee_id] || {
                                                          check_in: att.check_in_24 || '',
                                                          check_out: att.check_out_24 || '',
                                                          notes: att.notes || '',
                                                        };
                                                        return { ...prev, [att.employee_id]: { ...cur, check_out: val } };
                                                      });
                                                    }}
                                                  />
                                                </td>
                                                <td className="py-2.5 px-3 text-indigo-700 font-black font-mono">
                                                  {att.total_hours ? `${att.total_hours} س` : '-'}
                                                </td>
                                                <td className="py-2 px-3">
                                                  <input
                                                    type="text"
                                                    placeholder="كلية / إجازة / غياب / نص يوم..."
                                                    className="h-8 px-2.5 w-full rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none bg-white"
                                                    value={edit.notes || ''}
                                                    onChange={(e) => {
                                                      const val = e.target.value;
                                                      setAttendanceEditState((prev) => {
                                                        const cur = prev[att.employee_id] || {
                                                          check_in: att.check_in_24 || '',
                                                          check_out: att.check_out_24 || '',
                                                          notes: att.notes || '',
                                                        };
                                                        return { ...prev, [att.employee_id]: { ...cur, notes: val } };
                                                      });
                                                    }}
                                                  />
                                                </td>
                                                <td className="py-2 px-3 text-center whitespace-nowrap">
                                                  <Button
                                                    size="sm"
                                                    variant="primary"
                                                    icon={Save}
                                                    isLoading={edit.saving}
                                                    onClick={() => handleSaveAttendance(att.employee_id, day.date)}
                                                    className="h-8 text-xs py-0 px-3"
                                                  >
                                                    حفظ
                                                  </Button>
                                                </td>
                                              </tr>
                                            );
                                          })
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                  )}
                                </div>

                                {/* Table: Supplier Cash Payments from Drawer (Collapsible) */}
                                {expandedDetails.extended.supplier_payments?.length > 0 && (
                                  <div className="border border-amber-200 rounded-xl bg-white overflow-hidden shadow-sm">
                                    <div
                                      onClick={() => toggleSection('suppliers')}
                                      className="p-3 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between cursor-pointer hover:bg-amber-100/60 transition-colors select-none"
                                    >
                                      <span className="text-xs font-black text-amber-900 flex items-center gap-1.5">
                                        <Wallet className="w-4 h-4 text-amber-600" />
                                        دفعات الموردين المسددة نقداً من الدرج ({expandedDetails.extended.supplier_payments.length})
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-amber-800">
                                          الإجمالي المخصوم: {formatCurrency(expandedDetails.extended.summary?.total_supplier_cash_payments || 0)}
                                        </span>
                                        <div className="w-6 h-6 rounded-md bg-white border border-amber-200 flex items-center justify-center text-amber-700">
                                          {sectionsOpen.suppliers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </div>
                                      </div>
                                    </div>
                                    {sectionsOpen.suppliers && (
                                    <div className="overflow-x-auto max-h-48">
                                      <table className="w-full text-right text-xs">
                                        <thead className="bg-slate-50 text-slate-700 font-black border-b border-slate-200">
                                          <tr>
                                            <th className="py-2.5 px-3">المورد</th>
                                            <th className="py-2.5 px-3">المبلغ المسدد</th>
                                            <th className="py-2.5 px-3">البيان / الملاحظات</th>
                                            <th className="py-2.5 px-3">الوقت</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 font-bold">
                                          {expandedDetails.extended.supplier_payments.map((sp, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50/80">
                                              <td className="py-2 px-3 text-slate-900">{sp.supplier_name}</td>
                                              <td className="py-2 px-3 text-rose-600 font-black">{formatCurrency(sp.amount)}</td>
                                              <td className="py-2 px-3 text-slate-600">{sp.notes || 'سداد دفعة للمورد من الدرج'}</td>
                                              <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{sp.transaction_time || '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    )}
                                  </div>
                                )}

                                {/* Daily Summary Bar (Workbook Rows 76 & 77) */}
                                <div className="bg-slate-900 rounded-2xl p-4 text-white shadow-md space-y-3">
                                  {/* Row 76 */}
                                  <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800 text-xs">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                                      <span className="text-slate-400 font-bold">إجمالي مبيعات اليوم (سطر 76):</span>
                                      <span className="font-black text-white">
                                        الإجمالي: {formatCurrency(expandedDetails.extended.summary?.total_sales || 0)}
                                      </span>
                                      <span className="text-emerald-400 font-black mx-1">|</span>
                                      <span className="text-emerald-400 font-black">
                                        المدفوع: {formatCurrency(expandedDetails.extended.summary?.total_paid || 0)}
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-4">
                                      <div>
                                        <span className="text-slate-400 font-bold ml-1.5">السلف:</span>
                                        <span className="text-amber-400 font-black">
                                          {formatCurrency(expandedDetails.extended.summary?.total_advances || 0)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 font-bold ml-1.5">المصروفات:</span>
                                        <span className="text-rose-400 font-black">
                                          {formatCurrency(expandedDetails.extended.summary?.total_expenses || 0)}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="text-slate-400 font-bold ml-1.5">سداد موردين:</span>
                                        <span className="text-orange-400 font-black">
                                          {formatCurrency(expandedDetails.extended.summary?.total_supplier_cash_payments || 0)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Track 3: Separate Electronic Collections vs Cash Drawer */}
                                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 text-xs">
                                    <div className="flex flex-wrap items-center gap-3">
                                      <span className="text-slate-400 font-bold flex items-center gap-1">
                                        <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                                        توزيع المتحصلات الإلكترونية:
                                      </span>
                                      <span className="bg-slate-800 px-2 py-0.5 rounded text-blue-300 font-bold">
                                        فيزا: {formatCurrency(expandedDetails.extended.summary?.card_collected || 0)}
                                      </span>
                                      <span className="bg-slate-800 px-2 py-0.5 rounded text-cyan-300 font-bold">
                                        انستاباي: {formatCurrency(expandedDetails.extended.summary?.bank_collected || 0)}
                                      </span>
                                      <span className="bg-slate-800 px-2 py-0.5 rounded text-amber-300 font-bold">
                                        فودافون كاش: {formatCurrency(expandedDetails.extended.summary?.wallet_collected || 0)}
                                      </span>
                                    </div>
                                    <div className="text-slate-300 font-bold">
                                      كاش المحصل: <span className="text-emerald-400 font-black">{formatCurrency(expandedDetails.extended.summary?.cash_collected || 0)}</span>
                                    </div>
                                  </div>

                                  {/* Row 77 */}
                                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                                      <span className="text-slate-300 font-bold">إجمالي الخصومات (سطر 77 - سلف + مصروفات + موردين):</span>
                                      <span className="text-rose-300 font-black text-sm">
                                        {formatCurrency(expandedDetails.extended.summary?.total_deductions || 0)}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-3 bg-emerald-950/80 border border-emerald-500/40 px-4 py-2 rounded-xl">
                                      <span className="text-xs font-black text-emerald-300">
                                        صافي كاش الدرج للتوريد (سطر 77) 💵 :
                                      </span>
                                      <span className="text-lg font-black text-emerald-400">
                                        {formatCurrency(expandedDetails.extended.summary?.cash_in_drawer || 0)}
                                      </span>
                                      <span className="text-[10px] text-emerald-200/70 font-mono">
                                        [E76 - K77 = كاش المحصل - الخصومات]
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Breakdown cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  مبيعات الكاشير
                                </span>
                                <span className="text-base font-black text-slate-900 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_sales || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  متحصلات التأجير
                                </span>
                                <span className="text-base font-black text-indigo-600 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_rentals || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                                <span className="text-[10px] font-bold text-slate-400 block">
                                  متحصلات التفصيل
                                </span>
                                <span className="text-base font-black text-purple-600 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.total_tailoring || 0),
                                      0
                                    )
                                  )}
                                </span>
                              </div>

                              <div className="p-3.5 rounded-xl bg-white border border-emerald-300 bg-emerald-50/60 shadow-sm">
                                <span className="text-[10px] font-black text-emerald-800 block">
                                  المبلغ المحصّل بالدرج (كاش فعلي) 💵
                                </span>
                                <span className="text-base font-black text-emerald-700 block mt-0.5">
                                  {formatCurrency(
                                    expandedDetails.branch_sales?.reduce(
                                      (acc, b) => acc + Number(b.cash_in_drawer || b.net_cash || 0),
                                      0
                                    )
                                  )}
                                </span>
                                <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                                  الصافي داخل درج النقدية
                                </span>
                              </div>
                            </div>

                            {/* Electronic & Collections Breakdown Banner */}
                            {Array.isArray(expandedDetails.payment_methods) && expandedDetails.payment_methods.length > 0 && (() => {
                              let cashTotal = 0;
                              let instapayTotal = 0;
                              let visaTotal = 0;
                              let walletTotal = 0;
                              const othersMap = new Map();

                              expandedDetails.payment_methods.forEach((p) => {
                                const raw = String(p.method || '').toLowerCase().trim();
                                const amt = Number(p.total_amount || 0);
                                if (amt <= 0) return;

                                if (['cash', 'نقدي', 'كاش', 'نقدي (كاش)', 'كاش (بالدرج)'].includes(raw)) {
                                  cashTotal += amt;
                                } else if (['bank_transfer', 'bank', 'transfer', 'instapay', 'انستاباي', 'تحويل بنكي', 'انستاباي / تحويل بنكي', 'تحويل بنكي / انستاباي', 'انستاباي / بنكي'].includes(raw)) {
                                  instapayTotal += amt;
                                } else if (['visa', 'card', 'credit', 'بطاقة', 'فيزا', 'بطاقة (فيزا)', 'فيزا / بطاقة', 'فيزا / بطاقات'].includes(raw)) {
                                  visaTotal += amt;
                                } else if (['wallet', 'mobile_wallet', 'smart_wallet', 'فودافون كاش', 'فودافون', 'vodafone', 'vodafone_cash', 'vodafone cash', 'vodafonecash', 'محفظة', 'محفظه', 'محافظ', 'محافظ إلكترونية', 'محفظة إلكترونية', 'فودافون كاش / محفظة'].includes(raw)) {
                                  walletTotal += amt;
                                } else {
                                  const label = getPaymentMethodArabic(p.method);
                                  othersMap.set(label, (othersMap.get(label) || 0) + amt);
                                }
                              });

                              const othersList = Array.from(othersMap.entries()).map(([label, amount]) => ({ label, amount }));

                              return (
                                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                                  <div className="text-xs font-black text-slate-700 mb-2 flex items-center justify-between">
                                    <span>تفصيل طرق التحصيل (فصل الدرج عن الإلكتروني):</span>
                                    <span className="text-[10px] text-slate-500 font-bold">
                                      المدفوعات الإلكترونية لا تدخل درج الكاشير
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <div className="p-2.5 bg-white rounded-lg border border-emerald-200">
                                      <span className="text-[10px] font-bold text-emerald-800 block">كاش (بالدرج)</span>
                                      <span className="text-sm font-black text-emerald-700">
                                        {formatCurrency(cashTotal)}
                                      </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-lg border border-indigo-200">
                                      <span className="text-[10px] font-bold text-indigo-800 block">انستاباي / تحويل بنكي</span>
                                      <span className="text-sm font-black text-indigo-700">
                                        {formatCurrency(instapayTotal)}
                                      </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-lg border border-sky-200">
                                      <span className="text-[10px] font-bold text-sky-800 block">فيزا / بطاقات</span>
                                      <span className="text-sm font-black text-sky-700">
                                        {formatCurrency(visaTotal)}
                                      </span>
                                    </div>
                                    <div className="p-2.5 bg-white rounded-lg border border-purple-200">
                                      <span className="text-[10px] font-bold text-purple-800 block">فودافون كاش</span>
                                      <span className="text-sm font-black text-purple-700">
                                        {formatCurrency(walletTotal)}
                                      </span>
                                    </div>
                                    {othersList.map((p, pIdx) => (
                                      <div key={pIdx} className="p-2.5 bg-white rounded-lg border border-amber-200">
                                        <span className="text-[10px] font-bold text-amber-800 block">{p.label}</span>
                                        <span className="text-sm font-black text-amber-700">{formatCurrency(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Branch Sales Breakdown table */}
                            {expandedDetails.branch_sales?.length > 0 && (
                              <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                                <div className="p-3 bg-slate-100 border-b border-slate-200 text-xs font-black text-slate-800">
                                  توزيع مبيعات الفروع
                                </div>
                                <table className="w-full text-right text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                                      <th className="py-2.5 px-3">الفرع</th>
                                      <th className="py-2.5 px-3">البيع</th>
                                      <th className="py-2.5 px-3">التأجير</th>
                                      <th className="py-2.5 px-3">التفصيل</th>
                                      <th className="py-2.5 px-3">المصروفات</th>
                                      <th className="py-2.5 px-3">صافي الكاش بالدرج</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-bold">
                                    {expandedDetails.branch_sales.map((b, idx) => (
                                      <tr key={idx} className="hover:bg-slate-50">
                                        <td className="py-2 px-3 text-slate-900 font-black">
                                          {b.branch_name || 'الفرع الرئيسي'}
                                        </td>
                                        <td className="py-2 px-3 text-slate-700">
                                          {formatCurrency(b.total_sales)}
                                        </td>
                                        <td className="py-2 px-3 text-indigo-600">
                                          {formatCurrency(b.total_rentals)}
                                        </td>
                                        <td className="py-2 px-3 text-purple-600">
                                          {formatCurrency(b.total_tailoring)}
                                        </td>
                                        <td className="py-2 px-3 text-rose-600">
                                          {formatCurrency(b.total_expenses)}
                                        </td>
                                        <td className="py-2 px-3 text-emerald-700 font-black">
                                          {formatCurrency(b.cash_in_drawer || b.net_cash)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* Export / Print Buttons for the Day */}
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                icon={FileSpreadsheet}
                                size="sm"
                                isLoading={exportingDayExcel === day.date}
                                disabled={exportingDayExcel === day.date || exportingDayPDF === day.date}
                                onClick={() => exportToExcel('daily_details', { date: day.date })}
                              >
                                إكسيل (.xlsx) لليوم
                              </Button>
                              <Button
                                variant="outline"
                                icon={Printer}
                                size="sm"
                                isLoading={exportingDayPDF === day.date}
                                disabled={exportingDayPDF === day.date || exportingDayExcel === day.date}
                                onClick={() => exportToPDF('daily_details', { date: day.date })}
                              >
                                طباعة / PDF لليوم
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab: المجمع الشهري (MASTER SHEET) */}
      {activeTab === 'master' && (
        <div className="space-y-4">
          {/* Branch Branding & Month Header */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {masterReport?.branding?.logoDataUri ? (
                <img
                  src={masterReport.branding.logoDataUri}
                  alt="Branch Logo"
                  className="h-14 w-auto max-w-[120px] object-contain rounded-xl border border-slate-200 p-1 bg-white shadow-xs"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-lg">
                  {selectedBranch === 'all' ? 'كل' : (currentBranchLabel.replace(/^فرع\s+/, '').slice(0, 2) || 'فر')}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
                    {currentReportTitle}
                  </h2>
                  <Badge variant={selectedBranch === 'all' ? 'primary' : 'success'}>
                    {selectedBranch === 'all' ? 'شامل كافة الفروع' : 'فرع نشط'}
                  </Badge>
                </div>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  المجمع الشهري لحركة التشغيل والمبيعات والسلف والمصروفات والدرج اليومي لشهر {masterReport?.month || selectedMonth} ({masterReport?.daysInMonth || 30} يوماً) - نطاق: {currentBranchLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-600">الشهر:</span>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-900 focus:outline-none cursor-pointer"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                icon={FileSpreadsheet}
                isLoading={exportingConsolidated}
                disabled={exportingConsolidated || loadingMaster}
                onClick={exportConsolidatedExcel}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/30 font-bold"
              >
                تصدير مجمع الفرع (36 شيت)
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={Printer}
                isLoading={exportingPDF}
                disabled={exportingPDF || loadingMaster}
                onClick={exportMasterPdf}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 bg-indigo-50/30 font-bold"
              >
                طباعة / تصدير PDF
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                onClick={loadMasterReport}
                disabled={loadingMaster}
                className="text-slate-600"
              >
                تحديث
              </Button>
            </div>
          </div>

          {/* Monthly Grand KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              title="إجمالي مبيعات الشهر"
              value={formatCurrency(masterReport?.summary?.total_sales || 0)}
              icon={TrendingUp}
              variant="default"
              subtitle={`${masterReport?.summary?.total_orders || 0} عملية بيع`}
            />
            <StatCard
              title="إجمالي النقدية المقبوضة"
              value={formatCurrency(masterReport?.summary?.total_paid_cash ?? masterReport?.summary?.total_paid ?? 0)}
              icon={DollarSign}
              variant="primary"
              subtitle="مجموع عمود E كاش"
            />
            <StatCard
              title="إجمالي السلف الشهرية"
              value={formatCurrency(masterReport?.summary?.total_advances || 0)}
              icon={Users}
              variant="danger"
              subtitle="مجموع عمود J سلف"
            />
            <StatCard
              title="إجمالي المصروفات والتشغيل"
              value={formatCurrency(masterReport?.summary?.total_expenses || 0)}
              icon={TrendingDown}
              variant="warning"
              subtitle="مجموع عمود L مصاريف"
            />
            <StatCard
              title="كاش الدرج للتوريد (D77)"
              value={formatCurrency(masterReport?.summary?.total_cash_drawer ?? masterReport?.summary?.net_cash_drawer ?? 0)}
              icon={Wallet}
              variant={(masterReport?.summary?.total_cash_drawer ?? masterReport?.summary?.net_cash_drawer ?? 0) >= 0 ? 'success' : 'danger'}
              subtitle="الصافي بعد خصم المنصرفات"
            />
            <StatCard
              title="مدفوعات إلكترونية / فيزا"
              value={formatCurrency(masterReport?.summary?.total_electronic || 0)}
              icon={CreditCard}
              variant="info"
              subtitle="تحصيلات خارج الدرج"
            />
          </div>

          {/* Day Selector Pills Bar */}
          <Card>
            <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-black text-slate-800">اختر اليوم لعرض الشيت التفصيلي (20 عمود A - T):</span>
              </div>
              <span className="text-xs font-bold text-slate-400">
                اليوم المختار: يوم {masterSelectedDay || 1} من {masterReport?.daysInMonth || 30}
              </span>
            </div>

            <div className="p-3 overflow-x-auto flex items-center gap-2 scrollbar-thin">
              {loadingMaster ? (
                <div className="py-4 text-center text-xs text-slate-400 w-full font-bold">جارِ تحميل أيام الشهر...</div>
              ) : !masterReport?.days || masterReport.days.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400 w-full font-bold">لا توجد بيانات مسجلة لهذا الشهر</div>
              ) : (
                masterReport.days.map((day) => {
                  const dayNum = day.day_number || day.day;
                  const isSelected = (masterSelectedDay || 1) === dayNum;
                  const dayNetCash = day.summary?.net_cash_drawer ?? (day.data?.summary?.cash_in_drawer || 0);
                  return (
                    <button
                      key={dayNum}
                      onClick={() => setMasterSelectedDay(dayNum)}
                      className={`px-3 py-2 rounded-xl text-xs font-black flex flex-col items-center justify-center transition-all whitespace-nowrap min-w-[76px] border ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md scale-105'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span className="text-[11px] font-bold opacity-80">يوم {dayNum}</span>
                      <span className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-emerald-300' : dayNetCash >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {formatCurrency(dayNetCash)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </Card>

          {/* Active Day 20-Column Table (Mirroring MASTER SHEET) */}
          {(() => {
            const currentDay =
              masterReport?.days?.find((d) => (d.day_number || d.day) === (masterSelectedDay || 1)) ||
              masterReport?.days?.[0];

            if (!currentDay) {
              return null;
            }

            const populatedRows = (currentDay.rows || []).filter(
              (r) =>
                r.col_b_invoice_number ||
                r.col_c_description ||
                r.col_d_total ||
                r.col_e_paid ||
                r.col_i_advance_emp ||
                r.col_j_advance_amount ||
                r.col_k_expense_desc ||
                r.col_l_expense_amount ||
                r.col_m_electronic_type ||
                r.col_o_electronic_amount ||
                r.col_p_attendance_emp ||
                r.col_q_check_in ||
                r.a_customer_name ||
                r.b_seller_name ||
                r.d_total_order
            );
            const displayRows = populatedRows.length > 0 ? populatedRows : (currentDay.rows || []).slice(0, 10);

            return (
              <Card>
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-slate-900 text-white font-mono font-black rounded-lg text-sm">
                      يوم {currentDay.day_number || currentDay.day}
                    </span>
                    <div>
                      <h3 className="font-black text-slate-900 text-sm">
                        {formatDate(currentDay.date)}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-bold">
                        توزيع الـ 20 عموداً المعتمد (المبيعات، السلف، المصاريف والتشغيل، المدفوعات الإلكترونية، الحضور والانصراف)
                      </p>
                    </div>
                  </div>

                  {/* Cash Drawer Reconciliation Summary for the Day */}
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
                      نقدية مقبوضة (E76): <span className="font-black font-mono">{formatCurrency(currentDay.summary?.total_paid_cash ?? currentDay.summary?.total_paid ?? 0)}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                      منصرف الدرج (K77): <span className="font-black font-mono">{formatCurrency(currentDay.summary?.total_drawer_deductions ?? 0)}</span>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900">
                      صافي التوريد (D77): <span className="font-black font-mono">{formatCurrency(currentDay.summary?.net_cash_drawer ?? currentDay.data?.summary?.cash_in_drawer ?? 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-right border-collapse text-[11px]">
                    <thead>
                      {/* Category Header Row */}
                      <tr className="bg-slate-900 text-white font-black text-center divide-x divide-slate-800">
                        <th colSpan={8} className="py-2.5 px-2 bg-slate-950 text-indigo-200 border-b border-slate-800">
                          المبيعات والإيرادات (أعمدة A - H)
                        </th>
                        <th colSpan={2} className="py-2.5 px-2 bg-rose-950 text-rose-200 border-b border-slate-800">
                          السلف (أعمدة I - J)
                        </th>
                        <th colSpan={2} className="py-2.5 px-2 bg-amber-950 text-amber-200 border-b border-slate-800">
                          المصروفات والتشغيل (أعمدة K - L)
                        </th>
                        <th colSpan={3} className="py-2.5 px-2 bg-blue-950 text-blue-200 border-b border-slate-800">
                          المدفوعات الإلكترونية (أعمدة M - O)
                        </th>
                        <th colSpan={5} className="py-2.5 px-2 bg-emerald-950 text-emerald-200 border-b border-slate-800">
                          الحضور والانصراف (أعمدة P - T)
                        </th>
                      </tr>

                      {/* Exact 20 Column Header Row */}
                      <tr className="bg-slate-800 text-slate-200 font-black text-center divide-x divide-slate-700">
                        {/* Section 1: Sales (A to H) */}
                        <th className="py-2 px-2 text-right min-w-[90px]">A: التاريخ</th>
                        <th className="py-2 px-1.5 min-w-[75px]">B: رقم الفاتورة</th>
                        <th className="py-2 px-2.5 text-right min-w-[140px]">C: البيان </th>
                        <th className="py-2 px-2 min-w-[80px]">D: الأجمالي</th>
                        <th className="py-2 px-2 min-w-[85px] bg-emerald-900/60 text-emerald-200">E: المدفوع </th>
                        <th className="py-2 px-2 min-w-[75px]">F: الباقي</th>
                        <th className="py-2 px-1.5 min-w-[80px]">G: أسم البائع</th>
                        <th className="py-2 px-2 min-w-[90px]">H: تاريخ الأستلام</th>

                        {/* Section 2: Advances (I to J) */}
                        <th className="py-2 px-2 min-w-[90px]">I: الموظف</th>
                        <th className="py-2 px-2 min-w-[75px] bg-rose-900/60 text-rose-200">J: السلف</th>

                        {/* Section 3: Expenses (K to L) */}
                        <th className="py-2 px-2.5 text-right min-w-[120px]">K: مصروفات آخرى</th>
                        <th className="py-2 px-2 min-w-[75px] bg-amber-900/60 text-amber-200">L: المبلغ</th>

                        {/* Section 4: Electronic Payments (M to O) */}
                        <th className="py-2 px-2 min-w-[90px]">M: نوع الدفع الإلكتروني</th>
                        <th className="py-2 px-2 min-w-[90px]">N: رقم المرجع / الفاتورة</th>
                        <th className="py-2 px-2 min-w-[85px] bg-blue-900/60 text-blue-200">O: المبلغ الإلكتروني</th>

                        {/* Section 5: Attendance (P to T) */}
                        <th className="py-2 px-2 min-w-[90px]">P: أسماء الموظفين </th>
                        <th className="py-2 px-1.5 min-w-[65px]">Q: وقت الحضور </th>
                        <th className="py-2 px-1.5 min-w-[65px]">R: وقت الانصراف</th>
                        <th className="py-2 px-1.5 min-w-[60px]">S: عداد الساعات</th>
                        <th className="py-2 px-2 text-right min-w-[100px]">T: ملاحظات</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 font-bold">
                      {displayRows.length === 0 ? (
                        <tr>
                          <td colSpan={20} className="py-12 text-center text-slate-400 font-bold">
                            لا توجد عمليات مسجلة لهذا اليوم
                          </td>
                        </tr>
                      ) : (
                        displayRows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            {/* Sales */}
                            <td className="py-2 px-2 text-slate-600 text-center font-mono">{r.col_a_date || r.a_customer_name || currentDay.date || '-'}</td>
                            <td className="py-2 px-1.5 text-center font-mono text-slate-800">{r.col_b_invoice_number || '-'}</td>
                            <td className="py-2 px-2.5 text-slate-900">{r.col_c_description || r.a_customer_name || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-slate-800">{r.col_d_total != null ? formatCurrency(r.col_d_total) : (r.d_total_order ? formatCurrency(r.d_total_order) : '-')}</td>
                            <td className="py-2 px-2 text-center font-mono font-black text-emerald-700 bg-emerald-50/30">
                              {r.col_e_paid != null ? formatCurrency(r.col_e_paid) : (r.e_paid_cash ? formatCurrency(r.e_paid_cash) : '-')}
                            </td>
                            <td className="py-2 px-2 text-center font-mono text-slate-500">{r.col_f_remaining != null ? formatCurrency(r.col_f_remaining) : (r.f_remaining ? formatCurrency(r.f_remaining) : '-')}</td>
                            <td className="py-2 px-1.5 text-center text-slate-700">{r.col_g_seller || r.b_seller_name || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono text-slate-500">{r.col_h_delivery_date || '-'}</td>

                            {/* Advances */}
                            <td className="py-2 px-2 text-center text-slate-800">{r.col_i_advance_emp || r.i_advance_emp_name || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono font-black text-rose-700 bg-rose-50/30">
                              {r.col_j_advance_amount != null ? formatCurrency(r.col_j_advance_amount) : (r.j_advance_amount ? formatCurrency(r.j_advance_amount) : '-')}
                            </td>

                            {/* Expenses */}
                            <td className="py-2 px-2.5 text-slate-700">{r.col_k_expense_desc || r.m_expense_notes || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono font-black text-amber-800 bg-amber-50/30">
                              {r.col_l_expense_amount != null ? formatCurrency(r.col_l_expense_amount) : (r.l_expense_amount ? formatCurrency(r.l_expense_amount) : '-')}
                            </td>

                            {/* Electronic Payments */}
                            <td className="py-2 px-2 text-center text-slate-700">{r.col_m_electronic_type || r.n_expense_category || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono text-slate-500">{r.col_n_electronic_ref || '-'}</td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-blue-700 bg-blue-50/30">
                              {r.col_o_electronic_amount != null ? formatCurrency(r.col_o_electronic_amount) : (r.o_tailor_amount ? formatCurrency(r.o_tailor_amount) : '-')}
                            </td>

                            {/* Attendance */}
                            <td className="py-2 px-2 text-center text-slate-800">{r.col_p_attendance_emp || r.p_emp_name || '-'}</td>
                            <td className="py-2 px-1.5 text-center font-mono text-slate-600">{r.col_q_check_in || '-'}</td>
                            <td className="py-2 px-1.5 text-center font-mono text-slate-600">{r.col_r_check_out || '-'}</td>
                            <td className="py-2 px-1.5 text-center font-mono text-indigo-700">{r.col_s_hours ? (typeof r.col_s_hours === 'number' ? `${r.col_s_hours} س` : r.col_s_hours) : '-'}</td>
                            <td className="py-2 px-2 text-slate-500">{r.col_t_notes || r.t_notes || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>

                    {/* Footer Row 76: Totals */}
                    <tfoot>
                      <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                        <td colSpan={3} className="py-3 px-2 text-right">
                          اجمالى اليوم (Row 76 Totals)
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-black text-slate-900">
                          {formatCurrency(currentDay.summary?.total_sales ?? currentDay.data?.summary?.total_sales ?? 0)}
                        </td>
                        <td className="py-3 px-2 text-center font-mono font-black text-emerald-800 bg-emerald-100/60">
                          {formatCurrency(currentDay.summary?.total_paid ?? currentDay.summary?.total_paid_cash ?? currentDay.data?.summary?.total_paid ?? 0)}
                        </td>
                        <td colSpan={4} className="py-3 px-1 text-center">-</td>
                        <td className="py-3 px-2 text-center font-mono font-black text-rose-800 bg-rose-100/60">
                          {formatCurrency(currentDay.summary?.total_advances ?? currentDay.data?.summary?.total_advances ?? 0)}
                        </td>
                        <td className="py-3 px-1 text-center">-</td>
                        <td className="py-3 px-2 text-center font-mono font-black text-amber-800 bg-amber-100/60">
                          {formatCurrency(currentDay.summary?.total_expenses ?? currentDay.data?.summary?.total_expenses ?? 0)}
                        </td>
                        <td colSpan={2} className="py-3 px-1 text-center">-</td>
                        <td className="py-3 px-2 text-center font-mono font-black text-blue-800 bg-blue-100/60">
                          {formatCurrency(currentDay.summary?.total_electronic ?? currentDay.data?.summary?.electronic_collections ?? 0)}
                        </td>
                        <td colSpan={5} className="py-3 px-1 text-center">-</td>
                      </tr>

                      {/* Footer Row 77: Drawer Settlement */}
                      <tr className="bg-slate-900 text-white font-black border-t border-slate-800">
                        <td colSpan={8} className="py-3.5 px-4 text-emerald-300 text-xs">
                          <span className="text-slate-400 font-normal">معادلة الدرج D77 (صافي الكاش المتبقي للتوريد = المدفوع E76 - إجمالي المنصرف K77): </span>
                          <span className="font-mono text-sm underline mr-2">
                            {formatCurrency(currentDay.summary?.net_cash_drawer ?? currentDay.data?.summary?.cash_in_drawer ?? 0)}
                          </span>
                        </td>
                        <td colSpan={12} className="py-3.5 px-4 text-rose-300 text-xs text-left">
                          <span className="text-slate-400 font-normal">معادلة المنصرف K77 (السلف J76 + المصروفات L76 + الإلكتروني O76): </span>
                          <span className="font-mono text-sm underline mr-2">
                            {formatCurrency(currentDay.summary?.total_drawer_deductions ?? ((currentDay.summary?.total_advances || 0) + (currentDay.summary?.total_expenses || 0) + (currentDay.summary?.total_electronic || 0)))}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Tab: العهدة وسلف الشهر (OHDA) */}
      {activeTab === 'ohda' && (
        <Card>
          <CardHeader
            title="العهدة وسلف الشهر (OHDA)"
            subtitle="جدول رصد الحضور والغياب وسلف الموظفين اليومية ومجاميع الفترات"
          />

          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                الشهر: <span className="font-black text-slate-900">{ohdaReport?.month || selectedMonth}</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                عدد أيام الشهر: <span className="font-black text-slate-900">{ohdaReport?.daysInMonth || 30} يوماً</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                عدد الموظفين: <span className="font-black text-slate-900">{ohdaReport?.employees?.length || 0}</span>
              </span>
              <Badge variant={selectedBranch === 'all' ? 'primary' : 'success'}>
                {currentBranchLabel}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={FileSpreadsheet}
                isLoading={exportingConsolidated}
                onClick={exportConsolidatedExcel}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white"
              >
                تصدير شيت المجمع (.xlsx)
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-black text-center">
                  <th className="py-3 px-3 text-right sticky right-0 bg-slate-900 z-20 min-w-[140px]">الموظف</th>
                  <th className="py-3 px-2 min-w-[70px]">تقريبا/يوم</th>
                  {ohdaReport?.daysMeta ? (
                    ohdaReport.daysMeta.map((dm) => (
                      <th key={dm.day} className="py-2 px-1 min-w-[42px] border-x border-slate-800" title={`${dm.dayName} ${dm.date}`}>
                        <div className="text-[10px] text-slate-400 font-normal">{dm.dayName.slice(0, 3)}</div>
                        <div className="text-xs font-black">{dm.day}</div>
                      </th>
                    ))
                  ) : (
                    Array.from({ length: 31 }, (_, i) => (
                      <th key={i + 1} className="py-2 px-1 min-w-[36px] border-x border-slate-800">
                        {i + 1}
                      </th>
                    ))
                  )}
                  <th className="py-3 px-2.5 bg-amber-950/80 text-amber-300 min-w-[80px]">سلف 1-10</th>
                  <th className="py-3 px-2.5 bg-amber-950/80 text-amber-300 min-w-[80px]">سلف 11-20</th>
                  <th className="py-3 px-2.5 bg-amber-950/80 text-amber-300 min-w-[80px]">سلف 21-31</th>
                  <th className="py-3 px-3 bg-rose-950/80 text-rose-300 min-w-[90px]">مجمع السلف</th>
                  <th className="py-3 px-2.5 bg-slate-800 text-emerald-300 min-w-[70px]">حضور</th>
                  <th className="py-3 px-3 bg-emerald-950/80 text-emerald-300 min-w-[90px]">توتال مستحق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingOhda ? (
                  <tr>
                    <td colSpan={40} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل شيت العهدة وسلف الشهر...
                    </td>
                  </tr>
                ) : !ohdaReport?.employees || ohdaReport.employees.length === 0 ? (
                  <tr>
                    <td colSpan={40} className="py-12 text-center text-slate-400 font-bold">
                      لا يوجد موظفون نشطون بالفرع في هذا الشهر
                    </td>
                  </tr>
                ) : (
                  ohdaReport.employees.map((emp, idx) => (
                    <tr key={emp.employee_id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 sticky right-0 bg-white font-black text-slate-900 border-l border-slate-200 z-10 shadow-sm">
                        <div>{emp.employee_name}</div>
                        <div className="text-[10px] text-slate-400 font-normal">راتب: {formatCurrency(emp.basic_salary)}</div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-600 font-mono">
                        {formatCurrency(emp.daily_rate)}
                      </td>
                      {emp.days?.map((d) => (
                        <td key={d.day} className="py-1.5 px-1 text-center border-x border-slate-100 text-[11px]">
                          <div className={`w-5 h-5 mx-auto rounded flex items-center justify-center font-bold ${
                            d.attendance === 1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'
                          }`}>
                            {d.attendance === 1 ? '1' : '0'}
                          </div>
                          {d.advance > 0 && (
                            <div className="text-[10px] text-rose-600 font-black mt-0.5">
                              {d.advance}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-2.5 px-2.5 text-center font-mono text-amber-700 bg-amber-50/40">
                        {formatCurrency(emp.advances_1_to_10)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-amber-700 bg-amber-50/40">
                        {formatCurrency(emp.advances_11_to_20)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-amber-700 bg-amber-50/40">
                        {formatCurrency(emp.advances_21_to_31)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-black font-mono text-rose-600 bg-rose-50/40">
                        {formatCurrency(emp.total_advances)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-black text-emerald-700 bg-slate-50/60">
                        {emp.total_attendance} يوم
                      </td>
                      <td className="py-2.5 px-3 text-center font-black font-mono text-emerald-700 bg-emerald-50/40">
                        {formatCurrency(emp.month_entitlement)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {ohdaReport?.employees?.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-3 sticky right-0 bg-slate-100 z-10">المجموع العام</td>
                    <td className="py-3 px-2 text-center">-</td>
                    {Array.from({ length: ohdaReport.daysInMonth || 30 }, (_, i) => {
                      const dayNum = i + 1;
                      const dayAdvances = ohdaReport.employees.reduce((sum, emp) => {
                        const dayData = emp.days?.find((d) => d.day === dayNum);
                        return sum + (dayData?.advance || 0);
                      }, 0);
                      return (
                        <td key={dayNum} className="py-2 px-1 text-center text-[10px] text-rose-700 font-mono border-x border-slate-200">
                          {dayAdvances > 0 ? dayAdvances : '-'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-2.5 text-center text-amber-800 font-mono">
                      {formatCurrency(ohdaReport.employees.reduce((sum, e) => sum + (e.advances_1_to_10 || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center text-amber-800 font-mono">
                      {formatCurrency(ohdaReport.employees.reduce((sum, e) => sum + (e.advances_11_to_20 || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center text-amber-800 font-mono">
                      {formatCurrency(ohdaReport.employees.reduce((sum, e) => sum + (e.advances_21_to_31 || 0), 0))}
                    </td>
                    <td className="py-3 px-3 text-center text-rose-700 font-mono font-black">
                      {formatCurrency(ohdaReport.employees.reduce((sum, e) => sum + (e.total_advances || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center text-slate-700">
                      {ohdaReport.employees.reduce((sum, e) => sum + (e.total_attendance || 0), 0)} يوم
                    </td>
                    <td className="py-3 px-3 text-center text-emerald-800 font-mono font-black">
                      {formatCurrency(ohdaReport.employees.reduce((sum, e) => sum + (e.month_entitlement || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* Tab: مسير المرتبات الشامل (SALARY) */}
      {activeTab === 'salary' && (
        <Card>
          <CardHeader
            title="مسير المرتبات الشامل (SALARY)"
            subtitle="جدول استحقاقات وخصومات الموظفين (ساعات التأخير، الإضافي 1.35x، الغياب 2x، الإجازات، السلف وصافي القبض)"
          />

          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-bold text-slate-500">
                الشهر: <span className="font-black text-slate-900">{salaryReport?.month || selectedMonth}</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                الساعات المعيارية: <span className="font-black text-slate-900">268 ساعة</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                معادلة الإضافي: <span className="font-mono font-bold text-indigo-700">((اليومية / 10) * 1.35) * الساعات</span>
              </span>
              <span className="text-xs font-bold text-slate-500">
                معادلة الغياب: <span className="font-mono font-bold text-rose-700">الغياب * اليومية * 2</span>
              </span>
              <Badge variant={selectedBranch === 'all' ? 'primary' : 'success'}>
                {currentBranchLabel}
              </Badge>
            </div>

            <Button
              variant="outline"
              size="sm"
              icon={FileSpreadsheet}
              isLoading={exportingConsolidated}
              onClick={exportConsolidatedExcel}
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 bg-white"
            >
              تصدير شيت المجمع (.xlsx)
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white font-black">
                  <th className="py-3 px-3">الموظف</th>
                  <th className="py-3 px-3">الراتب الأساسي</th>
                  <th className="py-3 px-2.5">اليومية</th>
                  <th className="py-3 px-2.5 text-center">ساعات فعلية</th>
                  <th className="py-3 px-2.5 text-center">تأخير (س)</th>
                  <th className="py-3 px-2.5 text-center">خصم تأخير</th>
                  <th className="py-3 px-2.5 text-center">إضافي (س)</th>
                  <th className="py-3 px-2.5 text-center text-emerald-300">قيمة الإضافي</th>
                  <th className="py-3 px-2 text-center">غياب (يوم)</th>
                  <th className="py-3 px-2.5 text-center text-rose-300">خصم غياب (2x)</th>
                  <th className="py-3 px-2 text-center">إجازات</th>
                  <th className="py-3 px-2.5 text-center text-rose-300">خصم إجازات (&gt;4)</th>
                  <th className="py-3 px-2 text-center">نص يوم</th>
                  <th className="py-3 px-2.5 text-center text-rose-300">خصم نص يوم</th>
                  <th className="py-3 px-3 text-center text-rose-300">سلف الشهر</th>
                  <th className="py-3 px-2.5 text-center text-emerald-300">مكافآت وبدلات</th>
                  <th className="py-3 px-3.5 text-center bg-emerald-950/80 text-emerald-300 font-black">صافي القبض المستحق 💵</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingSalary ? (
                  <tr>
                    <td colSpan={17} className="py-12 text-center text-slate-400 font-bold">
                      جارِ حساب مسير المرتبات والخصومات...
                    </td>
                  </tr>
                ) : !salaryReport?.employees || salaryReport.employees.length === 0 ? (
                  <tr>
                    <td colSpan={17} className="py-12 text-center text-slate-400 font-bold">
                      لا تتوفر بيانات مرتبات لهذا الشهر
                    </td>
                  </tr>
                ) : (
                  salaryReport.employees.map((emp, idx) => (
                    <tr key={emp.employee_id || idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-black text-slate-900 whitespace-nowrap">
                        {emp.employee_name}
                      </td>
                      <td className="py-3 px-3 font-black font-mono text-slate-800">
                        {formatCurrency(emp.basic_salary)}
                      </td>
                      <td className="py-3 px-2.5 font-mono text-slate-600">
                        {formatCurrency(emp.daily_rate)}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-indigo-700">
                        {emp.actual_hours} س
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-rose-600">
                        {emp.delay_hours > 0 ? `${emp.delay_hours} س` : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-rose-600">
                        {emp.delay_deduction > 0 ? formatCurrency(emp.delay_deduction) : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-emerald-600">
                        {emp.overtime_hours > 0 ? `${emp.overtime_hours} س` : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-emerald-600 font-black">
                        {emp.overtime_amount > 0 ? formatCurrency(emp.overtime_amount) : '-'}
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-rose-600">
                        {emp.absent_days > 0 ? emp.absent_days : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-rose-600">
                        {emp.absent_deduction > 0 ? formatCurrency(emp.absent_deduction) : '-'}
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-slate-600">
                        {emp.leave_days > 0 ? emp.leave_days : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-rose-600">
                        {emp.leave_deduction > 0 ? formatCurrency(emp.leave_deduction) : '-'}
                      </td>
                      <td className="py-3 px-2 text-center font-mono text-amber-600">
                        {emp.half_days > 0 ? emp.half_days : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-rose-600">
                        {emp.half_day_deduction > 0 ? formatCurrency(emp.half_day_deduction) : '-'}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-rose-700 font-black bg-rose-50/30">
                        {emp.advances > 0 ? formatCurrency(emp.advances) : '-'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono text-emerald-700 bg-emerald-50/30">
                        {emp.allowances > 0 ? formatCurrency(emp.allowances) : '-'}
                      </td>
                      <td className="py-3 px-3.5 text-center font-mono font-black text-sm text-emerald-700 bg-emerald-50/70">
                        {formatCurrency(emp.net_salary)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {salaryReport?.employees?.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                    <td className="py-3 px-3">إجمالي المسير</td>
                    <td className="py-3 px-3 font-mono">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.basic_salary || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center">-</td>
                    <td className="py-3 px-2.5 text-center font-mono">
                      {Math.round(salaryReport.employees.reduce((sum, e) => sum + (e.actual_hours || 0), 0))} س
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono">
                      {Math.round(salaryReport.employees.reduce((sum, e) => sum + (e.delay_hours || 0), 0))} س
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono text-rose-700">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.delay_deduction || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono">
                      {Math.round(salaryReport.employees.reduce((sum, e) => sum + (e.overtime_hours || 0), 0))} س
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono text-emerald-700">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.overtime_amount || 0), 0))}
                    </td>
                    <td className="py-3 px-2 text-center">-</td>
                    <td className="py-3 px-2.5 text-center font-mono text-rose-700">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.absent_deduction || 0), 0))}
                    </td>
                    <td className="py-3 px-2 text-center">-</td>
                    <td className="py-3 px-2.5 text-center font-mono text-rose-700">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.leave_deduction || 0), 0))}
                    </td>
                    <td className="py-3 px-2 text-center">-</td>
                    <td className="py-3 px-2.5 text-center font-mono text-rose-700">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.half_day_deduction || 0), 0))}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-rose-800">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.advances || 0), 0))}
                    </td>
                    <td className="py-3 px-2.5 text-center font-mono text-emerald-800">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.allowances || 0), 0))}
                    </td>
                    <td className="py-3 px-3.5 text-center font-mono text-sm text-emerald-900 bg-emerald-100">
                      {formatCurrency(salaryReport.employees.reduce((sum, e) => sum + (e.net_salary || 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      )}

      {/* Tab: تقييم وأداء البائعين (KPI) */}
      {activeTab === 'kpi' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              title="إجمالي مبيعات البائعين"
              value={formatCurrency(kpiReport?.summary?.total_sales || 0)}
              icon={TrendingUp}
              variant="success"
            />
            <StatCard
              title="عدد فواتير البيع"
              value={Number(kpiReport?.summary?.total_orders || 0).toLocaleString('en-US')}
              icon={ShoppingBag}
              variant="primary"
            />
            <StatCard
              title="مستهدف البائع الشهري"
              value={formatCurrency(50000)}
              icon={Target}
              variant="info"
              subtitle="التارجت الشهري المحدد للفرع"
            />
            <StatCard
              title="متوسط تحقيق المستهدف"
              value={`${kpiReport?.summary?.average_achievement || 0}%`}
              icon={Award}
              variant={(kpiReport?.summary?.average_achievement || 0) >= 100 ? 'success' : 'warning'}
              subtitle="نسبة تحقيق تارجت الفرع"
            />
          </div>

          <Card>
            <CardHeader
              title="تقييم وأداء البائعين (KPI)"
              subtitle={`مقارنة مبيعات البائعين بالمستهدف الشهري (50,000 ج.م) ونسب التحقيق - نطاق: ${currentBranchLabel}`}
            />

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-b border-slate-100">
              {kpiReport?.sellers?.map((seller, idx) => {
                const pct = seller.achievement_percentage || 0;
                const isTargetAchieved = pct >= 100;
                return (
                  <div
                    key={seller.seller_id || idx}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center font-black text-indigo-700 text-xs">
                          #{idx + 1}
                        </div>
                        <div>
                          <div className="font-black text-slate-900 text-sm">{seller.seller_name}</div>
                          <div className="text-[11px] text-slate-400 font-bold">{seller.branch_name}</div>
                        </div>
                      </div>
                      <Badge variant={isTargetAchieved ? 'success' : pct >= 70 ? 'warning' : 'danger'}>
                        {pct}%
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">المبيعات المحققة</span>
                        <span className="font-black text-slate-900">{formatCurrency(seller.total_sales)}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isTargetAchieved
                              ? 'bg-emerald-500'
                              : pct >= 70
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>الهدف: 50,000 ج.م</span>
                        <span>{seller.orders_count} فاتورة</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-black">
                    <th className="py-3 px-3">الترتيب</th>
                    <th className="py-3 px-3">اسم البائع</th>
                    <th className="py-3 px-3">الفرع</th>
                    <th className="py-3 px-3">عدد الفواتير</th>
                    <th className="py-3 px-3">إجمالي المبيعات</th>
                    <th className="py-3 px-3">المستهدف الشهري</th>
                    <th className="py-3 px-3">نسبة التحقيق (%)</th>
                    <th className="py-3 px-3">متوسط قيمة الفاتورة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {loadingKpi ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحليل أداء البائعين...
                      </td>
                    </tr>
                  ) : !kpiReport?.sellers || kpiReport.sellers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                        لا توجد حركات بيع مسجلة لهذا الشهر
                      </td>
                    </tr>
                  ) : (
                    kpiReport.sellers.map((s, idx) => {
                      const avgInvoice = s.orders_count > 0 ? Math.round(s.total_sales / s.orders_count) : 0;
                      return (
                        <tr key={s.seller_id || idx} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3 font-mono font-black text-slate-400">#{idx + 1}</td>
                          <td className="py-3 px-3 font-black text-slate-900">{s.seller_name}</td>
                          <td className="py-3 px-3 text-slate-500">{s.branch_name}</td>
                          <td className="py-3 px-3 font-mono text-indigo-700">{s.orders_count}</td>
                          <td className="py-3 px-3 font-mono font-black text-slate-900">{formatCurrency(s.total_sales)}</td>
                          <td className="py-3 px-3 font-mono text-slate-500">{formatCurrency(50000)}</td>
                          <td className="py-3 px-3 font-mono font-black">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              s.achievement_percentage >= 100
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.achievement_percentage >= 70
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {s.achievement_percentage}%
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">{formatCurrency(avgInvoice)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 2: Monthly Financial Overview */}
      {activeTab === 'monthly' && (
        <Card>
          <CardHeader
            title="التقرير المالي الشهري"
            subtitle="مقارنة المبيعات والتأجير والمصروفات وصافي الأرباح شهرياً"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs font-black">
                  <th className="py-3.5 px-4">الشهر</th>
                  <th className="py-3.5 px-4">مبيعات الكاشير</th>
                  <th className="py-3.5 px-4">متحصلات التأجير</th>
                  <th className="py-3.5 px-4">التفصيل والتعديلات</th>
                  <th className="py-3.5 px-4">المصروفات التشغيلية</th>
                  {profitVisible && <th className="py-3.5 px-4">صافي الربح الشهري</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingMonthly ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحميل السجل الشهري...
                    </td>
                  </tr>
                ) : monthlyHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                      لا تتوفر بيانات مالية للأشهر السابقة
                    </td>
                  </tr>
                ) : (
                  monthlyHistory.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-900">{m.month}</td>
                      <td className="py-3.5 px-4 font-bold text-slate-700">
                        {formatCurrency(m.sales)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-indigo-600">
                        {formatCurrency(m.rentals)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-purple-600">
                        {formatCurrency(m.tailoring)}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-rose-600">
                        {formatCurrency(m.expenses)}
                      </td>
                      {profitVisible && (
                        <td className="py-3.5 px-4 font-black text-emerald-600">
                          {formatCurrency(m.net_profit)}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Sales Invoices Report */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard
              title="عدد الفواتير"
              value={Number(salesReport.summary?.total_orders || 0).toLocaleString('en-US')}
              icon={ShoppingBag}
              variant="default"
            />
            <StatCard
              title="إجمالي المبيعات"
              value={formatCurrency(salesReport.summary?.total_amount || 0)}
              icon={TrendingUp}
              variant="success"
            />
            <StatCard
              title="إجمالي المحصل"
              value={formatCurrency(salesReport.summary?.total_paid || 0)}
              icon={DollarSign}
              variant="primary"
            />
            <StatCard
              title="المحصل بالدرج (كاش)"
              value={formatCurrency(salesReport.summary?.cash_paid || 0)}
              icon={Wallet}
              variant="success"
            />
            <StatCard
              title="انستاباي / تحويل"
              value={formatCurrency(salesReport.summary?.bank_transfer_paid || 0)}
              icon={Building2}
              variant="info"
            />
            <StatCard
              title="المحصل فيزا وفودافون كاش"
              value={formatCurrency(Number(salesReport.summary?.visa_paid || 0) + Number(salesReport.summary?.wallet_paid || 0))}
              icon={CreditCard}
              variant="warning"
            />
          </div>

          <Card>
            <CardHeader
              title="سجل فواتير المبيعات"
              subtitle="تفاصيل فواتير البيع الصادرة والمتحصلات وطرق السداد"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">رقم الفاتورة</th>
                    <th className="py-3.5 px-4">تاريخ ووقت البيع</th>
                    <th className="py-3.5 px-4">العميل</th>
                    <th className="py-3.5 px-4">الكاشير</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">طريقة الدفع</th>
                    <th className="py-3.5 px-4">المنتجات / الأصناف</th>
                    <th className="py-3.5 px-4">الإجمالي</th>
                    <th className="py-3.5 px-4">المدفوع</th>
                    <th className="py-3.5 px-4">المتبقي</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingSales ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل فواتير المبيعات...
                      </td>
                    </tr>
                  ) : !salesReport.orders || salesReport.orders.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد فواتير مبيعات مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    salesReport.orders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          #{o.invoice_number || o.id}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {o.created_at_formatted || o.order_date || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{o.customer_name || 'عميل نقدي'}</div>
                          {o.customer_phone && (
                            <div className="text-[11px] font-mono text-slate-400">{o.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-bold text-slate-700">{o.cashier_name || '-'}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">{o.branch_name || '-'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold inline-block ${
                              o.payment_method === 'cash'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.payment_method === 'split'
                                ? 'bg-purple-100 text-purple-800'
                                : o.payment_method === 'bank_transfer'
                                ? 'bg-indigo-100 text-indigo-800'
                                : o.payment_method === 'visa' || o.payment_method === 'card'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-800'
                            }`}
                          >
                            {getPaymentMethodArabic(o.payment_method, o.payment_splits || o)}
                          </span>
                        </td>
                        <td className="py-3 px-4 min-w-[200px]">
                          {Array.isArray(o.items) && o.items.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {o.items.map((it, iIdx) => (
                                <div key={iIdx} className="flex items-center gap-1.5 text-xs">
                                  <span className="font-bold text-slate-800 leading-tight">
                                    {it.product_name || it.name || 'صنف'}
                                  </span>
                                  {Number(it.quantity) > 1 && (
                                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded">
                                      ×{it.quantity}
                                    </span>
                                  )}
                                  {it.size && (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      ({it.size})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="font-bold text-slate-800 text-xs">
                              {o.product_names || (o.items_count ? `${o.items_count} صنف` : '-')}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900">{formatCurrency(o.total_amount)}</td>
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(o.paid_amount)}</td>
                        <td className="py-3 px-4 font-black">
                          {o.status === 'returned' ? (
                            <span className="text-xs font-bold text-slate-400">0 ج.م</span>
                          ) : o.status === 'partially_returned' ? (
                            <div className="flex flex-col">
                              <span className="text-amber-600 font-black">
                                {formatCurrency(o.remainder || 0)}
                              </span>
                              {Number(o.returned_amount || 0) > 0 && (
                                <span className="text-[10px] font-bold text-rose-500">
                                  (مرتجع {formatCurrency(o.returned_amount)})
                                </span>
                              )}
                            </div>
                          ) : Number(o.remainder || 0) > 0 ? (
                            <span className="text-rose-600 font-black">
                              {formatCurrency(o.remainder)}
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-emerald-600">
                              0 ج.م
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant={
                              o.status === 'completed'
                                ? 'success'
                                : o.status === 'partially_returned'
                                ? 'warning'
                                : o.status === 'returned'
                                ? 'danger'
                                : o.status === 'cancelled'
                                ? 'danger'
                                : 'default'
                            }
                          >
                            {o.status === 'completed'
                              ? 'مكتملة'
                              : o.status === 'partially_returned'
                              ? 'مرتجع جزئياً'
                              : o.status === 'returned'
                              ? 'مرتجع بالكامل'
                              : o.status === 'cancelled'
                              ? 'ملغاة'
                              : (o.status || '-')}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Rentals Report */}
      {activeTab === 'rentals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              title="إجمالي العقود"
              value={Number(rentalsReport.summary?.total_rentals || 0).toLocaleString('en-US')}
              icon={Repeat}
              variant="default"
            />
            <StatCard
              title="إجمالي قيمة التأجير"
              value={formatCurrency(rentalsReport.summary?.total_price || 0)}
              icon={TrendingUp}
              variant="primary"
            />
            <StatCard
              title="العربونات المحصلة"
              value={formatCurrency(rentalsReport.summary?.total_deposit || 0)}
              icon={DollarSign}
              variant="success"
            />
            <StatCard
              title="المبالغ المتبقية"
              value={formatCurrency(rentalsReport.summary?.total_remaining || 0)}
              icon={TrendingDown}
              variant="danger"
            />
          </div>

          <Card>
            <CardHeader
              title="سجل عقود وتأجيرات الفروع"
              subtitle="تفاصيل حجز واستلام وإرجاع عقود التأجير والعربونات"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">رقم العقد</th>
                    <th className="py-3.5 px-4">تاريخ الحجز</th>
                    <th className="py-3.5 px-4">الصنف المؤجر</th>
                    <th className="py-3.5 px-4">العميل</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">طريقة الدفع</th>
                    <th className="py-3.5 px-4">الإجمالي</th>
                    <th className="py-3.5 px-4">العربون</th>
                    <th className="py-3.5 px-4">المتبقي</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingRentals ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل عقود التأجير...
                      </td>
                    </tr>
                  ) : !rentalsReport.rentals || rentalsReport.rentals.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد عقود تأجير مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    rentalsReport.rentals.map((r, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">#{r.id}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {r.booking_date_formatted || r.booking_date || '-'}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.item_name || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{r.customer_name || 'عميل'}</div>
                          {r.customer_phone && (
                            <div className="text-[11px] font-mono text-slate-400">{r.customer_phone}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{r.branch_name || '-'}</td>
                        <td className="py-3 px-4">
                          <Badge variant={r.payment_method === 'cash' ? 'success' : 'info'}>
                            {getPaymentMethodArabic(r.payment_method, r.payment_splits || r)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 font-black text-slate-900">{formatCurrency(r.total_price)}</td>
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(r.deposit)}</td>
                        <td className="py-3 px-4 font-black text-rose-600">
                          {Number(r.remaining || 0) > 0 ? formatCurrency(r.remaining) : '-'}
                        </td>
                        <td className="py-3 px-4">
                          {(() => {
                            const isReturnedWithRem = r.status === 'returned' && Number(r.remaining || 0) > 0;
                            const statusMap = {
                              booked: { label: 'محجوزة', variant: 'warning' },
                              active: { label: 'نشط', variant: 'info' },
                              returned: { label: 'تم الإرجاع (خالص)', variant: 'success' },
                              sold: { label: 'محولة لبيع', variant: 'purple' },
                              cancelled: { label: 'ملغي', variant: 'danger' },
                            };
                            const badgeInfo = isReturnedWithRem
                              ? { label: 'مرتجع (غير خالص / عليه متبقي)', variant: 'warning' }
                              : (statusMap[r.status] || { label: r.status || '-', variant: 'neutral' });
                            return (
                              <Badge variant={badgeInfo.variant}>
                                {badgeInfo.label}
                              </Badge>
                            );
                          })()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Expenses Report */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              title="عدد سندات الصرف"
              value={Number(expensesReport.summary?.total_count || 0).toLocaleString('en-US')}
              icon={TrendingDown}
              variant="default"
            />
            <StatCard
              title="إجمالي المصروفات"
              value={formatCurrency(expensesReport.summary?.total_amount || 0)}
              icon={DollarSign}
              variant="danger"
            />
          </div>

          {Array.isArray(expensesReport.categories) && expensesReport.categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-white rounded-xl border border-slate-200">
              <span className="text-xs font-bold text-slate-500 ml-2">تصنيفات المصروفات:</span>
              {expensesReport.categories.map((c, i) => (
                <span key={i} className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                  {c.category}: <span className="font-mono font-black text-rose-600">{formatCurrency(c.total_amount)}</span> ({c.count})
                </span>
              ))}
            </div>
          )}

          <Card>
            <CardHeader
              title="سجل المصروفات التشغيلية والنثريات"
              subtitle="تفاصيل بنود الصرف ومصروفات الفروع"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">التاريخ</th>
                    <th className="py-3.5 px-4">البند / التصنيف</th>
                    <th className="py-3.5 px-4">الفرع</th>
                    <th className="py-3.5 px-4">المبلغ</th>
                    <th className="py-3.5 px-4">البيان والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingExpenses ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                        جارِ تحميل سجل المصروفات...
                      </td>
                    </tr>
                  ) : !expensesReport.expenses || expensesReport.expenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد مصروفات مسجلة في هذه الفترة
                      </td>
                    </tr>
                  ) : (
                    expensesReport.expenses.map((e, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{e.expense_date || '-'}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{e.category || 'غير محدد'}</td>
                        <td className="py-3 px-4 text-xs text-slate-600">{e.branch_name || '-'}</td>
                        <td className="py-3 px-4 font-black text-rose-600">{formatCurrency(e.amount)}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{e.notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab: Inventory Report */}
      {activeTab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              title="عدد الأصناف"
              value={Number(inventoryReport.summary?.total_items || 0).toLocaleString('en-US')}
              icon={Package}
              variant="default"
            />
            <StatCard
              title="إجمالي القطع بالمخزون"
              value={`${Number(inventoryReport.summary?.total_quantity || 0).toLocaleString('en-US')} قطعة`}
              icon={Layers}
              variant="primary"
            />
            <StatCard
              title="قيمة المخزون (سعر البيع)"
              value={formatCurrency(inventoryReport.summary?.total_retail_value || 0)}
              icon={TrendingUp}
              variant="success"
            />
            {inventoryReport.summary?.total_cost_value !== null && (
              <StatCard
                title="قيمة المخزون (التكلفة)"
                value={profitVisible ? formatCurrency(inventoryReport.summary?.total_cost_value || 0) : '••••••'}
                icon={ShoppingBag}
                variant="info"
              />
            )}
            <StatCard
              title="أصناف قاربت النفاد"
              value={Number(inventoryReport.summary?.low_stock_count || 0).toLocaleString('en-US')}
              icon={TrendingDown}
              variant={inventoryReport.summary?.low_stock_count > 0 ? 'danger' : 'default'}
            />
          </div>

          <Card>
            <CardHeader
              title="جرد وتقييم المخزون الحالي"
              subtitle="أرصدة الأصناف بجميع الفروع وتقييم إجمالي المبيعات والتكلفة"
              action={
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setInventoryGender('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        inventoryGender === 'all'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      كل الأقسام
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryGender('men')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        inventoryGender === 'men'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-blue-700'
                      }`}
                    >
                      👔 رجالي
                    </button>
                    <button
                      type="button"
                      onClick={() => setInventoryGender('women')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                        inventoryGender === 'women'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-rose-700'
                      }`}
                    >
                      👗 حريمي
                    </button>
                  </div>
                </div>
              }
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-xs font-black">
                    <th className="py-3.5 px-4">#</th>
                    <th className="py-3.5 px-4">اسم الصنف</th>
                    <th className="py-3.5 px-4">الباركود</th>
                    <th className="py-3.5 px-4">القسم والتصنيف</th>
                    <th className="py-3.5 px-4">اللون / المقاس</th>
                    <th className="py-3.5 px-4">الرصيد</th>
                    <th className="py-3.5 px-4">حد الطلب</th>
                    <th className="py-3.5 px-4">سعر البيع</th>
                    {profitVisible && inventoryReport.summary?.total_cost_value !== null && (
                      <th className="py-3.5 px-4">سعر التكلفة</th>
                    )}
                    <th className="py-3.5 px-4">إجمالي البيع</th>
                    <th className="py-3.5 px-4">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loadingInventory ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400 font-bold">
                        جارِ جرد وحساب المخزون...
                      </td>
                    </tr>
                  ) : !inventoryReport.items || inventoryReport.items.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-bold">
                        لا توجد أصناف مسجلة بالمخزون
                      </td>
                    </tr>
                  ) : (
                    inventoryReport.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-black text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-black text-slate-900">{it.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">
                          {it.barcode ? `#${it.barcode}` : '-'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                              {it.category || 'عام'}
                            </span>
                            {it.gender === 'women' || it.gender === 'حريمي' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                👗 حريمي
                              </span>
                            ) : it.gender === 'both' ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200">
                                🚻 مشترك
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 text-blue-700 border border-blue-200">
                                👔 رجالي
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {[it.color, it.size_cut].filter(Boolean).join(' / ') || '-'}
                        </td>
                        <td className="py-3 px-4 font-black text-indigo-600">{it.stock_level}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-500">{it.min_stock_level}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{formatCurrency(it.price)}</td>
                        {profitVisible && inventoryReport.summary?.total_cost_value !== null && (
                          <td className="py-3 px-4 font-bold text-slate-500">
                            {it.cost_price !== null ? formatCurrency(it.cost_price) : '-'}
                          </td>
                        )}
                        <td className="py-3 px-4 font-black text-emerald-600">{formatCurrency(it.total_retail_value)}</td>
                        <td className="py-3 px-4">
                          <Badge variant={it.is_low_stock ? 'danger' : 'success'}>
                            {it.is_low_stock ? 'منخفض' : 'متوفر'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Top Selling Products */}
      {activeTab === 'top_products' && (
        <Card>
          <CardHeader
            title="أكثر المنتجات طلباً ومبيعاً"
            subtitle="ترتيب المنتجات الأكثر تحقيقاً للإيرادات وحركة المبيعات"
          />

          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white text-xs font-black">
                  <th className="py-3.5 px-4">#</th>
                  <th className="py-3.5 px-4">المنتج</th>
                  <th className="py-3.5 px-4">الباركود</th>
                  <th className="py-3.5 px-4">القسم</th>
                  <th className="py-3.5 px-4">الكمية المباعة</th>
                  <th className="py-3.5 px-4">إجمالي الإيرادات المحققة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingTopProducts ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-bold">
                      جارِ تحليل مبيعات المنتجات...
                    </td>
                  </tr>
                ) : topProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-slate-400 font-bold">
                      لا تتوفر بيانات مبيعات كافية لتحليل المنتجات
                    </td>
                  </tr>
                ) : (
                  topProducts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-black text-slate-400">{idx + 1}</td>
                      <td className="py-3.5 px-4">
                        <div className="font-black text-slate-900">{p.name}</div>
                        {(p.id || p.inventory_id) && (
                          <div className="text-[10px] font-mono text-slate-400 font-bold">
                            كود: #{p.id || p.inventory_id}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-500">
                        {p.barcode ? `#${p.barcode}` : '-'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                          {p.category || 'عام'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-black text-indigo-600">
                        {p.quantity_sold || p.total_quantity || 0} قطعة
                      </td>
                      <td className="py-3.5 px-4 font-black text-emerald-600">
                        {formatCurrency(p.total_revenue || p.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Suppliers Ledger & Statements (File 1) */}
      {activeTab === 'suppliers_ledger' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <Card>
            <div className="p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-64">
                  <Input
                    placeholder="ابحث باسم المورد، الكود، أو الهاتف..."
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 whitespace-nowrap">التصنيف:</span>
                  <select
                    value={ledgerCategory}
                    onChange={(e) => setLedgerCategory(e.target.value)}
                    className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="all">كافة التصنيفات</option>
                    <option value="men">رجالي</option>
                    <option value="women">حريمي</option>
                    <option value="both">مشترك</option>
                  </select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSuppliersLedger}
                  isLoading={loadingLedger}
                  className="h-10 text-xs"
                >
                  تحديث البيانات
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  icon={Download}
                  isLoading={exportingExcel}
                  onClick={() => exportToExcel('suppliers_ledger')}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs h-10 px-4 rounded-xl"
                >
                  تصدير كشف حسابات الموردين (إكسيل - 2 Level)
                </Button>
              </div>
            </div>
          </Card>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <StatCard
              title="عدد الموردين"
              value={ledgerData?.summary?.total_suppliers ?? (ledgerData?.suppliers?.length || 0)}
              icon={Users}
              variant="default"
              subtitle="المسجلين بالنظام"
            />
            <StatCard
              title="إجمالي التوريدات والمشتريات"
              value={formatCurrency(ledgerData?.summary?.grand_total_purchases || 0)}
              icon={ShoppingBag}
              variant="default"
              subtitle="حركات الاستلام الفعلية"
            />
            <StatCard
              title="إجمالي المرتجعات"
              value={formatCurrency(ledgerData?.summary?.grand_total_returns || 0)}
              icon={RotateCcw}
              variant="default"
              subtitle="بضائع مرتجعة للموردين"
            />
            <StatCard
              title="إجمالي المسدد"
              value={formatCurrency(ledgerData?.summary?.grand_total_paid || 0)}
              icon={Wallet}
              variant="default"
              subtitle="دفعات نقدية وبنكية"
            />
            <StatCard
              title="صافي الرصيد المستحق"
              value={formatCurrency(ledgerData?.summary?.grand_total_balance || 0)}
              icon={DollarSign}
              variant={Number(ledgerData?.summary?.grand_total_balance || 0) > 0 ? 'danger' : 'success'}
              subtitle={ledgerData?.summary?.grand_total_balance_type || 'الرصيد التراكمي'}
            />
          </div>

          {/* Level 1: Suppliers Summary Table */}
          <Card>
            <CardHeader
              title={`ملخص أرصدة وحسابات الموردين (${ledgerData?.suppliers?.length || 0})`}
              subtitle="اضغط على زر (كشف الحساب) للاطلاع على السجل التفصيلي وحركات الصنف وتصدير إكسيل"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-black">
                  <tr>
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">كود المورد</th>
                    <th className="py-3 px-4">اسم المورد</th>
                    <th className="py-3 px-4">التصنيف</th>
                    <th className="py-3 px-4">الهاتف</th>
                    <th className="py-3 px-4">إجمالي المشتريات</th>
                    <th className="py-3 px-4">إجمالي المرتجعات</th>
                    <th className="py-3 px-4">إجمالي المسدد</th>
                    <th className="py-3 px-4">صافي الرصيد الحالي</th>
                    <th className="py-3 px-4">حالة الرصيد</th>
                    <th className="py-3 px-4 text-center">كشف الحساب التفصيلي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-bold">
                  {loadingLedger ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-black">
                        جارِ تحميل كشوف حسابات الموردين...
                      </td>
                    </tr>
                  ) : !ledgerData?.suppliers || ledgerData.suppliers.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-16 text-center text-slate-400 font-bold">
                        لا يوجد موردين مطابقين لمعايير البحث
                      </td>
                    </tr>
                  ) : (
                    ledgerData.suppliers.map((sup, idx) => {
                      const balance = Number(sup.balance || 0);
                      const isPayable = balance > 0;
                      const isReceivable = balance < 0;

                      return (
                        <tr key={sup.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-3 px-4 font-mono font-black text-slate-800">
                            {sup.code || `#${sup.id}`}
                          </td>
                          <td className="py-3 px-4 font-black text-slate-900">
                            <div>{sup.name}</div>
                            {sup.company_name && (
                              <div className="text-[10px] text-slate-400 font-bold">{sup.company_name}</div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-700">
                              {sup.gender_category === 'men' ? 'رجالي' : (sup.gender_category === 'women' ? 'حريمي' : 'مشترك')}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-600">
                            {sup.phone || '-'}
                          </td>
                          <td className="py-3 px-4 font-black text-slate-900">
                            {formatCurrency(sup.total_purchases || 0)}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-600">
                            {formatCurrency(sup.total_returns || 0)}
                          </td>
                          <td className="py-3 px-4 font-black text-emerald-600">
                            {formatCurrency(sup.total_paid || 0)}
                          </td>
                          <td className={`py-3 px-4 font-black text-sm ${
                            isPayable ? 'text-rose-600' : (isReceivable ? 'text-blue-600' : 'text-slate-700')
                          }`}>
                            {formatCurrency(balance)}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-black ${
                              isPayable
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : isReceivable
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {sup.balance_type || (isPayable ? 'دائن (له)' : (isReceivable ? 'مدين (عليه)' : 'خالص'))}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={FileSpreadsheet}
                              onClick={() => openSupplierStatementModal(sup.id)}
                              className="text-indigo-600 border-indigo-200 hover:bg-indigo-50 font-black text-xs"
                            >
                              عرض كشف الحساب 🔍
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

          {/* Level 2: Detailed Supplier Statement Modal */}
          {selectedSupplierStatement && (
            <Modal
              isOpen={!!selectedSupplierStatement}
              onClose={() => setSelectedSupplierStatement(null)}
              title={`كشف حساب تفصيلي - ${selectedSupplierStatement.supplier?.name || ''}`}
              subtitle={`كود المورد: ${selectedSupplierStatement.supplier?.code || `#${selectedSupplierStatement.supplier?.id}`} | الهاتف: ${selectedSupplierStatement.supplier?.phone || '-'}`}
              maxWidth="max-w-6xl"
            >
              <div className="space-y-4">
                {/* Header Actions & KPIs */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                  <div className="flex flex-wrap items-center gap-6">
                    <div>
                      <span className="text-xs text-slate-500 font-bold block">إجمالي التوريدات</span>
                      <span className="text-base font-black text-slate-900">
                        {formatCurrency(selectedSupplierStatement.supplier?.total_purchases || selectedSupplierStatement.summary?.total_purchases || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-bold block">إجمالي المرتجعات</span>
                      <span className="text-base font-black text-slate-600">
                        {formatCurrency(selectedSupplierStatement.supplier?.total_returns || selectedSupplierStatement.summary?.total_returns || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-bold block">إجمالي المسدد</span>
                      <span className="text-base font-black text-emerald-600">
                        {formatCurrency(selectedSupplierStatement.supplier?.total_paid || selectedSupplierStatement.summary?.total_paid || 0)}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 font-bold block">الرصيد النهائي المستحق</span>
                      <span className={`text-lg font-black ${
                        Number(selectedSupplierStatement.supplier?.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-900'
                      }`}>
                        {formatCurrency(selectedSupplierStatement.supplier?.balance || selectedSupplierStatement.summary?.balance || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      icon={Download}
                      onClick={() => exportToExcel('supplier_statement', { supplier_id: selectedSupplierStatement.supplier?.id })}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs"
                    >
                      تصدير كشف الحساب (إكسيل)
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSupplierStatement(null)}
                    >
                      إغلاق
                    </Button>
                  </div>
                </div>

                {/* 11-Column Statement Timeline Table */}
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
                      {selectedSupplierStatement.transactions && selectedSupplierStatement.transactions.length > 0 ? (
                        selectedSupplierStatement.transactions.map((tx, idx) => (
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
                              {tx.price !== null && tx.price !== undefined ? formatCurrency(tx.price) : '-'}
                            </td>
                            <td className="p-3 font-black text-slate-900">
                              {tx.purchases > 0 ? formatCurrency(tx.purchases) : '-'}
                            </td>
                            <td className="p-3 font-bold text-rose-600">
                              {tx.returns > 0 ? formatCurrency(tx.returns) : '-'}
                            </td>
                            <td className="p-3 font-black text-emerald-600">
                              {tx.payments > 0 ? formatCurrency(tx.payments) : '-'}
                            </td>
                            <td className={`p-3 font-black font-mono ${
                              Number(tx.movement || 0) > 0 ? 'text-slate-900' : 'text-emerald-700'
                            }`}>
                              {formatCurrency(tx.movement || 0)}
                            </td>
                            <td className="p-3 font-black text-sm text-indigo-700 bg-indigo-50/40 font-mono">
                              {formatCurrency(tx.cumulative_balance || 0)}
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
                    {selectedSupplierStatement.transactions && selectedSupplierStatement.transactions.length > 0 && (
                      <tfoot className="bg-slate-100 font-black text-xs border-t-2 border-slate-300">
                        <tr>
                          <td colSpan={6} className="p-3 text-left pl-4 font-black text-slate-800">الإجمالي:</td>
                          <td className="p-3 font-black text-slate-900">
                            {formatCurrency(selectedSupplierStatement.summary?.total_purchases || 0)}
                          </td>
                          <td className="p-3 font-black text-rose-600">
                            {formatCurrency(selectedSupplierStatement.summary?.total_returns || 0)}
                          </td>
                          <td className="p-3 font-black text-emerald-600">
                            {formatCurrency(selectedSupplierStatement.summary?.total_paid || selectedSupplierStatement.summary?.total_payments || 0)}
                          </td>
                          <td className="p-3 font-mono font-black text-slate-900">
                            {formatCurrency((selectedSupplierStatement.summary?.total_purchases || 0) - (selectedSupplierStatement.summary?.total_returns || 0) - (selectedSupplierStatement.summary?.total_paid || selectedSupplierStatement.summary?.total_payments || 0))}
                          </td>
                          <td className="p-3 font-mono font-black text-indigo-800 bg-indigo-100/50">
                            {formatCurrency(selectedSupplierStatement.summary?.balance || selectedSupplierStatement.summary?.current_balance || 0)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* Profit Password Auth Modal */}
      <Modal
        isOpen={showProfitAuthModal}
        onClose={() => {
          setShowProfitAuthModal(false);
          setProfitAuthInput('');
          setProfitAuthError('');
        }}
        title="التحقق من كلمة سر الأرباح 🔒"
        subtitle="يرجى إدخال كلمة المرور للاطلاع على صافي الأرباح وتكاليف المنتجات"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmProfitAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              كلمة سر عرض الأرباح
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={profitAuthInput}
              onChange={(e) => {
                setProfitAuthInput(e.target.value);
                setProfitAuthError('');
              }}
              autoFocus
              required
            />
            {profitAuthError && (
              <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{profitAuthError}</span>
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowProfitAuthModal(false);
                setProfitAuthInput('');
                setProfitAuthError('');
              }}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={profitAuthLoading}
              icon={Lock}
            >
              تأكيد وفك القفل 🔓
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Reports;
