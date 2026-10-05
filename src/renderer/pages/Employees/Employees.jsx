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
import client from '../../api/client';
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
} from 'lucide-react';

export function Employees() {
  const { user } = useAuth();
  const { branches, activeBranchId, isMultiBranch } = useBranch();
  const { toast } = useToast();

  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterPosition, setFilterPosition] = useState('all');

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
    shift_start: '10:00',
    shift_end: '22:00',
    commission_rate: 0,
  });

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
  const [summaryEmp, setSummaryEmp] = useState(null);
  const [summaryData, setSummaryData] = useState({ daily_summary: [], monthly_summary: [] });
  const [activeSummaryTab, setActiveSummaryTab] = useState('daily');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [txForm, setTxForm] = useState({
    type: 'advance',
    amount: '',
    notes: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  // Payslip Modal
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [payslipEmp, setPayslipEmp] = useState(null);
  const [payslipData, setPayslipData] = useState(null);
  const [loadingPayslip, setLoadingPayslip] = useState(false);

  // Sales Report Modal
  const [showSalesReportModal, setShowSalesReportModal] = useState(false);
  const [salesReportEmp, setSalesReportEmp] = useState(null);
  const [salesReportData, setSalesReportData] = useState({ sales: [], total_sales: 0, total_commission: 0 });
  const [loadingSalesReport, setLoadingSalesReport] = useState(false);

  // Load Employees
  const loadEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await client.get('/employees');
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : Array.isArray(res?.employees) ? res.employees : [];
      setEmployees(list);
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تحميل بيانات الموظفين',
        variant: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (activeBranchId) {
      setFilterBranch(activeBranchId);
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
      if (filterBranch !== 'all' && String(emp.branch_id) !== String(filterBranch)) return false;
      if (filterPosition !== 'all' && emp.position !== filterPosition) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (emp.name || '').toLowerCase().includes(q);
        const matchesPhone = (emp.phone || '').includes(q);
        const matchesPos = (emp.position || '').toLowerCase().includes(q);
        return matchesName || matchesPhone || matchesPos;
      }
      return true;
    });
  }, [employees, filterBranch, filterPosition, search]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage) || 1;
  const paginatedEmployees = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, page]);

  // Salary Visibility & Authentication Handlers
  const handleToggleSalaryVisibility = () => {
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
      shift_start: '10:00',
      shift_end: '22:00',
      commission_rate: 0,
    });
    setShowAddModal(true);
  };

  const handleOpenEdit = (emp) => {
    setIsEditing(true);
    setEditingId(emp.id);
    setEmpForm({
      name: emp.name || '',
      phone: emp.phone || '',
      position: emp.position || '',
      basic_salary: emp.basic_salary || '',
      branch_id: String(emp.branch_id || (activeBranchId !== 'all' ? activeBranchId : branches[0]?.id) || '1'),
      shift_start: emp.shift_start ? emp.shift_start.slice(0, 5) : '10:00',
      shift_end: emp.shift_end ? emp.shift_end.slice(0, 5) : '22:00',
      commission_rate: emp.commission_rate || 0,
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
        shift_start: empForm.shift_start ? `${empForm.shift_start.slice(0, 5)}:00` : null,
        shift_end: empForm.shift_end ? `${empForm.shift_end.slice(0, 5)}:00` : null,
        commission_rate: Number(empForm.commission_rate || 0),
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

  // Delete Employee
  const handleDeleteEmployee = async (id, name) => {
    if (!window.confirm(`هل أنت متأكد من حذف الموظف "${name}"؟`)) return;
    try {
      await client.delete(`/employees/${id}`);
      toast({ title: 'تم الحذف', message: 'تم حذف الموظف بنجاح', variant: 'success' });
      loadEmployees();
    } catch (err) {
      toast({
        title: 'خطأ في الحذف',
        message: err.message || 'تعذر حذف الموظف لوجود سجلات مرتبطة',
        variant: 'danger',
      });
    }
  };

  // Quick Attendance Toggle
  const handleToggleAttendance = async (emp) => {
    try {
      const res = await client.post(`/employees/${emp.id}/attendance-toggle`, {});
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

  // Open Attendance Modal
  const openAttendanceModal = async (emp) => {
    setSelectedEmp(emp);
    setShowAttendanceModal(true);
    setLoadingAttendance(true);
    try {
      const res = await client.get(`/employees/${emp.id}/attendance-report`);
      setAttendanceLogs(res.data?.logs || (Array.isArray(res.data) ? res.data : []));
    } catch {
      setAttendanceLogs([]);
    } finally {
      setLoadingAttendance(false);
    }
  };

  // Open Manual Attendance Modal
  const openManualAttendance = (emp) => {
    setManualEmp(emp);
    setManualForm({
      date: new Date().toISOString().split('T')[0],
      status: emp.today_attendance_status || 'present',
      check_in: emp.today_check_in || emp.shift_start || '10:00',
      check_out: emp.today_check_out || '',
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
      await client.post(`/employees/${manualEmp.id}/attendance-manual`, manualForm);
      toast({ title: 'تم الحفظ', message: 'تم تسجيل الحضور اليدوي بنجاح', variant: 'success' });
      setShowManualAttendanceModal(false);
      loadEmployees();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'فشل تسجيل الحضور اليدوي', variant: 'danger' });
    } finally {
      setManualSubmitting(false);
    }
  };

  // Open Salary & Transactions Summary
  const openSummaryModal = (emp) => {
    const proceed = (pwd) => {
      executeOpenSummary(emp, pwd);
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

  const executeOpenSummary = async (emp, pwd) => {
    setSummaryEmp(emp);
    setShowSummaryModal(true);
    setLoadingSummary(true);
    setTxForm({
      type: 'advance',
      amount: '',
      notes: '',
      transaction_date: new Date().toISOString().split('T')[0],
      salary_password: pwd,
    });
    try {
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const res = await client.get(`/employees/${emp.id}/summary`, { headers });
      setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [] });
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'كلمة سر الرواتب غير صحيحة أو غير مصرح', variant: 'danger' });
      setSummaryData({ daily_summary: [], monthly_summary: [] });
      setShowSummaryModal(false);
    } finally {
      setLoadingSummary(false);
    }
  };

  // Save Financial Transaction
  const handleSaveTransaction = async (e) => {
    e.preventDefault();
    if (!txForm.amount || Number(txForm.amount) <= 0) {
      toast({ title: 'تنبيه', message: 'يرجى إدخال مبلغ صحيح', variant: 'warning' });
      return;
    }

    try {
      await client.post('/employee_transactions', {
        employee_id: summaryEmp.id,
        type: txForm.type,
        amount: Number(txForm.amount),
        notes: txForm.notes.trim() || null,
        transaction_date: txForm.transaction_date,
      });

      toast({ title: 'تم الحفظ', message: 'تم تسجيل الحركة المالية بنجاح', variant: 'success' });
      setTxForm((prev) => ({ ...prev, amount: '', notes: '' }));
      // Reload summary
      const headers = txForm.salary_password ? { 'x-salary-password': txForm.salary_password } : {};
      const res = await client.get(`/employees/${summaryEmp.id}/summary`, { headers });
      setSummaryData(res?.data || res || { daily_summary: [], monthly_summary: [] });
    } catch (err) {
      toast({
        title: 'خطأ',
        message: err.message || 'تعذر تسجيل الحركة المالية',
        variant: 'danger',
      });
    }
  };

  // Open Payslip
  const openPayslipModal = (emp) => {
    const proceed = (pwd) => {
      executeOpenPayslip(emp, pwd);
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

  const executeOpenPayslip = async (emp, pwd) => {
    setPayslipEmp(emp);
    setShowPayslipModal(true);
    setLoadingPayslip(true);
    try {
      const headers = pwd ? { 'x-salary-password': pwd } : {};
      const res = await client.get(`/employees/${emp.id}/payslip`, { headers });
      setPayslipData(res?.data || res);
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'كلمة سر الرواتب غير صحيحة أو غير مصرح', variant: 'danger' });
      setPayslipData(null);
      setShowPayslipModal(false);
    } finally {
      setLoadingPayslip(false);
    }
  };

  // Open Sales Report
  const openSalesReportModal = async (emp) => {
    setSalesReportEmp(emp);
    setShowSalesReportModal(true);
    setLoadingSalesReport(true);
    try {
      const res = await client.get(`/employees/${emp.id}/sales-report`);
      setSalesReportData(res.data || { sales: [], total_sales: 0, total_commission: 0 });
    } catch {
      setSalesReportData({ sales: [], total_sales: 0, total_commission: 0 });
    } finally {
      setLoadingSalesReport(false);
    }
  };

  // Transfer Employee
  const handleTransfer = async () => {
    if (!targetBranchId) return;
    try {
      await client.post(`/employees/${transferEmp.id}/transfer`, {
        target_branch_id: Number(targetBranchId),
      });
      toast({ title: 'تم النقل', message: 'تم نقل الموظف للفرع الجديد بنجاح', variant: 'success' });
      setShowTransferModal(false);
      loadEmployees();
    } catch (err) {
      toast({ title: 'خطأ', message: err.message || 'تعذر نقل الموظف', variant: 'danger' });
    }
  };

  const formatCurrency = (val) => {
    return `${Number(val || 0).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} ج.م`;
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                الموظفين والموارد البشرية (HR)
              </h1>
              <p className="text-sm font-semibold text-slate-500 mt-0.5">
                سجل الموظفين، الحضور والانصراف، المرتبات، السلف والعمولات
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            icon={salaryVisible ? EyeOff : Eye}
            onClick={handleToggleSalaryVisibility}
          >
            {salaryVisible ? 'إخفاء الرواتب' : 'إظهار الرواتب'}
          </Button>
          <Button variant="primary" icon={Plus} onClick={handleOpenAdd}>
            إضافة موظف جديد
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      </div>

      {/* Filter Bar */}
      <Card>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={filterBranch}
              onChange={(e) => {
                setFilterBranch(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">كل الفروع</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
              <tr className="bg-slate-900 text-white text-xs font-black">
                <th className="py-3.5 px-4">الموظف</th>
                <th className="py-3.5 px-4">رقم الهاتف</th>
                <th className="py-3.5 px-4">الوظيفة</th>
                <th className="py-3.5 px-4">مواعيد الوردية</th>
                <th className="py-3.5 px-4">الفرع</th>
                <th className="py-3.5 px-4">
                  <div className="flex items-center gap-1.5">
                    <span>الراتب الأساسي</span>
                    <button
                      type="button"
                      onClick={handleToggleSalaryVisibility}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      title={salaryVisible ? 'إخفاء الرواتب' : 'إظهار الرواتب'}
                    >
                      {salaryVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </th>
                <th className="py-3.5 px-4">حالة حضور اليوم</th>
                <th className="py-3.5 px-4 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-bold">
                    جارِ تحميل بيانات الموظفين...
                  </td>
                </tr>
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400 font-bold">
                    <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                    لا يوجد موظفون مطابقون لبيانات البحث
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const isCheckedIn = Boolean(emp.today_check_in);
                  const isCheckedOut = Boolean(emp.today_check_out);

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center font-black text-sm shrink-0">
                            {(emp.name || 'م')[0]}
                          </div>
                          <div>
                            <div className="font-black text-slate-900">{emp.name}</div>
                            {emp.commission_rate > 0 && (
                              <div className="text-[11px] font-bold text-emerald-600">
                                عمولة: {emp.commission_rate}%
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-600">
                        {emp.phone ? (
                          <span className="dir-ltr text-xs font-mono">{emp.phone}</span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700">
                          {emp.position || 'موظف'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatTime(emp.shift_start)}</span>
                          <span>-</span>
                          <span>{formatTime(emp.shift_end)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-800">
                        {emp.branch_name || 'الفرع الرئيسي'}
                      </td>

                      <td className="py-3.5 px-4 font-black text-slate-900 whitespace-nowrap">
                        {salaryVisible ? formatCurrency(emp.basic_salary) : '••••••'}
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
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAttendanceModal(emp)}
                            title="سجل الحضور والبصمة"
                            className="p-1.5 rounded-lg text-cyan-600 hover:bg-cyan-50 transition-colors"
                          >
                            <Calendar className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openManualAttendance(emp)}
                            title="تسجيل حضور/انصراف يدوي"
                            className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50 transition-colors"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openSummaryModal(emp)}
                            title="الحركات المالية وكشف الراتب"
                            className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors"
                          >
                            <DollarSign className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openPayslipModal(emp)}
                            title="طباعة قسيمة الراتب (Payslip)"
                            className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            <Receipt className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => openSalesReportModal(emp)}
                            title="سجل مبيعات وعمولات الموظف"
                            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                          >
                            <TrendingUp className="w-4 h-4" />
                          </button>

                          {user?.role === 'admin' && (
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

                          <button
                            onClick={() => handleOpenEdit(emp)}
                            title="تعديل بيانات الموظف"
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteEmployee(emp.id, emp.name)}
                            title="حذف الموظف"
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
                step="0.1"
                placeholder="0"
                value={empForm.commission_rate}
                onChange={(e) => setEmpForm({ ...empForm, commission_rate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-black text-slate-700 mb-1.5">
                الفرع *
              </label>
              <select
                className="w-full h-11 px-3.5 rounded-xl border border-slate-200 bg-white font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                value={empForm.branch_id}
                onChange={(e) => setEmpForm({ ...empForm, branch_id: e.target.value })}
                required
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
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
                  attendanceLogs.map((log, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-800">
                        {new Date(log.date || log.check_in).toLocaleDateString('ar-EG-u-nu-latn')}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-600">
                        {formatTime(log.check_in_time || log.check_in)}
                      </td>
                      <td className="py-2.5 px-3 text-rose-600">
                        {formatTime(log.check_out_time || log.check_out)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {log.total_hours ? `${log.total_hours} س` : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-amber-600">
                        {log.late_minutes ? `${log.late_minutes} د` : '0'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-100 text-slate-700">
                          {log.status === 'present' ? 'حاضر' : log.status || 'مكتمل'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Salary & Financial Transactions Modal */}
      <Modal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        title={`الحركات المالية ومسير الراتب: ${summaryEmp?.name || ''}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-6">
          {/* Add transaction form */}
          <form onSubmit={handleSaveTransaction} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
            <p className="text-xs font-black text-slate-800">تسجيل حركة مالية جديدة</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">نوع الحركة</label>
                <select
                  className="w-full h-10 px-2.5 rounded-xl border border-slate-200 bg-white font-bold text-xs"
                  value={txForm.type}
                  onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
                >
                  <option value="advance">سلفة مالية</option>
                  <option value="deduction">خصم</option>
                  <option value="bonus">مكافأة</option>
                  <option value="salary_payment">تسديد / صرف راتب</option>
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

            <div className="flex justify-end">
              <Button type="submit" variant="primary" size="sm">
                تأكيد وقيد الحركة
              </Button>
            </div>
          </form>

          {/* Tabs for Daily vs Monthly */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveSummaryTab('daily')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeSummaryTab === 'daily'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              كشف الحساب اليومي
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
              كشف الحساب الشهري
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-80 border border-slate-200 rounded-2xl">
            <table className="w-full text-right border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-black text-slate-700">
                    {activeSummaryTab === 'daily' ? 'اليوم' : 'الشهر'}
                  </th>
                  <th className="py-2.5 px-3 font-black text-slate-700">الراتب الأساسي</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">المكافآت (+)</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">السلف (-)</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">الخصومات (-)</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">المسدد (-)</th>
                  <th className="py-2.5 px-3 font-black text-slate-700">المتبقي الصافي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold">
                {loadingSummary ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      جارِ تحميل البيانات المالية...
                    </td>
                  </tr>
                ) : (activeSummaryTab === 'daily'
                    ? summaryData.daily_summary
                    : summaryData.monthly_summary
                  )?.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      لا توجد حركات مالية مسجلة
                    </td>
                  </tr>
                ) : (
                  (activeSummaryTab === 'daily'
                    ? summaryData.daily_summary
                    : summaryData.monthly_summary
                  ).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-900 font-black">
                        {activeSummaryTab === 'daily'
                          ? new Date(row.day).toLocaleDateString('ar-EG-u-nu-latn')
                          : row.month}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{formatCurrency(row.basic_salary)}</td>
                      <td className="py-2.5 px-3 text-emerald-600">{formatCurrency(row.bonuses)}</td>
                      <td className="py-2.5 px-3 text-amber-600">{formatCurrency(row.advances)}</td>
                      <td className="py-2.5 px-3 text-rose-600">{formatCurrency(row.deductions)}</td>
                      <td className="py-2.5 px-3 text-blue-600">{formatCurrency(row.salary_payments)}</td>
                      <td className="py-2.5 px-3 text-slate-900 font-black">
                        {formatCurrency(row.remaining_salary)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      {/* Payslip Modal */}
      <Modal
        isOpen={showPayslipModal}
        onClose={() => setShowPayslipModal(false)}
        title={`قسيمة الراتب (Payslip): ${payslipEmp?.name || ''}`}
        maxWidth="max-w-xl"
      >
        {loadingPayslip ? (
          <div className="py-12 text-center text-slate-400 font-bold">جارِ تجهيز كشف الراتب...</div>
        ) : !payslipData ? (
          <div className="py-12 text-center text-slate-400 font-bold">لا تتوفر بيانات راتب لهذا الشهر</div>
        ) : (
          <div className="space-y-4">
            <div className="p-6 rounded-2xl bg-white border-2 border-slate-200 space-y-4" id="payslip-print-area">
              <div className="text-center border-b border-slate-100 pb-3">
                <h3 className="text-lg font-black text-slate-900">مركز الببيون - كشف راتب شهري</h3>
                <p className="text-xs font-bold text-slate-500 mt-1">
                  الموظف: {payslipEmp?.name} | الوظيفة: {payslipEmp?.position || 'موظف'}
                </p>
                <p className="text-[11px] font-semibold text-slate-400">
                  الفرع: {payslipEmp?.branch_name || 'الرئيسي'} | التاريخ: {new Date().toLocaleDateString('ar-EG-u-nu-latn')}
                </p>
              </div>

              <div className="space-y-2 text-xs font-bold">
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100">
                  <span className="text-slate-500">الراتب الأساسي:</span>
                  <span className="text-slate-900">{formatCurrency(payslipData.basic_salary)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-emerald-600">
                  <span>المكافآت والبدلات (+):</span>
                  <span>{formatCurrency(payslipData.bonuses)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-blue-600">
                  <span>عمولات المبيعات (+):</span>
                  <span>{formatCurrency(payslipData.commissions)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-amber-600">
                  <span>السلف المسحوبة (-):</span>
                  <span>{formatCurrency(payslipData.advances)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-rose-600">
                  <span>الخصومات والجزاءات (-):</span>
                  <span>{formatCurrency(payslipData.deductions)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-dashed border-slate-100 text-slate-600">
                  <span>المدفوع مسبقاً (-):</span>
                  <span>{formatCurrency(payslipData.already_paid)}</span>
                </div>
                <div className="flex justify-between pt-3 text-sm font-black text-slate-900 border-t-2 border-slate-900">
                  <span>صافي المستحق للصرف:</span>
                  <span>{formatCurrency(payslipData.net_salary)}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPayslipModal(false)}>
                إغلاق
              </Button>
              <Button variant="primary" icon={Printer} onClick={() => window.print()}>
                طباعة القسيمة
              </Button>
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
