import api from './client';

export const rentalsService = {
  list: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/rentals${qs ? `?${qs}` : ''}`);
  },
  getById: (id) => api.get(`/rentals/${id}`),
  create: (data) => api.post('/rentals', data),
  updateStatus: (id, status, data = {}) => api.patch(`/rentals/${id}/status`, { status, ...data }),
  returnRental: (id, data) => api.put(`/rentals/${id}/return`, data),
  settlePayment: (id, data) => api.put(`/rentals/${id}/settle-payment`, data),
  convertToSale: (id, data) => api.post(`/rentals/${id}/convert-to-sale`, data),
  
  // Rental Inventory Items
  listInventory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/rental-inventory${qs ? `?${qs}` : ''}`);
  },
  createInventoryItem: (data) => api.post('/rental-inventory', data),
  updateInventoryItem: (id, data) => api.put(`/rental-inventory/${id}`, data),
  deleteInventoryItem: (id) => api.delete(`/rental-inventory/${id}`),
};

export default rentalsService;
