const db = require('../../database/connection');
const config = require('../../config/env');
const { normalizeBranchInvoiceLogoSettings } = require('../../../shared/constants/system');

async function listBranches() {
  if (config.IS_BRANCH_MODE) {
    return db.sqlite.prepare('SELECT * FROM branches ORDER BY id').all();
  }
  const { rows } = await db.query('SELECT * FROM branches ORDER BY id');
  return rows;
}

async function createBranch(data) {
  const { name, phone, type, is_main_warehouse, logo_url } = data;
  const branchLocation = data.location !== undefined ? data.location : (data.address ?? null);
  if (!name) {
    const err = new Error('اسم الفرع مطلوب');
    err.statusCode = 400;
    throw err;
  }
  const logoSettings = normalizeBranchInvoiceLogoSettings(data);
  const branchType = type || 'men';
  const isMain = Boolean(is_main_warehouse);
  const allowedGender = data.allowed_gender || 'both';
  const rentalsEnabled = data.rentals_enabled !== undefined
    ? (data.rentals_enabled === true || data.rentals_enabled === 'true' || data.rentals_enabled === 1 || data.rentals_enabled === '1')
    : true;

  return await db.transaction(async (tx) => {
    if (config.IS_BRANCH_MODE) {
      const stmt = db.sqlite.prepare(`
        INSERT INTO branches (
          name, location, phone, type, is_main_warehouse, logo_url,
          invoice_logo_height, invoice_logo_spacing, invoice_logo_filter,
          invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end,
          allowed_gender, rentals_enabled
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        name, branchLocation, phone, branchType, isMain ? 1 : 0, logo_url || null,
        logoSettings.invoice_logo_height, logoSettings.invoice_logo_spacing, logoSettings.invoice_logo_filter,
        logoSettings.invoice_logo_bg_enabled ? 1 : 0, logoSettings.invoice_logo_bg_start, logoSettings.invoice_logo_bg_end,
        allowedGender, rentalsEnabled ? 1 : 0
      );
      const newBranch = db.sqlite.prepare('SELECT * FROM branches WHERE id = ?').get(info.lastInsertRowid);
      db.sqlite.prepare(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
        SELECT id, ?, 0 FROM inventory
      `).run(newBranch.id);
      return newBranch;
    }

    const { rows } = await tx.query(
      `INSERT INTO branches (
        name, location, phone, type, is_main_warehouse, logo_url,
        invoice_logo_height, invoice_logo_spacing, invoice_logo_filter,
        invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end,
        allowed_gender, rentals_enabled
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        name,
        branchLocation,
        phone,
        branchType,
        isMain,
        logo_url || null,
        logoSettings.invoice_logo_height,
        logoSettings.invoice_logo_spacing,
        logoSettings.invoice_logo_filter,
        logoSettings.invoice_logo_bg_enabled,
        logoSettings.invoice_logo_bg_start,
        logoSettings.invoice_logo_bg_end,
        allowedGender,
        rentalsEnabled,
      ]
    );
    const newBranch = rows[0];

    // Initialize stock in inventory_branches for existing items atomically
    await tx.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      SELECT id, $1, 0 FROM inventory
    `, [newBranch.id]);

    return newBranch;
  });
}

