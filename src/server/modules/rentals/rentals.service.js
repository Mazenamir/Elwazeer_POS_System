const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL, DEFAULT_RENTAL_FINE_PER_DAY } = require('../../../shared/constants/system');
const { hasInventoryAdminAccess, hasInventoryAllBranchesAccess, isBranchScopedUser } = require('../../../shared/constants/permissions');
const { dateOnly, daysBetween, getDatabaseCairoNow } = require('../../../shared/utils/date');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { clampInt, roundCurrency } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { normalizeBarcodeInput, getAvailableBarcode, assertBarcodeAvailable } = require('../inventory/inventory.helpers');
const { queueSyncOperation, logActivity } = require('../../database/sync.helpers');
const { getRentalAvailability, getRentalGroupRows, getOrCreateSalesInventoryForRental } = require('./rentals.helpers');

async function listRentalInventory(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 60, 10000, true);
  const canViewAllBranches = hasInventoryAllBranchesAccess(user);

  let branchJoinFilter = '';
  const params = [];
  if (!canViewAllBranches && user?.branch_id) {
    params.push(user.branch_id);
    branchJoinFilter = `AND rib.branch_id = $${params.length}`;
  }

  const where = ['ri.is_deleted = FALSE'];
  if (!canViewAllBranches && user?.branch_id) {
    where.push('$1::int IS NOT NULL');
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(
      ri.name ILIKE $${params.length}
      OR ri.barcode ILIKE $${params.length}
      OR CAST(ri.id AS text) ILIKE $${params.length}
      OR ri.category ILIKE $${params.length}
      OR ri.color ILIKE $${params.length}
      OR ri.size_cut ILIKE $${params.length}
    )`);
  }

  if (query.name) {
    params.push(likePattern(query.name));
    where.push(`ri.name ILIKE $${params.length}`);
  }
  if (query.barcode) {
    params.push(likePattern(query.barcode));
    where.push(`ri.barcode ILIKE $${params.length}`);
  }
  if (query.category) {
    params.push(query.category);
    where.push(`ri.category = $${params.length}`);
  }
  if (query.color) {
    params.push(likePattern(query.color));
    where.push(`ri.color ILIKE $${params.length}`);
  }
  if (query.size) {
    params.push(likePattern(query.size));
    where.push(`ri.size_cut ILIKE $${params.length}`);
  }

  if (query.branch_id && query.branch_id !== 'all' && canViewAllBranches) {
    params.push(query.branch_id);
    where.push(`EXISTS (
      SELECT 1 FROM rental_inventory_branches rib_filter
      WHERE rib_filter.rental_inventory_id = ri.id
        AND rib_filter.branch_id = $${params.length}
    )`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;

  let selectQuery = `
    SELECT ri.*, 
           COALESCE(json_agg(json_build_object('branch_id', rib.branch_id, 'stock_level', rib.stock_level)) FILTER (WHERE rib.branch_id IS NOT NULL), '[]') as branch_stocks
    FROM rental_inventory ri
    LEFT JOIN rental_inventory_branches rib ON ri.id = rib.rental_inventory_id ${branchJoinFilter}
    ${whereClause}
    GROUP BY ri.id
    ORDER BY ri.id DESC
  `;

  const countQuery = `SELECT COUNT(*)::int as total FROM rental_inventory ri ${whereClause}`;
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
  return paginatedPayload(rows, rows.length, { page: 1, limit: rows.length, total: rows.length });
}

async function createRentalInventory(body, user) {
  let { name, category, size_cut, color, barcode, image_url, branch_stocks, stock_level } = body || {};
  barcode = normalizeBarcodeInput(barcode);

  if (isBranchScopedUser(user)) {
    branch_stocks = [{ branch_id: user.branch_id, stock_level: stock_level || 0 }];
  }

  const item = await db.transaction(async (tx) => {
    barcode = await getAvailableBarcode(tx, barcode);
    await assertBarcodeAvailable(tx, barcode);

    const { rows } = await tx.query(
      `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, category, size_cut, color, barcode, 0, image_url]
    );
    const newItem = rows[0];

    if (branch_stocks && Array.isArray(branch_stocks)) {
      for (const bs of branch_stocks) {
        if (bs.branch_id) {
          await tx.query(
            `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) VALUES ($1, $2, $3)
             ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = $3`,
            [newItem.id, bs.branch_id, bs.stock_level]
          );
        }
      }
    }
    return newItem;
  });

  if (user) {
    await logActivity(
      user.id,
      user.username,
      'إضافة منتج تأجير',
      `تم إضافة "${name}" للمخزون التأجيري`,
      'RentalInventory',
      user.role === 'branch_user' ? user.branch_id : null
    );
  }

  return item;
}

async function checkAvailability(id, branchId, pickupDate, returnDate, user) {
  let b_id = (branchId && branchId !== 'all' && Number.isFinite(Number(branchId))) ? Number(branchId) : (user?.branch_id || 1);
  if (isBranchScopedUser(user)) {
    b_id = user.branch_id;
  }

  if (!b_id || !pickupDate || !returnDate) {
    const err = new Error('Missing branch_id, pickup_date, or return_date');
    err.statusCode = 400;
    throw err;
  }
  if (dateOnly(returnDate) < dateOnly(pickupDate)) {
    const err = new Error('Return date must be after pickup date');
    err.statusCode = 400;
    throw err;
  }

  return getRentalAvailability(db, id, b_id, pickupDate, returnDate);
}

