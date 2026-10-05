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
  const { name, location, phone, type, is_main_warehouse, logo_url } = data;
  if (!name) {
    const err = new Error('اسم الفرع مطلوب');
    err.statusCode = 400;
    throw err;
  }
  const logoSettings = normalizeBranchInvoiceLogoSettings(data);
  const branchType = type || 'men';
  const isMain = Boolean(is_main_warehouse);
  const allowedGender = data.allowed_gender || 'both';

  return await db.transaction(async (tx) => {
    if (config.IS_BRANCH_MODE) {
      const stmt = db.sqlite.prepare(`
        INSERT INTO branches (
          name, location, phone, type, is_main_warehouse, logo_url,
          invoice_logo_height, invoice_logo_spacing, invoice_logo_filter,
          invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end,
          allowed_gender
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        name, location, phone, branchType, isMain ? 1 : 0, logo_url || null,
        logoSettings.invoice_logo_height, logoSettings.invoice_logo_spacing, logoSettings.invoice_logo_filter,
        logoSettings.invoice_logo_bg_enabled ? 1 : 0, logoSettings.invoice_logo_bg_start, logoSettings.invoice_logo_bg_end,
        allowedGender
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
        allowed_gender
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        name,
        location,
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
  const { name, location, phone, type, logo_url } = data;
  const logoSettings = normalizeBranchInvoiceLogoSettings(data);

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      UPDATE branches
      SET name = ?, location = ?, phone = ?, type = ?, logo_url = ?,
          invoice_logo_height = ?, invoice_logo_spacing = ?, invoice_logo_filter = ?,
          invoice_logo_bg_enabled = ?, invoice_logo_bg_start = ?, invoice_logo_bg_end = ?
      WHERE id = ?
    `);
    stmt.run(
      name, location, phone, type || 'men', logo_url || null,
      logoSettings.invoice_logo_height, logoSettings.invoice_logo_spacing, logoSettings.invoice_logo_filter,
      logoSettings.invoice_logo_bg_enabled ? 1 : 0, logoSettings.invoice_logo_bg_start, logoSettings.invoice_logo_bg_end,
      id
    );
    return db.sqlite.prepare('SELECT * FROM branches WHERE id = ?').get(id);
  }

  const { rows } = await db.query(
    `UPDATE branches
     SET name = $1,
         location = $2,
         phone = $3,
         type = $4,
         logo_url = $5,
         invoice_logo_height = $6,
         invoice_logo_spacing = $7,
         invoice_logo_filter = $8,
         invoice_logo_bg_enabled = $9,
         invoice_logo_bg_start = $10,
         invoice_logo_bg_end = $11,
         allowed_gender = $12
     WHERE id = $13
     RETURNING *`,
    [
      name,
      location,
      phone,
      type || 'men',
      logo_url || null,
      logoSettings.invoice_logo_height,
      logoSettings.invoice_logo_spacing,
      logoSettings.invoice_logo_filter,
      logoSettings.invoice_logo_bg_enabled,
      logoSettings.invoice_logo_bg_start,
      logoSettings.invoice_logo_bg_end,
      data.allowed_gender || 'both',
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
