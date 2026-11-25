import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { printElement } from '../../utils/print';
import {
  UserCheck,
  Plus,
  Search,
  Users,
  Clock,
  Eye,
  EyeOff,
  Calendar,
  DollarSign,
  TrendingUp,
  Receipt,
  Edit,
  Trash2,
  ArrowRightLeft,
  LogIn,
  LogOut,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Phone,
  Printer,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  KeyRound,
  Sparkles,
  Gift,
  ShieldAlert,
} from 'lucide-react';

export function Employees() {
  const { user, isAdmin, hasPermission } = useAuth();
  const { branches, activeBranchId, isMultiBranch } = useBranch();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // Granular Permissions Gating
  const canViewEmployees = Boolean(isAdmin || hasPermission('employees.list.view'));
  const canCreateEmployee = Boolean(isAdmin || hasPermission('employees.create'));
  const canEditEmployee = Boolean(isAdmin || hasPermission('employees.edit'));
  const canViewAttendance = Boolean(isAdmin || hasPermission('employees.attendance.view') || hasPermission('employees.attendance.edit'));
  const canEditAttendance = Boolean(isAdmin || hasPermission('employees.attendance.edit'));
  const canViewPayroll = Boolean(isAdmin || hasPermission('employees.payroll.view'));
  const canExecutePayroll = Boolean(isAdmin || hasPermission('employees.payroll.execute'));
  const canCreateAdvance = Boolean(isAdmin || hasPermission('employees.advances.create'));

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [filterBranch, setFilterBranch] = useState(
    () => searchParams.get('branch_id') || (activeBranchId && activeBranchId !== 'all' ? activeBranchId : 'all')
  );
  const [filterPosition, setFilterPosition] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filterBonusStatus, setFilterBonusStatus] = useState('all');

  useEffect(() => {
    if (activeBranchId) {
      setFilterBranch(activeBranchId.toString());
      setPage(1);
    }
  }, [activeBranchId]);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null && q !== undefined) {
      setSearch(q);
      const b = searchParams.get('branch_id');
      if (b) {
        setFilterBranch(b);
      } else if (q.trim()) {
        setFilterBranch('all');
      }
    }
  }, [searchParams]);

  // Salary Visibility & Authentication
  const [salaryVisible, setSalaryVisible] = useState(false);
  const [salaryPassword, setSalaryPassword] = useState('');
  const [showSalaryAuthModal, setShowSalaryAuthModal] = useState(false);
  const [salaryAuthInput, setSalaryAuthInput] = useState('');
  const [salaryAuthLoading, setSalaryAuthLoading] = useState(false);
  const [salaryAuthError, setSalaryAuthError] = useState('');
  const [pendingAuthAction, setPendingAuthAction] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  // Add / Edit Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [empForm, setEmpForm] = useState({
    name: '',
    phone: '',
    position: '',
    basic_salary: '',
    branch_id: '',
    branch_scope: 'single',
    branch_ids: [],
    shift_start: '10:00',
    shift_end: '22:00',
    commission_rate: 0,
    join_date: new Date().toISOString().split('T')[0],
    end_date: '',
    status: 'active',
  });

  // Deactivate / End of Service Modal
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivateEmp, setDeactivateEmp] = useState(null);
  const [deactivateDate, setDeactivateDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deactivating, setDeactivating] = useState(false);

  // Transfer Branch Modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferEmp, setTransferEmp] = useState(null);
  const [targetBranchId, setTargetBranchId] = useState('');

  // Attendance Report Modal
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [customTime, setCustomTime] = useState('');

  // Manual Attendance Modal State
  const [showManualAttendanceModal, setShowManualAttendanceModal] = useState(false);
  const [manualEmp, setManualEmp] = useState(null);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().split('T')[0],
    status: 'present',
    check_in: '10:00',
    check_out: '22:00',
    notes: '',
  });
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // Financial Transactions & Salary Summary Modal
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showSalaryInModal, setShowSalaryInModal] = useState(false);
  const [summaryEmp, setSummaryEmp] = useState(null);
  const [summaryData, setSummaryData] = useState({ daily_summary: [], monthly_summary: [], transactions: [] });
  const [activeSummaryTab, setActiveSummaryTab] = useState('daily');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [deletingTxId, setDeletingTxId] = useState(null);
  const [txForm, setTxForm] = useState(() => ({
    type: canCreateAdvance ? 'advance' : 'deduction',
    amount: '',
    notes: '',
    transaction_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    paid_from_drawer: false,
    branch_id: '',
  }));

  useEffect(() => {
    if (txForm.type === 'advance' && !canCreateAdvance && canExecutePayroll) {
      setTxForm((prev) => ({ ...prev, type: 'deduction' }));
    } else if (txForm.type !== 'advance' && !canExecutePayroll && canCreateAdvance) {
      setTxForm((prev) => ({ ...prev, type: 'advance' }));
    }
  }, [canCreateAdvance, canExecutePayroll, txForm.type]);

  // Payslip Modal
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipEmp, setPayslipEmp] = useState(null);
  const [payslipMonth, setPayslipMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payslipData, setPayslipData] = useState(null);
  const [editablePayslipData, setEditablePayslipData] = useState(null);
  const [payslipAdjForm, setPayslipAdjForm] = useState(null);
  const [savingPayslipAdj, setSavingPayslipAdj] = useState(false);
  const [isEditingPayslip, setIsEditingPayslip] = useState(false);
  const [loadingPayslip, setLoadingPayslip] = useState(false);
  const [quickPayOpen, setQuickPayOpen] = useState(false);
  const [quickPayAmount, setQuickPayAmount] = useState('');
  const [quickPayMethod, setQuickPayMethod] = useState('cash');
  const [quickPayFromDrawer, setQuickPayFromDrawer] = useState(false);
  const [quickPayNotes, setQuickPayNotes] = useState('');
  const [quickPayBranchId, setQuickPayBranchId] = useState('');
  const [quickPaySubmitting, setQuickPaySubmitting] = useState(false);

  // Sales Report Modal
  const [showSalesReportModal, setShowSalesReportModal] = useState(false);
  const [salesReportEmp, setSalesReportEmp] = useState(null);
  const [salesReportData, setSalesReportData] = useState({ sales: [], total_sales: 0, total_commission: 0 });
  const [loadingSalesReport, setLoadingSalesReport] = useState(false);

  // Load Employees
  const loadEmployees = useCallback(async (silent = false) => {
    if (!canViewEmployees) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      const res = await client.get('/employees', { params: { month: selectedMonth, limit: 1000, branch_id: 'all' } });
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : Array.isArray(res?.employees) ? res.employees : [];
      setEmployees(list);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل بيانات الموظفين',
        variant: 'danger',
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [canViewEmployees, selectedMonth, toast]);

  useEffect(() => {
    loadEmployees();
    const handleSyncCompleted = () => {
      loadEmployees(true);
    };
    window.addEventListener('elwazeer:sync-completed', handleSyncCompleted);
    window.addEventListener('elwazeer:payroll-updated', handleSyncCompleted);
    return () => {
      window.removeEventListener('elwazeer:sync-completed', handleSyncCompleted);
      window.removeEventListener('elwazeer:payroll-updated', handleSyncCompleted);
    };
  }, [loadEmployees]);

  useEffect(() => {
    if (activeBranchId) {
      setFilterBranch(activeBranchId);
      setPage(1);
    }
  }, [activeBranchId]);

  // Positions list
  const positions = useMemo(() => {
    const set = new Set();
    employees.forEach((e) => {
      if (e.position) set.add(e.position);
    });
    return Array.from(set);
  }, [employees]);

  // Filtered list
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const empStatus = emp.status || 'active';
      if (filterStatus !== 'all' && empStatus !== filterStatus) return false;
      if (filterBranch !== 'all') {
        const matchesPrimary = String(emp.branch_id) === String(filterBranch);
        const matchesAll = emp.branch_scope === 'all';
        const matchesSelected = emp.branch_scope === 'selected' && Array.isArray(emp.branch_ids) && emp.branch_ids.some((bId) => String(bId) === String(filterBranch));
        if (!matchesPrimary && !matchesAll && !matchesSelected) return false;
      }
      if (filterPosition !== 'all' && emp.position !== filterPosition) return false;
      if (filterBonusStatus === 'with_bonus' && Number(emp.current_month_bonuses || 0) <= 0) return false;
      if (filterBonusStatus === 'no_bonus' && Number(emp.current_month_bonuses || 0) > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (emp.name || '').toLowerCase().includes(q);
        const matchesPhone = (emp.phone || '').includes(q);
        const matchesPos = (emp.position || '').toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesPos;
      }
      return true;
    });
  }, [employees, filterStatus, filterBranch, filterPosition, filterBonusStatus, search]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage) || 1;
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, page]);

  // Salary Visibility & Authentication Handlers
  const handleToggleSalaryVisibility = async () => {
    if (salaryVisible) {
      setSalaryVisible(false);
      setSalaryPassword('');
      toast({
        title: 'تم إخفاء الرواتب',
        message: 'تم قفل عرض الرواتب وتفعيل الحماية',
        variant: 'info',
      });
      return;
    }

    if (salaryPassword) {
      setSalaryVisible(true);
      return;
    }

    try {
      const statusRes = await client.get('/sensitive-passwords/status');
      const status = statusRes?.data || statusRes || {};
      if (status?.salary && status.salary.configured === false) {
        setSalaryVisible(true);
        return;
      }
    } catch {
      // Fallback to modal
    }

    setPendingAuthAction(() => () => {
      setSalaryVisible(true);
    });
    setSalaryAuthInput('');
    setSalaryAuthError('');
    setShowSalaryAuthModal(true);
  };

  const handleConfirmSalaryAuth = async (e) => {
    if (e) e.preventDefault();
    if (!salaryAuthInput.trim()) {
      setSalaryAuthError('يرجى إدخال كلمة سر الرواتب');
      return;
    }

    try {
      setSalaryAuthLoading(true);
      setSalaryAuthError('');
      const res = await client.post('/verify-password', { password: salaryAuthInput.trim() });
      if (res?.ok) {
        const verifiedPwd = salaryAuthInput.trim();
        setSalaryPassword(verifiedPwd);
        setSalaryVisible(true);
        setShowSalaryAuthModal(false);
        toast({
          title: 'تم التحقق بنجاح',
          message: 'تم فك القفل وإظهار الرواتب',
          variant: 'success',
        });
        if (typeof pendingAuthAction === 'function') {
          pendingAuthAction(verifiedPwd);
          setPendingAuthAction(null);
        }
        if (showSummaryModal && summaryEmp) {
          client.get(`/employees/${summaryEmp.id}/summary`, { headers: { 'x-salary-password': verifiedPwd } })
            .then((res) => {
              setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [] });
            })
            .catch(() => {});
        }
      } else {
        setSalaryAuthError(res?.error || 'كلمة المرور غير صحيحة');
      }
    } catch (err) {
      setSalaryAuthError(err.message || 'كلمة المرور غير صحيحة');
    } finally {
      setSalaryAuthLoading(false);
    }
  };

  // Handle Add/Edit Open
  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingId(null);
    const initialBranch = (activeBranchId && activeBranchId !== 'all')
      ? String(activeBranchId)
      : branches[0]?.id
      ? String(branches[0].id)
      : '1';

    setEmpForm({
      name: '',
      phone: '',
      position: '',
      basic_salary: '',
      branch_id: initialBranch,
      branch_scope: 'single',
      branch_ids: [Number(initialBranch)],
      shift_start: '10:00',
      shift_end: '22:00',
      commission_rate: 0,
      join_date: new Date().toISOString().split('T')[0],
      end_date: '',
      status: 'active',
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (emp) => {
    setIsEditing(true);
    setEditingId(emp.id);
    const primaryBId = String(emp.branch_id || (activeBranchId !== 'all' ? activeBranchId : branches[0]?.id) || '1');
    const parsedIds = Array.isArray(emp.branch_ids) ? emp.branch_ids.map(Number).filter((n) => n > 0) : [];
    setEmpForm({
      name: emp.name || '',
      phone: emp.phone || '',
      position: emp.position || '',
      basic_salary: emp.basic_salary || '',
      branch_id: primaryBId,
      branch_scope: emp.branch_scope || 'single',
      branch_ids: parsedIds.length > 0 ? parsedIds : [Number(primaryBId)],
      shift_start: emp.shift_start ? emp.shift_start.slice(0, 5) : '10:00',
      shift_end: emp.shift_end ? emp.shift_end.slice(0, 5) : '22:00',
      commission_rate: emp.commission_rate || 0,
      join_date: emp.join_date ? String(emp.join_date).slice(0, 10) : '',
      end_date: emp.end_date ? String(emp.end_date).slice(0, 10) : '',
      status: emp.status || 'active',
    });
    setShowAddModal(true);
  };

  // Submit Employee
  const handleSaveEmployee = async (e) => {
    e.preventDefault();
    if (!empForm.name.trim()) {
      toast({ title: 'تنبيه', message: 'اسم الموظف مطلوب', variant: 'warning' });
      return;
    }

    const branchIdNum = Number(empForm.branch_id);
    if (!branchIdNum || branchIdNum <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار الفرع التابع له الموظف', variant: 'warning' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        name: empForm.name.trim(),
        phone: empForm.phone.trim() || null,
        position: empForm.position.trim() || null,
        basic_salary: empForm.basic_salary ? Number(empForm.basic_salary) : 0,
        branch_id: branchIdNum,
        branch_scope: empForm.branch_scope || 'single',
        branch_ids: empForm.branch_scope === 'selected'
          ? Array.from(new Set([branchIdNum, ...(empForm.branch_ids || []).map(Number).filter((n) => n > 0)]))
          : [],
        shift_start: empForm.shift_start ? `${empForm.shift_start.slice(0, 5)}:00` : null,
        shift_end: empForm.shift_end ? `${empForm.shift_end.slice(0, 5)}:00` : null,
        commission_rate: Number(empForm.commission_rate || 0),
        join_date: empForm.join_date || null,
        end_date: empForm.status === 'inactive' ? (empForm.end_date || new Date().toISOString().split('T')[0]) : null,
        status: empForm.status || 'active',
      };

      if (isEditing) {
        await client.put(`/employees/${editingId}`, payload);
        toast({ title: 'تم التحديث', message: 'تم تحديث بيانات الموظف بنجاح', variant: 'success' });
      } else {
        await client.post('/employees', payload);
        toast({ title: 'تمت الإضافة', message: 'تم إضافة الموظف الجديد بنجاح', variant: 'success' });
      }

      setShowAddModal(false);
      loadEmployees();
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر حفظ بيانات الموظف',
        variant: 'danger',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Deactivate / End of Service Employee
  const openDeactivateModal = (emp) => {
    setDeactivateEmp(emp);
    setDeactivateDate(emp.end_date ? String(emp.end_date).slice(0, 10) : new Date().toISOString().split('T')[0]);
    setShowDeactivateModal(true);
  };

  const handleConfirmDeactivate = async (e) => {
    if (e) e.preventDefault();
    if (!deactivateEmp) return;
    try {
      setDeactivating(true);
      await client.post(`/employees/${deactivateEmp.id}/deactivate`, {
        end_date: deactivateDate || new Date().toISOString().split('T')[0],
      });
      toast({
        title: 'تم إنهاء العمل',
        message: `تم إيقاف "${deactivateEmp.name}" بتاريخ ${deactivateDate} مع حفظ مستحقاته وسلفه في الشهر`,
        variant: 'success',
      });
      setShowDeactivateModal(false);
      setDeactivateEmp(null);
      loadEmployees();
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر إيقاف الموظف',
        variant: 'danger',
      });
    } finally {
      setDeactivating(false);
    }
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return '-';
    try {
      const [h, m] = timeStr.split(':');
      const hour = parseInt(h, 10);
      const ampm = hour >= 12 ? 'م' : 'ص';
      const formattedHour = hour % 12 || 12;
      return `${formattedHour}:${m} ${ampm}`;
    } catch {
      return timeStr;
    }
  };

  // Open Attendance Modal
  const openAttendanceModal = async (emp) => {
    setSelectedEmp(emp);
    setShowAttendanceModal(true);
    setLoadingAttendance(true);
    try {
      const res = await client.get(`/employees/${emp.id}/attendance-report`);
      const payload = res?.data || res || {};
      setAttendanceLogs(
        payload.daily_attendance ||
        payload.logs ||
        (Array.isArray(payload) ? payload : [])
      );
    } catch {
      setAttendanceLogs([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Quick Attendance Toggle
  const handleToggleAttendance = async (emp) => {
    try {
      const attBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : (user?.branch_id ? Number(user.branch_id) : undefined);
      const res = await client.post(`/employees/${emp.id}/attendance-toggle`, attBranchId ? { branch_id: attBranchId } : {});
      const action = res?.action;
      let title = 'سجل الحضور والبصمة';
      let message = 'تم تحديث حالة الحضور بنجاح';
      let variant = 'success';

      if (action === 'check_in') {
        const timeFormatted = formatTime(res?.attendance?.check_in);
        message = `تم تسجيل حضور الموظف "${emp.name}" بنجاح (${timeFormatted})`;
      } else if (action === 'check_out') {
        const timeFormatted = formatTime(res?.attendance?.check_out);
        message = `تم تسجيل انصراف الموظف "${emp.name}" بنجاح (${timeFormatted})`;
      } else if (action === 'already_completed') {
        message = `تم تسجيل الحضور والانصراف للموظف "${emp.name}" لهذا اليوم مسبقاً`;
        variant = 'warning';
      }

      toast({
        title,
        message,
        variant,
      });

      // Optimistically update local state so counters react instantly
      if (res?.attendance) {
        setEmployees((prev) =>
          prev.map((item) =>
            item.id === emp.id
              ? {
                  ...item,
                  today_check_in: res.attendance.check_in || item.today_check_in,
                  today_check_out: res.attendance.check_out || item.today_check_out,
                  today_attendance_status: res.attendance.status || item.today_attendance_status,
                }
              : item
          )
        );
      }

      loadEmployees();
      if (selectedEmp?.id === emp.id) {
        openAttendanceModal(emp);
      }
    } catch (err) {
      toast({
        title: 'تعذر التسجيل',
        message: err.message || 'حدث خطأ أثناء تسجيل البصمة',
        variant: 'danger',
      });
    }
  };

  // Open Manual Attendance Modal
  const openManualAttendance = (emp) => {
    setManualEmp(emp);
    const cairoToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const normalizedStatus = emp.today_attendance_status === 'completed'
      ? 'present'
      : (emp.today_attendance_status || 'present');
    setManualForm({
      date: cairoToday,
      status: normalizedStatus,
      check_in: (emp.today_check_in || emp.shift_start || '10:00').slice(0, 5),
      check_out: emp.today_check_out ? String(emp.today_check_out).slice(0, 5) : '',
      notes: '',
    });
    setShowManualAttendanceModal(true);
  };

  // Submit Manual Attendance
  const handleSaveManualAttendance = async (e) => {
    e.preventDefault();
    if (!manualEmp) return;
    try {
      setManualSubmitting(true);
      const attBranchId = activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : (user?.branch_id ? Number(user.branch_id) : undefined);
      await client.post(`/employees/${manualEmp.id}/attendance-manual`, {
        ...manualForm,
        ...(attBranchId ? { branch_id: attBranchId } : {}),
      });
      toast({ title: 'تم الحفظ', message: 'تم تسجيل الحضور اليدوي بنجاح', variant: 'success' });
      setShowManualAttendanceModal(false);
      loadEmployees();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'فشل تسجيل الحضور اليدوي', variant: 'danger' });
    } finally {
      setManualSubmitting(false);
    }
  };

  const executeOpenSummary = async (emp, pwd, initialType = null) => {
    setSummaryEmp(emp);
    setShowSummaryModal(true);
    setLoadingSummary(true);
    setShowSalaryInModal(false);
    const targetType = initialType || (canCreateAdvance ? 'advance' : 'deduction');
    const defaultTxBranch = activeBranchId && activeBranchId !== 'all'
      ? String(activeBranchId)
      : (!isMultiBranch && user?.branch_id ? String(user.branch_id) : '');
    setTxForm({
      type: targetType,
      amount: '',
      notes: '',
      transaction_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      paid_from_drawer: false,
      branch_id: defaultTxBranch,
      salary_password: pwd,
    });
    try {
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const qs = new URLSearchParams();
      if (targetType === 'advance') qs.set('type', 'advance');
      if (selectedMonth) qs.set('month', selectedMonth);
      const res = await client.get(`/employees/${emp.id}/summary?${qs.toString()}`, { headers });
      setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [], transactions: [] });
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر تحميل البيانات المالية', variant: 'danger' });
      setSummaryData({ daily_summary: [], monthly_summary: [], transactions: [] });
      setShowSummaryModal(false);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Open Salary & Transactions Summary
  const openSummaryModal = (emp, initialType = null) => {
    const targetType = initialType || (canCreateAdvance ? 'advance' : 'deduction');
    const isAddingAdvance = targetType === 'advance';

    const proceed = (pwd) => {
      executeOpenSummary(emp, pwd, targetType);
    };

    if (isAddingAdvance || !canViewPayroll || salaryPassword || user?.role === 'admin') {
      proceed(salaryPassword || '');
    } else {
      setPendingAuthAction(() => (pwd) => proceed(pwd));
      setSalaryAuthInput('');
      setSalaryAuthError('');
      setShowSalaryAuthModal(true);
    }
  };

  // Handle switching transaction type inside modal (e.g. advance <-> deduction)
  const handleTxTypeChange = async (newType) => {
    const wasAdvance = txForm.type === 'advance';
    const isNowAdvance = newType === 'advance';
    setTxForm((prev) => ({ ...prev, type: newType }));
    if (wasAdvance !== isNowAdvance && summaryEmp) {
      setLoadingSummary(true);
      try {
        const pwd = salaryPassword || txForm.salary_password || '';
        const headers = pwd ? { 'x-salary-password': pwd } : {};
        const qs = new URLSearchParams();
        if (isNowAdvance) qs.set('type', 'advance');
        if (selectedMonth) qs.set('month', selectedMonth);
        const res = await client.get(`/employees/${summaryEmp.id}/summary?${qs.toString()}`, { headers });
        setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [], transactions: [] });
      } catch {
        // preserve current summary on temporary error
      } finally {
        setLoadingSummary(false);
      }
    }
  };

  // Save Financial Transaction
  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    if (txForm.type === 'advance' && !canCreateAdvance) {
      toast({ title: 'غير مصرح', message: 'ليس لديك صلاحية تسجيل السلف', variant: 'danger' });
      return;
    }
    if (txForm.type !== 'advance' && !canExecutePayroll) {
      toast({ title: 'غير مصرح', message: 'ليس لديك صلاحية تسجيل حركات الرواتب والخصومات والمكافآت', variant: 'danger' });
      return;
    }
    if (!txForm.amount || Number(txForm.amount) <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال مبلغ صحيح', variant: 'warning' });
      return;
    }

    const resolvedBranchId = txForm.branch_id
      ? Number(txForm.branch_id)
      : (activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : (user?.branch_id ? Number(user.branch_id) : null));
    const needsBranchSelection = isMultiBranch && branches.length > 1 && (txForm.type === 'advance' || (txForm.type === 'salary_payment' && txForm.payment_method === 'cash' && txForm.paid_from_drawer));
    if (needsBranchSelection && (!resolvedBranchId || !Number.isFinite(resolvedBranchId))) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار الفرع / الدرج المصروف منه المبلغ', variant: 'warning' });
      return;
    }

    try {
      const txBranchId = resolvedBranchId || undefined;
      await client.post('/employee_transactions', {
        employee_id: summaryEmp.id,
        type: txForm.type,
        amount: Number(txForm.amount),
        notes: txForm.notes.trim() || null,
        transaction_date: txForm.transaction_date,
        payment_method: txForm.type === 'salary_payment' ? (txForm.payment_method || 'cash') : 'cash',
        paid_from_drawer: txForm.type === 'salary_payment' && txForm.payment_method === 'cash' ? Boolean(txForm.paid_from_drawer) : false,
        ...(txBranchId ? { branch_id: txBranchId } : {}),
      });

      toast({
        title: 'تم الحفظ',
        message: txForm.type === 'advance' ? 'تم تسجيل وقيد السلفة المالية بنجاح' : 'تم تسجيل الحركة المالية بنجاح',
        variant: 'success',
      });
      setTxForm((prev) => ({ ...prev, amount: '', notes: '' }));
      // Reload summary
      const pwd = salaryPassword || txForm.salary_password || '';
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const qs = new URLSearchParams();
      if (txForm.type === 'advance') qs.set('type', 'advance');
      if (selectedMonth) qs.set('month', selectedMonth);
      const res = await client.get(`/employees/${summaryEmp.id}/summary?${qs.toString()}`, { headers });
      setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [], transactions: [] });
      loadEmployees(true);
      window.dispatchEvent(new CustomEvent('elwazeer:payroll-updated'));
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تسجيل الحركة المالية',
        variant: 'danger',
      });
    }
  };

  const handleDeleteTransaction = async (tx, source = 'summary') => {
    if (!tx?.id) return;
    const isAdvance = tx.type === 'advance';
    if (isAdvance && !canCreateAdvance) {
      toast({ title: 'غير مصرح', message: 'ليس لديك صلاحية حذف السلف', variant: 'danger' });
      return;
    }
    if (!isAdvance && !canExecutePayroll) {
      toast({ title: 'غير مصرح', message: 'ليس لديك صلاحية حذف حركات الرواتب', variant: 'danger' });
      return;
    }
    const typeLabel =
      tx.type === 'advance'
        ? 'السلفة'
        : tx.type === 'bonus'
        ? 'المكافأة'
        : tx.type === 'deduction'
        ? 'الخصم'
        : 'صرف الراتب';
    if (!window.confirm(`هل أنت متأكد من حذف ${typeLabel} بقيمة ${formatCurrency(tx.amount)}؟`)) {
      return;
    }
    try {
      setDeletingTxId(tx.id);
      await client.delete(`/employee_transactions/${tx.id}`);
      toast({ title: 'تم الحذف', message: `تم حذف ${typeLabel} وإعادة احتساب الراتب`, variant: 'success' });
      if (source === 'summary' && summaryEmp) {
        const pwd = salaryPassword || txForm.salary_password || '';
        const headers = pwd ? { 'x-salary-password': pwd } : {};
        const qs = new URLSearchParams();
        if (txForm.type === 'advance') qs.set('type', 'advance');
        if (selectedMonth) qs.set('month', selectedMonth);
        const res = await client.get(`/employees/${summaryEmp.id}/summary?${qs.toString()}`, { headers });
        setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [], transactions: [] });
      }
      if (showPayslipModal && payslipEmp) {
        await executeOpenPayslip(payslipEmp, salaryPassword || '', payslipMonth);
      }
      await loadEmployees(true);
      window.dispatchEvent(new CustomEvent('elwazeer:payroll-updated'));
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حذف الحركة المالية', variant: 'danger' });
    } finally {
      setDeletingTxId(null);
    }
  };

  const buildAdjFormFromPayslip = (raw) => {
    const adj = raw?.adjustment || {};
    const att = raw?.attendance || {};
    const fin = raw?.financials || {};
    return {
      basic_salary_override: adj.basic_salary_override !== null && adj.basic_salary_override !== undefined
        ? String(adj.basic_salary_override)
        : String(raw?.basic_salary ?? 0),
      apply_basic_salary_to_employee: false,
      work_days: adj.work_days !== null && adj.work_days !== undefined ? String(adj.work_days) : String(raw?.work_days ?? 30),
      allowed_leave_days: adj.allowed_leave_days !== null && adj.allowed_leave_days !== undefined ? String(adj.allowed_leave_days) : String(raw?.allowed_leave_days ?? 4),
      include_unused_leave_payout: adj.include_unused_leave_payout !== null && adj.include_unused_leave_payout !== undefined
        ? (adj.include_unused_leave_payout === true || adj.include_unused_leave_payout === 1)
        : Boolean(raw?.effective_unused_leave_enabled),
      unused_leave_amount_override: adj.unused_leave_amount_override !== null && adj.unused_leave_amount_override !== undefined
        ? String(adj.unused_leave_amount_override)
        : '',
      required_hours: adj.required_hours !== null && adj.required_hours !== undefined ? String(adj.required_hours) : String(raw?.required_hours ?? 0),
      overtime_amount_override: adj.overtime_amount_override !== null && adj.overtime_amount_override !== undefined
        ? String(adj.overtime_amount_override)
        : '',
      delay_deduction_override: adj.delay_deduction_override !== null && adj.delay_deduction_override !== undefined
        ? String(adj.delay_deduction_override)
        : '',
      absent_days_override: adj.absent_days_override !== null && adj.absent_days_override !== undefined
        ? String(adj.absent_days_override)
        : String(att.absent_days ?? 0),
      leave_days_override: adj.leave_days_override !== null && adj.leave_days_override !== undefined
        ? String(adj.leave_days_override)
        : String(att.leave_days ?? 0),
      half_days_override: adj.half_days_override !== null && adj.half_days_override !== undefined
        ? String(adj.half_days_override)
        : String(att.half_days ?? 0),
      penalty_days: String(adj.penalty_days ?? raw?.penalty_days ?? 0),
      manual_bonuses_override: adj.manual_bonuses_override !== null && adj.manual_bonuses_override !== undefined
        ? String(adj.manual_bonuses_override)
        : String(fin.bonuses_manual ?? raw?.manual_bonuses ?? 0),
      transportation_allowance: String(adj.transportation_allowance ?? raw?.transportation_allowance ?? 0),
      commissions: String(adj.commissions ?? raw?.commissions ?? 0),
      manual_deductions_override: adj.manual_deductions_override !== null && adj.manual_deductions_override !== undefined
        ? String(adj.manual_deductions_override)
        : String(fin.deductions_manual ?? 0),
      old_advances: String(adj.old_advances ?? raw?.old_advances ?? 0),
      previous_dues: String(adj.previous_dues ?? raw?.previous_dues ?? 0),
      notes: adj.notes || '',
    };
  };

  const executeOpenPayslip = async (emp, pwd, monthOverride = null) => {
    const targetMonth = monthOverride || selectedMonth || new Date().toISOString().slice(0, 7);
    setPayslipEmp(emp);
    setPayslipMonth(targetMonth);
    setShowPayslipModal(true);
    setLoadingPayslip(true);
    setQuickPayOpen(false);
    try {
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const res = await client.get(`/employees/${emp.id}/payslip`, {
        params: { month: targetMonth },
        headers,
      });
      const raw = res?.data || res;
      setPayslipData(raw);
      setEditablePayslipData(raw);
      setPayslipAdjForm(buildAdjFormFromPayslip(raw));
      setQuickPayAmount(String(Math.max(0, Number(raw?.remaining_balance ?? raw?.net_salary ?? 0))));
      setQuickPayNotes(`صرف راتب شهر ${targetMonth}`);
      setIsEditingPayslip(false);
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'كلمة سر الرواتب غير صحيحة أو غير مصرح', variant: 'danger' });
      setPayslipData(null);
      setShowPayslipModal(false);
    } finally {
      setLoadingPayslip(false);
    }
  };

  const livePayslipPreview = useMemo(() => {
    if (!payslipData) return null;
    if (!isEditingPayslip || !payslipAdjForm) return editablePayslipData || payslipData;

    const toNum = (v, fallback = 0) => {
      if (v === '' || v === null || v === undefined) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const toOpt = (v) => {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const masterBasic = Number(payslipData.employee_master_basic_salary ?? payslipData.basic_salary ?? 0);
    const basicOverride = toOpt(payslipAdjForm.basic_salary_override);
    const basicSalary = basicOverride !== null ? Math.max(0, basicOverride) : masterBasic;
    const dailyRate = Math.round((basicSalary / 30) * 100) / 100;
    const workDays = Math.max(0, toNum(payslipAdjForm.work_days, payslipData.work_days ?? 30));
    const earnedBaseSalary = workDays === 30 ? basicSalary : Math.round(workDays * dailyRate * 100) / 100;

    const allowedLeaveDays = Math.max(0, toNum(payslipAdjForm.allowed_leave_days, payslipData.allowed_leave_days ?? 4));
    const absentDays = Math.max(0, toNum(payslipAdjForm.absent_days_override, 0));
    const leaveDays = Math.max(0, toNum(payslipAdjForm.leave_days_override, 0));
    const halfDays = Math.max(0, toNum(payslipAdjForm.half_days_override, 0));
    const penaltyDays = Math.max(0, toNum(payslipAdjForm.penalty_days, 0));

    const absenceDeduction = Math.round(absentDays * dailyRate * 2);
    const leaveDeduction = leaveDays > allowedLeaveDays ? Math.round((leaveDays - allowedLeaveDays) * dailyRate) : 0;
    const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));
    const penaltyDaysAmount = Math.round(penaltyDays * dailyRate);

    const unusedEnabled = Boolean(payslipAdjForm.include_unused_leave_payout);
    const unusedLeaveDays = (unusedEnabled && workDays > 0 && leaveDays < allowedLeaveDays)
      ? Math.max(0, allowedLeaveDays - leaveDays)
      : 0;
    const unusedOverride = toOpt(payslipAdjForm.unused_leave_amount_override);
    const unusedLeaveAmount = unusedOverride !== null ? Math.round(unusedOverride) : Math.round(unusedLeaveDays * dailyRate);

    const actualHours = Number(payslipData.actual_hours || 0);
    const requiredHours = Math.max(0, toNum(payslipAdjForm.required_hours, 0));
    const overtimeHours = (requiredHours > 0 && actualHours > requiredHours) ? Math.round((actualHours - requiredHours) * 100) / 100 : 0;
    const delayHours = (requiredHours > 0 && actualHours < requiredHours) ? Math.round((requiredHours - actualHours) * 100) / 100 : 0;

    const calcOvertime = Math.round(((dailyRate / 10) * 1.35) * overtimeHours);
    const calcDelay = Math.round(((dailyRate / 10) * 1.5) * delayHours);
    const otOverride = toOpt(payslipAdjForm.overtime_amount_override);
    const dlOverride = toOpt(payslipAdjForm.delay_deduction_override);
    const overtimeAmount = otOverride !== null ? Math.round(otOverride) : calcOvertime;
    const delayDeduction = dlOverride !== null ? Math.round(dlOverride) : calcDelay;

    const manualBonuses = toNum(payslipAdjForm.manual_bonuses_override, 0);
    const transportationAllowance = toNum(payslipAdjForm.transportation_allowance, 0);
    const commissions = toNum(payslipAdjForm.commissions, 0);
    const previousDues = toNum(payslipAdjForm.previous_dues, 0);
    const manualDeductions = toNum(payslipAdjForm.manual_deductions_override, 0);
    const oldAdvances = toNum(payslipAdjForm.old_advances, 0);
    const advances = Number(payslipData.advances || 0);
    const alreadyPaid = Number(payslipData.already_paid || 0);

    const totalAdditions = Math.round((unusedLeaveAmount + overtimeAmount + manualBonuses + commissions + transportationAllowance + previousDues) * 100) / 100;
    const grossSalary = Math.round((earnedBaseSalary + totalAdditions) * 100) / 100;
    const deductionsWithoutAdvances = Math.round((absenceDeduction + leaveDeduction + halfDayDeduction + delayDeduction + penaltyDaysAmount + manualDeductions) * 100) / 100;
    const netSalary = Math.round(grossSalary - advances - deductionsWithoutAdvances - oldAdvances);
    const remainingBalance = Math.round(netSalary - alreadyPaid);

    return {
      ...payslipData,
      basic_salary: basicSalary,
      daily_rate: dailyRate,
      work_days: workDays,
      earned_base_salary: earnedBaseSalary,
      allowed_leave_days: allowedLeaveDays,
      unused_leave_days: unusedLeaveDays,
      unused_leave_amount: unusedLeaveAmount,
      required_hours: requiredHours,
      overtime_hours: overtimeHours,
      overtime_amount: overtimeAmount,
      calc_overtime_amount: calcOvertime,
      delay_hours: delayHours,
      delay_deduction: delayDeduction,
      calc_delay_deduction: calcDelay,
      manual_bonuses: manualBonuses,
      bonuses: manualBonuses,
      transportation_allowance: transportationAllowance,
      commissions,
      previous_dues: previousDues,
      old_advances: oldAdvances,
      penalty_days: penaltyDays,
      penalty_days_amount: penaltyDaysAmount,
      deductions: deductionsWithoutAdvances,
      deductions_without_advances: deductionsWithoutAdvances,
      gross_salary: grossSalary,
      net_salary: netSalary,
      remaining_balance: remainingBalance,
      attendance: {
        ...payslipData.attendance,
        absent_days: absentDays,
        leave_days: leaveDays,
        half_days: halfDays,
        absence_deduction: absenceDeduction,
        leave_deduction: leaveDeduction,
        half_day_deduction: halfDayDeduction,
        delay_deduction: delayDeduction,
        overtime_amount: overtimeAmount,
      },
    };
  }, [payslipData, editablePayslipData, isEditingPayslip, payslipAdjForm]);

  const handleSavePayslipAdjustment = async () => {
    if (!payslipEmp || !payslipAdjForm) return;
    try {
      setSavingPayslipAdj(true);
      const toOptNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
      const masterBasic = Number(payslipData?.employee_master_basic_salary ?? payslipData?.basic_salary ?? 0);
      const formBasic = toOptNum(payslipAdjForm.basic_salary_override);
      const basicSalaryOverride = payslipAdjForm.apply_basic_salary_to_employee
        ? formBasic
        : (formBasic !== null && formBasic !== masterBasic ? formBasic : null);
      const payload = {
        month: payslipMonth,
        basic_salary_override: basicSalaryOverride,
        apply_basic_salary_to_employee: Boolean(canEditEmployee && payslipAdjForm.apply_basic_salary_to_employee),
        work_days: toOptNum(payslipAdjForm.work_days),
        allowed_leave_days: toOptNum(payslipAdjForm.allowed_leave_days),
        include_unused_leave_payout: Boolean(payslipAdjForm.include_unused_leave_payout),
        unused_leave_amount_override: toOptNum(payslipAdjForm.unused_leave_amount_override),
        required_hours: toOptNum(payslipAdjForm.required_hours),
        overtime_amount_override: toOptNum(payslipAdjForm.overtime_amount_override),
        delay_deduction_override: toOptNum(payslipAdjForm.delay_deduction_override),
        absent_days_override: toOptNum(payslipAdjForm.absent_days_override),
        leave_days_override: toOptNum(payslipAdjForm.leave_days_override),
        half_days_override: toOptNum(payslipAdjForm.half_days_override),
        penalty_days: Number(payslipAdjForm.penalty_days || 0),
        manual_bonuses_override: toOptNum(payslipAdjForm.manual_bonuses_override),
        transportation_allowance: Number(payslipAdjForm.transportation_allowance || 0),
        commissions: Number(payslipAdjForm.commissions || 0),
        manual_deductions_override: toOptNum(payslipAdjForm.manual_deductions_override),
        old_advances: Number(payslipAdjForm.old_advances || 0),
        previous_dues: Number(payslipAdjForm.previous_dues || 0),
        notes: payslipAdjForm.notes?.trim() || null,
      };

      const pwd = salaryPassword || '';
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const res = await client.put(`/employees/${payslipEmp.id}/payslip-adjustments`, payload, { headers });
      const raw = res?.data || res;
      setPayslipData(raw);
      setEditablePayslipData(raw);
      setPayslipAdjForm(buildAdjFormFromPayslip(raw));
      setQuickPayAmount(String(Math.max(0, Number(raw?.remaining_balance ?? 0))));
      setIsEditingPayslip(false);
      toast({ title: 'تم الحفظ', message: 'تم حفظ تسوية وتعديلات الراتب وتعميمها في السيستم بنجاح', variant: 'success' });
      loadEmployees(true);
      window.dispatchEvent(new CustomEvent('elwazeer:payroll-updated'));
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر حفظ التعديلات', variant: 'danger' });
    } finally {
      setSavingPayslipAdj(false);
    }
  };

  const handleResetPayslipAdjustment = async () => {
    if (!payslipEmp) return;
    try {
      setSavingPayslipAdj(true);
      const pwd = salaryPassword || '';
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const res = await client.put(`/employees/${payslipEmp.id}/payslip-adjustments`, { month: payslipMonth, reset: true }, { headers });
      const raw = res?.data || res;
      setPayslipData(raw);
      setEditablePayslipData(raw);
      setPayslipAdjForm(buildAdjFormFromPayslip(raw));
      setQuickPayAmount(String(Math.max(0, Number(raw?.remaining_balance ?? 0))));
      setIsEditingPayslip(false);
      toast({ title: 'تمت الاستعادة', message: 'تمت استعادة الحساب التلقائي للراتب', variant: 'info' });
      loadEmployees(true);
      window.dispatchEvent(new CustomEvent('elwazeer:payroll-updated'));
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر استعادة الحساب التلقائي', variant: 'danger' });
    } finally {
      setSavingPayslipAdj(false);
    }
  };

  const handleQuickSalaryPayout = async (e) => {
    e.preventDefault();
    if (!payslipEmp) return;
    const amt = Number(quickPayAmount || 0);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال مبلغ صحيح للصرف', variant: 'warning' });
      return;
    }
    const resolvedQuickBranchId = quickPayBranchId
      ? Number(quickPayBranchId)
      : (activeBranchId && activeBranchId !== 'all' ? Number(activeBranchId) : (user?.branch_id ? Number(user.branch_id) : null));
    if (isMultiBranch && branches.length > 1 && quickPayMethod === 'cash' && quickPayFromDrawer && (!resolvedQuickBranchId || !Number.isFinite(resolvedQuickBranchId))) {
      toast({ title: 'تنبيه', message: 'يرجى اختيار الفرع / الدرج المصروف منه الراتب', variant: 'warning' });
      return;
    }
    try {
      setQuickPaySubmitting(true);
      const txBranchId = resolvedQuickBranchId || undefined;
      await client.post('/employee_transactions', {
        employee_id: payslipEmp.id,
        type: 'salary_payment',
        amount: amt,
        payment_method: quickPayMethod,
        paid_from_drawer: quickPayMethod === 'cash' ? Boolean(quickPayFromDrawer) : false,
        transaction_date: new Date().toISOString().split('T')[0],
        notes: quickPayNotes?.trim() || `صرف راتب شهر ${payslipMonth}`,
        ...(txBranchId ? { branch_id: txBranchId } : {}),
      });
      toast({ title: 'تم الصرف', message: 'تم تسجيل صرف الراتب بنجاح', variant: 'success' });
      setQuickPayOpen(false);
      await executeOpenPayslip(payslipEmp, salaryPassword || '', payslipMonth);
      loadEmployees(true);
      window.dispatchEvent(new CustomEvent('elwazeer:payroll-updated'));
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر تسجيل صرف الراتب', variant: 'danger' });
    } finally {
      setQuickPaySubmitting(false);
    }
  };

  // Open Payslip
  const openPayslipModal = (emp) => {
    const proceed = (pwd) => {
      executeOpenPayslip(emp, pwd, selectedMonth);
    };

    if (salaryPassword || user?.role === 'admin') {
      proceed(salaryPassword || '');
    } else {
      setPendingAuthAction(() => (pwd) => proceed(pwd));
      setSalaryAuthInput('');
      setSalaryAuthError('');
      setShowSalaryAuthModal(true);
    }
  };


  // Open Sales Report
  const openSalesReportModal = async (emp) => {
    setSalesReportEmp(emp);
    setShowSalesReportModal(true);
    setLoadingSalesReport(true);
    try {
      const res = await client.get(`/employees/${emp.id}/sales-report`);
      const payload = res?.sales ? res : (res?.data || {});
      setSalesReportData({
        sales: Array.isArray(payload.sales) ? payload.sales : [],
        total_sales: Number(payload.total_sales || 0),
        total_commission: Number(payload.total_commission || 0),
      });
    } catch {
      setSalesReportData({ sales: [], total_sales: 0, total_commission: 0 });
    } finally {
      setLoadingSalesReport(false);
    }
  };

  useEffect(() => {
    if (!showSalesReportModal || !salesReportEmp?.id) return;
    const handleSyncCompleted = async () => {
      try {
        const res = await client.get(`/employees/${salesReportEmp.id}/sales-report`);
        const payload = res?.sales ? res : (res?.data || {});
        setSalesReportData({
          sales: Array.isArray(payload.sales) ? payload.sales : [],
          total_sales: Number(payload.total_sales || 0),
          total_commission: Number(payload.total_commission || 0),
        });
      } catch {}
    };
    window.addEventListener('elwazeer:sync-completed', handleSyncCompleted);
    return () => window.removeEventListener('elwazeer:sync-completed', handleSyncCompleted);
  }, [showSalesReportModal, salesReportEmp?.id]);

  // Transfer Employee
  const handleTransfer = async () => {
    if (!targetBranchId) return;
    try {
      await client.post(`/employees/${transferEmp.id}/transfer`, {
        branch_id: Number(targetBranchId),
      });
      toast({ title: 'تم النقل', message: 'تم نقل الموظف للفرع الجديد بنجاح', variant: 'success' });
      setShowTransferModal(false);
      loadEmployees();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر نقل الموظف', variant: 'danger' });
    }
  };

  const cleanNotes = (text) => {
    if (!text) return '';
    return text.replace(/\s*\[EXP-[a-zA-Z0-9-]+\]\s*/g, ' ').trim();
  };

  const getArabicMonthName = (monthStr) => {
    if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) return '';
    const [, month] = monthStr.split('-').map(Number);
    const arabicMonths = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    return arabicMonths[month - 1] || '';
  };

  const totalBonuses = useMemo(() => {
    const list = filterBranch === 'all' ? employees : filteredEmployees;
    return list.reduce((acc, e) => acc + Number(e.current_month_bonuses || 0), 0);
  }, [employees, filteredEmployees, filterBranch]);

  const bonusEmployeesCount = useMemo(() => {
    const list = filterBranch === 'all' ? employees : filteredEmployees;
    return list.filter((e) => Number(e.current_month_bonuses || 0) > 0).length;
  }, [employees, filteredEmployees, filterBranch]);

  const formatCurrency = (val) => {
    const parsed = Number(val);
    const num = Number.isFinite(parsed) ? parsed : 0;
    const formatted = num.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    return num < 0 ? `\u200E${formatted} ج.م` : `${formatted} ج.م`;
  };


  if (!canViewEmployees) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-[#EBE8E2] text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-[#24221F]">غير مصرح بالدخول</h2>
          <p className="text-sm text-[#777266] mt-1">ليس لديك صلاحية لعرض قائمة الموظفين والموارد البشرية</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#151515] border border-black flex items-center justify-center text-white shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[#24221F] tracking-tight">
                الموظفين والموارد البشرية (HR)
              </h1>
              <p className="text-sm font-semibold text-[#777266] mt-0.5">
                سجل الموظفين، الحضور والانصراف، المرتبات، المكافآت والسلف
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {canViewPayroll && (
            <Button
              variant="outline"
              icon={salaryVisible ? EyeOff : Eye}
              onClick={handleToggleSalaryVisibility}
            >
              {salaryVisible ? 'إخفاء الرواتب' : 'إظهار الرواتب'}
            </Button>
          )}
          {canCreateEmployee && (
            <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
              إضافة موظف جديد
            </Button>
          )}
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="إجمالي الموظفين"
          value={employees.length}
          icon={Users}
          variant="primary"
          subtitle="موظف مسجل بالنظام"
        />
        <StatCard
          title="حاضرون اليوم"
          value={employees.filter((e) => e.today_check_in && !e.today_check_out).length}
          icon={UserCheck}
          variant="success"
          subtitle="على رأس العمل حالياً"
        />
        <StatCard
          title="انصرفوا اليوم"
          value={employees.filter((e) => e.today_check_out).length}
          icon={LogOut}
          variant="warning"
          subtitle="أتموا وردية اليوم"
        />
        <StatCard
          title="إجمالي الرواتب الأساسية"
          value={
            salaryVisible
              ? formatCurrency(
                  (filterBranch === 'all' ? employees : filteredEmployees).reduce(
                    (acc, e) => acc + Number(e.basic_salary || 0),
                    0
                  )
                )
              : '•••••• ج.م'
          }
          icon={DollarSign}
          variant="danger"
          subtitle={
            salaryVisible
              ? (filterBranch === 'all' ? 'مسير الرواتب الشهري لكافة الفروع' : 'مسير الرواتب الشهري للفرع المحدد')
              : 'مسير الرواتب الشهري (محمي)'
          }
        />
        <StatCard
          title={`مكافآت شهر ${getArabicMonthName(selectedMonth)}`}
          value={salaryVisible ? formatCurrency(totalBonuses) : '•••••• ج.م'}
          icon={Gift}
          variant="success"
          subtitle={`${bonusEmployeesCount} موظف حصلوا على مكافأة`}
        />
      </div>

      {/* Filter Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Input
              placeholder="بحث بالاسم، رقم الهاتف، الوظيفة..."
              icon={Search}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515] transition-colors"
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id.toString()}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515] transition-colors"
              value={filterPosition}
              onChange={(e) => {
                setFilterPosition(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل الوظائف</option>
              {positions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-[#E6DECD] bg-[#FFFDF9] font-bold text-sm text-[#24221F] focus:outline-none focus:border-[#151515] transition-colors"
              value={filterBonusStatus}
              onChange={(e) => {
                setFilterBonusStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل حالات المكافآت</option>
              <option value="with_bonus">حصل على مكافأة (+)</option>
              <option value="no_bonus">المرتب فقط (بدون مكافأة)</option>
            </select>
          </div>
        </div>

        {/* Month Selector Bar */}
        <div className="px-4 pb-3.5 pt-1 border-t border-[#E6DECD] flex flex-wrap items-center justify-between gap-3 text-xs font-bold text-[#777266]">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#151515]" />
            <span>عرض مكافآت ومسير شهر:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedMonth(e.target.value);
                  setPage(1);
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-[#E6DECD] bg-[#FFFDF9] text-xs font-black text-[#24221F] focus:outline-none focus:border-[#151515]"
            />
            <span className="text-[#24221F] font-black">
              ({getArabicMonthName(selectedMonth)})
            </span>
          </div>

          {selectedMonth !== new Date().toISOString().slice(0, 7) && (
            <button
              type="button"
              onClick={() => {
                setSelectedMonth(new Date().toISOString().slice(0, 7));
                setPage(1);
              }}
              className="text-xs text-[#24221F] hover:underline font-black"
            >
              الرجوع للشهر الحالي ({getArabicMonthName(new Date().toISOString().slice(0, 7))})
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-[#FAF6ED] p-1 rounded-xl border border-[#E6DECD]">
            {[
              { id: 'active', label: 'الموظفون الحاليون' },
              { id: 'inactive', label: 'المتوقفون / السابقون' },
              { id: 'all', label: 'الكل' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setFilterStatus(st.id);
                  setPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition-all ${
                  filterStatus === st.id
                    ? 'bg-[#151515] text-white shadow-xs'
                    : 'text-[#777266] hover:text-[#24221F]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Employees Table */}
      <Card>
        <CardHeader
          title="دليل الموظفين"
          subtitle={`المعروض: ${paginatedEmployees.length} من إجمالي ${filteredEmployees.length} موظف`}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-[#151515] text-white text-xs font-black">
                <th className="py-3.5 px-4">الموظف</th>
                <th className="py-3.5 px-4">رقم الهاتف</th>
                <th className="py-3.5 px-4">الوظيفة</th>
                <th className="py-3.5 px-4">مواعيد الوردية</th>
                <th className="py-3.5 px-4">الفرع</th>
                <th className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <span>الراتب الأساسي</span>
                    {canViewPayroll && (
                      <button
                        type="button"
                        onClick={handleToggleSalaryVisibility}
                        className="p-1 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                        title={salaryVisible ? 'إخفاء الرواتب' : 'إظهار الرواتب'}
                      >
                        {salaryVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>المكافآت ({getArabicMonthName(selectedMonth)})</span>
                  </div>
                </th>
                <th className="py-3.5 px-4">حالة حضور اليوم</th>
                <th className="py-3.5 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E6DECD]/70 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#777266] font-bold">
                    جارِ تحميل بيانات الموظفين...
                  </td>
                </tr>
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-[#777266] font-bold">
                    <Users className="w-12 h-12 mx-auto mb-2 text-[#777266]/40" />
                    لا يوجد موظفون مطابقون لبيانات البحث
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const isCheckedIn = Boolean(emp.today_check_in);
                  const isCheckedOut = Boolean(emp.today_check_out);

                  return (
                    <tr key={emp.id} className="hover:bg-[#FAF6ED]/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-[#FDF5D2] border border-[#F4D95B]/40 text-[#24221F] flex items-center justify-center font-black text-sm shrink-0">
                            {(emp.name || 'م')[0]}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-black text-[#24221F]">{emp.name}</span>
                              {emp.branch_scope === 'all' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  كل الفروع
                                </span>
                              )}
                              {emp.branch_scope === 'selected' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                                  {emp.branch_ids?.length || 1} فروع
                                </span>
                              )}
                              {emp.status === 'inactive' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                                  متوقف{emp.end_date ? ` (${String(emp.end_date).slice(0, 10)})` : ''}
                                </span>
                              )}
                            </div>
                            {emp.commission_rate > 0 && (
                              <div className="text-[11px] font-bold text-emerald-700">
                                عمولة: {emp.commission_rate}%
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-[#565147]">
                        {emp.phone ? (
                          <span className="dir-ltr text-xs font-mono">{emp.phone}</span>
                        ) : (
                          <span className="text-[#777266]">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-[#FAF6ED] text-[#24221F] border border-[#E6DECD]">
                          {emp.position || 'موظف'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-bold text-[#777266] whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#777266]" />
                          <span>{formatTime(emp.shift_start)}</span>
                          <span>-</span>
                          <span>{formatTime(emp.shift_end)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-black text-[#24221F]">
                        {emp.branch_name || 'الفرع الرئيسي'}
                      </td>

                      <td className="py-3.5 px-4 font-black text-[#24221F] whitespace-nowrap">
                        {salaryVisible ? (
                          <div className="flex flex-col items-start gap-0.5">
                            <span>{formatCurrency(emp.basic_salary)}</span>
                            {emp.has_basic_salary_override && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                معدل للشهر (الأساسي: {formatCurrency(emp.master_basic_salary)})
                              </span>
                            )}
                          </div>
                        ) : '••••••'}
                      </td>

                      {/* Bonuses Column */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {!salaryVisible ? (
                          <span className="text-slate-400 font-mono tracking-widest text-xs">••••••</span>
                        ) : (
                          <div className="flex flex-col gap-1 items-start">
                            {Number(emp.current_month_bonuses || 0) > 0 ? (
                              <button
                                type="button"
                                onClick={() => openSummaryModal(emp, 'bonus')}
                                title="عرض تفاصيل المكافأة والحركات المالية"
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-xs"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>+{formatCurrency(emp.current_month_bonuses)}</span>
                                {emp.current_month_bonus_count > 1 && (
                                  <span className="bg-emerald-200 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                                    {emp.current_month_bonus_count}
                                  </span>
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black bg-slate-100 text-slate-600 border border-slate-200">
                                {emp.has_saved_adjustment ? 'تسوية محفوظة' : 'المرتب فقط'}
                              </span>
                            )}
                            <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                              <span>المستحق:</span>
                              <span className={`font-black ${Number(emp.current_month_net_salary ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                                {formatCurrency(
                                  emp.current_month_net_salary != null
                                    ? emp.current_month_net_salary
                                    : Number(emp.basic_salary || 0) + Number(emp.current_month_bonuses || 0)
                                )}
                              </span>
                            </div>
                            {emp.current_month_remaining_balance != null &&
                              Number(emp.current_month_salary_payments || 0) > 0 && (
                              <div className="text-[10px] font-bold text-blue-700">
                                المتبقي: {formatCurrency(emp.current_month_remaining_balance)}
                              </div>
                            )}
                            {emp.latest_bonus_notes && Number(emp.current_month_bonuses || 0) > 0 && (
                              <span
                                className="text-[10px] text-slate-400 truncate max-w-[170px]"
                                title={cleanNotes(emp.latest_bonus_notes)}
                              >
                                {cleanNotes(emp.latest_bonus_notes)}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          {isCheckedIn && !isCheckedOut ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                              حاضر ({formatTime(emp.today_check_in)})
                            </span>
                          ) : isCheckedOut ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-600">
                              انصرف ({formatTime(emp.today_check_out)})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700">
                              لم يسجل بعد
                            </span>
                          )}

                          {canEditAttendance && (
                            <button
                              type="button"
                              onClick={() => handleToggleAttendance(emp)}
                              title={
                                isCheckedIn && !isCheckedOut
                                  ? 'تسجيل انصراف الآن'
                                  : isCheckedOut
                                  ? 'تم تسجيل اليوم'
                                  : 'تسجيل حضور الآن'
                              }
                              className={`p-1.5 rounded-lg border transition-all ${
                                isCheckedIn && !isCheckedOut
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  : isCheckedOut
                                  ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              {isCheckedIn && !isCheckedOut ? (
                                <LogOut className="w-3.5 h-3.5" />
                              ) : (
                                <LogIn className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          {canViewAttendance && (
                            <button
                              onClick={() => openAttendanceModal(emp)}
                              title="سجل الحضور والبصمة"
                              className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 transition-colors"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>
                          )}

                          {canEditAttendance && (
                            <button
                              onClick={() => openManualAttendance(emp)}
                              title="تسجيل حضور/انصراف يدوي"
                              className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                            >
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}

                          {(canViewPayroll || canCreateAdvance) && (
                            <button
                              onClick={() => openSummaryModal(emp, canCreateAdvance ? 'advance' : 'deduction')}
                              title={
                                canCreateAdvance && !canViewPayroll
                                  ? 'تسجيل سلفة مالية وسجل الحركات'
                                  : 'تسجيل سلفة / الحركات المالية'
                              }
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                            >
                              <DollarSign className="w-4 h-4" />
                            </button>
                          )}

                          {canViewPayroll && (
                            <button
                              onClick={() => openPayslipModal(emp)}
                              title="طباعة قسيمة الراتب (Payslip)"
                              className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                            >
                              <Receipt className="w-4 h-4" />
                            </button>
                          )}

                          {Boolean(isAdmin || hasPermission('reports.sales.view')) && (
                            <button
                              onClick={() => openSalesReportModal(emp)}
                              title="سجل مبيعات وعمولات الموظف"
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              <TrendingUp className="w-4 h-4" />
                            </button>
                          )}

                          {(isAdmin || canEditEmployee) && (
                            <button
                              onClick={() => {
                                setTransferEmp(emp);
                                setTargetBranchId(String(emp.branch_id));
                                setShowTransferModal(true);
                              }}
                              title="نقل إلى فرع آخر"
                              className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors"
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </button>
                          )}

                          {canEditEmployee && (
                            <button
                              onClick={() => handleOpenEdit(emp)}
                              title="تعديل بيانات الموظف"
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {(isAdmin || canEditEmployee) && (
                            <button
                              onClick={() => openDeactivateModal(emp)}
                              title="إنهاء عمل / إيقاف الموظف"
                              className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
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

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              صفحة {page} من {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                السابق
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Add / Edit Employee Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={isEditing ? 'تعديل بيانات موظف' : 'إضافة موظف جديد'}
        subtitle={isEditing ? 'تعديل بيانات وملف الموظف الحالي' : 'تسجيل موظف جديد وتحديد مواعيد ورتبته والفرع'}
        maxWidth="max-w-2xl"
        closeOnBackdropClick={false}
      >
        <form onSubmit={handleSaveEmployee} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                اسم الموظف *
              </label>
              <Input
                required
                placeholder="الاسم ثلاثي أو ثنائي"
                value={empForm.name}
                onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                رقم الهاتف
              </label>
              <Input
                placeholder="01xxxxxxxxx"
                value={empForm.phone}
                onChange={(e) => setEmpForm({ ...empForm, phone: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                المسمى الوظيفي
              </label>
              <Input
                placeholder="كاشير، بائع، ترزي، مدير فرع..."
                value={empForm.position}
                onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                الراتب الأساسي (ج.م)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={empForm.basic_salary}
                onChange={(e) => setEmpForm({ ...empForm, basic_salary: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                نسبة العمولة على المبيعات (%)
              </label>
              <Input
                type="number"
                min="0"
                max="100"
                step="any"
                placeholder="0"
                value={empForm.commission_rate}
                onChange={(e) => setEmpForm({ ...empForm, commission_rate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                الفرع الأساسي (للراتب) *
              </label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={empForm.branch_id}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmpForm((prev) => ({
                    ...prev,
                    branch_id: val,
                    branch_ids: prev.branch_scope === 'selected'
                      ? Array.from(new Set([Number(val), ...(prev.branch_ids || []).map(Number).filter(Boolean)]))
                      : prev.branch_ids,
                  }));
                }}
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id.toString()}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                بداية الوردية (حضور)
              </label>
              <Input
                type="time"
                value={empForm.shift_start}
                onChange={(e) => setEmpForm({ ...empForm, shift_start: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                نهاية الوردية (انصراف)
              </label>
              <Input
                type="time"
                value={empForm.shift_end}
                onChange={(e) => setEmpForm({ ...empForm, shift_end: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                تاريخ النزول / التعيين
              </label>
              <Input
                type="date"
                value={empForm.join_date || ''}
                onChange={(e) => setEmpForm({ ...empForm, join_date: e.target.value })}
              />
            </div>

            {isEditing && (
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  حالة الخدمة
                </label>
                <select
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  value={empForm.status || 'active'}
                  onChange={(e) => setEmpForm({ ...empForm, status: e.target.value })}
                >
                  <option value="active">على رأس العمل (نشط)</option>
                  <option value="inactive">منتهي خدمته (متوقف)</option>
                </select>
              </div>
            )}

            {isEditing && empForm.status === 'inactive' && (
              <div>
                <label className="block text-xs font-black text-rose-700 mb-1.5">
                  تاريخ ترك العمل
                </label>
                <Input
                  type="date"
                  value={empForm.end_date || ''}
                  onChange={(e) => setEmpForm({ ...empForm, end_date: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <div>
              <label className="block text-xs font-black text-slate-800 mb-1.5">
                نطاق الحضور والعمل عبر الفروع
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'single', label: 'الفرع الأساسي فقط' },
                  { id: 'selected', label: 'فروع محددة' },
                  { id: 'all', label: 'كل الفروع' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setEmpForm((prev) => ({
                        ...prev,
                        branch_scope: opt.id,
                        branch_ids: opt.id === 'selected'
                          ? Array.from(new Set([Number(prev.branch_id), ...(prev.branch_ids || []).map(Number).filter(Boolean)]))
                          : prev.branch_ids,
                      }))
                    }
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition-all ${
                      empForm.branch_scope === opt.id
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {empForm.branch_scope === 'selected' && (
              <div className="flex flex-wrap gap-2 pt-1">
                {branches.map((b) => {
                  const bId = Number(b.id);
                  const isPrimary = bId === Number(empForm.branch_id);
                  const isChecked = isPrimary || (empForm.branch_ids || []).map(Number).includes(bId);
                  return (
                    <label
                      key={b.id}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isPrimary}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEmpForm((prev) => {
                            const current = new Set((prev.branch_ids || []).map(Number).filter(Boolean));
                            if (checked) current.add(bId);
                            else if (!isPrimary) current.delete(bId);
                            return { ...prev, branch_ids: Array.from(current) };
                          });
                        }}
                        className="accent-slate-900"
                      />
                      <span>{b.name}</span>
                      {isPrimary && <span className="text-[10px] text-amber-700">(أساسي)</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] font-semibold text-slate-500">
              يستطيع الموظف تسجيل الحضور والانصراف من الفروع المسموحة هنا، بينما يظل احتساب راتبه مرتبطاً بالفرع الأساسي فقط.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAddModal(false)}
              disabled={submitting}
            >
              إلغاء
            </Button>
            <Button type="submit" variant="primary" isLoading={submitting}>
              {isEditing ? 'حفظ التعديلات' : 'إضافة الموظف'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Salary Password Authentication Modal */}
      <Modal
        isOpen={showSalaryAuthModal}
        onClose={() => {
          setShowSalaryAuthModal(false);
          setPendingAuthAction(null);
        }}
        title="تأكيد كلمة سر الرواتب"
        subtitle="هذا القسم محمي، يرجى إدخال كلمة سر الرواتب للمتابعة"
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmSalaryAuth} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              كلمة سر الرواتب *
            </label>
            <Input
              type="password"
              placeholder="••••••••"
              value={salaryAuthInput}
              onChange={(e) => {
                setSalaryAuthInput(e.target.value);
                setSalaryAuthError('');
              }}
              autoFocus
              required
            />
            {salaryAuthError && (
              <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{salaryAuthError}</span>
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSalaryAuthModal(false);
                setPendingAuthAction(null);
              }}
              disabled={salaryAuthLoading}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={salaryAuthLoading}
              icon={KeyRound}
            >
              تأكيد وإظهار
            </Button>
          </div>
        </form>
      </Modal>

      {/* Transfer Employee Modal */}
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="نقل الموظف إلى فرع آخر"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs font-bold text-slate-600">
            اختر الفرع الجديد لنقل الموظف <span className="text-slate-900 font-black">{transferEmp?.name}</span> إليه:
          </p>
          <select
            className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
            value={targetBranchId}
            onChange={(e) => setTargetBranchId(e.target.value)}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTransferModal(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleTransfer}>
              تأكيد النقل
            </Button>
          </div>
        </div>
      </Modal>

      {/* Attendance Modal */}
      <Modal
        isOpen={showAttendanceModal}
        onClose={() => setShowAttendanceModal(false)}
        title={`سجل حضور وانصراف: ${selectedEmp?.name || ''}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          {/* Quick toggle bar */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black text-slate-800">تسجيل بصمة اليوم</p>
              <p className="text-[11px] font-semibold text-slate-400">
                تسجيل الحضور أو الانصراف للوردية الحالية
              </p>
            </div>
            <Button
              variant={selectedEmp?.today_check_in && !selectedEmp?.today_check_out ? 'danger' : 'success'}
              icon={selectedEmp?.today_check_in && !selectedEmp?.today_check_out ? LogOut : LogIn}
              onClick={() => handleToggleAttendance(selectedEmp)}
            >
              {selectedEmp?.today_check_in && !selectedEmp?.today_check_out
                ? 'تسجيل انصراف الآن'
                : 'تسجيل حضور الآن'}
            </Button>
          </div>

          {/* Attendance History Table */}
          <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-2xl">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-black text-slate-700">التاريخ</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">وقت الحضور</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">وقت الانصراف</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">ساعات العمل</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">تأخير (دقيقة)</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingAttendance ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      جارِ تحميل السجل...
                    </td>
                  </tr>
                ) : attendanceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      لا يوجد سجلات حضور سابقة
                    </td>
                  </tr>
                ) : (
                  attendanceLogs.map((log, idx) => {
                    const rawDate = log.day || log.date || '';
                    const parsedDate = rawDate ? new Date(`${String(rawDate).slice(0, 10)}T12:00:00`) : null;
                    const formattedDate = parsedDate && !Number.isNaN(parsedDate.getTime())
                      ? parsedDate.toLocaleDateString('ar-EG-u-nu-latn')
                      : (rawDate || '-');
                    const statusLabelMap = {
                      present: 'حاضر',
                      completed: 'مكتمل',
                      absent: 'غائب',
                      leave: 'إجازة',
                      late: 'متأخر',
                      half_day: 'نصف يوم',
                    };
                    return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-800">
                        {formattedDate}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-600">
                        {formatTime(log.check_in_time || log.check_in)}
                      </td>
                      <td className="py-2.5 px-3 text-rose-600">
                        {formatTime(log.check_out_time || log.check_out)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {Number(log.total_hours) > 0 ? `${log.total_hours} س` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-amber-600">
                        {log.late_minutes ? `${log.late_minutes} د` : '0'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700">
                          {statusLabelMap[log.status] || log.status || 'مكتمل'}
                        </span>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Salary & Financial Transactions Modal */}
      {(() => {
        const isAdvanceMode = txForm.type === 'advance';
        const canDisplaySalaryDetails = Boolean(
          !isAdvanceMode &&
          canViewPayroll &&
          salaryVisible &&
          showSalaryInModal
        );
        const canDisplayPayrollBreakdown = Boolean(
          !isAdvanceMode &&
          canViewPayroll
        );
        const summaryColSpan = (canDisplaySalaryDetails ? 2 : 0) + 2 + (canDisplayPayrollBreakdown ? 3 : 0);

        const displayedDailySummary = isAdvanceMode
          ? (summaryData.daily_summary || []).filter((r) => Number(r.advances || 0) > 0)
          : (summaryData.daily_summary || []);

        const displayedMonthlySummary = isAdvanceMode
          ? (summaryData.monthly_summary || []).filter((r) => Number(r.advances || 0) > 0 || r.month === summaryData.month)
          : (summaryData.monthly_summary || []);

        const displayedTransactions = (summaryData.transactions || []).filter((tx) =>
          isAdvanceMode ? tx.type === 'advance' : true
        );

        return (
          <Modal
            isOpen={showSummaryModal}
            onClose={() => {
              setShowSummaryModal(false);
              setShowSalaryInModal(false);
            }}
            title={
              isAdvanceMode
                ? `تسجيل سلفة مالية وسجل السلف: ${summaryEmp?.name || ''}`
                : canDisplaySalaryDetails
                ? `الحركات المالية ومسير الراتب: ${summaryEmp?.name || ''}`
                : `الحركات المالية والمسحوبات: ${summaryEmp?.name || ''}`
            }
            maxWidth="max-w-4xl"
          >
            <div className="space-y-6">
              {/* Add transaction form */}
              {(canCreateAdvance || canExecutePayroll) && (
                <form onSubmit={handleSaveTransaction} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <p className="text-xs font-black text-slate-800">
                      {isAdvanceMode ? 'تسجيل سلفة مالية جديدة' : 'تسجيل حركة مالية جديدة'}
                    </p>
                    {isAdvanceMode && (
                      <span className="text-[11px] font-bold text-slate-500 bg-white border border-slate-200 px-2.5 py-0.5 rounded-lg">
                        🔒 بيانات الراتب الأساسي والمسير محجوبة أثناء قيد السلف
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">نوع الحركة</label>
                      <select
                        className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                        value={txForm.type}
                        onChange={(e) => handleTxTypeChange(e.target.value)}
                      >
                        {canCreateAdvance && <option value="advance">سلفة مالية</option>}
                        {canExecutePayroll && (
                          <>
                            <option value="deduction">خصم</option>
                            <option value="bonus">مكافأة</option>
                            <option value="salary_payment">تسديد / صرف راتب</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">المبلغ (ج.م)</label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="0.00"
                        value={txForm.amount}
                        onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">التاريخ</label>
                      <Input
                        type="date"
                        required
                        value={txForm.transaction_date}
                        onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 mb-1">البيان / ملاحظة</label>
                      <Input
                        placeholder="سبب السلفة أو المكافأة..."
                        value={txForm.notes}
                        onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                      />
                    </div>
                  </div>

                  {isMultiBranch && branches.length > 1 && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        الفرع / الدرج المصروف منه {txForm.type === 'advance' ? '*' : ''}
                      </label>
                      <select
                        className="w-full sm:w-72 h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                        value={txForm.branch_id || ''}
                        onChange={(e) => setTxForm((prev) => ({ ...prev, branch_id: e.target.value }))}
                        required={txForm.type === 'advance' || (txForm.type === 'salary_payment' && txForm.payment_method === 'cash' && txForm.paid_from_drawer)}
                      >
                        <option value="">-- اختر الفرع المصروف منه --</option>
                        {branches.map((b) => (
                          <option key={b.id} value={String(b.id)}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {txForm.type === 'salary_payment' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200/70">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">طريقة صرف الراتب</label>
                        <select
                          className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                          value={txForm.payment_method || 'cash'}
                          onChange={(e) => {
                            const m = e.target.value;
                            setTxForm((prev) => ({
                              ...prev,
                              payment_method: m,
                              paid_from_drawer: m === 'cash' ? prev.paid_from_drawer : false,
                            }));
                          }}
                        >
                          <option value="cash">نقدي (كاش)</option>
                          <option value="bank_transfer">انستاباي / تحويل بنكي</option>
                        </select>
                      </div>
                      {txForm.payment_method === 'cash' && (
                        <label className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs font-bold text-amber-900 cursor-pointer select-none self-end">
                          <input
                            type="checkbox"
                            checked={Boolean(txForm.paid_from_drawer)}
                            onChange={(e) => setTxForm((prev) => ({ ...prev, paid_from_drawer: e.target.checked }))}
                            className="w-4 h-4 accent-slate-900"
                          />
                          <span>خصم المبلغ من درج الكاشير اليومي بالفرع</span>
                        </label>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" variant="primary" size="sm">
                      {isAdvanceMode ? 'تأكيد وقيد السلفة' : 'تأكيد وقيد الحركة'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Tabs for Daily vs Monthly & Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSummaryTab('daily')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      activeSummaryTab === 'daily'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isAdvanceMode ? 'سجل السلف اليومي' : 'كشف الحساب اليومي'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSummaryTab('monthly')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      activeSummaryTab === 'monthly'
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isAdvanceMode ? 'سجل السلف الشهري' : 'كشف الحساب الشهري'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSummaryTab('transactions')}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                      activeSummaryTab === 'transactions'
                        ? 'bg-rose-700 text-white shadow-sm'
                        : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    }`}
                  >
                    {isAdvanceMode ? 'حذف / تفاصيل السلف' : 'تفاصيل الحركات (حذف)'} ({displayedTransactions.length})
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                    إجمالي سلف الشهر: {formatCurrency(summaryData.advances || 0)}
                  </span>

                  {canViewPayroll && !isAdvanceMode && (
                    <button
                      type="button"
                      onClick={() => {
                        if (canDisplaySalaryDetails) {
                          setShowSalaryInModal(false);
                        } else if (salaryVisible || user?.role === 'admin') {
                          setShowSalaryInModal(true);
                          if (!salaryVisible) setSalaryVisible(true);
                        } else {
                          setPendingAuthAction(() => (pwd) => {
                            setShowSalaryInModal(true);
                          });
                          setSalaryAuthInput('');
                          setSalaryAuthError('');
                          setShowSalaryAuthModal(true);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                        canDisplaySalaryDetails
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                      }`}
                      title={canDisplaySalaryDetails ? 'إخفاء أعمدة الراتب الأساسي والمسير' : 'عرض أعمدة الراتب الأساسي والمسير'}
                    >
                      {canDisplaySalaryDetails ? <EyeOff className="w-3.5 h-3.5 text-amber-700" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
                      <span>{canDisplaySalaryDetails ? 'إخفاء الراتب الأساسي' : 'عرض الراتب الأساسي'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
                {activeSummaryTab === 'transactions' ? (
                  <table className="w-full text-right border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 font-black text-slate-700">التاريخ</th>
                        <th className="py-2.5 px-3 font-black text-slate-700">النوع</th>
                        <th className="py-2.5 px-3 font-black text-slate-700">المبلغ</th>
                        <th className="py-2.5 px-3 font-black text-slate-700">طريقة الصرف</th>
                        <th className="py-2.5 px-3 font-black text-slate-700">الملاحظات</th>
                        <th className="py-2.5 px-3 font-black text-slate-700 text-center">حذف</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold">
                      {loadingSummary ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            جارِ تحميل تفاصيل الحركات...
                          </td>
                        </tr>
                      ) : displayedTransactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            {isAdvanceMode ? 'لا توجد سلف مسجلة لهذا الشهر' : 'لا توجد حركات مالية مسجلة لهذا الشهر'}
                          </td>
                        </tr>
                      ) : (
                        displayedTransactions.map((tx) => {
                          const canDeleteTx = tx.type === 'advance' ? canCreateAdvance : canExecutePayroll;
                          const typeBadge =
                            tx.type === 'advance'
                              ? { label: 'سلفة', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
                              : tx.type === 'bonus'
                              ? { label: 'مكافأة', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
                              : tx.type === 'deduction'
                              ? { label: 'خصم', cls: 'bg-rose-50 text-rose-800 border-rose-200' }
                              : { label: 'صرف راتب', cls: 'bg-blue-50 text-blue-800 border-blue-200' };
                          return (
                            <tr key={tx.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3 text-slate-800 font-black whitespace-nowrap">
                                {tx.transaction_date ? new Date(tx.transaction_date).toLocaleDateString('ar-EG-u-nu-latn') : '-'}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg border text-[11px] font-black ${typeBadge.cls}`}>
                                  {typeBadge.label}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-black text-slate-900 whitespace-nowrap">
                                {formatCurrency(tx.amount)}
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                                {tx.payment_method === 'bank_transfer'
                                  ? 'بنك / انستاباي'
                                  : tx.type === 'advance' || tx.paid_from_drawer
                                  ? 'كاش (من الدرج)'
                                  : 'كاش (خارج الدرج)'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={cleanNotes(tx.notes)}>
                                {cleanNotes(tx.notes) || '-'}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {canDeleteTx ? (
                                  <button
                                    type="button"
                                    disabled={deletingTxId === tx.id}
                                    onClick={() => handleDeleteTransaction(tx, 'summary')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 disabled:opacity-50"
                                    title="حذف الحركة نهائياً"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{deletingTxId === tx.id ? 'جارِ الحذف...' : 'حذف'}</span>
                                  </button>
                                ) : (
                                  <span className="text-slate-300 text-[11px]">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : (
                <table className="w-full text-right border-collapse text-xs">
                  <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-black text-slate-700">
                        {activeSummaryTab === 'daily' ? 'اليوم' : 'الشهر'}
                      </th>
                      {canDisplaySalaryDetails && (
                        <th className="py-2.5 px-3 font-black text-slate-700">الراتب الأساسي</th>
                      )}
                      <th className="py-2.5 px-3 font-black text-slate-700">
                        {isAdvanceMode ? 'مبلغ السلفة (-)' : 'السلف (-)'}
                      </th>
                      {canDisplayPayrollBreakdown && (
                        <>
                          <th className="py-2.5 px-3 font-black text-slate-700">المكافآت (+)</th>
                          <th className="py-2.5 px-3 font-black text-slate-700">الخصومات (-)</th>
                          <th className="py-2.5 px-3 font-black text-slate-700">المسدد (-)</th>
                        </>
                      )}
                      {canDisplaySalaryDetails && (
                        <th className="py-2.5 px-3 font-black text-slate-700">المتبقي الصافي</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-bold">
                    {loadingSummary ? (
                      <tr>
                        <td colSpan={summaryColSpan} className="py-8 text-center text-slate-400">
                          {isAdvanceMode ? 'جارِ تحميل سجل السلف...' : 'جارِ تحميل البيانات المالية...'}
                        </td>
                      </tr>
                    ) : (activeSummaryTab === 'daily' ? displayedDailySummary : displayedMonthlySummary).length === 0 ? (
                      <tr>
                        <td colSpan={summaryColSpan} className="py-8 text-center text-slate-400">
                          {isAdvanceMode ? 'لا توجد سلف مسجلة لهذا الموظف' : 'لا توجد حركات مالية مسجلة'}
                        </td>
                      </tr>
                    ) : (
                      (activeSummaryTab === 'daily' ? displayedDailySummary : displayedMonthlySummary).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-900 font-black">
                            {activeSummaryTab === 'daily'
                              ? new Date(row.day).toLocaleDateString('ar-EG-u-nu-latn')
                              : row.month}
                          </td>
                          {canDisplaySalaryDetails && (
                            <td className="py-2.5 px-3 text-slate-700">
                              {row.basic_salary != null ? formatCurrency(row.basic_salary) : '••••••'}
                            </td>
                          )}
                          <td className="py-2.5 px-3 text-amber-600 font-bold">{formatCurrency(row.advances)}</td>
                          {canDisplayPayrollBreakdown && (
                            <>
                              <td className="py-2.5 px-3 text-emerald-600">{formatCurrency(row.bonuses)}</td>
                              <td className="py-2.5 px-3 text-rose-600">{formatCurrency(row.deductions)}</td>
                              <td className="py-2.5 px-3 text-blue-600">{formatCurrency(row.salary_payments)}</td>
                            </>
                          )}
                          {canDisplaySalaryDetails && (
                            <td className="py-2.5 px-3 text-slate-900 font-black">
                              {row.remaining_salary != null ? formatCurrency(row.remaining_salary) : '••••••'}
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Deactivate / End of Service Modal */}
      <Modal
        isOpen={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        title={`إنهاء عمل / إيقاف موظف: ${deactivateEmp?.name || ''}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleConfirmDeactivate} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900 leading-relaxed">
            سيتم إيقاف الموظف وإلغاء حساب دخوله، مع <strong>الاحتفاظ بكامل سلفه وحضوره في مسير هذا الشهر</strong> وحساب أيام عمله حتى تاريخ ترك العمل، وسيختفي تلقائياً من الشهور التالية.
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">
              تاريخ ترك العمل (آخر يوم عمل) *
            </label>
            <Input
              type="date"
              required
              value={deactivateDate}
              onChange={(e) => setDeactivateDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDeactivateModal(false)}
              disabled={deactivating}
            >
              إلغاء
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={deactivating}
              className="!bg-rose-600 hover:!bg-rose-700"
            >
              تأكيد الإيقاف وحفظ التاريخ
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payslip & Monthly Settlement Modal */}
      <Modal
        isOpen={showPayslipModal}
        onClose={() => {
          setShowPayslipModal(false);
          setIsEditingPayslip(false);
          setQuickPayOpen(false);
        }}
        title={`قسيمة الراتب وتسوية الشهر: ${payslipEmp?.name || ''}`}
        maxWidth="max-w-2xl"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <Calendar className="w-4 h-4 text-slate-700" />
            <span>الشهر:</span>
            <input
              type="month"
              value={payslipMonth}
              onChange={(e) => {
                const m = e.target.value;
                if (m && payslipEmp) {
                  executeOpenPayslip(payslipEmp, salaryPassword || '', m);
                }
              }}
              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-900"
            />
            {payslipData?.has_saved_adjustment && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                تعديل محفوظ
              </span>
            )}
          </div>
          {payslipData && (
            <div className="text-[11px] font-bold text-slate-500">
              اليومية: <span className="font-black text-slate-900">{formatCurrency(payslipData.daily_rate)}</span> |
              الساعات المحققة: <span className="font-black text-indigo-700">{payslipData.actual_hours} س</span>
            </div>
          )}
        </div>

        {loadingPayslip ? (
          <div className="py-12 text-center text-slate-400 font-bold">جارِ تجهيز كشف الراتب...</div>
        ) : !livePayslipPreview ? (
          <div className="py-12 text-center text-slate-400 font-bold">لا تتوفر بيانات راتب لهذا الشهر</div>
        ) : (
          <div className="space-y-4">
            {/* Carryover Suggestion Banner */}
            {(payslipData?.carryover_suggestion?.suggested_old_advances > 0 || payslipData?.carryover_suggestion?.suggested_previous_dues > 0) &&
             Number(payslipAdjForm?.old_advances || 0) === 0 &&
             Number(payslipAdjForm?.previous_dues || 0) === 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-amber-900">
                  {payslipData.carryover_suggestion.suggested_old_advances > 0
                    ? `يوجد سالب / سوالف متبقية من شهر ${payslipData.carryover_suggestion.prev_month} بقيمة ${formatCurrency(payslipData.carryover_suggestion.suggested_old_advances)}`
                    : `يوجد مستحقات غير منصرفة من شهر ${payslipData.carryover_suggestion.prev_month} بقيمة ${formatCurrency(payslipData.carryover_suggestion.suggested_previous_dues)}`}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditingPayslip(true);
                    setPayslipAdjForm((prev) => ({
                      ...prev,
                      old_advances: payslipData.carryover_suggestion.suggested_old_advances > 0
                        ? String(payslipData.carryover_suggestion.suggested_old_advances)
                        : prev.old_advances,
                      previous_dues: payslipData.carryover_suggestion.suggested_previous_dues > 0
                        ? String(payslipData.carryover_suggestion.suggested_previous_dues)
                        : prev.previous_dues,
                    }));
                  }}
                  className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                >
                  ترحيل تلقائي للشهر الحالي
                </Button>
              </div>
            )}

            {isEditingPayslip && payslipAdjForm ? (
              <div className="p-4 rounded-2xl bg-amber-50/70 border-2 border-amber-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-2">
                  <div className="flex items-center gap-2 text-amber-900 font-black text-xs">
                    <Edit className="w-4 h-4 text-amber-600" />
                    <span>تعديل وحفظ بنود راتب شهر {payslipMonth}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetPayslipAdjustment}
                    disabled={savingPayslipAdj}
                    className="text-[11px] font-black text-amber-700 hover:text-amber-900 underline cursor-pointer"
                  >
                    استعادة الحساب التلقائي
                  </button>
                </div>

                {/* Group 0: Basic Salary Override for Month (or Permanent) */}
                <div className="p-3 rounded-xl bg-white border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
                  <div>
                    <label className="block text-slate-700 mb-1">الراتب الأساسي للشهر (ج.م):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.basic_salary_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, basic_salary_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-amber-300 bg-white font-black text-slate-900 text-left"
                    />
                    <span className="text-[10px] text-slate-500">
                      الراتب المسجل بملف الموظف: {formatCurrency(payslipData.employee_master_basic_salary ?? payslipData.basic_salary)}
                    </span>
                  </div>
                  {canEditEmployee && (
                    <div className="flex flex-col justify-end">
                      <label className="flex items-center gap-2 p-2 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer text-amber-900">
                        <input
                          type="checkbox"
                          checked={Boolean(payslipAdjForm.apply_basic_salary_to_employee)}
                          onChange={(e) => setPayslipAdjForm((p) => ({ ...p, apply_basic_salary_to_employee: e.target.checked }))}
                          className="w-4 h-4 accent-amber-700"
                        />
                        <span className="text-[11px] font-black">تحديث الراتب الأساسي الدائم للموظف بهذا المبلغ</span>
                      </label>
                    </div>
                  )}
                </div>

                {/* Group 1: Days & Leaves */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-bold">
                  <div>
                    <label className="block text-slate-700 mb-1">أيام العمل المستحقة:</label>
                    <input
                      type="number"
                      min="0"
                      max="31"
                      step="0.5"
                      value={payslipAdjForm.work_days}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, work_days: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-left"
                    />
                    <span className="text-[10px] text-slate-500">الافتراضي: {payslipData.default_work_days} يوم | حضور: {payslipData.attendance?.present_days || 0}</span>
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1">الإجازات المسموحة:</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={payslipAdjForm.allowed_leave_days}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, allowed_leave_days: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-left"
                    />
                    <span className="text-[10px] text-slate-500">الافتراضي: {payslipData.default_allowed_leave_days} يوم</span>
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1">الإجازات المأخوذة:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={payslipAdjForm.leave_days_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, leave_days_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-700 mb-1">أيام الغياب (2x):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={payslipAdjForm.absent_days_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, absent_days_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-bold text-rose-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 mb-1">أنصاف الأيام (0.5x):</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={payslipAdjForm.half_days_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, half_days_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-700 mb-1">أيام الجزاء (1x):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={payslipAdjForm.penalty_days}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, penalty_days: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-bold text-rose-800 text-left"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col justify-end">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-emerald-50 border border-emerald-200 cursor-pointer text-emerald-900">
                      <input
                        type="checkbox"
                        checked={Boolean(payslipAdjForm.include_unused_leave_payout)}
                        onChange={(e) => setPayslipAdjForm((p) => ({ ...p, include_unused_leave_payout: e.target.checked }))}
                        className="w-4 h-4 accent-emerald-700"
                      />
                      <span className="text-[11px] font-black">صرف بدل الإجازات غير المستنفدة (+1× اليومية)</span>
                    </label>
                  </div>
                </div>

                {/* Group 2: Variable Hours & Direct Overrides */}
                <div className="p-3 rounded-xl bg-white border border-amber-200 space-y-2.5 text-xs font-bold">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="text-slate-700 font-black">حساب الساعات المتغيرة:</span>
                    <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 font-black">
                      الساعات المحققة من الحضور: {payslipData.actual_hours} ساعة
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block text-slate-700 mb-1">الساعات المطلوبة:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={payslipAdjForm.required_hours}
                        onChange={(e) => setPayslipAdjForm((p) => ({ ...p, required_hours: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-indigo-300 bg-white font-bold text-indigo-900 text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-emerald-700 mb-1">أوفر تايم 1.35x (تعديل):</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={`تلقائي: ${livePayslipPreview.calc_overtime_amount ?? 0}`}
                        value={payslipAdjForm.overtime_amount_override}
                        onChange={(e) => setPayslipAdjForm((p) => ({ ...p, overtime_amount_override: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-bold text-emerald-800 text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-rose-700 mb-1">خصم تأخير 1.5x (تعديل):</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={`تلقائي: ${livePayslipPreview.calc_delay_deduction ?? 0}`}
                        value={payslipAdjForm.delay_deduction_override}
                        onChange={(e) => setPayslipAdjForm((p) => ({ ...p, delay_deduction_override: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-bold text-rose-800 text-left"
                      />
                    </div>
                    <div>
                      <label className="block text-emerald-700 mb-1">بدل إجازات (تعديل):</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="تلقائي"
                        value={payslipAdjForm.unused_leave_amount_override}
                        onChange={(e) => setPayslipAdjForm((p) => ({ ...p, unused_leave_amount_override: e.target.value }))}
                        className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-bold text-emerald-800 text-left"
                      />
                    </div>
                  </div>
                </div>

                {/* Group 3: Bonuses, Old Advances ("سوالف قديمة") & Deductions */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-bold">
                  <div>
                    <label className="block text-emerald-700 mb-1">مكافآت وبدلات (+):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.manual_bonuses_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, manual_bonuses_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-bold text-emerald-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-emerald-700 mb-1">بدل مواصلات (+):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.transportation_allowance}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, transportation_allowance: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-bold text-emerald-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-blue-700 mb-1">عمولات المبيعات (+):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.commissions}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, commissions: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-blue-300 bg-white font-bold text-blue-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-emerald-700 mb-1">مستحقات سابقة له (+):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.previous_dues}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, previous_dues: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-emerald-300 bg-white font-bold text-emerald-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-700 mb-1">سوالف قديمة عليه (-):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.old_advances}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, old_advances: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-bold text-rose-800 text-left"
                    />
                  </div>
                  <div>
                    <label className="block text-rose-700 mb-1">خصومات مالية إضافية (-):</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={payslipAdjForm.manual_deductions_override}
                      onChange={(e) => setPayslipAdjForm((p) => ({ ...p, manual_deductions_override: e.target.value }))}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-rose-300 bg-white font-bold text-rose-800 text-left"
                    />
                  </div>
                </div>

                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex justify-between items-center text-xs font-black text-emerald-900">
                  <span>المتبقي المحسوب بعد التعديل:</span>
                  <span className={`text-sm font-black ${livePayslipPreview.remaining_balance < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {formatCurrency(livePayslipPreview.remaining_balance)}
                  </span>
                </div>
              </div>
            ) : null}

            {/* Printable Area - Clean separated rows */}
            <div className={`p-6 rounded-2xl bg-white border-2 border-slate-200 space-y-4 ${isEditingPayslip ? 'opacity-50 pointer-events-none' : ''}`} id="payslip-print-area">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-slate-900">
                  كشف راتب شهري ({payslipMonth})
                </h3>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  الموظف: {payslipEmp?.name} | الوظيفة: {payslipEmp?.position || 'موظف'} | الفرع: {livePayslipPreview.employee?.branch_name || payslipEmp?.branch_name || 'الرئيسي'}
                </p>
                <p className="text-[11px] font-semibold text-slate-400">
                  أيام العمل: {livePayslipPreview.work_days} يوم | اليومية: {formatCurrency(livePayslipPreview.daily_rate)} | التاريخ: {new Date().toLocaleDateString('ar-EG-u-nu-latn')}
                </p>
              </div>

              <div className="space-y-2 text-xs font-bold">
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                  <span className="text-slate-600">
                    {livePayslipPreview.work_days === 30
                      ? 'الراتب الأساسي (30 يوم):'
                      : `استحقاق أيام العمل (${livePayslipPreview.work_days} يوم × ${formatCurrency(livePayslipPreview.daily_rate)} من أصل ${formatCurrency(livePayslipPreview.basic_salary)}):`}
                  </span>
                  <span className="text-slate-900">{formatCurrency(livePayslipPreview.earned_base_salary)}</span>
                </div>
                {Number(livePayslipPreview.unused_leave_amount || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-emerald-700">
                    <span>بدل إجازات غير مستنفدة ({livePayslipPreview.unused_leave_days} يوم +):</span>
                    <span>+{formatCurrency(livePayslipPreview.unused_leave_amount)}</span>
                  </div>
                )}
                {Number(livePayslipPreview.overtime_amount || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-emerald-700">
                    <span>إضافي / أوفر تايم ({livePayslipPreview.overtime_hours} س × 1.35 +):</span>
                    <span>+{formatCurrency(livePayslipPreview.overtime_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-emerald-600">
                  <span>المكافآت وبدل المواصلات (+):</span>
                  <span>{formatCurrency(Number(livePayslipPreview.bonuses || 0) + Number(livePayslipPreview.transportation_allowance || 0))}</span>
                </div>
                {Number(livePayslipPreview.commissions || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-blue-600">
                    <span>عمولات المبيعات (+):</span>
                    <span>{formatCurrency(livePayslipPreview.commissions)}</span>
                  </div>
                )}
                {Number(livePayslipPreview.previous_dues || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-emerald-700">
                    <span>مستحقات سابقة له (+):</span>
                    <span>{formatCurrency(livePayslipPreview.previous_dues)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-amber-600">
                  <span>السلف المسحوبة (-):</span>
                  <span>{formatCurrency(livePayslipPreview.advances)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-rose-600">
                  <div>
                    <span>الخصومات والجزاءات والغياب والتأخير (-):</span>
                    {(livePayslipPreview.attendance?.absence_deduction > 0 ||
                      livePayslipPreview.attendance?.leave_deduction > 0 ||
                      livePayslipPreview.attendance?.half_day_deduction > 0 ||
                      livePayslipPreview.delay_deduction > 0 ||
                      livePayslipPreview.penalty_days_amount > 0) && (
                      <div className="text-[10px] text-rose-400 font-semibold">
                        {[
                          livePayslipPreview.attendance?.absence_deduction > 0 ? `غياب (${livePayslipPreview.attendance.absent_days}ي): ${formatCurrency(livePayslipPreview.attendance.absence_deduction)}` : null,
                          livePayslipPreview.attendance?.leave_deduction > 0 ? `إجازات زائدة: ${formatCurrency(livePayslipPreview.attendance.leave_deduction)}` : null,
                          livePayslipPreview.attendance?.half_day_deduction > 0 ? `نص يوم: ${formatCurrency(livePayslipPreview.attendance.half_day_deduction)}` : null,
                          livePayslipPreview.penalty_days_amount > 0 ? `جزاء (${livePayslipPreview.penalty_days}ي): ${formatCurrency(livePayslipPreview.penalty_days_amount)}` : null,
                          livePayslipPreview.delay_deduction > 0 ? `تأخير (${livePayslipPreview.delay_hours}س × 1.5): ${formatCurrency(livePayslipPreview.delay_deduction)}` : null,
                        ].filter(Boolean).join(' | ')}
                      </div>
                    )}
                  </div>
                  <span>{formatCurrency(livePayslipPreview.deductions_without_advances ?? livePayslipPreview.deductions)}</span>
                </div>
                {Number(livePayslipPreview.old_advances || 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-rose-700">
                    <span>سوالف قديمة عليه (-):</span>
                    <span>{formatCurrency(livePayslipPreview.old_advances)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-slate-600">
                  <span>المدفوع مسبقاً (-):</span>
                  <span>{formatCurrency(livePayslipPreview.already_paid)}</span>
                </div>
                <div className="flex justify-between pt-3 text-sm font-black text-slate-900 border-t-2 border-slate-900">
                  <span>{livePayslipPreview.remaining_balance < 0 ? 'سوالف متبقية على الموظف:' : 'صافي المستحق للصرف:'}</span>
                  <span className={livePayslipPreview.remaining_balance < 0 ? 'text-rose-700' : 'text-emerald-700'}>
                    {formatCurrency(livePayslipPreview.remaining_balance)}
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Monthly Transactions List inside Payslip (Delete Advances / Bonuses / Deductions / Payments) */}
            {(() => {
              const fin = payslipData?.financials || {};
              const items = [
                ...(fin.advance_details || []).map((x) => ({ ...x, type: 'advance', label: 'سلفة', badge: 'bg-amber-50 text-amber-800 border-amber-200' })),
                ...(fin.bonus_details || []).map((x) => ({ ...x, type: 'bonus', label: 'مكافأة', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200' })),
                ...(fin.deduction_details || []).map((x) => ({ ...x, type: 'deduction', label: 'خصم', badge: 'bg-rose-50 text-rose-800 border-rose-200' })),
                ...(fin.salary_payment_details || []).map((x) => ({ ...x, type: 'salary_payment', label: 'صرف راتب', badge: 'bg-blue-50 text-blue-800 border-blue-200' })),
              ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
              if (items.length === 0) return null;
              return (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs print:hidden">
                  <div className="flex items-center justify-between font-black text-slate-800">
                    <span>تفاصيل سلف وحركات شهر {payslipMonth} ({items.length})</span>
                    <span className="text-[11px] font-bold text-slate-500">يمكن حذف أي حركة لإعادة الحساب تلقائياً</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/70 bg-white rounded-xl border border-slate-200">
                    {items.map((item) => {
                      const canDel = item.type === 'advance' ? canCreateAdvance : canExecutePayroll;
                      return (
                        <div key={`${item.type}_${item.id}`} className="flex items-center justify-between gap-2 px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black shrink-0 ${item.badge}`}>
                              {item.label}
                            </span>
                            <span className="font-black text-slate-900 whitespace-nowrap">{formatCurrency(item.amount)}</span>
                            <span className="text-[11px] text-slate-500 whitespace-nowrap">
                              {item.date ? new Date(item.date).toLocaleDateString('ar-EG-u-nu-latn') : ''}
                            </span>
                            {item.notes && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[160px]" title={cleanNotes(item.notes)}>
                                {cleanNotes(item.notes)}
                              </span>
                            )}
                          </div>
                          {canDel && (
                            <button
                              type="button"
                              disabled={deletingTxId === item.id}
                              onClick={() => handleDeleteTransaction(item, 'payslip')}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 shrink-0 disabled:opacity-50"
                              title="حذف الحركة"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>{deletingTxId === item.id ? '...' : 'حذف'}</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Quick Salary Payout Box */}
            {canExecutePayroll && quickPayOpen && !isEditingPayslip && (
              <form onSubmit={handleQuickSalaryPayout} className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3 text-xs">
                <div className="font-black text-emerald-900">تسديد وصرف الراتب وتحديد مصدر الفلوس</div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">المبلغ المصروف (ج.م)</label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      value={quickPayAmount}
                      onChange={(e) => setQuickPayAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">طريقة الصرف</label>
                    <select
                      className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                      value={quickPayMethod}
                      onChange={(e) => {
                        const m = e.target.value;
                        setQuickPayMethod(m);
                        if (m !== 'cash') setQuickPayFromDrawer(false);
                      }}
                    >
                      <option value="cash">نقدي (كاش)</option>
                      <option value="bank_transfer">انستاباي / تحويل بنكي</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">ملاحظة</label>
                    <Input
                      value={quickPayNotes}
                      onChange={(e) => setQuickPayNotes(e.target.value)}
                      placeholder="صرف راتب..."
                    />
                  </div>
                </div>
                {quickPayMethod === 'cash' && (
                  <label className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200 font-bold text-amber-900 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={quickPayFromDrawer}
                      onChange={(e) => setQuickPayFromDrawer(e.target.checked)}
                      className="w-4 h-4 accent-slate-900"
                    />
                    <span>خصم المبلغ من درج الكاشير اليومي بالفرع (يقلل صافي الدرج اليومي)</span>
                  </label>
                )}
                {isMultiBranch && branches.length > 1 && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      الفرع / الدرج المصروف منه {quickPayMethod === 'cash' && quickPayFromDrawer ? '*' : ''}
                    </label>
                    <select
                      className="w-full sm:w-72 h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                      value={quickPayBranchId || (activeBranchId && activeBranchId !== 'all' ? String(activeBranchId) : '')}
                      onChange={(e) => setQuickPayBranchId(e.target.value)}
                      required={quickPayMethod === 'cash' && quickPayFromDrawer}
                    >
                      <option value="">-- اختر الفرع المصروف منه --</option>
                      {branches.map((b) => (
                        <option key={b.id} value={String(b.id)}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setQuickPayOpen(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={quickPaySubmitting} className="!bg-emerald-700 hover:!bg-emerald-800">
                    تأكيد صرف الراتب
                  </Button>
                </div>
              </form>
            )}

            <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
              <div className="flex items-center gap-2">
                {canExecutePayroll && !isEditingPayslip && (
                  <Button
                    variant="outline"
                    icon={Edit}
                    onClick={() => setIsEditingPayslip(true)}
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                  >
                    تعديل وتسوية الراتب
                  </Button>
                )}
                {isEditingPayslip && (
                  <>
                    <Button
                      variant="primary"
                      icon={CheckCircle}
                      isLoading={savingPayslipAdj}
                      onClick={handleSavePayslipAdjustment}
                      className="!bg-emerald-700 hover:!bg-emerald-800"
                    >
                      حفظ التعديلات في النظام
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setPayslipAdjForm(buildAdjFormFromPayslip(payslipData));
                        setIsEditingPayslip(false);
                      }}
                      disabled={savingPayslipAdj}
                    >
                      إلغاء التعديل
                    </Button>
                  </>
                )}
                {canExecutePayroll && !isEditingPayslip && Number(livePayslipPreview.remaining_balance || 0) > 0 && (
                  <Button
                    variant="outline"
                    icon={DollarSign}
                    onClick={() => {
                      setQuickPayAmount(String(Math.max(0, Number(livePayslipPreview.remaining_balance || 0))));
                      setQuickPayOpen((v) => !v);
                    }}
                    className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  >
                    صرف المتبقي
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => {
                  setShowPayslipModal(false);
                  setIsEditingPayslip(false);
                  setQuickPayOpen(false);
                }}>
                  إغلاق
                </Button>
                <Button
                  variant="primary"
                  icon={Printer}
                  onClick={() => {
                    setIsEditingPayslip(false);
                    setTimeout(() => {
                      printElement('payslip-print-area', `كشف راتب - ${payslipEmp?.name || ''}`);
                    }, 50);
                  }}
                >
                  طباعة القسيمة
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Sales Report Modal */}
      <Modal
        isOpen={showSalesReportModal}
        onClose={() => setShowSalesReportModal(false)}
        title={`سجل مبيعات الموظف: ${salesReportEmp?.name || ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-bold text-slate-500 block">إجمالي قيمة المبيعات</span>
              <span className="text-lg font-black text-slate-900 block mt-0.5">
                {formatCurrency(salesReportData.total_sales)}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <span className="text-[11px] font-bold text-emerald-700 block">إجمالي العمولات المستحقة</span>
              <span className="text-lg font-black text-emerald-700 block mt-0.5">
                {formatCurrency(salesReportData.total_commission)}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-black text-slate-700">رقم الفاتورة</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">التاريخ</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">العميل</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">قيمة الفاتورة</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">العمولة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingSalesReport ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      جارِ تحميل سجل المبيعات...
                    </td>
                  </tr>
                ) : salesReportData.sales?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      لا توجد مبيعات مسجلة لهذا الموظف
                    </td>
                  </tr>
                ) : (
                  salesReportData.sales?.map((sale, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-900 font-black">#{sale.order_number || sale.id}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {new Date(sale.created_at || sale.order_date).toLocaleDateString('ar-EG-u-nu-latn')}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800">{sale.customer_name || 'عميل نقدي'}</td>
                      <td className="py-2.5 px-3 text-slate-900">{formatCurrency(sale.total_amount)}</td>
                      <td className="py-2.5 px-3 text-emerald-600 font-black">
                        {formatCurrency(sale.commission_amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Manual Attendance Modal */}
      <Modal
        isOpen={showManualAttendanceModal}
        onClose={() => setShowManualAttendanceModal(false)}
        title={`تسجيل حضور/انصراف يدوي: ${manualEmp?.name || ''}`}
        subtitle="تسجيل الحضور أو الانصراف لتاريخ أو وقت سابق"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveManualAttendance} className="space-y-4">
          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">التاريخ *</label>
            <Input
              type="date"
              required
              value={manualForm.date}
              onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">وقت الحضور</label>
              <Input
                type="time"
                value={manualForm.check_in}
                onChange={(e) => setManualForm({ ...manualForm, check_in: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                وقت الانصراف <span className="text-slate-400 font-normal">(اتركه فارغاً إذا لم ينصرف بعد)</span>
              </label>
              <Input
                type="time"
                value={manualForm.check_out}
                onChange={(e) => setManualForm({ ...manualForm, check_out: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">حالة اليوم</label>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={manualForm.status}
              onChange={(e) => setManualForm({ ...manualForm, status: e.target.value })}
            >
              <option value="present">حاضر (يوم عمل كامل)</option>
              <option value="half_day">نصف يوم</option>
              <option value="absent">غائب</option>
              <option value="late">متأخر</option>
              <option value="leave">إجازة رسمية / إذن</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-slate-700 mb-1.5">ملاحظات وسبب التعديل اليدوي</label>
            <Input
              placeholder="مثال: نسيان تسجيل البصمة، استئذان مسبق..."
              value={manualForm.notes}
              onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowManualAttendanceModal(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="primary" isLoading={manualSubmitting}>
              حفظ البصمة يدوياً
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default Employees;
