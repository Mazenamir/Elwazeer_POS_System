import authApi from '../api/auth.service';

export const authService = {
  ...authApi,
  getStoredUsername: () => localStorage.getItem('bebyoon_remembered_username') || '',
  setStoredUsername: (username) => {
    if (username) {
      localStorage.setItem('bebyoon_remembered_username', username);
    } else {
      localStorage.removeItem('bebyoon_remembered_username');
    }
  },
};

export default authService;
