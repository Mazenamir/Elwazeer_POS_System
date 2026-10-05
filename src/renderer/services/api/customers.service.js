import api from './client';

export const customersService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/customers${qs ? `?${qs}` : ''}`);
  },
  getById: (id) => api.get(`/customers/${id}`),
  create: (data) => api.post('/customers', data),
  update: (id, data) => api.put(`/customers/${id}`, data),
  delete: (id) => api.delete(`/customers/${id}`),
  getHistory: (id) => api.get(`/customers/${id}/history`),
};

export default customersService;
