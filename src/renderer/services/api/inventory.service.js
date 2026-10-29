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
  listTransferLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/inventory/transfers/logs${qs ? `?${qs}` : ''}`);
  },
  listTransferRequests: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/inventory/transfers/requests${qs ? `?${qs}` : ''}`);
  },
  listIncomingTransfers: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/inventory/transfers/incoming${qs ? `?${qs}` : ''}`);
  },
  approveTransfer: (id) => api.post(`/inventory/transfers/${id}/approve`),
  rejectTransfer: (id) => api.post(`/inventory/transfers/${id}/reject`),
  receiveTransfer: (id) => api.post(`/inventory/transfers/${id}/receive`),
  
  // Suppliers
  listSuppliers: () => api.get('/suppliers'),
  createSupplier: (data) => api.post('/suppliers', data),
  updateSupplier: (id, data) => api.put(`/suppliers/${id}`, data),
  deleteSupplier: (id) => api.delete(`/suppliers/${id}`),
};

export default inventoryService;
