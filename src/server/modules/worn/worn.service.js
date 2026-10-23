const db = require('../../database/connection');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { isBranchScopedUser } = require('../../../shared/constants/permissions');
const { likePattern } = require('../../../shared/utils/string');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { roundCurrency } = require('../../../shared/utils/numbers');
const { adjustInventoryStock } = require('../inventory/inventory.helpers');

async function getSummary(query, user) {
  const params = [];
  const where = [];

  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int as records,
       COALESCE(SUM(quantity), 0)::int as quantity,
       COALESCE(SUM(estimated_loss), 0) as estimated_loss,
       COALESCE(SUM(quantity) FILTER (WHERE occurred_at >= date_trunc('month', ${CAIRO_DATE_SQL})::date), 0)::int as month_quantity
     FROM worn_products wp
     ${whereClause}`,
    params
  );

  return {
    records: Number(rows[0]?.records || 0),
    quantity: Number(rows[0]?.quantity || 0),
    estimated_loss: Number(rows[0]?.estimated_loss || 0),
    month_quantity: Number(rows[0]?.month_quantity || 0),
  };
}

async function listWornProducts(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);
  const params = [];
  const where = [];

  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`wp.branch_id = $${params.length}`);
  }

  if (query.product_type && query.product_type !== 'all') {
    params.push(query.product_type);
    where.push(`wp.product_type = $${params.length}`);
  }

  if (query.status && query.status !== 'all') {
    params.push(query.status);
    where.push(`wp.status = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      COALESCE(i.name, ri.name, '') ILIKE $${params.length}
      OR COALESCE(i.barcode, ri.barcode, '') ILIKE $${params.length}
      OR COALESCE(wp.reason, '') ILIKE $${params.length}
      OR COALESCE(wp.notes, '') ILIKE $${params.length}
    )`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  let selectQuery = `
    SELECT wp.*,
           b.name as branch_name,
           u.username as reported_by_name,
           COALESCE(i.name, ri.name) as product_name,
           COALESCE(i.barcode, ri.barcode) as product_barcode,
           COALESCE(i.category, ri.category) as product_category,
           COALESCE(i.color, ri.color) as product_color,
           COALESCE(i.size_cut, ri.size_cut) as product_size
    FROM worn_products wp
    LEFT JOIN branches b ON wp.branch_id = b.id
    LEFT JOIN users u ON wp.reported_by = u.id
    LEFT JOIN inventory i ON wp.inventory_id = i.id
    LEFT JOIN rental_inventory ri ON wp.rental_inventory_id = ri.id
    ${whereClause}
    ORDER BY wp.occurred_at DESC, wp.id DESC
  `;

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM worn_products wp
    LEFT JOIN inventory i ON wp.inventory_id = i.id
    LEFT JOIN rental_inventory ri ON wp.rental_inventory_id = ri.id
    ${whereClause}
  `;

  const queryParams = [...params];
  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(selectQuery, queryParams);
  return rows;
}

async function createWornProduct(body, user) {
  const {
    product_type,
    product_id,
    branch_id,
    quantity,
    condition,
    reason,
    estimated_loss,
    notes,
    occurred_at,
    deduct_stock,
  } = body || {};

  const qty = Number(quantity);
  if (!product_type || !product_id || !qty || qty <= 0) {
    const err = new Error('الرجاء اختيار المنتج وتحديد كمية صحيحة');
    err.statusCode = 400;
    throw err;
  }

  const finalBranchId = isBranchScopedUser(user) ? user.branch_id : (branch_id || user?.branch_id || 1);
  const productId = Number(product_id);
  const finalInventoryId = product_type === 'sales' ? productId : null;
  const finalRentalInventoryId = product_type === 'rental' ? productId : null;
  const shouldDeductStock = deduct_stock !== false;
  const roundedLoss = Math.max(0, roundCurrency(Number(estimated_loss || 0)));

  return await db.transaction(async (tx) => {
    if (shouldDeductStock) {
      if (product_type === 'sales') {
        // 1. Lock global inventory row first in consistent order
        const invRes = await tx.query(
          'SELECT id, name, stock_level FROM inventory WHERE id = $1 FOR UPDATE',
          [productId]
        );
        if (invRes.rows.length === 0) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }
        if (Number(invRes.rows[0].stock_level) < qty) {
          const err = new Error('الكمية المطلوبة أكبر من المخزون الإجمالي المتاح');
          err.statusCode = 400;
          throw err;
        }

        // 2. Lock branch inventory row
        const branchStockRes = await tx.query(
          'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [productId, finalBranchId]
        );
        const available = branchStockRes.rows.length ? Number(branchStockRes.rows[0].stock_level || 0) : 0;
        if (available < qty) {
          const err = new Error('الكمية المطلوبة أكبر من المتاح في هذا الفرع');
          err.statusCode = 400;
          throw err;
        }

        // 3. Atomic stock decrement across sizes, branch, and global levels
        await adjustInventoryStock(tx, {
          inventoryId: productId,
          branchId: finalBranchId,
          quantityDelta: -qty,
        });
      } else {
        const riRes = await tx.query('SELECT id, name FROM rental_inventory WHERE id = $1', [productId]);
        if (riRes.rows.length === 0) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }

        // Rental inventory deduction with row lock
        const stockRes = await tx.query(
          'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [productId, finalBranchId]
        );
        const available = stockRes.rows.length ? Number(stockRes.rows[0].stock_level || 0) : 0;
        if (available < qty) {
          const err = new Error('الكمية المطلوبة أكبر من المتاح في هذا الفرع');
          err.statusCode = 400;
          throw err;
        }
        await tx.query(
          'UPDATE rental_inventory_branches SET stock_level = stock_level - $1 WHERE rental_inventory_id = $2 AND branch_id = $3',
          [qty, productId, finalBranchId]
        );
      }
    } else {
      if (product_type === 'sales') {
        const invCheck = await tx.query('SELECT id FROM inventory WHERE id = $1', [productId]);
        if (!invCheck.rows.length) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }
      } else {
        const rCheck = await tx.query('SELECT id FROM rental_inventory WHERE id = $1', [productId]);
        if (!rCheck.rows.length) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }
      }
    }

    const result = await tx.query(
      `INSERT INTO worn_products
        (product_type, inventory_id, rental_inventory_id, branch_id, quantity, condition, reason, estimated_loss, notes, reported_by, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, ${CAIRO_DATE_SQL}))
       RETURNING *`,
      [
        product_type,
        finalInventoryId,
        finalRentalInventoryId,
        finalBranchId,
        qty,
        condition || 'worn',
        reason || null,
        roundedLoss,
        notes || null,
        user ? user.id : null,
        occurred_at || null,
      ]
    );

    return result.rows[0];
  });
}

async function updateWornProduct(id, body, user) {
  const { status, notes } = body || {};
  const params = [status || null, notes || null, id];
  let branchFilter = '';
  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    branchFilter = ` AND branch_id = $${params.length}`;
  }

  const { rows } = await db.query(
    `UPDATE worn_products
     SET status = COALESCE($1, status), notes = COALESCE($2, notes)
     WHERE id = $3${branchFilter}
     RETURNING *`,
    params
  );

  if (rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

module.exports = {
  getSummary,
  listWornProducts,
  createWornProduct,
  updateWornProduct,
};