async function updateRentalInventory(id, body, user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Inventory admin only');
    err.statusCode = 403;
    throw err;
  }

  let { name, category, size_cut, color, barcode, image_url, branch_stocks } = body || {};
  barcode = normalizeBarcodeInput(barcode);

  if (isBranchScopedUser(user)) {
    const ownStock = Array.isArray(branch_stocks)
      ? branch_stocks.find((bs) => Number(bs.branch_id) === Number(user.branch_id))
      : null;
    branch_stocks = [{ branch_id: user.branch_id, stock_level: ownStock ? ownStock.stock_level : 0 }];
  }

  if (barcode) {
    const existingRental = await db.query(
      'SELECT id FROM rental_inventory WHERE barcode = $1 AND id != $2 AND is_deleted = FALSE',
      [barcode, id]
    );
    if (existingRental.rows.length > 0) {
      const err = new Error('هذا الباركود مستخدم بالفعل لمنتج تأجير آخر');
      err.statusCode = 400;
      throw err;
    }
    const existingInventory = await db.query(
      'SELECT id FROM inventory WHERE barcode = $1 AND is_deleted = FALSE',
      [barcode]
    );
    if (existingInventory.rows.length > 0) {
      const err = new Error('هذا الباركود مستخدم بالفعل في المخزون العادي');
      err.statusCode = 400;
      throw err;
    }
  }

  const item = await db.transaction(async (tx) => {
    await assertBarcodeAvailable(tx, barcode, { rentalInventoryId: id });
    const { rows } = await tx.query(
      `UPDATE rental_inventory 
       SET name=$1, category=$2, size_cut=$3, color=$4, barcode=$5, price=$6, image_url=$7 
       WHERE id=$8 RETURNING *`,
      [name, category, size_cut, color, barcode, 0, image_url, id]
    );

    if (branch_stocks && Array.isArray(branch_stocks)) {
      for (const bs of branch_stocks) {
        if (bs.branch_id) {
          await tx.query(
            `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) VALUES ($1, $2, $3)
             ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = $3`,
            [id, bs.branch_id, bs.stock_level]
          );
        }
      }
    }
    return rows[0];
  });

  if (user) {
    await logActivity(user.id, user.username, 'تعديل منتج تأجير', `تم تعديل "${name}"`, 'RentalInventory');
  }

  return item;
}

async function deleteRentalInventory(id, user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Admin only');
    err.statusCode = 403;
    throw err;
  }

  await db.query('UPDATE rental_inventory SET is_deleted = TRUE WHERE id = $1', [id]);
  if (user) {
    await logActivity(user.id, user.username, 'حذف منتج تأجير', `تم حذف المنتج #${id}`, 'RentalInventory');
  }
  return { success: true };
}

