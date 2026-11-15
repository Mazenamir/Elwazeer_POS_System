import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api/client';
import { useAuth } from './AuthContext';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  // Compute allowed branch IDs set for the current user
  const userAllowedBranchIds = React.useMemo(() => {
    if (!user || user.role === 'admin' || user.branch_scope === 'all' || user.role === 'accountant' || /^(acct|hesabat|accountant|حسابات)/i.test(user?.username || '')) return null;
    const ids = new Set();
    if (user.branch_id) ids.add(Number(user.branch_id));
    if (user.branch_scope === 'selected' && Array.isArray(user.branch_ids)) {
      user.branch_ids.forEach((id) => ids.add(Number(id)));
    }
    return ids;
  }, [user]);

  // Filter accessible branches based on user's branch scope
  const accessibleBranches = React.useMemo(() => {
    if (!userAllowedBranchIds) return branches;
    return branches.filter((b) => userAllowedBranchIds.has(Number(b.id)));
  }, [branches, userAllowedBranchIds]);

  const [activeBranchId, setActiveBranchId] = useState(() => {
    if (user && user.role !== 'admin') {
      if (user.branch_scope === 'all' || user.role === 'accountant') {
        return localStorage.getItem('bebyoon_active_branch_id') || 'all';
      }
      if (user.branch_scope === 'selected') {
        const saved = localStorage.getItem('bebyoon_active_branch_id');
        if (saved === 'all') {
          return 'all';
        }
        if (saved && saved !== 'all') {
          const numSaved = Number(saved);
          if (user.branch_ids?.includes(numSaved) || Number(user.branch_id) === numSaved) {
            return saved;
          }
        }
        return user.branch_id ? user.branch_id.toString() : (user.branch_ids?.[0]?.toString() || 'all');
      }
      if (user.branch_scope !== 'all' && user.branch_id) {
        return user.branch_id.toString();
      }
    }
    return localStorage.getItem('bebyoon_active_branch_id') || 'all';
  });

  useEffect(() => {
    if (!user) return;
    const prevUserId = localStorage.getItem('bebyoon_active_branch_user_id');
    const isNewUser = prevUserId !== String(user.id);
    if (isNewUser) {
      localStorage.setItem('bebyoon_active_branch_user_id', String(user.id));
    }

    const isAllScopeUser = user.role === 'admin' || user.branch_scope === 'all' || user.role === 'accountant' || /^(acct|hesabat|accountant|حسابات)/i.test(user?.username || '');

    if (isAllScopeUser) {
      const saved = localStorage.getItem('bebyoon_active_branch_id');
      if (isNewUser || !saved) {
        setActiveBranchId('all');
        localStorage.setItem('bebyoon_active_branch_id', 'all');
      }
    } else if (user.branch_scope === 'selected') {
      const saved = localStorage.getItem('bebyoon_active_branch_id');
      if (saved === 'all') {
        setActiveBranchId('all');
      } else {
        const numSaved = Number(saved);
        const isAllowed = saved && (user.branch_ids?.includes(numSaved) || Number(user.branch_id) === numSaved);
        if (!isAllowed) {
          const fallback = user.branch_id ? user.branch_id.toString() : (user.branch_ids?.[0]?.toString() || 'all');
          setActiveBranchId(fallback);
          localStorage.setItem('bebyoon_active_branch_id', fallback);
        }
      }
    } else if (user.branch_scope !== 'all' && user.branch_id) {
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

        if (user && user.role !== 'admin') {
          if (user.branch_scope === 'all' || user.role === 'accountant') {
            const savedBranchId = localStorage.getItem('bebyoon_active_branch_id');
            if (savedBranchId && savedBranchId !== 'all') {
              const exists = data.some((b) => b.id.toString() === savedBranchId.toString());
              if (!exists) {
                setActiveBranchId('all');
                localStorage.setItem('bebyoon_active_branch_id', 'all');
              }
            }
          } else if (user.branch_scope === 'selected') {
            const savedBranchId = localStorage.getItem('bebyoon_active_branch_id');
            if (savedBranchId === 'all') {
              setActiveBranchId('all');
            } else {
              const numSaved = Number(savedBranchId);
              const isAllowed = savedBranchId && (user.branch_ids?.includes(numSaved) || Number(user.branch_id) === numSaved);
              if (!isAllowed) {
                const fallback = user.branch_id ? user.branch_id.toString() : (user.branch_ids?.[0]?.toString() || 'all');
                setActiveBranchId(fallback);
                localStorage.setItem('bebyoon_active_branch_id', fallback);
              }
            }
          } else if (user.branch_scope !== 'all' && user.branch_id) {
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

  const hasAllBranchesAccess = Boolean(
    user && (
      user.role === 'admin' ||
      user.branch_scope === 'all' ||
      user.role === 'accountant' ||
      /^(acct|hesabat|accountant|حسابات)/i.test(user?.username || '') ||
      (user.branch_scope === 'selected' && Array.isArray(user.branch_ids) && branches.length > 0 && branches.every((b) => user.branch_ids.includes(Number(b.id))))
    )
  );

  const canSwitchBranches = Boolean(
    hasAllBranchesAccess ||
    (user?.branch_scope === 'selected' && accessibleBranches.length > 1) ||
    user?.role === 'accountant'
  );

  const selectBranch = (branchId) => {
    if (user && user.role !== 'admin' && !hasAllBranchesAccess) {
      if (!user.branch_scope || user.branch_scope === 'single') {
        return; // single scope user without all-branch access cannot switch branches
      }
      if (user.branch_scope === 'selected') {
        if (branchId !== 'all') {
          const numId = Number(branchId);
          if (!userAllowedBranchIds?.has(numId)) return;
        }
      }
    }
    setActiveBranchId(branchId);
    localStorage.setItem('bebyoon_active_branch_id', branchId);
  };

  const activeBranch = branches.find((b) => b.id.toString() === activeBranchId.toString()) || null;
  const rentalsEnabled = activeBranch
    ? (activeBranch.rentals_enabled !== false && activeBranch.rentals_enabled !== 0)
    : true;

  return (
    <BranchContext.Provider
      value={{
        branches: accessibleBranches,
        allBranches: branches,
        activeBranchId,
        currentBranchId: activeBranchId,
        activeBranch,
        rentalsEnabled,
        isMultiBranch: accessibleBranches.length > 1,
        hasAllBranchesAccess,
        canSwitchBranches,
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
