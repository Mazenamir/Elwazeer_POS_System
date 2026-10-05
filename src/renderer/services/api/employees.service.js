import api from './client';

export const employeesService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/employees${qs ? `?${qs}` : ''}`);
  },
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
  
  // Attendance
  getAttendance: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/attendance${qs ? `?${qs}` : ''}`);
  },
  recordAttendance: (data) => api.post('/attendance', data),
  
  // Payroll
  getPayroll: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/payroll${qs ? `?${qs}` : ''}`);
  },
  calculatePayroll: (data) => api.post('/payroll/calculate', data),
  disbursePayroll: (data) => api.post('/payroll/disburse', data),
};

export default employeesService;
