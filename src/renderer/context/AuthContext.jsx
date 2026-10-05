import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { registerUnauthorizedHandler } from '../services/api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      // First check if initial system setup is required
      const setupStatus = await api.get('/public/check-setup');
      if (setupStatus?.needsSetup || setupStatus?.setupRequired) {
        setSetupRequired(true);
        setLoading(false);
        return;
      }
      setSetupRequired(false);

      // Verify current authenticated session
      const userData = await api.get('/me');
      setUser(userData?.user || userData);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    // Hook API unauthorized interceptor
    registerUnauthorizedHandler(() => {
      setUser(null);
    });
  }, [checkAuth]);

  const login = async (username, password) => {
    const res = await api.post('/login', { username, password });
    if (res?.user) {
      setUser(res.user);
    } else {
      // Re-fetch user profile
      const userData = await api.get('/me');
      setUser(userData?.user || userData);
    }
    return res;
  };

  const logout = async () => {
    try {
      await api.post('/logout');
    } catch {}
    setUser(null);
    window.location.href = '/login';
  };

  const hasPermission = (perm) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    let perms = user.permissions;
    if (typeof perms === 'string') {
      try {
        perms = JSON.parse(perms);
      } catch {
        perms = [];
      }
    }
    if (Array.isArray(perms)) {
      return perms.includes(perm);
    }
    return false;
  };

  const value = {
    user,
    setUser,
    loading,
    isAuthenticated: !!user,
    setupRequired,
    setSetupRequired,
    login,
    logout,
    checkAuth,
    hasPermission,
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
