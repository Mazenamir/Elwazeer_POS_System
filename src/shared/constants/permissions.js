/**
 * System Permissions & Role Definitions
 * Extracted from legacy server.js - 100% Preserved Business Logic
 */

const ALL_PERMISSIONS = [
  'Dashboard.html',
  'index.html',
  'Rentals.html',
  'Barcodes.html',
  'Customers.html',
  'Suppliers.html',
  'RentalInventory.html',
  'WornProducts.html',
  'Employees.html',
  'Expenses.html',
  'Reports.html',
  'Settings.html',
  'Alterations.html',
  'Tailoring.html',
];

const DEFAULT_BRANCH_PERMISSIONS = [
  'index.html',
  'Rentals.html',
  'Barcodes.html',
  'Customers.html',
  'Suppliers.html',
  'RentalInventory.html',
  'WornProducts.html',
];

const INVENTORY_ADMIN_PERMISSION = 'inventory_admin';
const INVENTORY_VIEW_ALL_BRANCHES_PERMISSION = 'inventory_view_all_branches';

const EXTRA_PERMISSIONS = [
  INVENTORY_ADMIN_PERMISSION,
  INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
];

function normalizePermissions(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (!permissions) return [];
  try {
    return JSON.parse(permissions);
  } catch {
    return [];
  }
}

function defaultPermissionsForRole(role) {
  if (role === 'admin') {
    return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS];
  }
  return [...DEFAULT_BRANCH_PERMISSIONS];
}

function getUserPermissions(user) {
  if (!user) return [];
  if (user.role === 'admin') return [...ALL_PERMISSIONS, ...EXTRA_PERMISSIONS];
  return normalizePermissions(user.permissions);
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const permissions = getUserPermissions(user);
  return permissions.includes(permission);
}

module.exports = {
  ALL_PERMISSIONS,
  DEFAULT_BRANCH_PERMISSIONS,
  INVENTORY_ADMIN_PERMISSION,
  INVENTORY_VIEW_ALL_BRANCHES_PERMISSION,
  EXTRA_PERMISSIONS,
  normalizePermissions,
  defaultPermissionsForRole,
  getUserPermissions,
  hasPermission,
};
