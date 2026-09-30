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

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      INSERT INTO branches (
        name, location, phone, type, is_main_warehouse, logo_url,
        invoice_logo_height, invoice_logo_spacing, invoice_logo_filter,
        invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      name, location, phone, type || 'men', is_main_warehouse ? 1 : 0, logo_url || null,
      logoSettings.invoice_logo_height, logoSettings.invoice_logo_spacing, logoSettings.invoice_logo_filter,
      logoSettings.invoice_logo_bg_enabled ? 1 : 0, logoSettings.invoice_logo_bg_start, logoSettings.invoice_logo_bg_end
    );
    return db.sqlite.prepare('SELECT * FROM branches WHERE id = ?').get(info.lastInsertRowid);
  }

  const { rows } = await db.query(
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
      type || 'men',
      is_main_warehouse || false,
      logo_url || null,
      logoSettings.invoice_logo_height,
      logoSettings.invoice_logo_spacing,
      logoSettings.invoice_logo_filter,
      logoSettings.invoice_logo_bg_enabled,
      logoSettings.invoice_logo_bg_start,
      logoSettings.invoice_logo_bg_end,
      data.allowed_gender || 'both',
    ]
  );
  const newBranch = rows[0];

  // Initialize stock in inventory_branches for existing items
  await db.query(`
    INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
    SELECT id, $1, 0 FROM inventory
  `, [newBranch.id]);

  return newBranch;
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
  if (config.IS_BRANCH_MODE) {
    const branch = db.sqlite.prepare('SELECT is_main_warehouse FROM branches WHERE id = ?').get(id);
    if (!branch) {
      const err = new Error('الفرع غير موجود');
      err.statusCode = 404;
      throw err;
    }
    if (branch.is_main_warehouse) {
      const err = new Error('لا يمكن حذف المخزن الرئيسي');
      err.statusCode = 400;
      throw err;
    }
    db.sqlite.prepare('DELETE FROM branches WHERE id = ?').run(id);
    return { success: true };
  }

  const branchCheck = await db.query('SELECT is_main_warehouse FROM branches WHERE id = $1', [id]);
  if (branchCheck.rows.length === 0) {
    const err = new Error('الفرع غير موجود');
    err.statusCode = 404;
    throw err;
  }
  if (branchCheck.rows[0].is_main_warehouse) {
    const err = new Error('لا يمكن حذف المخزن الرئيسي');
    err.statusCode = 400;
    throw err;
  }

  await db.query('DELETE FROM inventory_branches WHERE branch_id = $1', [id]);
  await db.query('DELETE FROM branches WHERE id = $1', [id]);
  return { success: true };
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
};
