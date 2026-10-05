import api from './client';

export const wornService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/worn-products${qs ? `?${qs}` : ''}`);
  },
  create: (data) => api.post('/worn-products', data),
  update: (id, data) => api.put(`/worn-products/${id}`, data),
  delete: (id) => api.delete(`/worn-products/${id}`),
};

export default wornService;
