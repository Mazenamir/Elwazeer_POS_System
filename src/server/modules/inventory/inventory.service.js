const crypto = require('crypto');
const db = require('../../database/connection');
const config = require('../../config/env');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { likePattern } = require('../../../shared/utils/string');
const { parsePositiveInt, parseNonNegativeInt } = require('../../../shared/utils/numbers');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const {
  invalidateInventoryMetadata,
  getInventoryMetadataCache,
  setInventoryMetadataCache,
  normalizeBarcodeInput,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
  assertBarcodeAvailable,
  getAvailableBarcode,
} = require('./inventory.helpers');

const TRANSFER_LIST_LIMIT = 200;

async function getMetadata() {
  const cached = getInventoryMetadataCache();
  if (cached) return cached;

  if (config.IS_BRANCH_MODE) {
    const cats = db.sqlite.prepare("SELECT DISTINCT category FROM inventory WHERE category IS NOT NULL AND category != ''").all();
    const colors = db.sqlite.prepare("SELECT DISTINCT color FROM inventory WHERE color IS NOT NULL AND color != ''").all();
    const metadata = {
      categories: cats.map((r) => r.category),
      colors: colors.map((r) => r.color),
    };
    setInventoryMetadataCache(metadata);
    return metadata;
  }

  const categoriesRes = await db.query("SELECT DISTINCT category FROM inventory WHERE category IS NOT NULL AND category != ''");
  const colorsRes = await db.query("SELECT DISTINCT color FROM inventory WHERE color IS NOT NULL AND color != ''");
  const metadata = {
    categories: categoriesRes.rows.map((r) => r.category),
    colors: colorsRes.rows.map((r) => r.color),
  };
  setInventoryMetadataCache(metadata);
  return metadata;
}

async function getModels(user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    return db.sqlite.prepare(`
      SELECT id, name, category, price, cost_price, barcode, image_url
      FROM inventory
      WHERE is_deleted = 0 AND name IS NOT NULL AND TRIM(name) != ''
      GROUP BY name
      ORDER BY id DESC LIMIT 50
    `).all();
  }

  const { rows } = await db.query(`
    SELECT DISTINCT ON (i.name)
      i.id, i.name, i.category, i.price, i.cost_price, i.wholesale_price,
      i.semi_wholesale_price, i.preferred_supplier_id, i.min_stock_level,
      i.image_url, i.barcode
    FROM inventory i
    WHERE i.is_deleted = FALSE AND i.name IS NOT NULL AND TRIM(i.name) != ''
    ORDER BY i.name, i.id DESC
    LIMIT 50
  `);
  return rows;
}

async function getBarcodes() {
  if (config.IS_BRANCH_MODE) {
    const inv = db.sqlite.prepare("SELECT 'inventory' as source, id, barcode FROM inventory WHERE is_deleted = 0 AND barcode IS NOT NULL LIMIT 2000").all();
    const rent = db.sqlite.prepare("SELECT 'rental_inventory' as source, id, barcode FROM rental_inventory WHERE is_deleted = 0 AND barcode IS NOT NULL LIMIT 500").all();
    return [...inv, ...rent];
  }

  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'inventory' AS source, id, REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') AS barcode
      FROM inventory WHERE is_deleted = FALSE AND REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') != ''
      ORDER BY id DESC LIMIT 2000
    ) inv
    UNION ALL
    SELECT * FROM (
      SELECT 'rental_inventory' AS source, id, REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') AS barcode
      FROM rental_inventory WHERE is_deleted = FALSE AND REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') != ''
      ORDER BY id DESC LIMIT 500
    ) rent
  `);
  return rows;
}

async function getVariants(name, requestedBranchId, user) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  const canViewAll = hasInventoryAllBranchesAccess(user);
  let branchId = Number.parseInt(requestedBranchId, 10) || Number(user?.branch_id) || 1;
  if (!canViewAll && user) branchId = Number(user.branch_id);

  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT i.*, 0 as stock_level
      FROM inventory i
      WHERE i.is_deleted = 0 AND LOWER(TRIM(i.name)) = LOWER(TRIM(?))
      LIMIT 500
    `).all(cleanName);
    return rows;
  }

  const branchStocksSql = canViewAll
    ? `(SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level, 'has_stock', stock_level > 0))
        FROM inventory_branches WHERE inventory_id = i.id)`
    : `(SELECT json_agg(json_build_object(
          'branch_id', branch_id,
          'stock_level', CASE WHEN branch_id = $2 THEN stock_level ELSE NULL END,
          'has_stock', stock_level > 0
        )) FROM inventory_branches WHERE inventory_id = i.id)`;

  const { rows } = await db.query(`
    SELECT i.id, i.name, i.category, i.size_cut, i.color, i.barcode, i.min_stock_level,
           i.price, i.image_url, i.preferred_supplier_id, i.wholesale_price,
           i.semi_wholesale_price, i.cost_price, i.gender, s.name as supplier_name,
           COALESCE(ib.stock_level, 0) as stock_level,
           ${branchStocksSql} as branch_stocks
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    LEFT JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = $2
    WHERE i.is_deleted = FALSE AND LOWER(TRIM(COALESCE(i.name, ''))) = LOWER(TRIM($1))
    ORDER BY COALESCE(NULLIF(TRIM(i.color), ''), 'zzzz'), COALESCE(NULLIF(TRIM(i.size_cut), ''), 'zzzz'), i.id
    LIMIT 2000
  `, [cleanName, branchId]);

  return rows;
}