async function transferFromSales(body, user) {
  const { inventory_id, from_branch, to_branch, quantity } = body || {};
  if (!inventory_id || !from_branch || !to_branch || !quantity) {
    const err = new Error('Missing required data');
    err.statusCode = 400;
    throw err;
  }

  if (isBranchScopedUser(user)) {
    if (from_branch != user.branch_id || to_branch != user.branch_id) {
      const err = new Error('غير مسموح بالتحويل لفرع آخر');
      err.statusCode = 403;
      throw err;
    }
  }

  await db.transaction(async (tx) => {
    // 1. Get source inventory details
    const invRes = await tx.query('SELECT * FROM inventory WHERE id = $1', [inventory_id]);
    if (invRes.rows.length === 0) {
      const err = new Error('Inventory item not found');
      err.statusCode = 404;
      throw err;
    }
    const invItem = invRes.rows[0];

    // 2. Check source stock
    const stockRes = await tx.query(
      'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
      [inventory_id, from_branch]
    );
    if (stockRes.rows.length === 0 || Number(stockRes.rows[0].stock_level) < quantity) {
      const err = new Error('Insufficient stock in source branch');
      err.statusCode = 400;
      throw err;
    }

    // 3. Find or create rental inventory item
    let rentalItemId;
    const rentalInvRes = await tx.query(
      'SELECT id FROM rental_inventory WHERE name = $1 AND category = $2 AND size_cut = $3 AND color = $4 AND is_deleted = FALSE',
      [invItem.name, invItem.category, invItem.size_cut, invItem.color]
    );

    if (rentalInvRes.rows.length > 0) {
      rentalItemId = rentalInvRes.rows[0].id;
    } else {
      let newBarcode = invItem.barcode ? normalizeBarcodeInput(`${invItem.barcode}9`) : null;
      newBarcode = await getAvailableBarcode(tx, newBarcode);
      const newRentalRes = await tx.query(
        `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [invItem.name, invItem.category, invItem.size_cut, invItem.color, newBarcode, 0, invItem.image_url]
      );
      rentalItemId = newRentalRes.rows[0].id;

      // Sync new rental item with all branches
      await tx.query(
        `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
         SELECT $1, id, 0 FROM branches
         ON CONFLICT DO NOTHING`,
        [rentalItemId]
      );
    }

    // 4. Deduct from sales inventory
    await tx.query(
      'UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3',
      [quantity, inventory_id, from_branch]
    );
    await tx.query('UPDATE inventory SET stock_level = stock_level - $1 WHERE id = $2', [quantity, inventory_id]);

    // 5. Add to rental inventory (specific target branch)
    await tx.query(
      `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) 
       VALUES ($1, $2, $3)
       ON CONFLICT (rental_inventory_id, branch_id) 
       DO UPDATE SET stock_level = rental_inventory_branches.stock_level + $3`,
      [rentalItemId, to_branch, quantity]
    );

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'تحويل للمخزون التأجيري',
        `تم تحويل ${quantity} قطعة من "${invItem.name}" لمخزون التأجير`,
        'RentalInventory',
        from_branch
      );
    }
  });

  return { success: true };
}

async function getRentalsSummary(branchId, user) {
  const params = [];
  const where = [];

  if (user && user.role !== 'admin') {
    params.push(user.branch_id);
    where.push(`branch_id = $${params.length}`);
  } else if (branchId && branchId !== 'all') {
    params.push(branchId);
    where.push(`branch_id = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT status, 
            COUNT(*)::int as count,
            COUNT(CASE WHEN status = 'returned' AND remaining > 0 THEN 1 END)::int as returned_debt_count,
            COUNT(CASE WHEN status = 'returned' AND (remaining IS NULL OR remaining <= 0) THEN 1 END)::int as returned_settled_count
     FROM (
       SELECT COALESCE(rental_group_uuid::text, id::text) as rental_group_key, 
              MIN(status) as status,
              SUM(COALESCE(remaining, 0)) as remaining
       FROM rentals
       ${whereClause}
       GROUP BY rental_group_key
     ) grouped_rentals
     GROUP BY status`,
    params
  );

  const summary = { booked: 0, active: 0, returned: 0, sold: 0, cancelled: 0, returned_debt: 0, returned_settled: 0 };
  rows.forEach((row) => {
    summary[row.status] = row.count;
    if (row.status === 'returned') {
      summary.returned_debt = row.returned_debt_count || 0;
      summary.returned_settled = row.returned_settled_count || 0;
    }
  });
  return summary;
}

async function listRentals(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);

  const selectFrom = `
    FROM (
      SELECT r.*,
             COALESCE(r.rental_group_uuid::text, r.id::text) as rental_group_key,
             c.name as customer_name,
             c.phone as customer_phone,
             ri.name as inventory_name,
             ri.category as inventory_category,
             ri.barcode as inventory_barcode,
             ri.color as inventory_color,
             ri.size_cut as inventory_size,
             ri.image_url as image_url,
             b.name as branch_name,
             GREATEST((r.return_date::date - r.pickup_date::date), 0) as rental_days,
             CASE
                WHEN r.status = 'active' AND ${CAIRO_DATE_SQL} > r.return_date
                THEN (${CAIRO_DATE_SQL} - r.return_date)
               ELSE 0
             END as delay_days,
             CASE
                WHEN r.status = 'active' AND ${CAIRO_DATE_SQL} > r.return_date
                THEN (${CAIRO_DATE_SQL} - r.return_date) * COALESCE(r.daily_fine, $1::numeric)
               ELSE COALESCE(r.fine_amount, 0)
             END as suggested_fine,
             e.name as seller_name,
             so.branch_invoice_number as sale_branch_invoice_number,
             so.order_date as sale_order_date,
             so.payment_method as sale_payment_method,
             so.paid_amount as sale_paid_amount,
             so.change_amount as sale_change_amount
      FROM rentals r
      JOIN customers c ON r.customer_id = c.id
      JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
      JOIN branches b ON r.branch_id = b.id
      LEFT JOIN employees e ON r.seller_id = e.id
      LEFT JOIN orders so ON r.sale_order_id = so.id
  `;

  const params = [DEFAULT_RENTAL_FINE_PER_DAY];
  const where = ['$1::numeric IS NOT NULL'];

  if (user && user.role === 'branch_user') {
    params.push(user.branch_id);
    where.push(`r.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`r.branch_id = $${params.length}`);
  }

  if (query.status === 'returned_debt') {
    where.push(`r.status = 'returned' AND COALESCE(r.remaining, 0) > 0`);
  } else if (query.status === 'returned_settled') {
    where.push(`r.status = 'returned' AND COALESCE(r.remaining, 0) <= 0`);
  } else if (query.status) {
    params.push(query.status);
    where.push(`r.status = $${params.length}`);
  }
  if (query.id) {
    params.push(likePattern(query.id));
    where.push(`r.id::text ILIKE $${params.length}`);
  }
  if (query.name) {
    params.push(likePattern(query.name));
    where.push(`c.name ILIKE $${params.length}`);
  }
  if (query.phone) {
    params.push(likePattern(query.phone));
    where.push(`c.phone ILIKE $${params.length}`);
  }
  if (query.national_id) {
    params.push(likePattern(query.national_id));
    where.push(`r.national_id ILIKE $${params.length}`);
  }
  if (query.fromDate) {
    params.push(query.fromDate);
    where.push(`r.pickup_date >= $${params.length}::date`);
  }
  if (query.toDate) {
    params.push(query.toDate);
    where.push(`r.pickup_date < ($${params.length}::date + INTERVAL '1 day')`);
  }

  const whereClause = ` WHERE ${where.join(' AND ')}`;
  const groupedWhereClause = `${whereClause}
    ) rental_rows
    GROUP BY rental_group_key
  `;

  let queryStr = `
    SELECT
      MIN(id) as id,
      rental_group_key,
      MIN(rental_group_uuid::text) as rental_group_uuid,
      MIN(customer_id) as customer_id,
      MIN(customer_name) as customer_name,
      MIN(customer_phone) as customer_phone,
      MIN(national_id) as national_id,
      MIN(branch_id) as branch_id,
      MIN(branch_name) as branch_name,
      MIN(booking_date) as booking_date,
      MIN(pickup_date) as pickup_date,
      MIN(return_date) as return_date,
      MAX(actual_return_date) as actual_return_date,
      MIN(status) as status,
      SUM(COALESCE(total_price, 0)) as total_price,
      SUM(COALESCE(deposit, 0)) as deposit,
      SUM(COALESCE(remaining, 0)) as remaining,
      SUM(COALESCE(fine_amount, 0)) as fine_amount,
      BOOL_OR(COALESCE(id_card_guarantee, false)) as id_card_guarantee,
      MAX(notes) as notes,
      MAX(daily_fine) as daily_fine,
      MIN(payment_method) as payment_method,
      MIN(seller_id) as seller_id,
      MIN(seller_name) as seller_name,
      MIN(sale_order_id) as sale_order_id,
      MIN(sale_branch_invoice_number) as sale_branch_invoice_number,
      MIN(sale_order_date) as sale_order_date,
      MIN(sale_payment_method) as sale_payment_method,
      MIN(sale_paid_amount) as sale_paid_amount,
      MIN(sale_change_amount) as sale_change_amount,
      MAX(rental_days) as rental_days,
      MAX(delay_days) as delay_days,
      SUM(COALESCE(suggested_fine, 0)) as suggested_fine,
      MIN(inventory_name) as inventory_name,
      MIN(inventory_category) as inventory_category,
      MIN(inventory_barcode) as inventory_barcode,
      MIN(inventory_color) as inventory_color,
      MIN(inventory_size) as inventory_size,
      MIN(image_url) as image_url,
      COUNT(*)::int as item_count,
      ARRAY_AGG(id ORDER BY id) as rental_ids,
      JSON_AGG(JSON_BUILD_OBJECT(
        'id', id,
        'rental_id', id,
        'rental_inventory_id', rental_inventory_id,
        'product_name', inventory_name,
        'name', inventory_name,
        'product_category', inventory_category,
        'category', inventory_category,
        'barcode', inventory_barcode,
        'color', inventory_color,
        'size', inventory_size,
        'size_cut', inventory_size,
        'image_url', image_url,
        'status', status
      ) ORDER BY id) as items
    ${selectFrom}
    ${groupedWhereClause}
    ORDER BY MIN(pickup_date) DESC, MIN(id) DESC
  `;

  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM (
      SELECT rental_group_key
      ${selectFrom}
      ${groupedWhereClause}
    ) grouped_rentals
  `;

  const queryParams = [...params];

  if (pagination.enabled) {
    queryStr = appendPagination(queryStr, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(queryStr, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(queryStr, queryParams);
  return rows;
}

async function createRental(body, user, req) {
  let {
    customer_name,
    customer_phone,
    national_id,
    rental_inventory_id,
    branch_id,
    pickup_date,
    return_date,
    total_price,
    deposit,
    remaining,
    notes,
    id_card_guarantee,
    daily_fine,
    seller_id,
    payment_method,
    offline_uuid,
    rental_group_uuid,
  } = body || {};

  const requestedItems = Array.isArray(body?.items) && body.items.length
    ? body.items.flatMap((item) => {
      const itemId = Number(item?.rental_inventory_id ?? item?.id);
      const quantity = clampInt(item?.quantity, 1, 1, 100);
      return Array.from({ length: quantity }, () => itemId);
    })
    : [Number(rental_inventory_id)];

  const rentalItemIds = requestedItems.filter(Number.isInteger).filter((id) => id > 0);
  const rentalOfflineUuid = newUuid(offline_uuid);
  const rentalGroupUuid = newUuid(rental_group_uuid);

  if (user && user.role === 'branch_user') {
    branch_id = user.branch_id;
  }
  const b_id = parseInt(branch_id, 10) || 1;

  if (!config.IS_BRANCH_MODE && !(await db.isPrimaryDbAvailable())) {
    const err = new Error('قاعدة البيانات غير متاحة حالياً. يرجى المحاولة بعد قليل.');
    err.statusCode = 503;
    err.retry_after = 30;
    err.code = 'DB_UNAVAILABLE';
    throw err;
  }

  const normalizedCustomerName = typeof customer_name === 'string' ? customer_name.trim() : '';
  if (!normalizedCustomerName || !customer_phone || !rentalItemIds.length || !pickup_date || !return_date) {
    const err = new Error('Missing required rental data');
    err.statusCode = 400;
    throw err;
  }
  if (dateOnly(return_date) < dateOnly(pickup_date)) {
    const err = new Error('Return date must be after pickup date');
    err.statusCode = 400;
    throw err;
  }

  if (seller_id) {
    const sellerRes = await db.query('SELECT branch_id FROM employees WHERE id = $1', [seller_id]);
    if (sellerRes.rows.length === 0) {
      const err = new Error('Seller not found');
      err.statusCode = 400;
      throw err;
    }
    if (Number(sellerRes.rows[0].branch_id) !== Number(b_id)) {
      const err = new Error('Seller does not belong to this branch');
      err.statusCode = 400;
      throw err;
    }
  }

  const rental = await db.transaction(async (tx) => {
    const requestedCounts = new Map();
    for (const itemId of rentalItemIds) {
      requestedCounts.set(itemId, (requestedCounts.get(itemId) || 0) + 1);
    }

    // Pre-sort rental item IDs ascending to strictly prevent deadlocks
    const sortedItemIds = Array.from(requestedCounts.keys()).sort((a, b) => a - b);

    for (const itemId of sortedItemIds) {
      const requestedQuantity = requestedCounts.get(itemId);
      const availability = await getRentalAvailability(tx, itemId, b_id, pickup_date, return_date, { lockStockRow: true });
      if (availability.available < requestedQuantity) {
        const err = new Error('هذا المنتج غير متاح في الفترة المحددة. اختر تاريخ بعد رجوع الحجز السابق أو منتج آخر.');
        err.statusCode = 400;
        throw err;
      }
    }

    // 1. Handle Customer with concurrency lock
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${customer_phone}`]);

    let customerId;
    const existingCustomer = await tx.query(
      'SELECT id, national_id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE',
      [customer_phone, b_id]
    );

    if (existingCustomer.rows.length > 0) {
      customerId = existingCustomer.rows[0].id;
      if (national_id && !existingCustomer.rows[0].national_id) {
        await tx.query('UPDATE customers SET national_id = $1 WHERE id = $2', [national_id, customerId]);
      }
    } else {
      const initials = getInitialsFromName(normalizedCustomerName);
      const customerOfflineUuid = newUuid();
      try {
        const newCust = await tx.query(
          `INSERT INTO customers (name, initials, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid) 
           VALUES ($1, $2, $3, $4, ${CAIRO_DATE_SQL}, 0, $5, $6, $7) RETURNING id`,
          [normalizedCustomerName, initials, customer_phone, national_id, 'نشط', b_id, customerOfflineUuid]
        );
        customerId = newCust.rows[0].id;
      } catch (insertErr) {
        const retryCust = await tx.query(
          'SELECT id, national_id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE',
          [customer_phone, b_id]
        );
        if (retryCust.rows.length) {
          customerId = retryCust.rows[0].id;
          if (national_id && !retryCust.rows[0].national_id) {
            await tx.query('UPDATE customers SET national_id = $1 WHERE id = $2', [national_id, customerId]);
          }
        } else {
          throw insertErr;
        }
      }
    }

    // 2. Create one booked row per item. Financial totals live on the first row only
    const createdRentals = [];
    for (let index = 0; index < rentalItemIds.length; index += 1) {
      const itemId = rentalItemIds[index];
      const itemOfflineUuid = index === 0 ? rentalOfflineUuid : newUuid();
      const itemTotal = index === 0 ? Math.max(0, roundCurrency(Number(total_price || 0))) : 0;
      const itemDeposit = index === 0 ? Math.max(0, roundCurrency(Number(deposit || 0))) : 0;
      const itemRemaining = index === 0 ? Math.max(0, roundCurrency(Number(remaining !== undefined ? remaining : (itemTotal - itemDeposit)))) : 0;

      const { rows } = await tx.query(
        `INSERT INTO rentals (customer_id, rental_inventory_id, branch_id, pickup_date, return_date, total_price, national_id, deposit, remaining, id_card_guarantee, notes, status, daily_fine, seller_id, payment_method, rental_group_uuid, offline_uuid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'booked', $12, $13, $14, $15, $16) RETURNING *`,
        [
          customerId,
          itemId,
          b_id,
          pickup_date,
          return_date,
          itemTotal,
          national_id,
          itemDeposit,
          itemRemaining,
          Boolean(id_card_guarantee),
          notes,
          Number(daily_fine || 0),
          seller_id || null,
          payment_method || 'cash',
          rentalGroupUuid,
          itemOfflineUuid,
        ]
      );
      createdRentals.push(rows[0]);

      await queueSyncOperation(tx, req, 'rental', 'create', rows[0].id, b_id, {
        offline_uuid: itemOfflineUuid,
        customer: { name: normalizedCustomerName, phone: customer_phone, national_id, branch_id: b_id },
        rental: {
          rental_inventory_id: itemId,
          branch_id: b_id,
          pickup_date,
          return_date,
          total_price: itemTotal,
          national_id,
          deposit: itemDeposit,
          remaining: itemRemaining,
          id_card_guarantee: Boolean(id_card_guarantee),
          notes,
          daily_fine: Number(daily_fine || 0),
          seller_id: seller_id || null,
          payment_method: payment_method || 'cash',
          rental_group_uuid: rentalGroupUuid,
        },
      });
    }

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'حجز إيجار جديد',
        `حجز ${createdRentals.length} منتج للعميل ${customer_name} (بداية من الحجز #${createdRentals[0].id})`,
        'Rental',
        b_id
      );
    }

    return { ...createdRentals[0], rentals: createdRentals };
  });

  return rental;
}

