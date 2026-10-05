import api from './client';

export const inventoryService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/inventory${qs ? `?${qs}` : ''}`);
  },
  getMetadata: () => api.get('/inventory/metadata'),
  getById: (id) => api.get(`/inventory/${id}`),
  create: (data) => api.post('/inventory', data),
  update: (id, data) => api.put(`/inventory/${id}`, data),
  delete: (id) => api.delete(`/inventory/${id}`),
  transferStock: (data) => api.post('/inventory/transfer', data),
  transferToRental: (data) => api.post('/inventory/transfer-to-rental', data),
  
  // Suppliers
  listSuppliers: () => api.get('/suppliers'),
  createSupplier: (data) => api.post('/suppliers', data),
  updateSupplier: (id, data) => api.put(`/suppliers/${id}`, data),
  deleteSupplier: (id) => api.delete(`/suppliers/${id}`),
};

export default inventoryService;