async function listInventory(req, user) {
  const isInventoryAdmin = hasInventoryAdminAccess(user);
  const canViewAllBranches = hasInventoryAllBranchesAccess(user);
  const pagination = parsePagination(req, 60, 10000, true);

  if (config.IS_BRANCH_MODE) {
    const where = ['i.is_deleted = 0'];
    const params = [];

    if (req.query.search) {
      params.push(likePattern(req.query.search));
      where.push('(i.name LIKE ? OR i.barcode LIKE ? OR i.category LIKE ?)');
      params.push(likePattern(req.query.search));
      params.push(likePattern(req.query.search));
    }
    if (req.query.name) {
      params.push(likePattern(req.query.name));
      where.push('i.name LIKE ?');
    }
    if (req.query.category) {
      params.push(req.query.category);
      where.push('i.category = ?');
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const total = db.sqlite.prepare(`SELECT COUNT(*) as count FROM inventory i ${whereClause}`).get(...params).count;

    const rows = db.sqlite.prepare(`
      SELECT i.*, i.stock_level
      FROM inventory i
      ${whereClause}
      ORDER BY i.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, pagination.limit, pagination.offset);

    return paginatedPayload(rows, total, pagination);
  }

  let columns = 'i.id, i.name, i.category, i.size_cut, i.color, i.barcode, i.min_stock_level, i.price, i.image_url, i.gender';
  if (isInventoryAdmin) {
    columns += ', i.preferred_supplier_id, i.wholesale_price, i.semi_wholesale_price, i.cost_price, s.name as supplier_name';
  }

  let stockLevelSql = 'COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), 0)';
  let branchStocksSql = `(SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level, 'has_stock', stock_level > 0)) FROM inventory_branches WHERE inventory_id = i.id)`;
  const params = [];

  if (!canViewAllBranches) {
    params.push(user.branch_id);
    stockLevelSql = 'COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $1), 0)';
    branchStocksSql = `(SELECT json_agg(json_build_object(
      'branch_id', branch_id,
      'stock_level', CASE WHEN branch_id = $1 THEN stock_level ELSE NULL END,
      'has_stock', stock_level > 0
    )) FROM inventory_branches WHERE inventory_id = i.id)`;
  }

  const where = ['i.is_deleted = FALSE'];
  if (!canViewAllBranches) {
    where.push('$1::int IS NOT NULL');
    where.push(`(
      (SELECT allowed_gender FROM branches WHERE id = $1) = 'both' 
      OR i.gender = 'both' 
      OR i.gender = (SELECT allowed_gender FROM branches WHERE id = $1)
    )`);
  }

  if (req.query.search) {
    params.push(likePattern(req.query.search));
    where.push(`(
      i.name ILIKE $${params.length}
      OR i.barcode ILIKE $${params.length}
      OR i.category ILIKE $${params.length}
      OR i.color ILIKE $${params.length}
      OR i.size_cut ILIKE $${params.length}
    )`);
  }
  if (req.query.name) {
    params.push(likePattern(req.query.name));
    where.push(`i.name ILIKE $${params.length}`);
  }
  if (req.query.barcode) {
    params.push(likePattern(req.query.barcode));
    where.push(`i.barcode ILIKE $${params.length}`);
  }
  if (req.query.category) {
    params.push(req.query.category);
    where.push(`i.category = $${params.length}`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  let query = `
    SELECT ${columns},
           ${stockLevelSql} as stock_level,
           ${branchStocksSql} as branch_stocks
    FROM inventory i 
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
    ${whereClause}
    ORDER BY i.id
  `;
  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    ${whereClause}
  `;

  const queryParams = [...params];
  if (pagination.enabled) {
    query = appendPagination(query, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0].total, pagination);
  }

  const { rows } = await db.query(query, queryParams);
  return rows;
}

