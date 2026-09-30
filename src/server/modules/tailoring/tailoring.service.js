const db = require('../../database/connection');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { resolveOrderId } = require('../sales/sales.helpers');
const { logActivity } = require('../../database/sync.helpers');

// ==========================================
// ALTERATIONS
// ==========================================

async function listAlterations(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);

  let selectQuery = `
    SELECT alt.*,
           c.name as customer_name,
           c.phone as customer_phone,
           b.name as branch_name,
           COALESCE(ai.id, first_item.id) as product_id,
           COALESCE(ai.name, first_item.name) as product_name,
           COALESCE(ai.category, first_item.category) as product_category,
           COALESCE(ai.barcode, first_item.barcode) as product_barcode,
           COALESCE(ai.image_url, first_item.image_url) as product_image_url,
           COALESCE(ai.color, first_item.color) as product_color,
           COALESCE(ai.size_cut, first_item.size_cut) as product_size
    FROM alterations alt
    LEFT JOIN customers c ON alt.customer_id = c.id
    LEFT JOIN branches b ON alt.branch_id = b.id
    LEFT JOIN inventory ai ON alt.inventory_id = ai.id
    LEFT JOIN LATERAL (
      SELECT i.id, i.name, i.category, i.barcode, i.image_url, i.color, i.size_cut
      FROM order_items oi
      JOIN inventory i ON oi.inventory_id = i.id
      WHERE oi.order_id = alt.order_id
      ORDER BY oi.id
      LIMIT 1
    ) first_item ON TRUE
  `;

  let countQuery = `
    SELECT COUNT(*)::int as total
    FROM alterations alt
    LEFT JOIN customers c ON alt.customer_id = c.id
    LEFT JOIN inventory ai ON alt.inventory_id = ai.id
    LEFT JOIN LATERAL (
      SELECT i.id, i.name, i.category, i.barcode
      FROM order_items oi
      JOIN inventory i ON oi.inventory_id = i.id
      WHERE oi.order_id = alt.order_id
      ORDER BY oi.id
      LIMIT 1
    ) first_item ON TRUE
  `;

  const params = [];
  const where = [];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`alt.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      c.name ILIKE $${params.length}
      OR COALESCE(ai.name, first_item.name, '') ILIKE $${params.length}
      OR COALESCE(ai.category, first_item.category, '') ILIKE $${params.length}
      OR COALESCE(ai.barcode, first_item.barcode, '') ILIKE $${params.length}
    )`);
  }

  if (query.status) {
    if (query.status === 'pending') {
      where.push(`alt.status IN ('pending', 'in_progress')`);
    } else {
      params.push(query.status);
      where.push(`alt.status = $${params.length}`);
    }
  }

  if (where.length) {
    const whereClause = ` WHERE ${where.join(' AND ')}`;
    selectQuery += whereClause;
    countQuery += whereClause;
  }

  selectQuery += ' ORDER BY alt.created_at DESC';
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

async function createAlteration(body, user) {
  let { order_id, customer_id, branch_id, description, due_date, inventory_id } = body || {};

  // Resolve offline order IDs (OFF-xxxx) to real database IDs
  if (order_id) {
    const resolvedId = await resolveOrderId(db, order_id);
    if (resolvedId) order_id = resolvedId;
  }

  if (!branch_id) {
    branch_id = user ? user.branch_id : null;
  }

  if (!branch_id && order_id) {
    const orderRes = await db.query('SELECT branch_id FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length > 0) {
      branch_id = orderRes.rows[0].branch_id;
    }
  }

  const b_id = branch_id || 1;
  let finalInventoryId = inventory_id || null;

  if (!finalInventoryId && order_id) {
    const itemRes = await db.query(
      'SELECT inventory_id FROM order_items WHERE order_id = $1 ORDER BY id LIMIT 1',
      [order_id]
    );
    finalInventoryId = itemRes.rows[0]?.inventory_id || null;
  }

  const { rows } = await db.query(
    'INSERT INTO alterations (order_id, customer_id, branch_id, description, due_date, inventory_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [order_id, customer_id, b_id, description, due_date, finalInventoryId]
  );
  return rows[0];
}

