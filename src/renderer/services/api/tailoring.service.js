import api from './client';

export const tailoringService = {
  // Tailoring Orders
  listTailoring: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/tailoring${qs ? `?${qs}` : ''}`);
  },
  createTailoring: (data) => api.post('/tailoring', data),
  updateTailoring: (id, data) => api.put(`/tailoring/${id}`, data),
  deleteTailoring: (id) => api.delete(`/tailoring/${id}`),

  // Alterations
  listAlterations: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/alterations${qs ? `?${qs}` : ''}`);
  },
  createAlteration: (data) => api.post('/alterations', data),
  updateAlteration: (id, data) => api.put(`/alterations/${id}`, data),
  deleteAlteration: (id) => api.delete(`/alterations/${id}`),
};

export default tailoringService;
