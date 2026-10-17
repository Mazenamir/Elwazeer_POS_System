const db = require('../../database/connection');
const config = require('../../config/env');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { queueSyncOperation } = require('../../database/sync.helpers');


async function listCustomers(req, user) {
  const pagination = parsePagination(req, 50, 200, true);

  if (config.IS_BRANCH_MODE) {
    const where = [];
    const params = [];
    if (user && user.role === 'branch_user' && !req.query.search && !req.query.phone && !req.query.name) {
      params.push(user.branch_id);
      where.push('c.branch_id = ?');
    }
    if (req.query.search) {
      params.push(likePattern(req.query.search));
      params.push(likePattern(req.query.search));
      where.push('(c.name LIKE ? OR c.phone LIKE ?)');
    }
    if (req.query.name) {
      params.push(likePattern(req.query.name));
      where.push('c.name LIKE ?');
    }
    if (req.query.phone) {
      params.push(likePattern(req.query.phone));
      where.push('c.phone LIKE ?');
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.sqlite.prepare(`SELECT COUNT(*) as count FROM customers c ${whereClause}`).get(...params).count;

    const dataStmt = db.sqlite.prepare(`
      SELECT c.*, b.name as branch_name
      FROM customers c
      LEFT JOIN branches b ON c.branch_id = b.id
      ${whereClause}
      ORDER BY c.id DESC
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...params, pagination.limit, pagination.offset);
    const payload = paginatedPayload(rows, total, pagination);
    payload.customers = rows;
    return payload;
  }

  let query = `
    SELECT c.*, b.name as branch_name 
    FROM customers c
    LEFT JOIN branches b ON c.branch_id = b.id
  `;
  let countQuery = 'SELECT COUNT(*)::int as total FROM customers c';
  const params = [];
  const where = [];

  if (user && user.role === 'branch_user' && !req.query.search && !req.query.phone && !req.query.name) {
    params.push(user.branch_id);
    where.push(`c.branch_id = $${params.length}`);
  }
  if (req.query.search) {
    params.push(likePattern(req.query.search));
    where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }
  if (req.query.name) {
    params.push(likePattern(req.query.name));
    where.push(`c.name ILIKE $${params.length}`);
  }
  if (req.query.phone) {
    params.push(likePattern(req.query.phone));
    where.push(`c.phone ILIKE $${params.length}`);
  }
  if (req.query.email) {
    params.push(likePattern(req.query.email));
    where.push(`c.email ILIKE $${params.length}`);
  }
  if (req.query.national_id) {
    params.push(likePattern(req.query.national_id));
    where.push(`c.national_id ILIKE $${params.length}`);
  }
  if (req.query.branch_id && req.query.branch_id !== 'all' && (!user || user.role !== 'branch_user')) {
    params.push(req.query.branch_id);
    where.push(`c.branch_id = $${params.length}`);
  }

  if (where.length) {
    const whereClause = ` WHERE ${where.join(' AND ')}`;
    query += whereClause;
    countQuery += whereClause;
  }
  query += ' ORDER BY c.id DESC';

  const queryParams = [...params];
  if (pagination.enabled) {
    query = appendPagination(query, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, params),
    ]);
    const payload = paginatedPayload(dataRes.rows, countRes.rows[0].total, pagination);
    payload.customers = dataRes.rows;
    return payload;
  }

  const { rows } = await db.query(query, queryParams);
  return rows;
}

async function createCustomer(data, user) {
  const { name, email, phone, national_id, status } = data;
  const offlineUuid = newUuid(data.offline_uuid);
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName) {
    const err = new Error('Customer name is required');
    err.statusCode = 400;
    throw err;
  }

  const initials = getInitialsFromName(normalizedName);
  const branchId = (user && user.role === 'branch_user') ? user.branch_id : (data.branch_id || user?.branch_id || 1);
  const customerStatus = status || 'عادي';

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      INSERT INTO customers (name, initials, email, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid, pending_sync)
      VALUES (?, ?, ?, ?, ?, CURRENT_DATE, 0, ?, ?, ?, 1)
      ON CONFLICT(offline_uuid) DO UPDATE SET name = excluded.name, phone = excluded.phone, status = excluded.status
    `);
    const info = stmt.run(normalizedName, initials, email || null, phone || null, national_id || null, customerStatus, branchId, offlineUuid);
    const created = db.sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
    try {
      await queueSyncOperation(db, null, 'customer', 'create', created?.id, branchId, {
        offline_uuid: offlineUuid,
        name: normalizedName,
        initials,
        email: email || null,
        phone: phone || null,
        national_id: national_id || null,
        status: customerStatus,
        branch_id: branchId,
      });
    } catch {}
    return created;
  }

  return db.transaction(async (tx) => {
    const { rows } = await tx.query(
      `INSERT INTO customers (name, initials, email, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid)
       VALUES ($1, $2, $3, $4, $5, ${CAIRO_DATE_SQL}, 0, $6, $7, $8)
       ON CONFLICT (offline_uuid) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone, status = EXCLUDED.status
       RETURNING *`,
      [normalizedName, initials, email, phone, national_id, customerStatus, branchId, offlineUuid]
    );
    return rows[0];
  });
}

async function updateCustomer(id, data, user) {
  const { name, email, phone, national_id, status } = data;
  const normalizedName = typeof name === 'string' ? name.trim() : '';

  if (!normalizedName) {
    const err = new Error('Customer name is required');
    err.statusCode = 400;
    throw err;
  }

  const initials = getInitialsFromName(normalizedName);
  const customerStatus = status || 'عادي';

  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      UPDATE customers SET name = ?, initials = ?, email = ?, phone = ?, national_id = ?, status = ?, pending_sync = 1
      WHERE id = ? AND (branch_id = ? OR ? = 'admin')
    `);
    stmt.run(normalizedName, initials, email || null, phone || null, national_id || null, customerStatus, id, user?.branch_id || 1, user?.role);
    return db.sqlite.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  }

  const { rows } = await db.query(
    `UPDATE customers SET name = $1, initials = $2, email = $3, phone = $4, national_id = $5, status = $6 
     WHERE id = $7 AND (branch_id = $8 OR $9 = 'admin') RETURNING *`,
    [normalizedName, initials, email, phone, national_id, customerStatus, id, user?.branch_id || 1, user?.role]
  );

  if (rows.length === 0) {
    const err = new Error('Unauthorized or not found');
    err.statusCode = 403;
    throw err;
  }
  return rows[0];
}

async function deleteCustomer(id, user) {
  if (config.IS_BRANCH_MODE) {
    const check = db.sqlite.prepare('SELECT branch_id FROM customers WHERE id = ?').get(id);
    if (check && check.branch_id !== user.branch_id && user.role !== 'admin') {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }
    const orderCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM orders WHERE customer_id = ?').get(id)?.count || 0;
    const rentalCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM rentals WHERE customer_id = ?').get(id)?.count || 0;
    const altCount = db.sqlite.prepare('SELECT COUNT(*) as count FROM alterations WHERE customer_id = ?').get(id)?.count || 0;
    if (orderCount > 0 || rentalCount > 0 || altCount > 0) {
      db.sqlite.prepare("UPDATE customers SET status = 'غير نشط' WHERE id = ?").run(id);
    } else {
      db.sqlite.prepare('UPDATE orders SET customer_id = NULL WHERE customer_id = ?').run(id);
      db.sqlite.prepare('UPDATE rentals SET customer_id = NULL WHERE customer_id = ?').run(id);
      db.sqlite.prepare('UPDATE alterations SET customer_id = NULL WHERE customer_id = ?').run(id);
      db.sqlite.prepare('DELETE FROM customers WHERE id = ?').run(id);
    }
    return { success: true };
  }

  const check = await db.query('SELECT branch_id FROM customers WHERE id = $1', [id]);
  if (check.rows.length > 0 && check.rows[0].branch_id !== user.branch_id && user.role !== 'admin') {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  await db.transaction(async (tx) => {
    // Check if customer has history in orders, rentals, or alterations
    const historyCheck = await tx.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM orders WHERE customer_id = $1) as orders_count,
        (SELECT COUNT(*)::int FROM rentals WHERE customer_id = $1) as rentals_count,
        (SELECT COUNT(*)::int FROM alterations WHERE customer_id = $1) as alterations_count
    `, [id]);

    const hasHistory = (Number(historyCheck.rows[0]?.orders_count || 0) > 0) ||
                       (Number(historyCheck.rows[0]?.rentals_count || 0) > 0) ||
                       (Number(historyCheck.rows[0]?.alterations_count || 0) > 0);

    if (hasHistory) {
      // Soft-delete to preserve FK integrity & accounting history
      await tx.query("UPDATE customers SET status = 'غير نشط', is_active = FALSE WHERE id = $1", [id]);
    } else {
      // Safely unlink relations if any and delete
      await tx.query('UPDATE orders SET customer_id = NULL WHERE customer_id = $1', [id]);
      await tx.query('UPDATE rentals SET customer_id = NULL WHERE customer_id = $1', [id]);
      await tx.query('UPDATE alterations SET customer_id = NULL WHERE customer_id = $1', [id]);
      await tx.query('DELETE FROM customers WHERE id = $1', [id]);
    }
  });

  return { success: true };
}