async function pickupRental(id, user) {
  await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    const branchId = rentals[0].branch_id;

    if (user && user.role === 'branch_user' && Number(branchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (rentals.some((r) => r.status !== 'booked')) {
      const err = new Error('Rental is not booked');
      err.statusCode = 400;
      throw err;
    }

    // Pre-sort items ascending to acquire locks in consistent order
    const sortedRentals = [...rentals].sort((a, b) => Number(a.rental_inventory_id || 0) - Number(b.rental_inventory_id || 0));

    for (const rental of sortedRentals) {
      if (!rental.rental_inventory_id) continue;
      const stockCheck = await tx.query(
        'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
        [rental.rental_inventory_id, rental.branch_id]
      );
      if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < 1) {
        const err = new Error('Insufficient stock for rental item');
        err.statusCode = 400;
        throw err;
      }
      await tx.query(
        'UPDATE rental_inventory_branches SET stock_level = stock_level - 1 WHERE rental_inventory_id = $1 AND branch_id = $2',
        [rental.rental_inventory_id, rental.branch_id]
      );
    }

    await tx.query("UPDATE rentals SET status = 'active' WHERE id = ANY($1::int[])", [rentals.map((r) => r.id)]);

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'استلام إيجار',
        `تم تسليم الحجز #${id} (${rentals.length} منتج) للعميل`,
        'Rental',
        branchId
      );
    }
  });

  return { success: true };
}