async function createProduct(body, user) {
  let { name, category, size_cut, color, stock_level, min_stock_level, branch_id, price, wholesale_price, semi_wholesale_price, cost_price, image_url, barcode, supplier_id, gender, purchase_batch_id } = body;
  barcode = normalizeBarcodeInput(barcode);
  if (isBranchScopedUser(user)) {
    branch_id = user.branch_id;
  }
  if (!supplier_id) {
    const err = new Error('الرجاء اختيار المورد');
    err.statusCode = 400;
    throw err;
  }

  const initialStock = stock_level === undefined || stock_level === '' ? 0 : parseNonNegativeInt(stock_level, 'stock_level');
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');
  const b_id = parseInt(branch_id, 10) || 1;

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      INSERT INTO inventory (name, category, size_cut, color, stock_level, min_stock_level, price, cost_price, image_url, barcode, preferred_supplier_id, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);
    const info = stmt.run(name, category, size_cut, color, initialStock, minStockLevel, price, cost_price, image_url, barcode, supplier_id);
    return db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(info.lastInsertRowid);
  }

  const item = await db.transaction(async (tx) => {
    barcode = await getAvailableBarcode(tx, barcode);
    await assertBarcodeAvailable(tx, barcode);

    const { rows } = await tx.query(
      `INSERT INTO inventory (
        name, category, size_cut, color, stock_level, min_stock_level, price,
        wholesale_price, semi_wholesale_price, cost_price, image_url, barcode,
        preferred_supplier_id, gender
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [name, category, size_cut, color, initialStock, minStockLevel, price, wholesale_price, semi_wholesale_price, cost_price, image_url, barcode, supplier_id, gender || 'both']
    );
    const newId = rows[0].id;

    // Initialize stock for all branches
    await tx.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) 
      SELECT $1, id, CASE WHEN id = $2 THEN $3 ELSE 0 END FROM branches
    `, [newId, b_id, initialStock]);

    if (initialStock > 0) {
      const batchId = purchase_batch_id || crypto.randomUUID();
      await tx.query(
        'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [supplier_id, newId, initialStock, cost_price, 'إضافة منتج جديد برصيد', b_id, batchId]
      );
      const total_cost = initialStock * cost_price;
      await tx.query(
        'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
        [supplier_id, 'purchase', total_cost, `فاتورة مشتريات (منتج جديد: ${name})`, batchId]
      );
      await tx.query(
        `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
        [total_cost, supplier_id]
      );
    }

    return rows[0];
  });

  invalidateInventoryMetadata();
  return item;
}

async function updateProduct(id, body, user) {
  let { name, category, size_cut, color, stock_level, min_stock_level, supplier_id, price, wholesale_price, semi_wholesale_price, cost_price, image_url, barcode, branch_id, is_correction } = body;
  barcode = normalizeBarcodeInput(barcode);
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');

  if (!supplier_id) {
    const err = new Error('الرجاء اختيار المورد');
    err.statusCode = 400;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare(`
      UPDATE inventory
      SET name = ?, category = ?, size_cut = ?, color = ?, min_stock_level = ?, preferred_supplier_id = ?, price = ?, cost_price = ?, image_url = ?, barcode = ?
      WHERE id = ?
    `).run(name, category, size_cut, color, minStockLevel, supplier_id, price, cost_price, image_url, barcode, id);
    return db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
  }

  if (barcode) {
    const existing = await db.query('SELECT id FROM inventory WHERE barcode = $1 AND id != $2 AND is_deleted = FALSE', [barcode, id]);
    if (existing.rows.length > 0) {
      const err = new Error('هذا الباركود مستخدم بالفعل لمنتج آخر');
      err.statusCode = 400;
      throw err;
    }
    const existingRental = await db.query('SELECT id FROM rental_inventory WHERE barcode = $1 AND is_deleted = FALSE', [barcode]);
    if (existingRental.rows.length > 0) {
      const err = new Error('هذا الباركود مستخدم بالفعل في مخزون التأجير');
      err.statusCode = 400;
      throw err;
    }
  }

  const item = await db.transaction(async (tx) => {
    await assertBarcodeAvailable(tx, barcode, { inventoryId: id });

    if (hasInventoryAdminAccess(user)) {
      await tx.query(
        'UPDATE inventory SET name = $1, category = $2, size_cut = $3, color = $4, min_stock_level = $5, preferred_supplier_id = $6, price = $7, wholesale_price = $8, semi_wholesale_price = $9, cost_price = $10, image_url = $11, barcode = $12, gender = $13 WHERE id = $14',
        [name, category, size_cut, color, minStockLevel, supplier_id, price, wholesale_price, semi_wholesale_price, cost_price, image_url, barcode, body.gender || 'both', id]
      );
    }

    if (user && branch_id && stock_level !== undefined) {
      if (!hasInventoryAllBranchesAccess(user) && Number(branch_id) !== Number(user.branch_id)) {
        throw new Error('Unauthorized branch stock update');
      }

      const currentStockRes = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [id, branch_id]);
      const oldStock = currentStockRes.rows.length ? Number(currentStockRes.rows[0].stock_level) : 0;
      const diff = Number(stock_level) - oldStock;

      await tx.query(
        'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, $2, $3) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = EXCLUDED.stock_level',
        [id, branch_id, stock_level]
      );

      if (diff !== 0 && !is_correction) {
        const absDiff = Math.abs(diff);
        const total_cost = absDiff * cost_price;
        const note = diff > 0 ? 'تعديل كمية (زيادة رصيد)' : 'تعديل كمية (نقص رصيد)';
        const transType = diff > 0 ? 'purchase' : 'return';
        const transNote = diff > 0 ? `تعديل رصيد بالزيادة (${name})` : `تعديل رصيد بالنقصان (${name})`;
        const batchId = crypto.randomUUID();

        await tx.query(
          'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [supplier_id, id, diff, cost_price, note, branch_id, batchId]
        );

        await tx.query(
          'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
          [supplier_id, transType, total_cost, transNote, batchId]
        );

        if (diff > 0) {
          await tx.query(
            `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
            [total_cost, supplier_id]
          );
        } else {
          await tx.query('UPDATE suppliers SET balance = balance + $1 WHERE id = $2', [total_cost, supplier_id]);
        }
      }

      const totalStockRes = await tx.query('SELECT SUM(stock_level) as total FROM inventory_branches WHERE inventory_id = $1', [id]);
      const newTotal = totalStockRes.rows[0]?.total || 0;
      await tx.query('UPDATE inventory SET stock_level = $1 WHERE id = $2', [newTotal, id]);
    }

    const { rows } = await db.query(`
      SELECT i.*, s.name as supplier_name,
             (SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level)) FROM inventory_branches WHERE inventory_id = i.id) as branch_stocks
      FROM inventory i 
      LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
      WHERE i.id = $1
    `, [id]);
    return rows[0];
  });

  invalidateInventoryMetadata();
  return item;
}

