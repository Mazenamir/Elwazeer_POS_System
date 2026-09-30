const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { getCairoDateTimeParts } = require('../../../shared/utils/date');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { parsePositiveInt } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { queueSyncOperation, logActivity } = require('../../database/sync.helpers');
const { resolveOrderId } = require('./sales.helpers');

async function getNextOrderId(branchId, user = null) {
  let b_id = branchId;
  if (user && user.role === 'branch_user') {
    b_id = user.branch_id;
  }
  const branch_id = b_id || 1;

  try {
    const result = await db.query(
      "SELECT COALESCE(MAX(branch_invoice_number), 0) + 1 AS next_id FROM orders WHERE branch_id = $1 AND COALESCE(order_source, 'cashier') = 'cashier'",
      [branch_id]
    );
    return { next_id: result.rows[0]?.next_id || 1 };
  } catch (err) {
    return { next_id: '?' };
  }
}

async function listOrders(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);

  let selectQuery = `
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, e.name as seller_name,
           json_agg(json_build_object(
             'id', i.id,
             'name', i.name,
              'category', i.category,
              'barcode', i.barcode,
              'color', i.color,
              'size', i.size_cut,
              'image_url', i.image_url,
              'quantity', oi.quantity, 
              'price_at_time', oi.price_at_time,
              'discount', oi.discount,
              'discount_type', oi.discount_type
           )) FILTER (WHERE oi.id IS NOT NULL) as items
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON o.seller_id = e.id
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN inventory i ON oi.inventory_id = i.id
  `;

  let countQuery = `
    SELECT COUNT(DISTINCT o.id)::int as total
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON o.seller_id = e.id
  `;

  const params = [];
  const where = [`COALESCE(o.order_source, 'cashier') = 'cashier'`];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`o.branch_id = $${params.length}`);
  } else if (query.branch_id) {
    params.push(query.branch_id);
    where.push(`o.branch_id = $${params.length}`);
  }

  if (query.id) {
    params.push(likePattern(String(query.id).replace(/^cashier-/i, '')));
    where.push(`(o.id::text ILIKE $${params.length} OR o.branch_invoice_number::text ILIKE $${params.length})`);
  }

  if (query.customer) {
    params.push(likePattern(query.customer));
    where.push(`c.name ILIKE $${params.length}`);
  }

  if (query.phone) {
    params.push(likePattern(query.phone));
    where.push(`c.phone ILIKE $${params.length}`);
  }

  if (query.date) {
    params.push(query.date);
    where.push(`o.order_date >= $${params.length}::date AND o.order_date < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const whereClause = ` WHERE ${where.join(' AND ')}`;
  selectQuery += whereClause;
  countQuery += whereClause;

  selectQuery += ' GROUP BY o.id, c.name, c.phone, e.name ORDER BY o.order_date DESC, o.id DESC';

  const queryParams = [...params];

  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  selectQuery += ' LIMIT 100';
  const { rows } = await db.query(selectQuery, queryParams);
  return rows;
}

async function createOrder(body, user, req) {
  let {
    customer_name,
    customer_phone,
    items,
    total_amount,
    branch_id,
    payment_method,
    seller_id,
    paid_amount,
    change_amount,
    invoice_discount,
    invoice_discount_type,
    offline_uuid,
  } = body || {};

  const orderOfflineUuid = newUuid(offline_uuid);

  if (user && user.role === 'branch_user') {
    branch_id = user.branch_id;
  }
  const b_id = parseInt(branch_id, 10) || 1;
  const p_method = payment_method || 'cash';

  // Server mode: reject if database is unavailable
  if (!config.IS_BRANCH_MODE && !(await db.isPrimaryDbAvailable())) {
    const err = new Error('قاعدة البيانات غير متاحة حالياً. يرجى المحاولة بعد قليل.');
    err.statusCode = 503;
    err.retry_after = 30;
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const sellerId = Number(seller_id);
  if (!Number.isInteger(sellerId) || sellerId <= 0) {
    const err = new Error('الرجاء اختيار الموظف البائع');
    err.statusCode = 400;
    throw err;
  }

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('Order must include at least one item');
    err.statusCode = 400;
    throw err;
  }

  const normalizedCustomerName = typeof customer_name === 'string' ? customer_name.trim() : '';
  const normalizedCustomerPhone = typeof customer_phone === 'string' ? customer_phone.trim() : '';

  if (!normalizedCustomerName) {
    const err = new Error('الرجاء إدخال اسم العميل');
    err.statusCode = 400;
    throw err;
  }
  if (!normalizedCustomerPhone) {
    const err = new Error('الرجاء إدخال رقم هاتف العميل');
    err.statusCode = 400;
    throw err;
  }

  const { date: todayDate } = getCairoDateTimeParts();
  const sellerRes = await db.query(
    `SELECT e.id, e.branch_id, e.name, a.check_in, a.check_out
     FROM employees e
     LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $2
     WHERE e.id = $1`,
    [sellerId, todayDate]
  );

  if (sellerRes.rows.length === 0) {
    const err = new Error('الموظف البائع غير موجود');
    err.statusCode = 400;
    throw err;
  }

  if (Number(sellerRes.rows[0].branch_id) !== Number(b_id)) {
    const err = new Error('الموظف البائع غير تابع لهذا الفرع');
    err.statusCode = 400;
    throw err;
  }

  if (!sellerRes.rows[0].check_in) {
    const err = new Error('لا يمكن إتمام البيع لأن الموظف البائع ليس داخل الدوام');
    err.statusCode = 400;
    throw err;
  }

  if (sellerRes.rows[0].check_out) {
    const err = new Error('لا يمكن إتمام البيع لأن الموظف البائع سجل الانصراف بالفعل');
    err.statusCode = 400;
    throw err;
  }

  const orderData = await db.transaction(async (tx) => {
    // 1. Handle Customer (Create or Update)
    let customerId;
    const existingCustomer = await tx.query(
      'SELECT id FROM customers WHERE phone = $1 AND branch_id = $2',
      [normalizedCustomerPhone, b_id]
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      await tx.query(
        'UPDATE customers SET total_spent = total_spent + $1 WHERE id = $2',
        [total_amount, customerId]
      );
    } else {
      const initials = getInitialsFromName(normalizedCustomerName);
      const customerOfflineUuid = newUuid();
      const newCust = await tx.query(
        `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid) 
         VALUES ($1, $2, $3, ${CAIRO_DATE_SQL}, $4, $5, $6, $7) RETURNING id`,
        [normalizedCustomerName, initials, normalizedCustomerPhone, total_amount, 'نشط', b_id, customerOfflineUuid]
      );
      customerId = newCust.rows[0].id;
    }

    // 2. Calculate next branch_invoice_number safely with advisory lock
    await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [4001, b_id]);
    const branchOrderRes = await tx.query(
      "SELECT COALESCE(MAX(branch_invoice_number), 0) + 1 AS next_no FROM orders WHERE branch_id = $1 AND COALESCE(order_source, 'cashier') = 'cashier'",
      [b_id]
    );
    const nextBranchInvoiceNumber = branchOrderRes.rows[0].next_no;

    // 3. Create the Order
    const orderResult = await tx.query(
      `INSERT INTO orders (customer_id, total_amount, order_date, branch_id, payment_method, seller_id, paid_amount, change_amount, invoice_discount, invoice_discount_type, branch_invoice_number, offline_uuid) 
       VALUES ($1, $2, ${CAIRO_NOW_SQL}, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, branch_invoice_number`,
      [customerId, total_amount, b_id, p_method, sellerId, paid_amount || 0, change_amount || 0, invoice_discount || 0, invoice_discount_type || 'amount', nextBranchInvoiceNumber, orderOfflineUuid]
    );
    const newOrderId = orderResult.rows[0].id;

    // 4. Add Items & Update Inventory atomically
    for (const item of items) {
      const itemQty = parsePositiveInt(item.quantity, 'quantity');
      const stockCheck = await tx.query(
        'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
        [item.id, b_id]
      );
      if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < itemQty) {
        const err = new Error('Insufficient stock for order item');
        err.statusCode = 400;
        throw err;
      }

      await tx.query(
        'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time, discount, discount_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [newOrderId, item.id, itemQty, item.price, item.discount || 0, item.discount_type || 'amount']
      );

      // Update specific branch stock
      await tx.query(
        'UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3',
        [itemQty, item.id, b_id]
      );

      // Update global legacy stock
      await tx.query(
        'UPDATE inventory SET stock_level = stock_level - $1 WHERE id = $2',
        [itemQty, item.id]
      );
    }

    if (user) {
      await logActivity(user.id, user.username, 'عملية بيع جديدة', `بيع بقيمة ${total_amount} ج.م (طلب #${newOrderId})`, 'POS', b_id);
    }

    await queueSyncOperation(tx, req, 'order', 'create', newOrderId, b_id, {
      offline_uuid: orderOfflineUuid,
      customer: { name: normalizedCustomerName, phone: normalizedCustomerPhone, branch_id: b_id },
      order: {
        total_amount,
        branch_id: b_id,
        payment_method: p_method,
        seller_id: sellerId,
        paid_amount: paid_amount || 0,
        change_amount: change_amount || 0,
        invoice_discount: invoice_discount || 0,
        invoice_discount_type: invoice_discount_type || 'amount',
        branch_invoice_number: nextBranchInvoiceNumber,
      },
      items: items.map((item) => ({
        inventory_id: item.id,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        discount_type: item.discount_type || 'amount',
      })),
    });

    return { orderId: newOrderId, customerId, branchInvoiceNumber: nextBranchInvoiceNumber };
  });

  return {
    success: true,
    orderId: orderData.orderId,
    id: orderData.orderId,
    branch_invoice_number: orderData.branchInvoiceNumber,
    customer_id: orderData.customerId,
  };
}

