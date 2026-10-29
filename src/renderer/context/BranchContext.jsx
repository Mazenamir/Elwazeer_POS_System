import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api/client';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [branches, setBranches] = useState([]);
  const [activeBranchId, setActiveBranchId] = useState(() => {
    if (user && user.role !== 'admin' && user?.branch_id) {
      return user.branch_id.toString();
    }
    return localStorage.getItem('bebyoon_active_branch_id') || 'all';
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin' && user?.branch_id) {
      const bId = user.branch_id.toString();
      setActiveBranchId(bId);
      localStorage.setItem('bebyoon_active_branch_id', bId);
    }
  }, [user]);

  const fetchBranches = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      const data = await api.get('/branches');
      if (Array.isArray(data)) {
        setBranches(data);

        // If user is branch-scoped (any non-admin account), strictly lock to their assigned branch
        if (user && user.role !== 'admin' && user?.branch_id) {
          setActiveBranchId(user.branch_id.toString());
          localStorage.setItem('bebyoon_active_branch_id', user.branch_id.toString());
        } else {
          const savedBranchId = localStorage.getItem('bebyoon_active_branch_id');
          if (savedBranchId && savedBranchId !== 'all') {
            const exists = data.some((b) => b.id.toString() === savedBranchId.toString());
            if (!exists) {
              setActiveBranchId('all');
              localStorage.setItem('bebyoon_active_branch_id', 'all');
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch branches:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const selectBranch = (branchId) => {
    if (user && user.role !== 'admin' && user?.branch_id) {
      return;
    }
    setActiveBranchId(branchId);
    localStorage.setItem('bebyoon_active_branch_id', branchId);
  };

  const activeBranch = branches.find((b) => b.id.toString() === activeBranchId.toString()) || null;

  return (
    <BranchContext.Provider
      value={{
        branches,
        activeBranchId,
        currentBranchId: activeBranchId,
        activeBranch,
        isMultiBranch: branches.length > 1,
        selectBranch,
        fetchBranches,
        reloadBranches: fetchBranches,
        loading,
      }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
}

export default BranchContext;