async function updateAlteration(id, body) {
  const { status, description, due_date } = body || {};
  const { rows } = await db.query(
    'UPDATE alterations SET status = COALESCE($1, status), description = COALESCE($2, description), due_date = COALESCE($3, due_date) WHERE id = $4 RETURNING *',
    [status, description, due_date, id]
  );

  if (rows.length === 0) {
    const err = new Error('Alteration not found');
    err.statusCode = 404;
    throw err;
  }
  return rows[0];
}

async function deleteAlteration(id, user) {
  const params = [id];
  let query = `
    DELETE FROM alterations
    WHERE id = $1
      AND status IN ('pending', 'in_progress')
  `;

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    query += ` AND branch_id = $2`;
  }

  query += ' RETURNING id, order_id';
  const { rows } = await db.query(query, params);

  if (rows.length === 0) {
    const err = new Error('يمكن حذف طلبات التعديل الموجودة تحت التنفيذ فقط');
    err.statusCode = 409;
    throw err;
  }

  if (user) {
    await logActivity(
      user.id,
      user.username,
      'حذف طلب تعديل',
      `تم حذف طلب التعديل للفاتورة #${rows[0].order_id}`,
      'Alterations'
    );
  }

  return { message: 'تم حذف طلب التعديل بنجاح' };
}

// ==========================================
// TAILORING ORDERS
// ==========================================

async function listTailoringOrders(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 30, 100, true);
  const params = [];
  const where = [];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`t.branch_id = $${params.length}`);
  } else if (query.branch_id) {
    params.push(query.branch_id);
    where.push(`t.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      t.invoice_number ILIKE $${params.length}
      OR t.customer_name ILIKE $${params.length}
      OR t.customer_phone ILIKE $${params.length}
      OR t.product_description ILIKE $${params.length}
    )`);
  }

  if (query.invoice_number) {
    params.push(likePattern(query.invoice_number));
    where.push(`t.invoice_number ILIKE $${params.length}`);
  }

  if (query.customer_name) {
    params.push(likePattern(query.customer_name));
    where.push(`t.customer_name ILIKE $${params.length}`);
  }

  if (query.customer_phone) {
    params.push(likePattern(query.customer_phone));
    where.push(`t.customer_phone ILIKE $${params.length}`);
  }

  const whereClause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const baseQuery = `
    SELECT t.*, b.name AS branch_name, u.username AS created_by_name, e.name AS seller_name
    FROM tailoring_orders t
    LEFT JOIN branches b ON b.id = t.branch_id
    LEFT JOIN users u ON u.id = t.created_by
    LEFT JOIN employees e ON e.id = t.seller_id
    ${whereClause}
    ORDER BY t.created_at DESC, t.id DESC
  `;

  const queryParams = [...params];
  const selectQuery = appendPagination(baseQuery, queryParams, pagination);
  const [dataRes, countRes] = await Promise.all([
    db.query(selectQuery, queryParams),
    db.query(`SELECT COUNT(*)::int AS total FROM tailoring_orders t${whereClause}`, params),
  ]);

  return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
}

