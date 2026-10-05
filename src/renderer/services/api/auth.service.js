import api from './client';

export const authService = {
  checkSetup: () => api.get('/public/check-setup'),
  setup: (payload) => api.post('/public/setup', payload),
  login: (credentials) => api.post('/login', credentials),
  logout: () => api.post('/logout'),
  getMe: () => api.get('/me'),
  getPublicSettings: () => api.get('/public/settings'),
  getServerTime: () => api.get('/server-time'),
  verifyPassword: (password) => api.post('/verify-password', { password }),
  verifyInvoiceEditPassword: (password) => api.post('/verify-invoice-edit-password', { password }),
};

export default authService;