async function cancelRental(id, user, req) {
  await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    const branchId = rentals[0].branch_id;

    if (user && user.role === 'branch_user' && Number(branchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (rentals.some((r) => r.status !== 'booked')) {
      const err = new Error('لا يمكن إلغاء الحجز بعد تسجيل الاستلام');
      err.statusCode = 400;
      throw err;
    }

    await tx.query("UPDATE rentals SET status = 'cancelled' WHERE id = ANY($1::int[])", [rentals.map((r) => r.id)]);

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'إلغاء حجز إيجار',
        `تم إلغاء الحجز #${id} (${rentals.length} منتج)`,
        'Rental',
        branchId
      );
    }

    for (const rental of rentals) {
      await queueSyncOperation(tx, req, 'rental_status', 'cancel', rental.id, rental.branch_id, {
        rental_id: rental.id,
        rental_offline_uuid: rental.offline_uuid,
      });
    }
  });

  return { success: true };
}

async function returnRental(id, bodyOrFine, user, req) {
  let options = {};
  if (typeof bodyOrFine === 'object' && bodyOrFine !== null) {
    options = bodyOrFine;
  } else if (typeof bodyOrFine === 'number') {
    options = { fine_per_day: bodyOrFine };
  }

  let calculatedFine = 0;
  let remainingAfterReturn = 0;

  await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    const branchId = rentals[0].branch_id;

    if (user && user.role === 'branch_user' && Number(branchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (rentals.some((r) => r.status !== 'active')) {
      const err = new Error('Rental is not active');
      err.statusCode = 400;
      throw err;
    }

    // 1. Calculate Fine
    if (options.fine !== undefined && options.fine !== null && options.fine !== '') {
      calculatedFine = Math.max(0, roundCurrency(Number(options.fine)));
    } else {
      const cairoNow = await getDatabaseCairoNow(tx);
      const delayDays = daysBetween(rentals[0].return_date, cairoNow.date);
      const perDay = Number(rentals[0].daily_fine || options.fine_per_day || DEFAULT_RENTAL_FINE_PER_DAY);
      calculatedFine = Math.max(0, roundCurrency(delayDays * perDay));
    }

    // 2. Handle Remaining Settlement
    const currentRemaining = Number(rentals[0].remaining || 0);
    const depositAmount = Number(rentals[0].deposit || 0);
    let noteAppend = '';

    if (currentRemaining > 0) {
      const allowedActions = ['collect', 'deduct_deposit', 'debt'];
      let action = options.settlement_action;
      if (!action && typeof bodyOrFine === 'number') {
        action = 'debt';
      }
      if (!action || !allowedActions.includes(action)) {
        const err = new Error('الرجاء اختيار طريقة تسوية المبلغ المتبقي (تحصيل نقدي، خصم من التأمين، أو تسجيل كدين خالص)');
        err.statusCode = 400;
        throw err;
      }

      if (action === 'collect') {
        const paid = options.paid_amount !== undefined
          ? roundCurrency(Number(options.paid_amount))
          : currentRemaining;
        if (!Number.isFinite(paid) || paid <= 0) {
          const err = new Error('يرجى تحديد المبلغ المحصل من العميل بشكل صحيح (أكبر من الصفر)');
          err.statusCode = 400;
          throw err;
        }
        if (paid > currentRemaining) {
          const err = new Error(`المبلغ المحصل (${paid} ج.م) لا يمكن أن يتجاوز المتبقي المطلوب (${currentRemaining} ج.م)`);
          err.statusCode = 400;
          throw err;
        }
        remainingAfterReturn = Math.max(0, roundCurrency(currentRemaining - paid));
        const method = options.payment_method || 'نقدي';
        noteAppend = `[تم تحصيل ${paid} ج.م من المتبقي عند الإرجاع (${method})]`;
      } else if (action === 'deduct_deposit') {
        const availableDeposit = Math.max(0, roundCurrency(depositAmount - calculatedFine));
        if (availableDeposit <= 0) {
          const err = new Error('لا يوجد مبلغ تأمين متاح للخصم منه بعد احتساب الغرامات');
          err.statusCode = 400;
          throw err;
        }
        const deducted = Math.min(availableDeposit, currentRemaining);
        remainingAfterReturn = Math.max(0, roundCurrency(currentRemaining - deducted));
        noteAppend = `[تم خصم ${deducted} ج.م من التأمين لسداد المتبقي عند الإرجاع]`;
      } else if (action === 'debt') {
        remainingAfterReturn = currentRemaining;
        noteAppend = `[تم تسجيل المتبقي (${currentRemaining} ج.م) كدين خالص على العميل عند الإرجاع]`;
      }
    } else {
      remainingAfterReturn = 0;
    }

    if (options.notes && typeof options.notes === 'string' && options.notes.trim()) {
      noteAppend = noteAppend ? `${noteAppend} - ${options.notes.trim()}` : options.notes.trim();
    }

    await tx.query(
      `UPDATE rentals
       SET status = 'returned',
           actual_return_date = ${CAIRO_DATE_SQL},
           fine_amount = CASE WHEN id = $2 THEN $1 ELSE 0 END,
           remaining = CASE WHEN id = $2 THEN $4 ELSE 0 END,
           notes = CASE 
             WHEN id = $2 AND $5 <> '' THEN TRIM(COALESCE(notes, '') || ' ' || $5)
             ELSE notes
           END
       WHERE id = ANY($3::int[])`,
      [calculatedFine, rentals[0].id, rentals.map((r) => r.id), remainingAfterReturn, noteAppend]
    );

    for (const rental of rentals) {
      if (!rental.rental_inventory_id) continue;
      await tx.query(
        'UPDATE rental_inventory_branches SET stock_level = stock_level + 1 WHERE rental_inventory_id = $1 AND branch_id = $2',
        [rental.rental_inventory_id, rental.branch_id]
      );
    }

    await queueSyncOperation(tx, req, 'rental', 'update', rentals[0].id, branchId, {
      id: rentals[0].id,
      status: 'returned',
      fine_amount: calculatedFine,
      remaining: remainingAfterReturn,
    });

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'إرجاع إيجار',
        `تم إرجاع الحجز #${id} (${rentals.length} منتج) مع غرامة ${calculatedFine} ج.م ومتبقي ${remainingAfterReturn} ج.م`,
        'Rental',
        branchId
      );
    }
  });

  return { success: true, fine_amount: calculatedFine, remaining: remainingAfterReturn };
}

