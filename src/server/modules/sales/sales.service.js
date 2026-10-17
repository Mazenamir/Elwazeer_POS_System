const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { getCairoDateTimeParts } = require('../../../shared/utils/date');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { parsePositiveInt, roundCurrency } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { queueSyncOperation, logActivity } = require('../../database/sync.helpers');
const { resolveOrderId } = require('./sales.helpers');

async function getNextOrderId(branchId, user = null) {
  let b_id = branchId;
  if (user && user.role === 'branch_user') {
    b_id = user.branch_id;
  }
  const branch_id = (b_id && b_id !== 'all' && Number.isFinite(Number(b_id))) ? Number(b_id) : (user?.branch_id || 1);

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
  } else if (query.branch_id && query.branch_id !== 'all') {
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

  // Aggregate quantities by inventory item ID
  const itemQtyMap = new Map();
  for (const item of items) {
    const itemId = Number(item.id ?? item.inventory_id);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      const err = new Error('معرف الصنف غير صالح');
      err.statusCode = 400;
      throw err;
    }
    const qty = parsePositiveInt(item.quantity, 'quantity');
    itemQtyMap.set(itemId, (itemQtyMap.get(itemId) || 0) + qty);
  }

  // Pre-sort unique item IDs ascending to strictly prevent deadlocks
  const sortedItemIds = Array.from(itemQtyMap.keys()).sort((a, b) => a - b);

  const orderData = await db.transaction(async (tx) => {
    // Concurrency protection on customer
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${normalizedCustomerPhone}`]);

    // 1. Lock global inventory and branch stock in ascending item ID order
    const canonicalProducts = new Map();
    for (const itemId of sortedItemIds) {
      const requiredQty = itemQtyMap.get(itemId);

      // Lock and validate global inventory row
      const globalStockCheck = await tx.query(
        'SELECT id, name, price, stock_level FROM inventory WHERE id = $1 FOR UPDATE',
        [itemId]
      );
      if (globalStockCheck.rows.length === 0) {
        const err = new Error(`المنتج #${itemId} غير موجود`);
        err.statusCode = 404;
        throw err;
      }
      const globalRow = globalStockCheck.rows[0];
      if (Number(globalRow.stock_level) < requiredQty) {
        const err = new Error(`المخزون العام غير كافٍ للمنتج "${globalRow.name}"`);
        err.statusCode = 400;
        throw err;
      }
      canonicalProducts.set(itemId, globalRow);

      // Lock and validate branch inventory row
      const branchStockCheck = await tx.query(
        'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
        [itemId, b_id]
      );
      if (branchStockCheck.rows.length === 0 || Number(branchStockCheck.rows[0].stock_level) < requiredQty) {
        const err = new Error(`المخزون غير كافٍ للمنتج "${globalRow.name}" في هذا الفرع`);
        err.statusCode = 400;
        throw err;
      }
    }

    // 2. Recalculate line prices and total using canonical database prices (anti-tampering)
    let calculatedSubtotal = 0;
    const processedOrderItems = [];

    for (const item of items) {
      const itemId = Number(item.id ?? item.inventory_id);
      const itemQty = parsePositiveInt(item.quantity, 'quantity');
      const canonicalPrice = roundCurrency(Number(canonicalProducts.get(itemId).price || 0));

      const discountVal = Math.max(0, Number(item.discount || 0));
      const discountType = item.discount_type || 'amount';
      const isPercent = discountType === 'percent' || discountType === 'percentage';
      let itemDiscountAmount = 0;
      if (discountVal > 0) {
        if (isPercent) {
          itemDiscountAmount = roundCurrency((canonicalPrice * itemQty) * (discountVal / 100));
        } else {
          itemDiscountAmount = Math.min(roundCurrency(canonicalPrice * itemQty), roundCurrency(discountVal));
        }
      }
      const lineNet = Math.max(0, roundCurrency((canonicalPrice * itemQty) - itemDiscountAmount));
      calculatedSubtotal = roundCurrency(calculatedSubtotal + lineNet);

      const itemSize = String(item.size || item.size_cut || '').trim() || null;

      processedOrderItems.push({
        inventory_id: itemId,
        quantity: itemQty,
        price_at_time: canonicalPrice,
        discount: discountVal,
        discount_type: discountType,
        line_net: lineNet,
        size: itemSize,
      });
    }

    // Invoice discount calculation
    const invDiscountVal = Math.max(0, Number(invoice_discount || 0));
    const invDiscountType = invoice_discount_type || 'amount';
    const isInvPercent = invDiscountType === 'percent' || invDiscountType === 'percentage';
    let invoiceDiscountAmount = 0;
    if (invDiscountVal > 0) {
      if (isInvPercent) {
        invoiceDiscountAmount = roundCurrency(calculatedSubtotal * (invDiscountVal / 100));
      } else {
        invoiceDiscountAmount = Math.min(calculatedSubtotal, roundCurrency(invDiscountVal));
      }
    }

    const finalTotalAmount = Math.max(0, roundCurrency(calculatedSubtotal - invoiceDiscountAmount));

    // 3. Handle Customer (Create or Update)
    let customerId;
    const existingCustomer = await tx.query(
      'SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE',
      [normalizedCustomerPhone, b_id]
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      await tx.query(
        'UPDATE customers SET total_spent = total_spent + $1 WHERE id = $2',
        [finalTotalAmount, customerId]
      );
    } else {
      const initials = getInitialsFromName(normalizedCustomerName);
      const customerOfflineUuid = newUuid();
      try {
        const newCust = await tx.query(
          `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid) 
           VALUES ($1, $2, $3, ${CAIRO_DATE_SQL}, $4, $5, $6, $7) RETURNING id`,
          [normalizedCustomerName, initials, normalizedCustomerPhone, finalTotalAmount, 'نشط', b_id, customerOfflineUuid]
        );
        customerId = newCust.rows[0].id;
      } catch (insertErr) {
        const retryCust = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [normalizedCustomerPhone, b_id]);
        if (retryCust.rows.length) {
          customerId = retryCust.rows[0].id;
          await tx.query('UPDATE customers SET total_spent = total_spent + $1 WHERE id = $2', [finalTotalAmount, customerId]);
        } else {
          throw insertErr;
        }
      }
    }

    // 4. Calculate next branch_invoice_number safely with advisory lock
    await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [4001, b_id]);
    const branchOrderRes = await tx.query(
      "SELECT COALESCE(MAX(branch_invoice_number), 0) + 1 AS next_no FROM orders WHERE branch_id = $1 AND COALESCE(order_source, 'cashier') = 'cashier'",
      [b_id]
    );
    const nextBranchInvoiceNumber = branchOrderRes.rows[0].next_no;

    // Financial paid/change handling
    const roundedPaid = Math.max(0, roundCurrency(Number(paid_amount || 0)));
    const roundedChange = roundCurrency(Math.max(0, roundedPaid - finalTotalAmount));

    // 5. Create the Order
    const orderResult = await tx.query(
      `INSERT INTO orders (customer_id, total_amount, order_date, branch_id, payment_method, seller_id, paid_amount, change_amount, invoice_discount, invoice_discount_type, branch_invoice_number, offline_uuid) 
       VALUES ($1, $2, ${CAIRO_NOW_SQL}, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, branch_invoice_number`,
      [customerId, finalTotalAmount, b_id, p_method, sellerId, roundedPaid, roundedChange, invDiscountVal, invDiscountType, nextBranchInvoiceNumber, orderOfflineUuid]
    );
    const newOrderId = orderResult.rows[0].id;

    // 6. Add Items & Update Inventory atomically
    for (const item of processedOrderItems) {
      await tx.query(
        'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time, discount, discount_type, size) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [newOrderId, item.inventory_id, item.quantity, item.price_at_time, item.discount, item.discount_type, item.size]
      );

      // Decrement branch stock
      await tx.query(
        'UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3',
        [item.quantity, item.inventory_id, b_id]
      );

      // Decrement specific size stock if size was specified
      if (item.size) {
        await tx.query(
          `UPDATE inventory_sizes 
           SET stock_level = GREATEST(stock_level - $1, 0), updated_at = CURRENT_TIMESTAMP
           WHERE inventory_id = $2 AND branch_id = $3 AND LOWER(TRIM(size_name)) = LOWER(TRIM($4))`,
          [item.quantity, item.inventory_id, b_id, item.size]
        );
      }

      // Decrement global stock atomically
      await tx.query(
        'UPDATE inventory SET stock_level = stock_level - $1 WHERE id = $2',
        [item.quantity, item.inventory_id]
      );
    }

    if (user) {
      await logActivity(user.id, user.username, 'عملية بيع جديدة', `بيع بقيمة ${finalTotalAmount} ج.م (طلب #${newOrderId})`, 'POS', b_id);
    }

    await queueSyncOperation(tx, req, 'order', 'create', newOrderId, b_id, {
      offline_uuid: orderOfflineUuid,
      customer: { name: normalizedCustomerName, phone: normalizedCustomerPhone, branch_id: b_id },
      order: {
        total_amount: finalTotalAmount,
        branch_id: b_id,
        payment_method: p_method,
        seller_id: sellerId,
        paid_amount: roundedPaid,
        change_amount: roundedChange,
        invoice_discount: invDiscountVal,
        invoice_discount_type: invDiscountType,
        branch_invoice_number: nextBranchInvoiceNumber,
      },
      items: processedOrderItems.map((item) => ({
        inventory_id: item.inventory_id,
        quantity: item.quantity,
        price: item.price_at_time,
        discount: item.discount,
        discount_type: item.discount_type,
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
  const safeAmount = roundCurrency(Number(amount));
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

  return await db.transaction(async (tx) => {
    const { rows } = await tx.query(
      'SELECT id, total_amount, paid_amount, branch_id, status FROM orders WHERE id = $1 FOR UPDATE',
      [resolvedId]
    );
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

    if (order.status === 'returned') {
      const err = new Error('لا يمكن السداد لطلب تم إرجاعه');
      err.statusCode = 400;
      throw err;
    }

    const currentPaid = roundCurrency(Number(order.paid_amount || 0));
    const totalAmount = roundCurrency(Number(order.total_amount || 0));
    const remainingDue = roundCurrency(Math.max(0, totalAmount - currentPaid));

    if (remainingDue <= 0) {
      const err = new Error('تم سداد كامل قيمة الطلب بالفعل');
      err.statusCode = 400;
      throw err;
    }

    if (safeAmount > remainingDue) {
      const err = new Error('المبلغ المدفوع يتجاوز الباقي المستحق');
      err.statusCode = 400;
      throw err;
    }

    const newPaidAmount = roundCurrency(currentPaid + safeAmount);

    await tx.query(
      'UPDATE orders SET paid_amount = $1 WHERE id = $2',
      [newPaidAmount, resolvedId]
    );

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'تسجيل دفعة متبقية',
        `تم دفع ${safeAmount} ج.م للطلب #${resolvedId} (الإجمالي المدفوع: ${newPaidAmount} ج.م)`,
        'POS',
        order.branch_id
      );
    }

    return { message: 'تم تسجيل الدفعة بنجاح', newPaidAmount, remainingAmount: roundCurrency(totalAmount - newPaidAmount) };
  });
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
    `SELECT oi.*, i.name, i.barcode, i.category, i.size_cut, i.color,
            COALESCE(ret.returned_qty, 0)::int as returned_quantity
     FROM order_items oi
     LEFT JOIN inventory i ON oi.inventory_id = i.id
     LEFT JOIN (
       SELECT ri.inventory_id, COALESCE(SUM(ri.quantity), 0) as returned_qty
       FROM returns r
       JOIN return_items ri ON r.id = ri.return_id
       WHERE r.order_id = $1
       GROUP BY ri.inventory_id
     ) ret ON ret.inventory_id = oi.inventory_id
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
    invoice_edit_password,
  } = body || {};

  // SEC-02: Enforce invoice edit password verification on backend
  const authService = require('../auth/auth.service');
  if (!user || user.role !== 'admin') {
    if (!invoice_edit_password) {
      const err = new Error('كلمة مرور تعديل الفاتورة مطلوبة');
      err.statusCode = 403;
      throw err;
    }
    const isValidPassword = await authService.verifyInvoiceEditPassword(invoice_edit_password);
    if (!isValidPassword) {
      const err = new Error('كلمة مرور تعديل الفاتورة غير صحيحة');
      err.statusCode = 403;
      throw err;
    }
  } else if (invoice_edit_password) {
    const isValidPassword = await authService.verifyInvoiceEditPassword(invoice_edit_password);
    if (!isValidPassword) {
      const err = new Error('كلمة مرور تعديل الفاتورة غير صحيحة');
      err.statusCode = 403;
      throw err;
    }
  }

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

  await db.transaction(async (tx) => {
    // 1. Read & lock order inside transaction
    const { rows: orderRows } = await tx.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [resolvedId]);
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

    const branchId = currentOrder.branch_id;

    // 2. Fetch current items to determine delta
    const { rows: currentItems } = await tx.query('SELECT * FROM order_items WHERE order_id = $1', [resolvedId]);

    const oldQtyMap = new Map();
    for (const oldItem of currentItems) {
      const iId = Number(oldItem.inventory_id);
      oldQtyMap.set(iId, (oldQtyMap.get(iId) || 0) + Number(oldItem.quantity));
    }

    const newQtyMap = new Map();
    for (const newItem of items) {
      const iId = Number(newItem.id ?? newItem.inventory_id);
      const qty = parsePositiveInt(newItem.quantity, 'quantity');
      newQtyMap.set(iId, (newQtyMap.get(iId) || 0) + qty);
    }

    // Combine all unique item IDs and pre-sort ascending to prevent deadlocks
    const allItemIds = Array.from(new Set([...oldQtyMap.keys(), ...newQtyMap.keys()])).sort((a, b) => a - b);

    // Lock global inventory and branch inventory in ascending order
    const canonicalProducts = new Map();
    for (const itemId of allItemIds) {
      const globalRes = await tx.query(
        'SELECT id, name, price, stock_level FROM inventory WHERE id = $1 FOR UPDATE',
        [itemId]
      );
      if (globalRes.rows.length === 0) {
        const err = new Error(`المنتج #${itemId} غير موجود`);
        err.statusCode = 404;
        throw err;
      }
      canonicalProducts.set(itemId, globalRes.rows[0]);

      const branchRes = await tx.query(
        'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
        [itemId, branchId]
      );
      if (branchRes.rows.length === 0) {
        const err = new Error(`سجل مخزون الفرع غير موجود للمنتج #${itemId}`);
        err.statusCode = 400;
        throw err;
      }

      const oldQ = oldQtyMap.get(itemId) || 0;
      const newQ = newQtyMap.get(itemId) || 0;
      const diff = newQ - oldQ; // diff > 0 requires additional stock

      if (diff > 0) {
        if (Number(branchRes.rows[0].stock_level) < diff) {
          const err = new Error(`المخزون غير كافي للمنتج "${globalRes.rows[0].name}" بالفرع`);
          err.statusCode = 400;
          throw err;
        }
        if (Number(globalRes.rows[0].stock_level) < diff) {
          const err = new Error(`المخزون العام غير كافي للمنتج "${globalRes.rows[0].name}"`);
          err.statusCode = 400;
          throw err;
        }
      }
    }

    // Apply stock delta adjustments atomically
    for (const itemId of allItemIds) {
      const oldQ = oldQtyMap.get(itemId) || 0;
      const newQ = newQtyMap.get(itemId) || 0;
      const diff = newQ - oldQ;

      if (diff !== 0) {
        if (diff < 0) {
          await tx.query(
            `INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, $2, 0)
             ON CONFLICT (inventory_id, branch_id) DO NOTHING`,
            [itemId, branchId]
          );
        }
        await tx.query(
          'UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3',
          [diff, itemId, branchId]
        );
        await tx.query(
          'UPDATE inventory SET stock_level = stock_level - $1 WHERE id = $2',
          [diff, itemId]
        );
      }
    }

    // Recalculate line prices and total amount using canonical database prices (anti-tampering)
    let calculatedSubtotal = 0;
    const processedNewItems = [];

    for (const item of items) {
      const itemId = Number(item.id ?? item.inventory_id);
      const qty = parsePositiveInt(item.quantity, 'quantity');
      const canonicalPrice = roundCurrency(Number(canonicalProducts.get(itemId).price || 0));

      const discountVal = Math.max(0, Number(item.discount || 0));
      const discountType = item.discount_type || 'amount';
      const isPercent = discountType === 'percent' || discountType === 'percentage';
      let lineDiscount = 0;
      if (discountVal > 0) {
        if (isPercent) {
          lineDiscount = roundCurrency((canonicalPrice * qty) * (discountVal / 100));
        } else {
          lineDiscount = Math.min(roundCurrency(canonicalPrice * qty), roundCurrency(discountVal));
        }
      }
      const lineNet = Math.max(0, roundCurrency((canonicalPrice * qty) - lineDiscount));
      calculatedSubtotal = roundCurrency(calculatedSubtotal + lineNet);

      processedNewItems.push({
        inventory_id: itemId,
        quantity: qty,
        price_at_time: canonicalPrice,
        discount: discountVal,
        discount_type: discountType,
      });
    }

    const invDiscountVal = Math.max(0, Number(invoice_discount || 0));
    const invDiscountType = invoice_discount_type || 'amount';
    const isInvPercent = invDiscountType === 'percent' || invDiscountType === 'percentage';
    let invoiceDiscountAmount = 0;
    if (invDiscountVal > 0) {
      if (isInvPercent) {
        invoiceDiscountAmount = roundCurrency(calculatedSubtotal * (invDiscountVal / 100));
      } else {
        invoiceDiscountAmount = Math.min(calculatedSubtotal, roundCurrency(invDiscountVal));
      }
    }

    const recalculatedTotal = Math.max(0, roundCurrency(calculatedSubtotal - invoiceDiscountAmount));

    // Handle customer update / creation
    let finalCustomerId = customer_id || currentOrder.customer_id;
    if (customer_name && customer_phone) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${customer_phone}`]);
      const { rows: existingCustomer } = await tx.query(
        'SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE',
        [customer_phone, branchId]
      );

      if (existingCustomer.length > 0) {
        finalCustomerId = existingCustomer[0].id;
        await tx.query(
          'UPDATE customers SET name = $1 WHERE id = $2',
          [customer_name, finalCustomerId]
        );
      } else if (finalCustomerId) {
        await tx.query(
          'UPDATE customers SET name = $1, phone = $2 WHERE id = $3',
          [customer_name, customer_phone, finalCustomerId]
        );
      } else {
        const initials = getInitialsFromName(customer_name);
        const customerOfflineUuid = newUuid();
        try {
          const { rows: newCustomer } = await tx.query(
            `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid) 
             VALUES ($1, $2, $3, ${CAIRO_DATE_SQL}, 0, 'نشط', $4, $5) RETURNING id`,
            [customer_name, initials, customer_phone, branchId, customerOfflineUuid]
          );
          finalCustomerId = newCustomer[0].id;
        } catch (insertErr) {
          const retryCust = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [customer_phone, branchId]);
          if (retryCust.rows.length) {
            finalCustomerId = retryCust.rows[0].id;
          } else {
            throw insertErr;
          }
        }
      }
    }

    // Adjust customer total_spent properly (handling customer reassignment or total change)
    const oldCustomerId = currentOrder.customer_id;
    if (finalCustomerId && oldCustomerId && Number(finalCustomerId) !== Number(oldCustomerId)) {
      await tx.query('UPDATE customers SET total_spent = GREATEST(0, total_spent - $1) WHERE id = $2', [currentOrder.total_amount || 0, oldCustomerId]);
      await tx.query('UPDATE customers SET total_spent = total_spent + $1 WHERE id = $2', [recalculatedTotal, finalCustomerId]);
    } else if (finalCustomerId) {
      const orderTotalDiff = roundCurrency(recalculatedTotal - Number(currentOrder.total_amount || 0));
      if (orderTotalDiff !== 0) {
        await tx.query(
          'UPDATE customers SET total_spent = GREATEST(0, total_spent + $1) WHERE id = $2',
          [orderTotalDiff, finalCustomerId]
        );
      }
    }

    // Safe paid and change handling
    const safePaid = Math.max(0, roundCurrency(Number(paid_amount !== undefined ? paid_amount : (currentOrder.paid_amount || 0))));
    const safeChange = roundCurrency(Math.max(0, safePaid - recalculatedTotal));

    // Update order record
    await tx.query(
      `UPDATE orders 
       SET total_amount = $1, 
           invoice_discount = $2, 
           invoice_discount_type = $3,
           customer_id = $4,
           payment_method = COALESCE($5, payment_method),
           seller_id = COALESCE($6, seller_id),
           paid_amount = $7,
           change_amount = $8
       WHERE id = $9`,
      [
        recalculatedTotal,
        invDiscountVal,
        invDiscountType,
        finalCustomerId,
        payment_method || null,
        seller_id || null,
        safePaid,
        safeChange,
        resolvedId,
      ]
    );

    // Delete old items and insert updated items
    await tx.query('DELETE FROM order_items WHERE order_id = $1', [resolvedId]);

    for (const item of processedNewItems) {
      await tx.query(
        `INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time, discount, discount_type) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [resolvedId, item.inventory_id, item.quantity, item.price_at_time, item.discount, item.discount_type]
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
      `o.offline_uuid::text LIKE $1`,
      `COALESCE(o.order_source, 'cashier') = 'cashier'`,
    ];

    if (user && user.role === 'branch_user') {
      offParams.push(user.branch_id);
      offWhere.push(`o.branch_id = $${offParams.length}`);
    } else if (branchId && branchId !== 'all') {
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
  } else if (branchId && branchId !== 'all') {
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

  const returnData = await db.transaction(async (tx) => {
    // 1. Read & lock order inside transaction
    const orderRes = await tx.query(
      'SELECT id, branch_id, seller_id, customer_id, total_amount, status, invoice_discount, invoice_discount_type, offline_uuid FROM orders WHERE id = $1 FOR UPDATE',
      [order_id]
    );
    if (orderRes.rows.length === 0) {
      const err = new Error('Order not found');
      err.statusCode = 404;
      throw err;
    }

    const orderRow = orderRes.rows[0];
    if (orderRow.status === 'returned') {
      const err = new Error('هذا الطلب تم إرجاعه بالكامل بالفعل');
      err.statusCode = 400;
      throw err;
    }

    const orderBranchId = orderRow.branch_id;
    if (user && user.role === 'branch_user' && Number(orderBranchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    branch_id = orderBranchId;
    let s_id = seller_id === '' || seller_id === undefined ? null : seller_id;
    if (!s_id) {
      s_id = orderRow.seller_id || null;
    }

    // 2. Fetch original order items to validate return quantities and prices
    const { rows: originalOrderItems } = await tx.query(
      'SELECT inventory_id, quantity, price_at_time, discount, discount_type, size FROM order_items WHERE order_id = $1',
      [order_id]
    );
    const origItemMap = new Map();
    let totalOriginalQty = 0;
    for (const oi of originalOrderItems) {
      origItemMap.set(Number(oi.inventory_id), oi);
      totalOriginalQty += Number(oi.quantity || 0);
    }

    // Fetch prior returns on this order to prevent double/over returns
    const { rows: priorReturnRows } = await tx.query(
      `SELECT ri.inventory_id, COALESCE(SUM(ri.quantity), 0)::int as returned_qty
       FROM returns r
       JOIN return_items ri ON r.id = ri.return_id
       WHERE r.order_id = $1
       GROUP BY ri.inventory_id`,
      [order_id]
    );
    const priorReturnMap = new Map();
    let totalPriorReturnedQty = 0;
    for (const pr of priorReturnRows) {
      const q = Number(pr.returned_qty || 0);
      priorReturnMap.set(Number(pr.inventory_id), q);
      totalPriorReturnedQty += q;
    }

    if (totalPriorReturnedQty >= totalOriginalQty) {
      const err = new Error('هذا الطلب تم إرجاعه بالكامل بالفعل');
      err.statusCode = 400;
      throw err;
    }

    // Check prior refunded amounts
    const { rows: priorReturnAmountRows } = await tx.query(
      'SELECT COALESCE(SUM(total_return_amount), 0)::numeric as total_refunded FROM returns WHERE order_id = $1',
      [order_id]
    );
    const alreadyRefunded = roundCurrency(Number(priorReturnAmountRows[0]?.total_refunded || 0));
    const remainingOrderTotal = Math.max(0, roundCurrency(Number(orderRow.total_amount || 0) - alreadyRefunded));

    if (remainingOrderTotal <= 0) {
      const err = new Error('هذا الطلب تم استرداد مبلغه بالكامل بالفعل');
      err.statusCode = 400;
      throw err;
    }

    // Calculate total net before invoice discount across original order items
    let orderOriginalNetSubtotal = 0;
    const itemLineNets = new Map();
    for (const oi of originalOrderItems) {
      const oPrice = roundCurrency(Number(oi.price_at_time || 0));
      const oQty = Math.max(1, Number(oi.quantity || 1));
      const dVal = Math.max(0, Number(oi.discount || 0));
      const dType = oi.discount_type || 'amount';
      const isP = dType === 'percent' || dType === 'percentage';
      let lDisc = 0;
      if (dVal > 0) {
        lDisc = isP ? roundCurrency((oPrice * oQty) * (dVal / 100)) : Math.min(roundCurrency(oPrice * oQty), roundCurrency(dVal));
      }
      const lNet = Math.max(0, roundCurrency((oPrice * oQty) - lDisc));
      itemLineNets.set(Number(oi.inventory_id), lNet);
      orderOriginalNetSubtotal = roundCurrency(orderOriginalNetSubtotal + lNet);
    }

    const invDiscVal = Math.max(0, Number(orderRow.invoice_discount || 0));
    const invDiscType = orderRow.invoice_discount_type || 'amount';
    const isInvP = invDiscType === 'percent' || invDiscType === 'percentage';
    let invDiscAmount = 0;
    if (invDiscVal > 0) {
      invDiscAmount = isInvP ? roundCurrency(orderOriginalNetSubtotal * (invDiscVal / 100)) : Math.min(orderOriginalNetSubtotal, roundCurrency(invDiscVal));
    }
    const invDiscRatio = orderOriginalNetSubtotal > 0 ? (invDiscAmount / orderOriginalNetSubtotal) : 0;

    // Pre-sort items by id ascending to prevent deadlocks
    const sortedReturnItems = [...items].sort((a, b) => Number(a.id ?? a.inventory_id) - Number(b.id ?? b.inventory_id));

    let calculatedReturnTotal = 0;
    let currentReturnQty = 0;
    const validatedReturnItems = [];

    for (const item of sortedReturnItems) {
      const itemId = Number(item.id ?? item.inventory_id);
      const qty = parsePositiveInt(item.quantity, 'quantity');
      const origItem = origItemMap.get(itemId);
      if (!origItem) {
        const err = new Error(`الصنف #${itemId} غير موجود في الفاتورة الأصلية`);
        err.statusCode = 400;
        throw err;
      }

      const origQty = Number(origItem.quantity || 0);
      const alreadyReturned = priorReturnMap.get(itemId) || 0;
      const remainingReturnable = origQty - alreadyReturned;

      if (remainingReturnable <= 0) {
        const err = new Error(`الصنف #${itemId} تم إرجاعه بالكامل بالفعل`);
        err.statusCode = 400;
        throw err;
      }
      if (qty > remainingReturnable) {
        const err = new Error(`الكمية المرتجعة للصنف #${itemId} (${qty}) أكبر من الكمية المتبقية (${remainingReturnable})`);
        err.statusCode = 400;
        throw err;
      }

      const origPrice = roundCurrency(Number(origItem.price_at_time || 0));
      const itemLineNet = itemLineNets.get(itemId) || 0;
      const itemInvDiscShare = roundCurrency(itemLineNet * invDiscRatio);
      const itemEffectiveNet = Math.max(0, roundCurrency(itemLineNet - itemInvDiscShare));
      const effectiveUnitPrice = origQty > 0 ? roundCurrency(itemEffectiveNet / origQty) : origPrice;
      const lineAmount = roundCurrency(effectiveUnitPrice * qty);
      calculatedReturnTotal = roundCurrency(calculatedReturnTotal + lineAmount);
      currentReturnQty += qty;

      validatedReturnItems.push({
        id: itemId,
        quantity: qty,
        price: effectiveUnitPrice,
        size: item.size || origItem.size || null,
      });

      // Lock global inventory and branch stock rows in ascending order
      await tx.query('SELECT stock_level FROM inventory WHERE id = $1 FOR UPDATE', [itemId]);
      await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [itemId, branch_id]);
    }

    // Defend against client price tampering on return total
    const maxAllowedReturn = Math.min(calculatedReturnTotal, remainingOrderTotal);
    const clientReturnVal = Number(total_return_amount);
    let finalReturnAmount = calculatedReturnTotal;
    if (Number.isFinite(clientReturnVal) && clientReturnVal > 0) {
      if (clientReturnVal > maxAllowedReturn) {
        const err = new Error(`مبلغ المرتجع المطلوب (${clientReturnVal}) يتجاوز القيمة المستحقة (${maxAllowedReturn})`);
        err.statusCode = 400;
        throw err;
      }
      finalReturnAmount = roundCurrency(clientReturnVal);
    }

    // 3. Create Return record
    const returnResult = await tx.query(
      'INSERT INTO returns (order_id, total_return_amount, branch_id, seller_id, offline_uuid) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [order_id, finalReturnAmount, branch_id, s_id, returnOfflineUuid]
    );
    const returnId = returnResult.rows[0].id;

    // 4. Add return items and update inventory
    for (const item of validatedReturnItems) {
      await tx.query(
        'INSERT INTO return_items (return_id, inventory_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
        [returnId, item.id, item.quantity, item.price]
      );

      // Return stock to branch
      await tx.query(
        'UPDATE inventory_branches SET stock_level = stock_level + $1 WHERE inventory_id = $2 AND branch_id = $3',
        [item.quantity, item.id, branch_id]
      );

      // Return stock to size
      if (item.size) {
        await tx.query(
          `UPDATE inventory_sizes 
           SET stock_level = stock_level + $1, updated_at = CURRENT_TIMESTAMP
           WHERE inventory_id = $2 AND branch_id = $3 AND LOWER(TRIM(size_name)) = LOWER(TRIM($4))`,
          [item.quantity, item.id, branch_id, item.size]
        );
      }

      // Return stock to global inventory
      await tx.query(
        'UPDATE inventory SET stock_level = stock_level + $1 WHERE id = $2',
        [item.quantity, item.id]
      );
    }

    // 5. Update Order Status (full vs partial return)
    const isFullyReturned = (totalPriorReturnedQty + currentReturnQty) >= totalOriginalQty;
    await tx.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      [isFullyReturned ? 'returned' : 'partially_returned', order_id]
    );

    // 6. Adjust customer total_spent
    if (orderRow.customer_id) {
      await tx.query(
        'UPDATE customers SET total_spent = GREATEST(0, total_spent - $1) WHERE id = $2',
        [finalReturnAmount, orderRow.customer_id]
      );
    }

    if (user) {
      await logActivity(user.id, user.username, 'مرتجع مبيعات', `مرتجع بقيمة ${finalReturnAmount} ج.م (طلب #${order_id})`, 'POS', branch_id);
    }

    await queueSyncOperation(tx, req, 'return', 'create', returnId, branch_id, {
      offline_uuid: returnOfflineUuid,
      order_id,
      order_offline_uuid: orderRow.offline_uuid || null,
      total_return_amount: finalReturnAmount,
      branch_id,
      seller_id: s_id,
      items: validatedReturnItems.map((item) => ({
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
  } else if (query.branch_id && query.branch_id !== 'all') {
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