async function updateBranch(id, data) {
  const { name, phone, type, logo_url } = data;
  const branchLocation = data.location !== undefined ? data.location : (data.address ?? null);
  const logoSettings = normalizeBranchInvoiceLogoSettings(data);
  const rentalsEnabled = data.rentals_enabled !== undefined
    ? (data.rentals_enabled === true || data.rentals_enabled === 'true' || data.rentals_enabled === 1 || data.rentals_enabled === '1' ? 1 : 0)
    : null;
  const pgRentalsEnabled = data.rentals_enabled !== undefined
    ? Boolean(data.rentals_enabled === true || data.rentals_enabled === 'true' || data.rentals_enabled === 1 || data.rentals_enabled === '1')
    : null;

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      UPDATE branches
      SET name = COALESCE(?, name), location = COALESCE(?, location), phone = COALESCE(?, phone), type = COALESCE(?, type), logo_url = COALESCE(?, logo_url),
          invoice_logo_height = COALESCE(?, invoice_logo_height), invoice_logo_spacing = COALESCE(?, invoice_logo_spacing), invoice_logo_filter = COALESCE(?, invoice_logo_filter),
          invoice_logo_bg_enabled = COALESCE(?, invoice_logo_bg_enabled), invoice_logo_bg_start = COALESCE(?, invoice_logo_bg_start), invoice_logo_bg_end = COALESCE(?, invoice_logo_bg_end),
          allowed_gender = COALESCE(?, allowed_gender),
          rentals_enabled = COALESCE(?, rentals_enabled)
      WHERE id = ?
    `);
    stmt.run(
      name !== undefined ? name : null,
      branchLocation !== undefined ? branchLocation : null,
      phone !== undefined ? phone : null,
      type !== undefined ? type : null,
      logo_url !== undefined ? logo_url : null,
      data.invoice_logo_height !== undefined ? logoSettings.invoice_logo_height : null,
      data.invoice_logo_spacing !== undefined ? logoSettings.invoice_logo_spacing : null,
      data.invoice_logo_filter !== undefined ? logoSettings.invoice_logo_filter : null,
      data.invoice_logo_bg_enabled !== undefined ? (logoSettings.invoice_logo_bg_enabled ? 1 : 0) : null,
      data.invoice_logo_bg_start !== undefined ? logoSettings.invoice_logo_bg_start : null,
      data.invoice_logo_bg_end !== undefined ? logoSettings.invoice_logo_bg_end : null,
      data.allowed_gender !== undefined ? data.allowed_gender : null,
      rentalsEnabled,
      id
    );
    return db.sqlite.prepare('SELECT * FROM branches WHERE id = ?').get(id);
  }

  const { rows } = await db.query(
    `UPDATE branches
     SET name = COALESCE($1, name),
         location = COALESCE($2, location),
         phone = COALESCE($3, phone),
         type = COALESCE($4, type),
         logo_url = COALESCE($5, logo_url),
         invoice_logo_height = COALESCE($6, invoice_logo_height),
         invoice_logo_spacing = COALESCE($7, invoice_logo_spacing),
         invoice_logo_filter = COALESCE($8, invoice_logo_filter),
         invoice_logo_bg_enabled = COALESCE($9, invoice_logo_bg_enabled),
         invoice_logo_bg_start = COALESCE($10, invoice_logo_bg_start),
         invoice_logo_bg_end = COALESCE($11, invoice_logo_bg_end),
         allowed_gender = COALESCE($12, allowed_gender),
         rentals_enabled = COALESCE($13, rentals_enabled)
     WHERE id = $14
     RETURNING *`,
    [
      name !== undefined ? name : null,
      branchLocation !== undefined ? branchLocation : null,
      phone !== undefined ? phone : null,
      type !== undefined ? type : null,
      logo_url !== undefined ? logo_url : null,
      data.invoice_logo_height !== undefined ? logoSettings.invoice_logo_height : null,
      data.invoice_logo_spacing !== undefined ? logoSettings.invoice_logo_spacing : null,
      data.invoice_logo_filter !== undefined ? logoSettings.invoice_logo_filter : null,
      data.invoice_logo_bg_enabled !== undefined ? logoSettings.invoice_logo_bg_enabled : null,
      data.invoice_logo_bg_start !== undefined ? logoSettings.invoice_logo_bg_start : null,
      data.invoice_logo_bg_end !== undefined ? logoSettings.invoice_logo_bg_end : null,
      data.allowed_gender !== undefined ? data.allowed_gender : null,
      pgRentalsEnabled,
      id,
    ]
  );

  if (rows.length === 0) {
    const err = new Error('Branch not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

async function deleteBranch(id) {
  const branchId = Number(id);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    const err = new Error('معرف الفرع غير صالح');
    err.statusCode = 400;
    throw err;
  }

  return await db.transaction(async (tx) => {
    let isMainWarehouse = false;
    if (config.IS_BRANCH_MODE) {
      const branch = db.sqlite.prepare('SELECT is_main_warehouse FROM branches WHERE id = ?').get(branchId);
      if (!branch) {
        const err = new Error('الفرع غير موجود');
        err.statusCode = 404;
        throw err;
      }
      isMainWarehouse = Boolean(branch.is_main_warehouse);
    } else {
      const branchCheck = await tx.query('SELECT is_main_warehouse FROM branches WHERE id = $1 FOR UPDATE', [branchId]);
      if (branchCheck.rows.length === 0) {
        const err = new Error('الفرع غير موجود');
        err.statusCode = 404;
        throw err;
      }
      isMainWarehouse = Boolean(branchCheck.rows[0].is_main_warehouse);
    }

    if (isMainWarehouse) {
      const err = new Error('لا يمكن حذف المخزن الرئيسي');
      err.statusCode = 400;
      throw err;
    }

    // Determine fallback branch (main warehouse or branch 1) for historical data unlinking
    let fallbackBranchId = 1;
    if (config.IS_BRANCH_MODE) {
      const mainWarehouse = db.sqlite.prepare('SELECT id FROM branches WHERE is_main_warehouse = 1 OR id = 1 ORDER BY is_main_warehouse DESC, id ASC LIMIT 1').get();
      fallbackBranchId = mainWarehouse?.id || 1;

      // Reassign operational history to fallback branch to preserve audit records
      db.sqlite.prepare('UPDATE orders SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE customers SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE rentals SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE tailoring_orders SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE alterations SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE expenses SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE employees SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);
      db.sqlite.prepare('UPDATE users SET branch_id = ? WHERE branch_id = ?').run(fallbackBranchId, branchId);

      db.sqlite.prepare('DELETE FROM rental_inventory_branches WHERE branch_id = ?').run(branchId);
      db.sqlite.prepare('DELETE FROM inventory_branches WHERE branch_id = ?').run(branchId);
      db.sqlite.prepare('DELETE FROM branches WHERE id = ?').run(branchId);
      return { success: true };
    }

    const mainRes = await tx.query('SELECT id FROM branches WHERE is_main_warehouse = TRUE OR id = 1 ORDER BY is_main_warehouse DESC, id ASC LIMIT 1');
    fallbackBranchId = mainRes.rows[0]?.id || 1;

    // Safely reassign records referencing branches(id) to avoid foreign key violations and preserve history
    await tx.query('UPDATE orders SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE customers SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE rentals SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE tailoring_orders SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE alterations SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE expenses SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE employees SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);
    await tx.query('UPDATE users SET branch_id = $1 WHERE branch_id = $2', [fallbackBranchId, branchId]);

    await tx.query('DELETE FROM rental_inventory_branches WHERE branch_id = $1', [branchId]);
    await tx.query('DELETE FROM inventory_branches WHERE branch_id = $1', [branchId]);
    await tx.query('DELETE FROM branches WHERE id = $1', [branchId]);
    return { success: true };
  });
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
};