async function payRemaining(id, amount, paymentMethod, user) {
  const safeAmount = Number(amount);
  if (!safeAmount || safeAmount <= 0) {
    const err = new Error('مبلغ الدفع غير صحيح');
    err.statusCode = 400;
    throw err;
  }

  const resolvedId = await resolveOrderId(db, id);
  if (!resolvedId) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const { rows } = await db.query('SELECT total_amount, paid_amount, branch_id FROM orders WHERE id = $1', [resolvedId]);
  if (rows.length === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const order = rows[0];
  if (user && user.role === 'branch_user' && Number(order.branch_id) !== Number(user.branch_id)) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const newPaidAmount = Number(order.paid_amount || 0) + safeAmount;
  if (newPaidAmount > Number(order.total_amount) + 0.01) {
    const err = new Error('المبلغ المدفوع يتجاوز الباقي المستحق');
    err.statusCode = 400;
    throw err;
  }

  await db.query(
    `UPDATE orders 
     SET paid_amount = $1
     WHERE id = $2`,
    [newPaidAmount, resolvedId]
  );

  return { message: 'تم تسجيل الدفعة بنجاح', newPaidAmount };
}

async function getOrderDetails(id, user) {
  const resolvedId = await resolveOrderId(db, id);
  if (!resolvedId) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const { rows: orderRows } = await db.query(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1`,
    [resolvedId]
  );

  if (orderRows.length === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const order = orderRows[0];
  if (user && user.role === 'branch_user' && Number(order.branch_id) !== Number(user.branch_id)) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const { rows: itemRows } = await db.query(
    `SELECT oi.*, i.name, i.barcode, i.category, i.size_cut, i.color
     FROM order_items oi
     LEFT JOIN inventory i ON oi.inventory_id = i.id
     WHERE oi.order_id = $1`,
    [resolvedId]
  );

  return {
    ...order,
    items: itemRows,
  };
}

async function updateOrder(id, body, user) {
  const {
    items,
    invoice_discount,
    invoice_discount_type,
    total_amount,
    customer_id,
    customer_name,
    customer_phone,
    payment_method,
    seller_id,
    paid_amount,
    change_amount,
  } = body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    const err = new Error('يجب إضافة منتج واحد على الأقل');
    err.statusCode = 400;
    throw err;
  }

  const resolvedId = await resolveOrderId(db, id);
  if (!resolvedId) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const { rows: orderRows } = await db.query('SELECT * FROM orders WHERE id = $1', [resolvedId]);
  if (orderRows.length === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }

  const currentOrder = orderRows[0];
  if (user && user.role === 'branch_user' && Number(currentOrder.branch_id) !== Number(user.branch_id)) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  if (currentOrder.status === 'returned') {
    const err = new Error('لا يمكن تعديل فاتورة تم إرجاعها');
    err.statusCode = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    // 1. Get current items to restore stock
    const { rows: currentItems } = await tx.query('SELECT * FROM order_items WHERE order_id = $1', [resolvedId]);

    // Restore stock for removed or reduced items
    for (const oldItem of currentItems) {
      const newItem = items.find((i) => Number(i.inventory_id) === Number(oldItem.inventory_id));
      const quantityDiff = newItem ? (Number(oldItem.quantity) - Number(newItem.quantity)) : Number(oldItem.quantity);

      if (quantityDiff > 0) {
        await tx.query(
          `UPDATE inventory_branches 
           SET stock_level = stock_level + $1 
           WHERE inventory_id = $2 AND branch_id = $3`,
          [quantityDiff, oldItem.inventory_id, currentOrder.branch_id]
        );
        await tx.query(
          'UPDATE inventory SET stock_level = stock_level + $1 WHERE id = $2',
          [quantityDiff, oldItem.inventory_id]
        );
      }
    }

    // Deduct stock for new or increased items
    for (const newItem of items) {
      const oldItem = currentItems.find((i) => Number(i.inventory_id) === Number(newItem.inventory_id));
      const quantityDiff = oldItem ? (Number(newItem.quantity) - Number(oldItem.quantity)) : Number(newItem.quantity);

      if (quantityDiff > 0) {
        const { rows: stockRows } = await tx.query(
          `SELECT stock_level FROM inventory_branches 
           WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE`,
          [newItem.inventory_id, currentOrder.branch_id]
        );

        if (stockRows.length === 0 || Number(stockRows[0].stock_level) < quantityDiff) {
          const err = new Error('المخزون غير كافي للمنتج');
          err.statusCode = 400;
          throw err;
        }

        await tx.query(
          `UPDATE inventory_branches 
           SET stock_level = stock_level - $1 
           WHERE inventory_id = $2 AND branch_id = $3`,
          [quantityDiff, newItem.inventory_id, currentOrder.branch_id]
        );
        await tx.query(
          'UPDATE inventory SET stock_level = stock_level - $1 WHERE id = $2',
          [quantityDiff, newItem.inventory_id]
        );
      }
    }

    // Handle customer update / creation
    let finalCustomerId = customer_id;
    if (customer_name && customer_phone) {
      const { rows: existingCustomer } = await tx.query(
        'SELECT id FROM customers WHERE phone = $1 AND branch_id = $2',
        [customer_phone, currentOrder.branch_id]
      );

      if (existingCustomer.length > 0) {
        finalCustomerId = existingCustomer[0].id;
        await tx.query(
          'UPDATE customers SET name = $1 WHERE id = $2',
          [customer_name, finalCustomerId]
        );
      } else if (currentOrder.customer_id) {
        finalCustomerId = currentOrder.customer_id;
        await tx.query(
          'UPDATE customers SET name = $1, phone = $2 WHERE id = $3',
          [customer_name, customer_phone, finalCustomerId]
        );
      } else {
        const { rows: newCustomer } = await tx.query(
          `INSERT INTO customers (name, phone, branch_id, join_date) 
           VALUES ($1, $2, $3, ${CAIRO_DATE_SQL}) RETURNING id`,
          [customer_name, customer_phone, currentOrder.branch_id]
        );
        finalCustomerId = newCustomer[0].id;
      }
    }

    // Update order record
    await tx.query(
      `UPDATE orders 
       SET total_amount = $1, 
           invoice_discount = $2, 
           invoice_discount_type = $3,
           customer_id = $4,
           payment_method = $5,
           seller_id = $6,
           paid_amount = $7,
           change_amount = $8
       WHERE id = $9`,
      [
        total_amount,
        invoice_discount || 0,
        invoice_discount_type || 'amount',
        finalCustomerId,
        payment_method,
        seller_id,
        paid_amount || 0,
        change_amount || 0,
        resolvedId,
      ]
    );

    // Delete old items and insert updated items
    await tx.query('DELETE FROM order_items WHERE order_id = $1', [resolvedId]);

    for (const item of items) {
      await tx.query(
        `INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time, discount, discount_type) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resolvedId, item.inventory_id, item.quantity, item.price_at_time, item.discount || 0, item.discount_type || 'amount']
      );
    }
  });

  return { message: 'تم تحديث الفاتورة بنجاح' };
}