async function createTailoringOrder(body, user) {
  const customerName = String(body?.customer_name || '').trim();
  const customerPhone = String(body?.customer_phone || '').trim();
  const productDescription = String(body?.product_description || '').trim();
  const measurements = String(body?.measurements || '').trim();
  const paidAmount = Number(body?.paid_amount);
  const remainingAmount = Number(body?.remaining_amount || 0);
  const paymentMethod = String(body?.payment_method || 'cash').trim() || 'cash';
  const sellerId = Number.parseInt(body?.seller_id || 0, 10) || null;

  if (!customerName || !customerPhone || !productDescription || !measurements) {
    const err = new Error('اسم العميل ورقم الهاتف ووصف المنتج والمقاسات مطلوبة');
    err.statusCode = 400;
    throw err;
  }

  if (!/^\+?[0-9\s-]{7,20}$/.test(customerPhone)) {
    const err = new Error('رقم الهاتف غير صحيح');
    err.statusCode = 400;
    throw err;
  }

  if (body?.paid_amount === '' || body?.paid_amount === null || body?.paid_amount === undefined || !Number.isFinite(paidAmount) || paidAmount <= 0) {
    const err = new Error('المدفوع يجب أن يكون أكبر من صفر');
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(remainingAmount) || remainingAmount < 0) {
    const err = new Error('المدفوع والمتبقي يجب أن يكونا أرقاماً موجبة');
    err.statusCode = 400;
    throw err;
  }

  const offlineUuid = newUuid(body?.offline_uuid);
  const branchId = user?.role === 'branch_user'
    ? user.branch_id
    : (body?.branch_id || user?.branch_id || 1);

  if (!sellerId) {
    const err = new Error('الرجاء اختيار الموظف البائع');
    err.statusCode = 400;
    throw err;
  }

  const sellerRes = await db.query('SELECT branch_id FROM employees WHERE id = $1', [sellerId]);
  if (sellerRes.rows.length === 0) {
    const err = new Error('الموظف غير موجود');
    err.statusCode = 400;
    throw err;
  }

  if (Number(sellerRes.rows[0].branch_id) !== Number(branchId)) {
    const err = new Error('الموظف لا يتبع الفرع المختار');
    err.statusCode = 400;
    throw err;
  }

  const created = await db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tailoring-invoice:${branchId}`]);
    const nextRes = await tx.query(
      `SELECT COALESCE(
         MAX(invoice_number::bigint) FILTER (WHERE invoice_number ~ '^[0-9]+$'),
         0
       ) + 1 AS next_number
       FROM tailoring_orders
       WHERE branch_id = $1`,
      [branchId]
    );
    const invoiceNumber = String(nextRes.rows[0].next_number);

    const { rows } = await tx.query(
      `INSERT INTO tailoring_orders
        (invoice_number, customer_name, customer_phone, product_description, measurements, total_amount,
         paid_amount, remaining_amount, payment_method, seller_id, branch_id, created_by, offline_uuid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14::timestamp, ${CAIRO_NOW_SQL}))
       ON CONFLICT (offline_uuid) DO UPDATE SET offline_uuid = EXCLUDED.offline_uuid
       RETURNING *`,
      [
        invoiceNumber,
        customerName,
        customerPhone,
        productDescription,
        measurements,
        paidAmount + remainingAmount,
        paidAmount,
        remainingAmount,
        paymentMethod,
        sellerId,
        branchId,
        user.id,
        offlineUuid,
        body?.created_at || null,
      ]
    );

    const order = rows[0];

    const custRes = await tx.query('SELECT id FROM customers WHERE phone = $1 LIMIT 1', [customerPhone]);
    if (custRes.rows.length === 0) {
      const initials = getInitialsFromName(customerName);
      const customerOfflineUuid = newUuid();
      await tx.query(
        `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid) 
         VALUES ($1, $2, $3, ${CAIRO_DATE_SQL}, $4, $5, $6, $7)`,
        [customerName, initials, customerPhone, 0, 'عادي', branchId, customerOfflineUuid]
      );
    }

    if (paidAmount > 0) {
      await tx.query(
        `INSERT INTO tailoring_payments (tailoring_order_id, amount, branch_id, payment_date, is_remainder)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [order.id, paidAmount, branchId, order.created_at]
      );
    }

    return order;
  });

  return { ...created, offline: false, pending_sync: false };
}