async function settleRentalPayment(id, body, user, req) {
  const { paid_amount, payment_method, notes } = body || {};
  const pay = roundCurrency(Number(paid_amount));
  if (!Number.isFinite(pay) || pay <= 0) {
    const err = new Error('المبلغ المدفوع يجب أن يكون أكبر من الصفر');
    err.statusCode = 400;
    throw err;
  }

  let updatedRemaining = 0;

  await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    const branchId = rentals[0].branch_id;

    if (user && user.role === 'branch_user' && Number(branchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    const currentRemaining = Number(rentals[0].remaining || 0);
    if (currentRemaining <= 0) {
      const err = new Error('هذا الحجز مسدد بالكامل بالفعل ولا يوجد متبقي');
      err.statusCode = 400;
      throw err;
    }

    if (pay > currentRemaining) {
      const err = new Error(`المبلغ المدفوع (${pay}) أكبر من المتبقي المطلوب (${currentRemaining})`);
      err.statusCode = 400;
      throw err;
    }

    updatedRemaining = Math.max(0, roundCurrency(currentRemaining - pay));
    const methodStr = payment_method || 'نقدي';
    const noteMsg = `[سداد دفعة من المتبقي: ${pay} ج.م (${methodStr})${notes ? ` - ${notes}` : ''}]`;

    await tx.query(
      `UPDATE rentals
       SET remaining = CASE WHEN id = $1 THEN $2 ELSE 0 END,
           notes = TRIM(COALESCE(notes, '') || ' ' || $3)
       WHERE id = ANY($4::int[])`,
      [rentals[0].id, updatedRemaining, noteMsg, rentals.map((r) => r.id)]
    );

    await queueSyncOperation(tx, req, 'rental', 'update', rentals[0].id, branchId, {
      id: rentals[0].id,
      remaining: updatedRemaining,
    });

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'سداد متبقي إيجار',
        `تم سداد ${pay} ج.م للحجز #${id}، المتبقي الحالي: ${updatedRemaining} ج.م`,
        'Rental',
        branchId
      );
    }
  });

  return { success: true, remaining: updatedRemaining };
}

