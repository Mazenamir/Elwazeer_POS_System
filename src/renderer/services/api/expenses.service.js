import api from './client';

export const expensesService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/expenses${qs ? `?${qs}` : ''}`);
  },
  getSummary: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/expenses/summary${qs ? `?${qs}` : ''}`);
  },
  getCashiers: () => api.get('/expenses/cashiers'),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
};

export default expensesService;