async function deleteTailoringOrder(id, user) {
  let orderId = null;

  if (String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const { rows } = await db.query('SELECT id FROM tailoring_orders WHERE offline_uuid = $1', [id]);
    if (rows.length > 0) orderId = rows[0].id;
  } else if (/^\d+$/.test(String(id))) {
    orderId = parseInt(id, 10);
  }

  if (!orderId) {
    const err = new Error('الفاتورة غير موجودة');
    err.statusCode = 404;
    throw err;
  }

  const { rows: orderRows } = await db.query('SELECT * FROM tailoring_orders WHERE id = $1', [orderId]);
  if (orderRows.length === 0) {
    const err = new Error('الفاتورة غير موجودة');
    err.statusCode = 404;
    throw err;
  }

  const order = orderRows[0];
  if (user && user.role === 'branch_user' && Number(order.branch_id) !== Number(user.branch_id)) {
    const err = new Error('غير مصرح لك بحذف هذه الفاتورة');
    err.statusCode = 403;
    throw err;
  }

  await db.query('DELETE FROM tailoring_orders WHERE id = $1', [orderId]);

  if (user) {
    await logActivity(
      user.id,
      user.username,
      'حذف فاتورة تفصيل',
      `تم حذف فاتورة التفصيل #${order.invoice_number} للعميل ${order.customer_name}`,
      'Tailoring',
      order.branch_id
    );
  }

  return { message: 'تم حذف الفاتورة بنجاح' };
}

async function payRemainingTailoringOrder(id, user) {
  let orderId = null;

  if (String(id).match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const { rows } = await db.query('SELECT id FROM tailoring_orders WHERE offline_uuid = $1', [id]);
    if (rows.length > 0) orderId = rows[0].id;
  } else if (/^\d+$/.test(String(id))) {
    orderId = parseInt(id, 10);
  }

  if (!orderId) {
    const err = new Error('الفاتورة غير موجودة');
    err.statusCode = 404;
    throw err;
  }

  const { rows: orderRows } = await db.query('SELECT * FROM tailoring_orders WHERE id = $1', [orderId]);
  if (orderRows.length === 0) {
    const err = new Error('الفاتورة غير موجودة');
    err.statusCode = 404;
    throw err;
  }

  const order = orderRows[0];
  if (user && user.role === 'branch_user' && Number(order.branch_id) !== Number(user.branch_id)) {
    const err = new Error('غير مصرح لك بتعديل هذه الفاتورة');
    err.statusCode = 403;
    throw err;
  }

  if (Number(order.remaining_amount) <= 0) {
    const err = new Error('لا يوجد مبلغ متبقي لدفعه');
    err.statusCode = 400;
    throw err;
  }

  const newPaidAmount = Number(order.paid_amount) + Number(order.remaining_amount);

  await db.transaction(async (tx) => {
    await tx.query(
      'UPDATE tailoring_orders SET paid_amount = $1, remaining_amount = 0 WHERE id = $2',
      [newPaidAmount, orderId]
    );

    await tx.query(
      `INSERT INTO tailoring_payments (tailoring_order_id, amount, branch_id, payment_date, is_remainder)
       VALUES ($1, $2, $3, ${CAIRO_NOW_SQL}, TRUE)`,
      [orderId, order.remaining_amount, order.branch_id]
    );
  });

  if (user) {
    await logActivity(
      user.id,
      user.username,
      'دفع مبلغ تفصيل',
      `تم دفع المبلغ المتبقي (${order.remaining_amount} ج.م) لفاتورة التفصيل #${order.invoice_number}`,
      'Tailoring',
      order.branch_id
    );
  }

  return { message: 'تم الدفع بنجاح' };
}

module.exports = {
  listAlterations,
  createAlteration,
  updateAlteration,
  deleteAlteration,
  listTailoringOrders,
  createTailoringOrder,
  deleteTailoringOrder,
  payRemainingTailoringOrder,
};
