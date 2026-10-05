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
  getProfit: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/reports/profit${qs ? `?${qs}` : ''}`);
  },
  getDashboard: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/dashboard${qs ? `?${qs}` : ''}`);
  },
};

export default reportsService;