async function deleteProduct(id, user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Admin only');
    err.statusCode = 403;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare('UPDATE inventory SET is_deleted = 1 WHERE id = ?').run(id);
    invalidateInventoryMetadata();
    return { success: true };
  }

  await db.query('UPDATE inventory SET is_deleted = TRUE WHERE id = $1', [id]);
  invalidateInventoryMetadata();
  return { success: true };
}

async function transferStock(body, user) {
  let { inventory_id, from_branch_id, to_branch_id, from_branch, to_branch, quantity, is_request } = body;
  if (!from_branch_id && from_branch) from_branch_id = from_branch;
  if (!to_branch_id && to_branch) to_branch_id = to_branch;

  if (user && (!hasInventoryAdminAccess(user) || (is_request && !hasInventoryAllBranchesAccess(user)))) {
    if (is_request) to_branch_id = user.branch_id;
    else from_branch_id = user.branch_id;
  }

  if (!inventory_id || !from_branch_id || !to_branch_id || !quantity) {
    const err = new Error('الرجاء تحديد المنتج، الفرع المصدر، الفرع الوجهة، والكمية');
    err.statusCode = 400;
    throw err;
  }

  if (Number(from_branch_id) === Number(to_branch_id)) {
    const err = new Error('لا يمكن التحويل لنفس الفرع');
    err.statusCode = 400;
    throw err;
  }

  const transferQty = parsePositiveInt(quantity, 'quantity');

  if (is_request) {
    const sourceStock = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [inventory_id, from_branch_id]);
    const available = sourceStock.rows.length ? Number(sourceStock.rows[0].stock_level) : 0;
    if (transferQty > available) {
      const err = new Error(`عفواً، الكمية المطلوبة غير متوفرة في الفرع المصدر. المتاح حالياً: ${available} قطعة`);
      err.statusCode = 400;
      throw err;
    }

    await db.query(
      'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES ($1, $2, $3, $4, $5)',
      [inventory_id, from_branch_id, to_branch_id, transferQty, 'requested']
    );
    return { success: true, message: 'تم إرسال طلب بضاعة للفرع الآخر بنجاح' };
  }

  await db.transaction(async (tx) => {
    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [inventory_id, from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('عفواً، المخزون في الفرع المصدر غير كافٍ لإتمام عملية التحويل');
    }

    await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, inventory_id, from_branch_id]);

    await tx.query(
      'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES ($1, $2, $3, $4, $5)',
      [inventory_id, from_branch_id, to_branch_id, transferQty, 'pending']
    );
  });

  return { success: true, message: 'تم إرسال البضاعة وهي الآن في انتظار تأكيد الفرع الوجهة' };
}