async function sellRental(id, sellPrice, paymentMethod, offlineUuid, user, req) {
  let priceVal = sellPrice;
  let methodVal = paymentMethod;
  if (typeof sellPrice === 'object' && sellPrice !== null) {
    priceVal = sellPrice.sell_price ?? sellPrice.price ?? sellPrice.sellPrice;
    methodVal = sellPrice.payment_method ?? sellPrice.paymentMethod ?? paymentMethod;
  }
  const price = Number(priceVal);
  if (!Number.isFinite(price) || price <= 0) {
    const err = new Error('سعر البيع غير صحيح');
    err.statusCode = 400;
    throw err;
  }

  let createdOrderId;
  let finalPaymentMethod;

  await db.transaction(async (tx) => {
    const rentalRes = await tx.query('SELECT * FROM rentals WHERE id = $1 FOR UPDATE', [id]);
    if (rentalRes.rows.length === 0) {
      const err = new Error('Rental not found');
      err.statusCode = 404;
      throw err;
    }
    const rental = rentalRes.rows[0];

    if (user && user.role === 'branch_user' && Number(rental.branch_id) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (rental.status !== 'active') {
      const err = new Error('Rental is not active');
      err.statusCode = 400;
      throw err;
    }

    if (!rental.rental_inventory_id) {
      const err = new Error('Rental inventory item not found');
      err.statusCode = 404;
      throw err;
    }

    const salesInventoryId = await getOrCreateSalesInventoryForRental(tx, rental.rental_inventory_id, price);
    const orderOfflineUuid = newUuid(offlineUuid);
    finalPaymentMethod = methodVal || rental.payment_method || 'cash';
    let r_cash = 0;
    let r_card = 0;
    let r_wallet = 0;
    let r_bank = 0;
    const normRPM = String(finalPaymentMethod).toLowerCase();
    if (['cash', 'نقدي', 'كاش'].includes(normRPM)) r_cash = price;
    else if (['card', 'visa', 'بطاقة', 'فيزا'].includes(normRPM)) r_card = price;
    else if (['wallet', 'mobile_wallet', 'فودافون كاش', 'محفظة'].includes(normRPM)) r_wallet = price;
    else if (['bank_transfer', 'bank', 'transfer', 'انستاباي', 'instapay', 'تحويل بنكي'].includes(normRPM)) r_bank = price;

    const orderResult = await tx.query(
      `INSERT INTO orders (
        customer_id, total_amount, order_date, branch_id, payment_method, seller_id,
        paid_amount, change_amount, order_source, branch_invoice_number, offline_uuid,
        cash_amount, card_amount, wallet_amount, bank_transfer_amount
      )
       VALUES ($1, $2, ${CAIRO_NOW_SQL}, $3, $4, $5, $2, 0, 'rental_sale', NULL, $6, $7, $8, $9, $10)
       RETURNING id`,
      [rental.customer_id, price, rental.branch_id, finalPaymentMethod, rental.seller_id || null, orderOfflineUuid, r_cash, r_card, r_wallet, r_bank]
    );
    createdOrderId = orderResult.rows[0].id;

    await tx.query(
      'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)',
      [createdOrderId, salesInventoryId, 1, price]
    );

    await tx.query('UPDATE customers SET total_spent = COALESCE(total_spent, 0) + $1 WHERE id = $2', [price, rental.customer_id]);

    await tx.query(
      `UPDATE rentals 
       SET status = 'sold', actual_return_date = ${CAIRO_DATE_SQL}, total_price = $1, sale_order_id = $2 
       WHERE id = $3`,
      [price, createdOrderId, id]
    );

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'تحويل إيجار لبيع',
        `تم تحويل الحجز #${id} إلى بيع بقيمة ${price} ج.م (طلب #${createdOrderId})`,
        'Rental',
        rental.branch_id
      );
    }

    await queueSyncOperation(tx, req, 'rental_status', 'sell', id, rental.branch_id, {
      rental_id: rental.id,
      rental_offline_uuid: rental.offline_uuid,
      sell_price: price,
      payment_method: finalPaymentMethod,
      order_offline_uuid: orderOfflineUuid,
      order_date: new Date().toISOString(),
    });
  });

  return {
    success: true,
    orderId: createdOrderId,
    invoice_number: `RENT#${id}`,
    sell_price: price,
    payment_method: finalPaymentMethod,
    order_date: new Date().toISOString(),
  };
}

module.exports = {
  listRentalInventory,
  createRentalInventory,
  checkAvailability,
  updateRentalInventory,
  deleteRentalInventory,
  transferFromSales,
  getRentalsSummary,
  listRentals,
  createRental,
  pickupRental,
  cancelRental,
  returnRental,
  settleRentalPayment,
  sellRental,
};