async function searchOrders(queryStr, branchId, user) {
  // If query looks like an offline invoice (OFF-xxxx), search by offline_uuid
  if (typeof queryStr === 'string' && queryStr.toUpperCase().startsWith('OFF-')) {
    const offlinePart = queryStr.slice(4);
    const offParams = [offlinePart + '%'];
    const offWhere = [
      `o.offline_uuid LIKE $1`,
      `COALESCE(o.order_source, 'cashier') = 'cashier'`,
    ];

    if (user && user.role === 'branch_user') {
      offParams.push(user.branch_id);
      offWhere.push(`o.branch_id = $${offParams.length}`);
    } else if (branchId) {
      offParams.push(branchId);
      offWhere.push(`o.branch_id = $${offParams.length}`);
    }

    const { rows } = await db.query(
      `SELECT o.*, c.name as customer_name, c.phone as customer_phone,
              json_agg(json_build_object(
                'id', i.id,
                'name', i.name,
                'category', i.category,
                'barcode', i.barcode,
                'color', i.color,
                'size', i.size_cut,
                'image_url', i.image_url,
                'quantity', oi.quantity, 
                'price_at_time', oi.price_at_time,
                'discount', oi.discount,
                'discount_type', oi.discount_type
              )) as items
       FROM orders o
       LEFT JOIN customers c ON o.customer_id = c.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN inventory i ON oi.inventory_id = i.id
       WHERE ${offWhere.join(' AND ')}
       GROUP BY o.id, c.name, c.phone
       ORDER BY o.order_date DESC
       LIMIT 10`,
      offParams
    );
    return rows;
  }

  const params = [queryStr, likePattern(queryStr), likePattern(queryStr)];
  const where = [
    `(o.id::text = $1 OR c.name ILIKE $2 OR c.phone LIKE $3)`,
    `COALESCE(o.order_source, 'cashier') = 'cashier'`,
  ];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`o.branch_id = $${params.length}`);
  } else if (branchId) {
    params.push(branchId);
    where.push(`o.branch_id = $${params.length}`);
  }

  const { rows } = await db.query(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone,
            json_agg(json_build_object(
              'id', i.id,
              'name', i.name,
              'category', i.category,
               'barcode', i.barcode,
               'color', i.color,
               'size', i.size_cut,
               'image_url', i.image_url,
               'quantity', oi.quantity, 
               'price_at_time', oi.price_at_time,
               'discount', oi.discount,
               'discount_type', oi.discount_type
            )) as items
     FROM orders o
     LEFT JOIN customers c ON o.customer_id = c.id
     LEFT JOIN order_items oi ON o.id = oi.order_id
     LEFT JOIN inventory i ON oi.inventory_id = i.id
     WHERE ${where.join(' AND ')}
     GROUP BY o.id, c.name, c.phone
     ORDER BY o.order_date DESC
     LIMIT 10`,
    params
  );
  return rows;
}

async function createReturn(body, user, req) {
  let { order_id, items, total_return_amount, branch_id, seller_id, offline_uuid } = body || {};
  const returnOfflineUuid = newUuid(offline_uuid);

  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('يجب اختيار صنف واحد على الأقل لإتمام المرتجع');
    err.statusCode = 400;
    throw err;
  }

  // Server mode: reject if database is unavailable
  if (!config.IS_BRANCH_MODE && !(await db.isPrimaryDbAvailable())) {
    const err = new Error('قاعدة البيانات غير متاحة حالياً. يرجى المحاولة بعد قليل.');
    err.statusCode = 503;
    err.retry_after = 30;
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  // Resolve offline order IDs (OFF-xxxx) to real database IDs
  const resolvedOrderId = await resolveOrderId(db, order_id);
  if (!resolvedOrderId) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }
  order_id = resolvedOrderId;

  const orderRes = await db.query('SELECT branch_id, seller_id FROM orders WHERE id = $1', [order_id]);
  if (orderRes.rows.length === 0) {
    const err = new Error('Order not found');
    err.statusCode = 404;
    throw err;
  }

  const orderBranchId = orderRes.rows[0].branch_id;
  if (user && user.role === 'branch_user' && Number(orderBranchId) !== Number(user.branch_id)) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  branch_id = orderBranchId;
  let s_id = seller_id === '' || seller_id === undefined ? null : seller_id;
  if (!s_id) {
    s_id = orderRes.rows[0]?.seller_id || null;
  }

  const returnData = await db.transaction(async (tx) => {
    // 1. Create Return record
    const returnResult = await tx.query(
      'INSERT INTO returns (order_id, total_return_amount, branch_id, seller_id, offline_uuid) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [order_id, total_return_amount, branch_id, s_id, returnOfflineUuid]
    );
    const returnId = returnResult.rows[0].id;

    // 2. Add return items and update inventory
    for (const item of items) {
      await tx.query(
        'INSERT INTO return_items (return_id, inventory_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
        [returnId, item.id, item.quantity, item.price]
      );

      // Return stock to branch
      await tx.query(
        'UPDATE inventory_branches SET stock_level = stock_level + $1 WHERE inventory_id = $2 AND branch_id = $3',
        [item.quantity, item.id, branch_id]
      );

      // Return stock to global inventory
      await tx.query(
        'UPDATE inventory SET stock_level = stock_level + $1 WHERE id = $2',
        [item.quantity, item.id]
      );
    }

    // 3. Update Order Status
    await tx.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      ['returned', order_id]
    );

    if (user) {
      await logActivity(user.id, user.username, 'مرتجع مبيعات', `مرتجع بقيمة ${total_return_amount} ج.م (طلب #${order_id})`, 'POS', branch_id);
    }

    await queueSyncOperation(tx, req, 'return', 'create', returnId, branch_id, {
      offline_uuid: returnOfflineUuid,
      order_id,
      total_return_amount,
      branch_id,
      seller_id: s_id,
      items: items.map((item) => ({
        inventory_id: item.id,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    return { returnId };
  });

  return { success: true, returnId: returnData.returnId };
}

async function listReturns(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);

  let selectQuery = `
    SELECT r.*, o.id as original_order_id, c.name as customer_name, c.phone as customer_phone, e.name as seller_name,
           json_agg(json_build_object(
             'id', i.id,
             'name', i.name,
             'category', i.category,
             'barcode', i.barcode,
             'color', i.color,
             'size', i.size_cut,
             'image_url', i.image_url,
             'quantity', ri.quantity,
             'price_at_time', ri.price_at_time
           )) FILTER (WHERE ri.id IS NOT NULL) as items
    FROM returns r
    LEFT JOIN orders o ON r.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON r.seller_id = e.id
    LEFT JOIN return_items ri ON r.id = ri.return_id
    LEFT JOIN inventory i ON ri.inventory_id = i.id
  `;

  let countQuery = `
    SELECT COUNT(DISTINCT r.id)::int as total
    FROM returns r
    LEFT JOIN orders o ON r.order_id = o.id
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN employees e ON r.seller_id = e.id
  `;

  const params = [];
  const where = [];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`o.branch_id = $${params.length}`);
  } else if (query.branch_id) {
    params.push(query.branch_id);
    where.push(`o.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(o.id::text ILIKE $${params.length} OR c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length})`);
  }

  if (query.return_id) {
    params.push(likePattern(String(query.return_id).replace(/^ret-/i, '')));
    where.push(`r.id::text ILIKE $${params.length}`);
  }

  if (query.order_id) {
    params.push(likePattern(String(query.order_id).replace(/^cashier-/i, '')));
    where.push(`o.id::text ILIKE $${params.length}`);
  }

  if (query.customer) {
    params.push(likePattern(query.customer));
    where.push(`c.name ILIKE $${params.length}`);
  }

  if (query.phone) {
    params.push(likePattern(query.phone));
    where.push(`c.phone ILIKE $${params.length}`);
  }

  if (query.date) {
    params.push(query.date);
    where.push(`r.return_date >= $${params.length}::date AND r.return_date < ($${params.length}::date + INTERVAL '1 day')`);
  }

  if (where.length) {
    const whereClause = ` WHERE ${where.join(' AND ')}`;
    selectQuery += whereClause;
    countQuery += whereClause;
  }

  selectQuery += ' GROUP BY r.id, o.id, c.name, c.phone, e.name ORDER BY r.return_date DESC';

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

module.exports = {
  getNextOrderId,
  listOrders,
  createOrder,
  payRemaining,
  getOrderDetails,
  updateOrder,
  searchOrders,
  createReturn,
  listReturns,
};
