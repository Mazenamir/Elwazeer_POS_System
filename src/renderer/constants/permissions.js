/**
 * Re-exports authoritative permission catalog from shared constants
 * Eliminates frontend / backend divergence
 */

import permissionsShared from '../../shared/constants/permissions';

export const {
  ALL_PERMISSIONS,
  DEFAULT_BRANCH_PERMISSIONS,
  INVENTORY_ADMIN_PERMISSION,
  INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
  EXTRA_PERMISSIONS,
  HIERARCHICAL_CATALOG,
  LEGACY_TO_GRANULAR_MAP,
  GRANULAR_TO_LEGACY_MAP,
  ALL_GRANULAR_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUPS,
  PERMISSION_PRESETS,
  normalizePermissions,
  expandPermissionsWithLegacy,
  defaultPermissionsForRole,
  getUserPermissions,
  hasPermission,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
  SENSITIVE_OR_PRIVILEGED_PERMISSIONS,
} = permissionsShared;

export default permissionsShared;
