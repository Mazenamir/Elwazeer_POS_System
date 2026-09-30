const db = require('../../database/connection');
const config = require('../../config/env');
const { hasPermission, INVENTORY_ADMIN_PERMISSION, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION } = require('../../../shared/constants/permissions');

let inventoryMetadataCache = null;
const INVENTORY_METADATA_TTL_MS = 5 * 60 * 1000;

function invalidateInventoryMetadata() {
  inventoryMetadataCache = null;
}

function getInventoryMetadataCache() {
  const now = Date.now();
  if (inventoryMetadataCache && inventoryMetadataCache.expiresAt > now) {
    return inventoryMetadataCache.value;
  }
  return null;
}

function setInventoryMetadataCache(value) {
  inventoryMetadataCache = {
    value,
    expiresAt: Date.now() + INVENTORY_METADATA_TTL_MS,
  };
}

function normalizeBarcodeInput(barcode) {
  if (typeof barcode !== 'string') return barcode || null;
  const normalized = barcode.trim().replace(/\D/g, '');
  return normalized || null;
}

function hasInventoryAdminAccess(user) {
  return Boolean(user && (user.role === 'admin' || hasPermission(user, INVENTORY_ADMIN_PERMISSION)));
}

function hasInventoryAllBranchesAccess(user) {
  return Boolean(user && (user.role === 'admin' || hasPermission(user, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION)));
}

function isBranchScopedUser(user) {
  return Boolean(user && user.role === 'branch_user');
}

async function assertBarcodeAvailable(tx, barcode, { inventoryId = null, rentalInventoryId = null } = {}) {
  if (!barcode) return;
  if (config.IS_BRANCH_MODE) {
    // SQLite check
    const invRow = db.sqlite.prepare('SELECT id FROM inventory WHERE barcode = ? AND id != ? AND is_deleted = 0 LIMIT 1').get(barcode, inventoryId || -1);
    if (invRow) {
      const err = new Error('هذا الباركود مستخدم بالفعل في المخزون العادي');
      err.statusCode = 400;
      throw err;
    }
    const rentRow = db.sqlite.prepare('SELECT id FROM rental_inventory WHERE barcode = ? AND id != ? AND is_deleted = 0 LIMIT 1').get(barcode, rentalInventoryId || -1);
    if (rentRow) {
      const err = new Error('هذا الباركود مستخدم بالفعل في مخزون التأجير');
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`barcode:${barcode}`]);

  const inventoryParams = [barcode];
  let inventoryWhere = "REGEXP_REPLACE(COALESCE(barcode, ''), '\\D', '', 'g') = $1 AND is_deleted = FALSE";
  if (inventoryId !== null && inventoryId !== undefined) {
    inventoryParams.push(inventoryId);
    inventoryWhere += ` AND id != $${inventoryParams.length}`;
  }
  const existingInventory = await tx.query(`SELECT id FROM inventory WHERE ${inventoryWhere} LIMIT 1`, inventoryParams);
  if (existingInventory.rows.length > 0) {
    const err = new Error('هذا الباركود مستخدم بالفعل في المخزون العادي');
    err.statusCode = 400;
    throw err;
  }

  const rentalParams = [barcode];
  let rentalWhere = "REGEXP_REPLACE(COALESCE(barcode, ''), '\\D', '', 'g') = $1 AND is_deleted = FALSE";
  if (rentalInventoryId !== null && rentalInventoryId !== undefined) {
    rentalParams.push(rentalInventoryId);
    rentalWhere += ` AND id != $${rentalParams.length}`;
  }
  const existingRental = await tx.query(`SELECT id FROM rental_inventory WHERE ${rentalWhere} LIMIT 1`, rentalParams);
  if (existingRental.rows.length > 0) {
    const err = new Error('هذا الباركود مستخدم بالفعل في مخزون التأجير');
    err.statusCode = 400;
    throw err;
  }
}

async function getAvailableBarcode(tx, requestedBarcode, { inventoryId = null, rentalInventoryId = null } = {}) {
  const baseBarcode = normalizeBarcodeInput(requestedBarcode);
  if (!baseBarcode) return null;

  for (let counter = 0; counter <= 999; counter++) {
    const candidate = counter === 0 ? baseBarcode : `${baseBarcode}${String(counter).padStart(2, '0')}`;

    if (config.IS_BRANCH_MODE) {
      const invRow = db.sqlite.prepare('SELECT id FROM inventory WHERE barcode = ? AND id != ? AND is_deleted = 0 LIMIT 1').get(candidate, inventoryId || -1);
      if (invRow) continue;
      const rentRow = db.sqlite.prepare('SELECT id FROM rental_inventory WHERE barcode = ? AND id != ? AND is_deleted = 0 LIMIT 1').get(candidate, rentalInventoryId || -1);
      if (!rentRow) return candidate;
      continue;
    }

    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`barcode:${candidate}`]);

    const inventoryParams = [candidate];
    let inventoryWhere = "REGEXP_REPLACE(COALESCE(barcode, ''), '\\D', '', 'g') = $1 AND is_deleted = FALSE";
    if (inventoryId !== null && inventoryId !== undefined) {
      inventoryParams.push(inventoryId);
      inventoryWhere += ` AND id != $${inventoryParams.length}`;
    }
    const existingInventory = await tx.query(`SELECT id FROM inventory WHERE ${inventoryWhere} LIMIT 1`, inventoryParams);
    if (existingInventory.rows.length > 0) continue;

    const rentalParams = [candidate];
    let rentalWhere = "REGEXP_REPLACE(COALESCE(barcode, ''), '\\D', '', 'g') = $1 AND is_deleted = FALSE";
    if (rentalInventoryId !== null && rentalInventoryId !== undefined) {
      rentalParams.push(rentalInventoryId);
      rentalWhere += ` AND id != $${rentalParams.length}`;
    }
    const existingRental = await tx.query(`SELECT id FROM rental_inventory WHERE ${rentalWhere} LIMIT 1`, rentalParams);
    if (existingRental.rows.length === 0) return candidate;
  }

  const err = new Error('تعذر توليد باركود فريد تلقائيًا');
  err.statusCode = 400;
  throw err;
}

module.exports = {
  invalidateInventoryMetadata,
  getInventoryMetadataCache,
  setInventoryMetadataCache,
  normalizeBarcodeInput,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
  assertBarcodeAvailable,
  getAvailableBarcode,
};
