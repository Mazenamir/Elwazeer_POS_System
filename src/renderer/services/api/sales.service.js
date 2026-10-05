import api from './client';

export const salesService = {
  listOrders: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return api.get(`/orders${qs ? `?${qs}` : ''}`);
  },
  getOrderById: (id) => api.get(`/orders/${id}`),
  createOrder: (data) => api.post('/orders', data),
  returnInvoice: (data) => api.post('/sales/return', data),
  getInvoiceDetails: (invoiceNumber) => api.get(`/sales/invoice/${invoiceNumber}`),
};

export default salesService;