async function listTransferRequests(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) branch_id = user.branch_id;

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
    WHERE st.status = 'requested'
  `;
  const params = [];

  if (branch_id) {
    query += ' AND st.from_branch_id = $1';
    params.push(branch_id);
  } else if (user && !hasInventoryAdminAccess(user)) {
    return [];
  }

  params.push(TRANSFER_LIST_LIMIT);
  query += ` ORDER BY st.transfer_date DESC LIMIT $${params.length}`;
  const { rows } = await db.query(query, params);
  return rows;
}

async function approveTransfer(transferId, user) {
  await db.transaction(async (tx) => {
    const transferRes = await tx.query("SELECT * FROM stock_transfers WHERE id = $1 AND status = 'requested' FOR UPDATE", [transferId]);
    if (transferRes.rows.length === 0) throw new Error('الطلب غير موجود أو تم التعامل معه بالفعل');

    const transfer = transferRes.rows[0];
    if (isBranchScopedUser(user) && Number(transfer.from_branch_id) !== Number(user.branch_id)) {
      throw new Error('Unauthorized');
    }
    const transferQty = transfer.quantity;

    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [transfer.inventory_id, transfer.from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('المخزون في فرعك غير كافٍ للموافقة على هذا الطلب');
    }

    await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, transfer.inventory_id, transfer.from_branch_id]);
    await tx.query("UPDATE stock_transfers SET status = 'pending' WHERE id = $1", [transferId]);
  });
  return { success: true, message: 'تمت الموافقة وإرسال البضاعة بنجاح' };
}

async function rejectTransfer(transferId, user) {
  const params = [transferId];
  let branchFilter = '';
  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    branchFilter = ' AND from_branch_id = $2';
  }
  const res = await db.query(`UPDATE stock_transfers SET status = 'rejected' WHERE id = $1 AND status = 'requested'${branchFilter}`, params);
  if (res.rowCount === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }
  return { success: true, message: 'تم رفض طلب البضاعة بنجاح' };
}

async function listIncomingTransfers(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) branch_id = user.branch_id;

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
    WHERE st.status = 'pending'
  `;
  const params = [];

  if (branch_id) {
    query += ' AND st.to_branch_id = $1';
    params.push(branch_id);
  } else if (user && !hasInventoryAdminAccess(user)) {
    return [];
  }

  params.push(TRANSFER_LIST_LIMIT);
  query += ` ORDER BY st.transfer_date DESC LIMIT $${params.length}`;
  const { rows } = await db.query(query, params);
  return rows;
}

async function receiveTransfer(transferId, user) {
  await db.transaction(async (tx) => {
    const transferRes = await tx.query("SELECT * FROM stock_transfers WHERE id = $1 AND status = 'pending' FOR UPDATE", [transferId]);
    if (transferRes.rows.length === 0) throw new Error('التحويل غير موجود أو تم استلامه بالفعل');

    const transfer = transferRes.rows[0];
    if (isBranchScopedUser(user) && Number(transfer.to_branch_id) !== Number(user.branch_id)) {
      throw new Error('Unauthorized');
    }

    await tx.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + $3
    `, [transfer.inventory_id, transfer.to_branch_id, transfer.quantity]);

    await tx.query("UPDATE stock_transfers SET status = 'received' WHERE id = $1", [transferId]);
  });
  return { success: true, message: 'تم تأكيد استلام المخزون بنجاح' };
}

module.exports = {
  getMetadata,
  getModels,
  getBarcodes,
  getVariants,
  listInventory,
  createProduct,
  updateProduct,
  deleteProduct,
  transferStock,
  listTransferRequests,
  approveTransfer,
  rejectTransfer,
  listIncomingTransfers,
  receiveTransfer,
};
