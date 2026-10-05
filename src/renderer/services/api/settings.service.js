import api from './client';

export const settingsService = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.post('/settings', data),
  getPublicSettings: () => api.get('/public/settings'),
  backupDatabase: () => api.get('/backup/export'),
  restoreDatabase: (formData) => api.post('/backup/restore', formData),
  getSyncStatus: () => api.get('/sync/ping'),
  triggerSync: () => api.post('/sync/apply'),
};

export default settingsService;