async function getCustomerHistory(id, user, requestedLimit = 200) {
  const historyLimit = Math.min(Math.max(Number.parseInt(requestedLimit, 10) || 200, 10), 200);

  if (config.IS_BRANCH_MODE) {
    const cust = db.sqlite.prepare('SELECT phone, branch_id FROM customers WHERE id = ?').get(id);
    if (!cust) {
      const err = new Error('Customer not found');
      err.statusCode = 404;
      throw err;
    }
    const orders = db.sqlite.prepare('SELECT * FROM orders WHERE customer_id = ? ORDER BY order_date DESC LIMIT ?').all(id, historyLimit);
    const rentals = db.sqlite.prepare('SELECT * FROM rentals WHERE customer_id = ? ORDER BY booking_date DESC LIMIT ?').all(id, historyLimit);
    const alterations = db.sqlite.prepare('SELECT * FROM alterations WHERE customer_id = ? ORDER BY id DESC LIMIT ?').all(id, historyLimit);
    const returns = db.sqlite.prepare(`
      SELECT ret.* FROM returns ret
      JOIN orders o ON ret.order_id = o.id
      WHERE o.customer_id = ?
      ORDER BY ret.return_date DESC LIMIT ?
    `).all(id, historyLimit);
    const tailoring = cust.phone ? db.sqlite.prepare('SELECT * FROM tailoring_orders WHERE customer_phone = ? ORDER BY id DESC LIMIT ?').all(cust.phone, historyLimit) : [];

    return { orders, rentals, alterations, returns, tailoring };
  }

  if (user && user.role === 'branch_user') {
    const customerCheck = await db.query('SELECT phone, branch_id FROM customers WHERE id = $1', [id]);
    if (customerCheck.rows.length === 0) {
      const err = new Error('Customer not found');
      err.statusCode = 404;
      throw err;
    }
    if (Number(customerCheck.rows[0].branch_id) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }
  }

  let customerPhone = null;
  const custRes = await db.query('SELECT phone FROM customers WHERE id = $1', [id]);
  if (custRes.rows.length > 0) customerPhone = custRes.rows[0].phone;

  const ordersRes = await db.query(`
    WITH recent_orders AS (
      SELECT id FROM orders WHERE customer_id = $1 ORDER BY order_date DESC, id DESC LIMIT $2
    )
    SELECT o.*, e.name as seller_name, b.name as branch_name,
           json_agg(json_build_object(
             'name', i.name, 'category', i.category, 'barcode', i.barcode, 'color', i.color, 'size', i.size_cut,
             'quantity', oi.quantity, 'price', oi.price_at_time, 'discount', oi.discount, 'discount_type', oi.discount_type
           )) FILTER (WHERE oi.id IS NOT NULL) as items
    FROM recent_orders ro
    JOIN orders o ON o.id = ro.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN inventory i ON oi.inventory_id = i.id
    LEFT JOIN employees e ON o.seller_id = e.id
    LEFT JOIN branches b ON o.branch_id = b.id
    GROUP BY o.id, e.name, b.name
    ORDER BY o.order_date DESC, o.id DESC
  `, [id, historyLimit]);

  const rentalsRes = await db.query(`
    SELECT r.*, 
           COALESCE(ri.name, i.name) as product_name,
           COALESCE(ri.category, i.category) as product_category,
           COALESCE(ri.barcode, i.barcode) as product_barcode,
           COALESCE(ri.color, i.color) as product_color,
           COALESCE(ri.size_cut, i.size_cut) as product_size,
           e.name as seller_name, b.name as branch_name
    FROM rentals r
    LEFT JOIN inventory i ON r.inventory_id = i.id
    LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
    LEFT JOIN employees e ON r.seller_id = e.id
    LEFT JOIN branches b ON r.branch_id = b.id
    WHERE r.customer_id = $1
    ORDER BY r.booking_date DESC, r.id DESC
    LIMIT $2
  `, [id, historyLimit]);

  const alterationsRes = await db.query(`
    SELECT a.*, i.name as product_name, i.category as product_category, i.barcode as product_barcode, b.name as branch_name
    FROM alterations a
    LEFT JOIN inventory i ON a.inventory_id = i.id
    LEFT JOIN branches b ON a.branch_id = b.id
    WHERE a.customer_id = $1
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $2
  `, [id, historyLimit]);

  const returnsRes = await db.query(`
    WITH recent_returns AS (
      SELECT ret.id FROM returns ret JOIN orders o ON ret.order_id = o.id WHERE o.customer_id = $1 ORDER BY ret.return_date DESC, ret.id DESC LIMIT $2
    )
    SELECT ret.*, o.id as original_order_id, e.name as seller_name, b.name as branch_name,
           json_agg(json_build_object(
             'name', i.name, 'category', i.category, 'barcode', i.barcode, 'color', i.color, 'size', i.size_cut,
             'quantity', ri2.quantity, 'price_at_time', ri2.price_at_time
           )) FILTER (WHERE ri2.id IS NOT NULL) as items
    FROM recent_returns rr
    JOIN returns ret ON ret.id = rr.id
    LEFT JOIN orders o ON ret.order_id = o.id
    LEFT JOIN employees e ON ret.seller_id = e.id
    LEFT JOIN branches b ON o.branch_id = b.id
    LEFT JOIN return_items ri2 ON ret.id = ri2.return_id
    LEFT JOIN inventory i ON ri2.inventory_id = i.id
    GROUP BY ret.id, o.id, e.name, b.name
    ORDER BY ret.return_date DESC, ret.id DESC
  `, [id, historyLimit]);

  const tailoringRes = await db.query(`
    SELECT t.*, COALESCE(e.name, u.username) as seller_name, b.name as branch_name
    FROM tailoring_orders t
    LEFT JOIN users u ON t.created_by = u.id
    LEFT JOIN employees e ON t.seller_id = e.id
    LEFT JOIN branches b ON t.branch_id = b.id
    WHERE t.customer_phone = $1
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT $2
  `, [customerPhone, historyLimit]);

  return {
    orders: ordersRes.rows,
    rentals: rentalsRes.rows,
    alterations: alterationsRes.rows,
    returns: returnsRes.rows,
    tailoring: tailoringRes.rows,
  };
}

module.exports = {
  listCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
};
