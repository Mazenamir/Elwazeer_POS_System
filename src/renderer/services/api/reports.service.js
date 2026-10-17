import api from './client';

export const reportsService = {
  getSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/summary${qs ? `?${qs}` : ''}`);
  },
  getSales: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/sales${qs ? `?${qs}` : ''}`);
  },
  getRentals: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/rentals${qs ? `?${qs}` : ''}`);
  },
  getExpenses: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/expenses${qs ? `?${qs}` : ''}`);
  },
  getInventory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/inventory${qs ? `?${qs}` : ''}`);
  },
  getProfit: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/profit${qs ? `?${qs}` : ''}`);
  },
  getDashboard: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/dashboard${qs ? `?${qs}` : ''}`);
  },
  getDailyHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/daily-history${qs ? `?${qs}` : ''}`);
  },
  getMonthlyHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/monthly-history${qs ? `?${qs}` : ''}`);
  },
  getTopProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/top-products${qs ? `?${qs}` : ''}`);
  },
  getDailyReport: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/daily${qs ? `?${qs}` : ''}`);
  },
  exportExcel: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/export/excel${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
  },
  exportPdfHtml: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/export/pdf-html${qs ? `?${qs}` : ''}`);
  },
};

export default reportsService;
