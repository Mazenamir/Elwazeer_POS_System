const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL, DEFAULT_RENTAL_FINE_PER_DAY } = require('../../../shared/constants/system');
const { hasInventoryAdminAccess, hasInventoryAllBranchesAccess, isBranchScopedUser } = require('../../../shared/constants/permissions');
const { dateOnly, daysBetween, getDatabaseCairoNow } = require('../../../shared/utils/date');
const { likePattern, newUuid, getInitialsFromName } = require('../../../shared/utils/string');
const { clampInt, roundCurrency } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { normalizeBarcodeInput, getAvailableBarcode, assertBarcodeAvailable, generateUniqueBarcode, adjustInventoryStock, resolveCategoryQuery } = require('../inventory/inventory.helpers');
const { queueSyncOperation, logActivity } = require('../../database/sync.helpers');
const { getRentalAvailability, getRentalGroupRows, getOrCreateSalesInventoryForRental } = require('./rentals.helpers');
const { normalizePaymentMethod } = require('../reports/reports.helpers');

function isValidIsoDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

async function listRentalInventory(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 60, 10000, true);
  const canViewAllBranches = hasInventoryAllBranchesAccess(user);
  const targetRentalBranchId = (!canViewAllBranches && user?.branch_id)
    ? user.branch_id
    : (query.branch_id && query.branch_id !== 'all' ? query.branch_id : null);

  let branchJoinFilter = '';
  const params = [];
  if (targetRentalBranchId) {
    params.push(targetRentalBranchId);
    branchJoinFilter = `AND rib.branch_id = $${params.length}`;
  }

  const where = ['ri.is_deleted = FALSE'];
  if (targetRentalBranchId) {
    params.push(targetRentalBranchId);
    const stockFilter = (query.stock_status === 'in_stock' || query.only_branch === 'true' || query.branch_only === 'true')
      ? 'AND rib_filter.stock_level > 0'
      : '';
    where.push(`EXISTS (
      SELECT 1 FROM rental_inventory_branches rib_filter
      WHERE rib_filter.rental_inventory_id = ri.id
        AND rib_filter.branch_id = $${params.length}
        ${stockFilter}
    )`);
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
  const catQuery = resolveCategoryQuery(query.category);
  if (catQuery) {
    if (catQuery.type === 'suits') {
      where.push(`(ri.category ILIKE '%SUIT%' OR ri.category ILIKE '%بدل%')`);
    } else if (catQuery.type === 'other') {
      where.push(`(ri.category IS NULL OR TRIM(ri.category) = '' OR LOWER(TRIM(ri.category)) IN ('أخرى', 'اخري', 'other', 'uncategorized'))`);
    } else {
      params.push(catQuery.value);
      where.push(`LOWER(TRIM(ri.category)) = LOWER(TRIM($${params.length}))`);
    }
  }
  if (query.color) {
    params.push(likePattern(query.color));
    where.push(`ri.color ILIKE $${params.length}`);
  }
  if (query.size) {
    params.push(likePattern(query.size));
    where.push(`ri.size_cut ILIKE $${params.length}`);
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
  let { name, category, size_cut, color, barcode, image_url, branch_stocks, stock_level, price, rental_price } = body || {};
  barcode = normalizeBarcodeInput(barcode);
  const itemPrice = Number(price ?? rental_price ?? 0) || 0;

  if (isBranchScopedUser(user)) {
    branch_stocks = [{ branch_id: user.branch_id, stock_level: stock_level || 0 }];
  }

  const item = await db.transaction(async (tx) => {
    if (barcode) {
      await assertBarcodeAvailable(tx, barcode);
    } else {
      barcode = await generateUniqueBarcode(tx, { prefix: 'RENT' });
    }

    const { rows } = await tx.query(
      `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, category, size_cut, color, barcode, itemPrice, image_url]
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
  const cleanPickup = dateOnly(pickupDate);
  const cleanReturn = dateOnly(returnDate);
  if (!isValidIsoDate(cleanPickup) || !isValidIsoDate(cleanReturn)) {
    const err = new Error('صيغة التاريخ غير صالحة. الصيغة المطلوبة YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }
  if (cleanReturn < cleanPickup) {
    const err = new Error('تاريخ الإرجاع يجب أن يكون في نفس يوم الاستلام أو بعده');
    err.statusCode = 400;
    throw err;
  }
  if (daysBetween(cleanPickup, cleanReturn) > 365) {
    const err = new Error('لا يمكن أن تتجاوز مدة الحجز سنة واحدة (365 يوماً)');
    err.statusCode = 400;
    throw err;
  }

  const itemRes = await db.query('SELECT id FROM rental_inventory WHERE id = $1 AND is_deleted = FALSE', [id]);
  if (itemRes.rows.length === 0) {
    const err = new Error('منتج التأجير غير موجود أو تم حذفه');
    err.statusCode = 404;
    throw err;
  }

  return getRentalAvailability(db, id, b_id, cleanPickup, cleanReturn);
}

async function updateRentalInventory(id, body, user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Inventory admin only');
    err.statusCode = 403;
    throw err;
  }

  let { name, category, size_cut, color, barcode, image_url, branch_stocks, price, rental_price } = body || {};
  barcode = normalizeBarcodeInput(barcode);
  const itemPrice = Number(price ?? rental_price ?? 0) || 0;

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
      [name, category, size_cut, color, barcode, itemPrice, image_url, id]
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
  let {
    inventory_id,
    from_branch,
    to_branch,
    quantity,
    branch_id,
    rental_price,
    price,
    transfer_mode,
    size,
    size_name,
    part_type,
    color,
  } = body || {};

  from_branch = Number(from_branch || branch_id || user?.branch_id || 1);
  to_branch = Number(to_branch || branch_id || from_branch || user?.branch_id || 1);
  quantity = Number(quantity) > 0 ? Number(quantity) : 1;
  const effectiveRentalPrice = Number(price ?? rental_price ?? 0) || 0;

  if (!inventory_id) {
    const err = new Error('بيانات الصنف المطلوب تحويله غير صالحة أو مفقودة');
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

  let transferredItemName = '';

  await db.transaction(async (tx) => {
    // 1. Get source inventory details
    const invRes = await tx.query('SELECT * FROM inventory WHERE id = $1', [inventory_id]);
    if (invRes.rows.length === 0) {
      const err = new Error('الصنف غير موجود بالمخزون أو تم حذفه');
      err.statusCode = 404;
      throw err;
    }
    const invItem = invRes.rows[0];

    // Determine target piece / size name
    const effectivePart = part_type && part_type !== 'بدلة كاملة' ? String(part_type).trim() : null;
    transferredItemName = effectivePart ? `${invItem.name} (${effectivePart})` : invItem.name;
    const effectiveSize = String(size || size_name || '').trim();
    const effectiveColor = String(color || invItem.color || '').trim();

    if (transfer_mode === 'full_suit' && !effectiveSize) {
      // Transfer across all available sizes for this suit in from_branch
      const sizesRes = await tx.query(
        'SELECT * FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2 AND stock_level > 0 ORDER BY id ASC',
        [inventory_id, from_branch]
      );
      if (sizesRes.rows.length > 0) {
        for (const sr of sizesRes.rows) {
          const moveQty = Math.min(Number(sr.stock_level || 0), quantity);
          if (moveQty <= 0) continue;

          // Find or create in rental_inventory
          const sName = sr.size_name || invItem.size_cut;
          const sColor = sr.color_name || effectiveColor;
          const rInvRes = await tx.query(
            'SELECT id, price FROM rental_inventory WHERE name = $1 AND category = $2 AND size_cut = $3 AND color = $4 AND is_deleted = FALSE',
            [transferredItemName, invItem.category, sName, sColor]
          );
          let rId;
          if (rInvRes.rows.length > 0) {
            rId = rInvRes.rows[0].id;
            if (effectiveRentalPrice > 0 && Number(rInvRes.rows[0].price) === 0) {
              await tx.query('UPDATE rental_inventory SET price = $1 WHERE id = $2', [effectiveRentalPrice, rId]);
            }
          } else {
            let newBarcode = invItem.barcode ? normalizeBarcodeInput(`${invItem.barcode}${sr.size_id || 9}`) : null;
            newBarcode = await getAvailableBarcode(tx, newBarcode);
            const insRes = await tx.query(
              `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url)
               VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
              [transferredItemName, invItem.category, sName, sColor, newBarcode, effectiveRentalPrice, invItem.image_url]
            );
            rId = insRes.rows[0].id;
          }

          // Deduct from sales inventory
          await adjustInventoryStock(tx, {
            inventoryId: inventory_id,
            branchId: from_branch,
            quantityDelta: -moveQty,
            size: sName,
            color: sColor,
          });

          // Add to rental inventory
          await tx.query(
            `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
             VALUES ($1, $2, $3)
             ON CONFLICT (rental_inventory_id, branch_id)
             DO UPDATE SET stock_level = rental_inventory_branches.stock_level + $3`,
            [rId, to_branch, moveQty]
          );
        }
      } else {
        // Fallback when no inventory_sizes rows exist
        const stockRes = await tx.query(
          'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [inventory_id, from_branch]
        );
        const currentStock = stockRes.rows.length > 0 ? Number(stockRes.rows[0].stock_level) : 0;
        if (currentStock < quantity) {
          const err = new Error(`الرصيد المتوفر بالمخزن (${currentStock} قطعة) غير كافٍ لتحويل (${quantity} قطعة)`);
          err.statusCode = 400;
          throw err;
        }

        let rentalItemId;
        const rentalInvRes = await tx.query(
          'SELECT id, price FROM rental_inventory WHERE name = $1 AND category = $2 AND size_cut = $3 AND color = $4 AND is_deleted = FALSE',
          [transferredItemName, invItem.category, invItem.size_cut, effectiveColor]
        );
        if (rentalInvRes.rows.length > 0) {
          rentalItemId = rentalInvRes.rows[0].id;
        } else {
          let newBarcode = invItem.barcode ? normalizeBarcodeInput(`${invItem.barcode}9`) : null;
          newBarcode = await getAvailableBarcode(tx, newBarcode);
          const newRentalRes = await tx.query(
            `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [transferredItemName, invItem.category, invItem.size_cut, effectiveColor, newBarcode, effectiveRentalPrice, invItem.image_url]
          );
          rentalItemId = newRentalRes.rows[0].id;
        }
        await adjustInventoryStock(tx, {
          inventoryId: inventory_id,
          branchId: from_branch,
          quantityDelta: -quantity,
          size: invItem.size_cut,
          color: effectiveColor,
        });
        await tx.query(
          `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) 
           VALUES ($1, $2, $3)
           ON CONFLICT (rental_inventory_id, branch_id) 
           DO UPDATE SET stock_level = rental_inventory_branches.stock_level + $3`,
          [rentalItemId, to_branch, quantity]
        );
      }
    } else {
      // Specific size or part piece transfer
      const targetSize = effectiveSize || invItem.size_cut;

      // Check stock
      if (effectiveSize) {
        const sizeStockRes = await tx.query(
          'SELECT stock_level FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2 AND LOWER(TRIM(size_name)) = LOWER(TRIM($3)) FOR UPDATE',
          [inventory_id, from_branch, effectiveSize]
        );
        const sizeStock = sizeStockRes.rows.length > 0 ? Number(sizeStockRes.rows[0].stock_level) : 0;
        if (sizeStock < quantity) {
          const err = new Error(`رصيد المقاس (${effectiveSize}) في الفرع هو (${sizeStock} قطعة) فقط، ولا يكفي لتحويل (${quantity} قطعة)`);
          err.statusCode = 400;
          throw err;
        }
      } else {
        const stockRes = await tx.query(
          'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [inventory_id, from_branch]
        );
        const currentStock = stockRes.rows.length > 0 ? Number(stockRes.rows[0].stock_level) : 0;
        if (currentStock < quantity) {
          const err = new Error(`الرصيد المتوفر بالمخزن (${currentStock} قطعة) غير كافٍ لتحويل (${quantity} قطعة)`);
          err.statusCode = 400;
          throw err;
        }
      }

      // Find or create in rental_inventory
      let rentalItemId;
      const rentalInvRes = await tx.query(
        'SELECT id, price FROM rental_inventory WHERE name = $1 AND category = $2 AND size_cut = $3 AND color = $4 AND is_deleted = FALSE',
        [transferredItemName, invItem.category, targetSize, effectiveColor]
      );

      if (rentalInvRes.rows.length > 0) {
        rentalItemId = rentalInvRes.rows[0].id;
        if (effectiveRentalPrice > 0 && Number(rentalInvRes.rows[0].price) === 0) {
          await tx.query('UPDATE rental_inventory SET price = $1 WHERE id = $2', [effectiveRentalPrice, rentalItemId]);
        }
      } else {
        let newBarcode = invItem.barcode ? normalizeBarcodeInput(`${invItem.barcode}${effectiveSize || '9'}`) : null;
        newBarcode = await getAvailableBarcode(tx, newBarcode);
        const newRentalRes = await tx.query(
          `INSERT INTO rental_inventory (name, category, size_cut, color, barcode, price, image_url) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [transferredItemName, invItem.category, targetSize, effectiveColor, newBarcode, effectiveRentalPrice, invItem.image_url]
        );
        rentalItemId = newRentalRes.rows[0].id;

        await tx.query(
          `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
           SELECT $1, id, 0 FROM branches
           ON CONFLICT DO NOTHING`,
          [rentalItemId]
        );
      }

      // Deduct from sales inventory
      await adjustInventoryStock(tx, {
        inventoryId: inventory_id,
        branchId: from_branch,
        quantityDelta: -quantity,
        size: targetSize,
        color: effectiveColor,
      });

      // Add to rental inventory
      await tx.query(
        `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level) 
         VALUES ($1, $2, $3)
         ON CONFLICT (rental_inventory_id, branch_id) 
         DO UPDATE SET stock_level = rental_inventory_branches.stock_level + $3`,
        [rentalItemId, to_branch, quantity]
      );
    }

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'تحويل للمخزون التأجيري',
        `تم تحويل ${quantity} قطعة من "${transferredItemName}" ${effectiveSize ? `(مقاس ${effectiveSize})` : ''} لمخزون التأجير`,
        'RentalInventory',
        from_branch
      );
    }
  });

  return {
    success: true,
    message: `تم تحويل ${quantity} قطعة من "${transferredItemName}" إلى مخزون التأجير بنجاح! ✨`,
  };
}

async function getRentalsSummary(branchIdOrQuery, user) {
  const branchId = (branchIdOrQuery && typeof branchIdOrQuery === 'object') ? branchIdOrQuery.branch_id : branchIdOrQuery;
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
            COUNT(CASE WHEN status = 'returned' AND (remaining IS NULL OR remaining <= 0) THEN 1 END)::int as returned_settled_count,
            COUNT(CASE WHEN status = 'booked' AND pickup_date >= ${CAIRO_DATE_SQL} THEN 1 END)::int as upcoming_count,
            COUNT(CASE WHEN status = 'booked' AND pickup_date = ${CAIRO_DATE_SQL} THEN 1 END)::int as today_pickups_count,
            COUNT(CASE WHEN status = 'active' AND return_date = ${CAIRO_DATE_SQL} THEN 1 END)::int as today_returns_count,
            COUNT(CASE WHEN (status = 'booked' AND pickup_date = ${CAIRO_DATE_SQL}) OR (status = 'active' AND return_date = ${CAIRO_DATE_SQL}) THEN 1 END)::int as today_actions_count
     FROM (
       SELECT COALESCE(rental_group_uuid::text, id::text) as rental_group_key, 
              MIN(status) as status,
              MIN(pickup_date) as pickup_date,
              MIN(return_date) as return_date,
              SUM(COALESCE(remaining, 0)) as remaining
       FROM rentals
       ${whereClause}
       GROUP BY rental_group_key
     ) grouped_rentals
     GROUP BY status`,
    params
  );

  const summary = {
    booked: 0,
    active: 0,
    returned: 0,
    sold: 0,
    cancelled: 0,
    returned_debt: 0,
    returned_settled: 0,
    upcoming: 0,
    today_pickups: 0,
    today_returns: 0,
    today_actions: 0,
  };
  rows.forEach((row) => {
    summary[row.status] = row.count;
    if (row.status === 'returned') {
      summary.returned_debt = row.returned_debt_count || 0;
      summary.returned_settled = row.returned_settled_count || 0;
    }
    if (row.status === 'booked') {
      summary.upcoming += (row.upcoming_count || 0);
    }
    summary.today_pickups += (row.today_pickups_count || 0);
    summary.today_returns += (row.today_returns_count || 0);
    summary.today_actions += (row.today_actions_count || 0);
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
             ep.name as prep_employee_name,
             r.is_prepared,
             r.prepared_at,
             r.prep_notes,
             so.branch_invoice_number as sale_branch_invoice_number,
             so.order_date as sale_order_date,
             so.payment_method as sale_payment_method,
             so.paid_amount as sale_paid_amount,
             so.change_amount as sale_change_amount
      FROM rentals r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
      LEFT JOIN branches b ON r.branch_id = b.id
      LEFT JOIN employees e ON r.seller_id = e.id
      LEFT JOIN employees ep ON r.prepared_by = ep.id
      LEFT JOIN orders so ON r.sale_order_id = so.id
  `;

  const params = [DEFAULT_RENTAL_FINE_PER_DAY];
  const where = ['$1::numeric IS NOT NULL'];

  if (user && (user.role === 'branch_user' || user.role === 'cashier')) {
    params.push(user.branch_id);
    where.push(`r.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`r.branch_id = $${params.length}`);
  }

  const isUpcomingFilter = query.status === 'upcoming' || query.filter === 'upcoming' || query.upcoming === 'true';
  const isTodayFilter = query.status === 'today' || query.filter === 'today' || query.tab === 'today';

  if (isUpcomingFilter) {
    where.push(`r.status = 'booked' AND r.pickup_date >= ${CAIRO_DATE_SQL}`);
  } else if (query.status === 'today_pickup' || (isTodayFilter && query.today_type === 'pickup')) {
    where.push(`r.status = 'booked' AND r.pickup_date = ${CAIRO_DATE_SQL}`);
  } else if (query.status === 'today_return' || (isTodayFilter && query.today_type === 'return')) {
    where.push(`r.status = 'active' AND r.return_date = ${CAIRO_DATE_SQL}`);
  } else if (isTodayFilter) {
    where.push(`((r.status = 'booked' AND r.pickup_date = ${CAIRO_DATE_SQL}) OR (r.status = 'active' AND r.return_date = ${CAIRO_DATE_SQL}))`);
  } else if (query.status === 'returned_debt') {
    where.push(`r.status = 'returned' AND COALESCE(r.remaining, 0) > 0`);
  } else if (query.status === 'returned_settled') {
    where.push(`r.status = 'returned' AND COALESCE(r.remaining, 0) <= 0`);
  } else if (query.status && query.status !== 'all') {
    params.push(query.status);
    where.push(`r.status = $${params.length}`);
  }
  if (query.search) {
    params.push(likePattern(query.search));
    const pIdx = params.length;
    where.push(`(c.name ILIKE $${pIdx} OR c.phone ILIKE $${pIdx} OR r.id::text ILIKE $${pIdx} OR ri.name ILIKE $${pIdx} OR ri.barcode ILIKE $${pIdx})`);
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
      MIN(booking_date::text) as booking_date,
      MIN(pickup_date::text) as pickup_date,
      MIN(return_date::text) as return_date,
      MAX(actual_return_date::text) as actual_return_date,
      MIN(status) as status,
      SUM(COALESCE(total_price, 0)) as total_price,
      SUM(COALESCE(deposit, 0)) as deposit,
      SUM(COALESCE(remaining, 0)) as remaining,
      SUM(COALESCE(fine_amount, 0)) as fine_amount,
      BOOL_OR(COALESCE(id_card_guarantee, false)) as id_card_guarantee,
      MAX(notes) as notes,
      MAX(daily_fine) as daily_fine,
      MIN(payment_method) as payment_method,
      MIN(payment_splits::text) as payment_splits,
      MIN(custom_items::text) as custom_items,
      SUM(COALESCE(paid_amount, 0)) as paid_amount,
      SUM(COALESCE(cash_amount, 0)) as cash_amount,
      SUM(COALESCE(card_amount, 0)) as card_amount,
      SUM(COALESCE(wallet_amount, 0)) as wallet_amount,
      SUM(COALESCE(bank_transfer_amount, 0)) as bank_transfer_amount,
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
        'status', status,
        'price', total_price,
        'rental_price', total_price,
        'deposit', deposit
      ) ORDER BY id) as items
    ${selectFrom}
    ${groupedWhereClause}
    ${isUpcomingFilter ? 'ORDER BY MIN(pickup_date) ASC, MIN(id) ASC' : 'ORDER BY MIN(pickup_date) DESC, MIN(id) DESC'}
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

  const normalizeRentalRows = (rawRows) => {
    return (rawRows || []).map((r) => {
      let customArr = [];
      if (r.custom_items) {
        try {
          customArr = typeof r.custom_items === 'string' ? JSON.parse(r.custom_items) : r.custom_items;
        } catch {}
      }
      const baseItems = Array.isArray(r.items) ? r.items.filter((it) => it && (it.rental_inventory_id || it.product_name)) : [];
      const allItems = [...baseItems, ...(Array.isArray(customArr) ? customArr : [])];
      let splits = null;
      if (r.payment_splits) {
        try {
          splits = typeof r.payment_splits === 'string' ? JSON.parse(r.payment_splits) : r.payment_splits;
        } catch {}
      }
      return {
        ...r,
        inventory_name: r.inventory_name || allItems[0]?.name || allItems[0]?.product_name || 'قطعة تأجير',
        pickup_date: dateOnly(r.pickup_date),
        return_date: dateOnly(r.return_date),
        actual_return_date: r.actual_return_date ? dateOnly(r.actual_return_date) : null,
        items: allItems,
        item_count: allItems.length,
        custom_items: customArr,
        payment_splits: splits,
      };
    });
  };

  if (pagination.enabled) {
    queryStr = appendPagination(queryStr, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(queryStr, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(normalizeRentalRows(dataRes.rows), countRes.rows[0]?.total || 0, pagination);
  }

  const { rows } = await db.query(queryStr, queryParams);
  return normalizeRentalRows(rows);
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
    paid_amount,
    remaining,
    notes,
    id_card_guarantee,
    daily_fine,
    seller_id,
    payment_method,
    payment_splits,
    custom_items,
    offline_uuid,
    rental_group_uuid,
  } = body || {};

  const customItemsList = Array.isArray(custom_items)
    ? custom_items
    : (Array.isArray(body?.items) ? body.items.filter((it) => it && (it.is_custom || (!it.rental_inventory_id && !it.id))) : []);

  const requestedItems = Array.isArray(body?.items) && body.items.length
    ? body.items.flatMap((item) => {
      const itemId = Number(item?.rental_inventory_id ?? item?.id);
      if (!itemId || item.is_custom) return [];
      const quantity = clampInt(item?.quantity, 1, 1, 100);
      return Array.from({ length: quantity }, () => itemId);
    })
    : (rental_inventory_id ? [Number(rental_inventory_id)] : (Array.isArray(body?.rental_item_ids) ? body.rental_item_ids.map(Number) : []));

  let rentalItemIds = requestedItems.filter(Number.isInteger).filter((id) => id > 0);
  if (!rentalItemIds.length && customItemsList.length > 0) {
    rentalItemIds = [null];
  }

  // Calculate Payment Method & Splits Breakdown
  let cashAmount = 0;
  let cardAmount = 0;
  let walletAmount = 0;
  let bankTransferAmount = 0;
  let paymentSplitsJson = null;

  const totalPaid = Math.max(0, Number(paid_amount !== undefined ? paid_amount : (deposit || 0)));

  if (payment_method === 'split') {
    let splits = payment_splits;
    if (typeof splits === 'string') {
      try { splits = JSON.parse(splits); } catch { splits = []; }
    }
    if (Array.isArray(splits) && splits.length > 0) {
      const cleanSplits = [];
      for (const s of splits) {
        const amt = Math.max(0, Number(s.amount || 0));
        const normM = normalizePaymentMethod(s.method || s.id);
        cleanSplits.push({ method: normM, amount: amt });
        if (normM === 'cash') cashAmount += amt;
        else if (normM === 'card') cardAmount += amt;
        else if (normM === 'wallet') walletAmount += amt;
        else if (normM === 'bank_transfer') bankTransferAmount += amt;
      }
      paymentSplitsJson = JSON.stringify(cleanSplits);
    }
  } else {
    const normM = normalizePaymentMethod(payment_method);
    if (normM === 'cash') cashAmount = totalPaid;
    else if (normM === 'card') cardAmount = totalPaid;
    else if (normM === 'wallet') walletAmount = totalPaid;
    else if (normM === 'bank_transfer') bankTransferAmount = totalPaid;
  }

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
  if (!normalizedCustomerName || !customer_phone || (!rentalItemIds.length && !customItemsList.length) || !pickup_date || !return_date) {
    const err = new Error('Missing required rental data');
    err.statusCode = 400;
    throw err;
  }
  const cleanPickupDate = dateOnly(pickup_date);
  const cleanReturnDate = dateOnly(return_date);
  if (!isValidIsoDate(cleanPickupDate) || !isValidIsoDate(cleanReturnDate)) {
    const err = new Error('صيغة التاريخ غير صالحة. الصيغة المطلوبة YYYY-MM-DD');
    err.statusCode = 400;
    throw err;
  }
  if (cleanReturnDate < cleanPickupDate) {
    const err = new Error('تاريخ الإرجاع يجب أن يكون في نفس يوم الاستلام أو بعده');
    err.statusCode = 400;
    throw err;
  }
  if (daysBetween(cleanPickupDate, cleanReturnDate) > 365) {
    const err = new Error('لا يمكن أن تتجاوز مدة الحجز سنة واحدة (365 يوماً)');
    err.statusCode = 400;
    throw err;
  }

  let sellerName = null;
  if (seller_id) {
    const sellerRes = await db.query('SELECT name, branch_id FROM employees WHERE id = $1', [seller_id]);
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
    sellerName = sellerRes.rows[0].name;
  }

  const rental = await db.transaction(async (tx) => {
    const requestedCounts = new Map();
    for (const itemId of rentalItemIds) {
      requestedCounts.set(itemId, (requestedCounts.get(itemId) || 0) + 1);
    }

    // Pre-sort rental item IDs ascending to strictly prevent deadlocks (filter out custom null items)
    const sortedItemIds = Array.from(requestedCounts.keys()).filter((id) => id !== null && id !== undefined).sort((a, b) => a - b);

    if (sortedItemIds.length > 0) {
      const existingItems = await tx.query(
        'SELECT id FROM rental_inventory WHERE id = ANY($1::int[]) AND is_deleted = FALSE',
        [sortedItemIds]
      );
      if (existingItems.rows.length !== sortedItemIds.length) {
        const foundIds = new Set(existingItems.rows.map((r) => Number(r.id)));
        const missing = sortedItemIds.filter((id) => !foundIds.has(Number(id)));
        const err = new Error(`أحد منتجات التأجير غير موجود أو تم حذفه (معرف: ${missing.join(', ')})`);
        err.statusCode = 404;
        throw err;
      }
    }

    for (const itemId of sortedItemIds) {
      const requestedQuantity = requestedCounts.get(itemId);
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rental_booking_item:${itemId}:${b_id}`]);
      const availability = await getRentalAvailability(tx, itemId, b_id, cleanPickupDate, cleanReturnDate, { lockStockRow: true });
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
      const itemPaid = index === 0 ? Math.max(0, roundCurrency(totalPaid)) : 0;
      const itemRemaining = index === 0 ? Math.max(0, roundCurrency(Number(remaining !== undefined ? remaining : (itemTotal - itemPaid)))) : 0;
      const itemCash = index === 0 ? cashAmount : 0;
      const itemCard = index === 0 ? cardAmount : 0;
      const itemWallet = index === 0 ? walletAmount : 0;
      const itemBank = index === 0 ? bankTransferAmount : 0;
      const itemSplits = index === 0 ? paymentSplitsJson : null;
      const itemCustom = index === 0 && customItemsList.length > 0 ? JSON.stringify(customItemsList) : null;

      const { rows } = await tx.query(
        `INSERT INTO rentals (
           customer_id, rental_inventory_id, branch_id, pickup_date, return_date,
           total_price, national_id, deposit, remaining, paid_amount,
           id_card_guarantee, notes, status, daily_fine, seller_id,
           payment_method, payment_splits, cash_amount, card_amount,
           wallet_amount, bank_transfer_amount, custom_items,
           rental_group_uuid, offline_uuid
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6, $7, $8, $9, $10,
           $11, $12, 'booked', $13, $14,
           $15, $16, $17, $18,
           $19, $20, $21,
           $22, $23
         ) RETURNING *`,
        [
          customerId,
          itemId,
          b_id,
          cleanPickupDate,
          cleanReturnDate,
          itemTotal,
          national_id,
          itemDeposit,
          itemRemaining,
          itemPaid,
          Boolean(id_card_guarantee),
          notes,
          Number(daily_fine || 0),
          seller_id || null,
          payment_method || 'cash',
          itemSplits,
          itemCash,
          itemCard,
          itemWallet,
          itemBank,
          itemCustom,
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
          pickup_date: cleanPickupDate,
          return_date: cleanReturnDate,
          total_price: itemTotal,
          national_id,
          deposit: itemDeposit,
          paid_amount: itemPaid,
          remaining: itemRemaining,
          id_card_guarantee: Boolean(id_card_guarantee),
          notes,
          daily_fine: Number(daily_fine || 0),
          seller_id: seller_id || null,
          payment_method: payment_method || 'cash',
          payment_splits: itemSplits,
          cash_amount: itemCash,
          card_amount: itemCard,
          wallet_amount: itemWallet,
          bank_transfer_amount: itemBank,
          custom_items: itemCustom,
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

    return {
      ...createdRentals[0],
      seller_name: sellerName || null,
      rentals: createdRentals.map((r) => ({ ...r, seller_name: sellerName || null })),
    };
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

    await tx.query("UPDATE rentals SET status = 'active', actual_pickup_date = CURRENT_TIMESTAMP WHERE id = ANY($1::int[])", [rentals.map((r) => r.id)]);

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
  let finalPaymentMethod = 'cash';
  let newPaidAmount = 0;

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
    finalPaymentMethod = rentals[0].payment_method || 'cash';
    newPaidAmount = Number(rentals[0].paid_amount || 0) || depositAmount;
    let currentCash = Number(rentals[0].cash_amount || 0);
    let currentCard = Number(rentals[0].card_amount || 0);
    let currentWallet = Number(rentals[0].wallet_amount || 0);
    let currentBank = Number(rentals[0].bank_transfer_amount || 0);
    let finalSplitsJson = rentals[0].payment_splits ? (typeof rentals[0].payment_splits === 'object' ? JSON.stringify(rentals[0].payment_splits) : rentals[0].payment_splits) : null;

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

        newPaidAmount = roundCurrency(newPaidAmount + paid);

        if (currentCash === 0 && currentCard === 0 && currentWallet === 0 && currentBank === 0 && (newPaidAmount - paid) > 0) {
          const oldMethod = normalizePaymentMethod(rentals[0].payment_method || 'cash');
          if (oldMethod === 'card') currentCard = newPaidAmount - paid;
          else if (oldMethod === 'bank_transfer') currentBank = newPaidAmount - paid;
          else if (oldMethod === 'wallet') currentWallet = newPaidAmount - paid;
          else currentCash = newPaidAmount - paid;
        }

        if (Array.isArray(options.payment_splits) && options.payment_splits.length > 0) {
          for (const s of options.payment_splits) {
            const m = normalizePaymentMethod(s.method || s.payment_method || s.id || 'cash');
            const a = roundCurrency(Number(s.amount || 0));
            if (m === 'card') currentCard += a;
            else if (m === 'bank_transfer') currentBank += a;
            else if (m === 'wallet') currentWallet += a;
            else currentCash += a;
          }
        } else {
          const normMethod = normalizePaymentMethod(options.payment_method || 'cash');
          if (normMethod === 'card') currentCard += paid;
          else if (normMethod === 'bank_transfer') currentBank += paid;
          else if (normMethod === 'wallet') currentWallet += paid;
          else currentCash += paid;
        }

        const positiveBuckets = [];
        if (currentCash > 0) positiveBuckets.push({ method: 'cash', amount: roundCurrency(currentCash) });
        if (currentCard > 0) positiveBuckets.push({ method: 'card', amount: roundCurrency(currentCard) });
        if (currentBank > 0) positiveBuckets.push({ method: 'bank_transfer', amount: roundCurrency(currentBank) });
        if (currentWallet > 0) positiveBuckets.push({ method: 'wallet', amount: roundCurrency(currentWallet) });

        if (positiveBuckets.length > 1) {
          finalPaymentMethod = 'split';
          finalSplitsJson = JSON.stringify(positiveBuckets);
        } else if (positiveBuckets.length === 1) {
          finalPaymentMethod = positiveBuckets[0].method;
          finalSplitsJson = null;
        }
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
           paid_amount = CASE WHEN id = $2 THEN $6 ELSE paid_amount END,
           cash_amount = CASE WHEN id = $2 THEN $7 ELSE cash_amount END,
           card_amount = CASE WHEN id = $2 THEN $8 ELSE card_amount END,
           wallet_amount = CASE WHEN id = $2 THEN $9 ELSE wallet_amount END,
           bank_transfer_amount = CASE WHEN id = $2 THEN $10 ELSE bank_transfer_amount END,
           payment_method = CASE WHEN id = $2 THEN $11 ELSE payment_method END,
           payment_splits = CASE WHEN id = $2 THEN $12 ELSE payment_splits END,
           notes = CASE 
             WHEN id = $2 AND $5 <> '' THEN TRIM(COALESCE(notes, '') || ' ' || $5)
             ELSE notes
           END
       WHERE id = ANY($3::int[])`,
      [
        calculatedFine,
        rentals[0].id,
        rentals.map((r) => r.id),
        remainingAfterReturn,
        noteAppend,
        newPaidAmount,
        currentCash,
        currentCard,
        currentWallet,
        currentBank,
        finalPaymentMethod,
        finalSplitsJson,
      ]
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
      paid_amount: newPaidAmount,
      cash_amount: currentCash,
      card_amount: currentCard,
      wallet_amount: currentWallet,
      bank_transfer_amount: currentBank,
      payment_method: finalPaymentMethod,
      payment_splits: finalSplitsJson,
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

  return { success: true, fine_amount: calculatedFine, remaining: remainingAfterReturn, paid_amount: newPaidAmount, payment_method: finalPaymentMethod };
}

async function settleRentalPayment(id, body, user, req) {
  const { paid_amount, payment_method, payment_splits, notes } = body || {};
  const pay = roundCurrency(Number(paid_amount));
  if (!Number.isFinite(pay) || pay <= 0) {
    const err = new Error('المبلغ المدفوع يجب أن يكون أكبر من الصفر');
    err.statusCode = 400;
    throw err;
  }

  let updatedRemaining = 0;
  let finalPaymentMethod = 'cash';
  let newPaidAmount = 0;

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

    const r0 = rentals[0];
    const prevPaid = Number(r0.paid_amount || 0) || Number(r0.deposit || 0);
    newPaidAmount = roundCurrency(prevPaid + pay);

    let currentCash = Number(r0.cash_amount || 0);
    let currentCard = Number(r0.card_amount || 0);
    let currentWallet = Number(r0.wallet_amount || 0);
    let currentBank = Number(r0.bank_transfer_amount || 0);

    // If older record had no breakdown initialized, seed it from prevPaid
    if (currentCash === 0 && currentCard === 0 && currentWallet === 0 && currentBank === 0 && prevPaid > 0) {
      const oldMethod = normalizePaymentMethod(r0.payment_method || 'cash');
      if (oldMethod === 'card') currentCard = prevPaid;
      else if (oldMethod === 'bank_transfer') currentBank = prevPaid;
      else if (oldMethod === 'wallet') currentWallet = prevPaid;
      else currentCash = prevPaid;
    }

    if (Array.isArray(payment_splits) && payment_splits.length > 0) {
      for (const s of payment_splits) {
        const m = normalizePaymentMethod(s.method || s.payment_method || s.id || 'cash');
        const a = roundCurrency(Number(s.amount || 0));
        if (m === 'card') currentCard += a;
        else if (m === 'bank_transfer') currentBank += a;
        else if (m === 'wallet') currentWallet += a;
        else currentCash += a;
      }
    } else {
      const normMethod = normalizePaymentMethod(payment_method || 'cash');
      if (normMethod === 'card') currentCard += pay;
      else if (normMethod === 'bank_transfer') currentBank += pay;
      else if (normMethod === 'wallet') currentWallet += pay;
      else currentCash += pay;
    }

    const positiveBuckets = [];
    if (currentCash > 0) positiveBuckets.push({ method: 'cash', amount: roundCurrency(currentCash) });
    if (currentCard > 0) positiveBuckets.push({ method: 'card', amount: roundCurrency(currentCard) });
    if (currentBank > 0) positiveBuckets.push({ method: 'bank_transfer', amount: roundCurrency(currentBank) });
    if (currentWallet > 0) positiveBuckets.push({ method: 'wallet', amount: roundCurrency(currentWallet) });

    let finalSplitsJson = null;
    if (positiveBuckets.length > 1) {
      finalPaymentMethod = 'split';
      finalSplitsJson = JSON.stringify(positiveBuckets);
    } else if (positiveBuckets.length === 1) {
      finalPaymentMethod = positiveBuckets[0].method;
      finalSplitsJson = null;
    } else {
      finalPaymentMethod = normalizePaymentMethod(r0.payment_method || 'cash');
    }

    const methodStr = payment_method || 'نقدي';
    const noteMsg = `[سداد دفعة من المتبقي: ${pay} ج.م (${methodStr})${notes ? ` - ${notes}` : ''}]`;

    await tx.query(
      `UPDATE rentals
       SET remaining = CASE WHEN id = $1 THEN $2 ELSE 0 END,
           paid_amount = CASE WHEN id = $1 THEN $4 ELSE paid_amount END,
           cash_amount = CASE WHEN id = $1 THEN $5 ELSE cash_amount END,
           card_amount = CASE WHEN id = $1 THEN $6 ELSE card_amount END,
           wallet_amount = CASE WHEN id = $1 THEN $7 ELSE wallet_amount END,
           bank_transfer_amount = CASE WHEN id = $1 THEN $8 ELSE bank_transfer_amount END,
           payment_method = CASE WHEN id = $1 THEN $9 ELSE payment_method END,
           payment_splits = CASE WHEN id = $1 THEN $10 ELSE payment_splits END,
           notes = TRIM(COALESCE(notes, '') || ' ' || $3)
       WHERE id = ANY($11::int[])`,
      [
        rentals[0].id,
        updatedRemaining,
        noteMsg,
        newPaidAmount,
        currentCash,
        currentCard,
        currentWallet,
        currentBank,
        finalPaymentMethod,
        finalSplitsJson,
        rentals.map((r) => r.id),
      ]
    );

    await tx.query(
      `INSERT INTO rental_payments (rental_id, amount, payment_method, payment_date, branch_id, seller_id, notes)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, $4, $5, $6)`,
      [rentals[0].id, pay, finalPaymentMethod, branchId, user?.employee_id || rentals[0].seller_id, noteMsg]
    );

    await queueSyncOperation(tx, req, 'rental', 'update', rentals[0].id, branchId, {
      id: rentals[0].id,
      remaining: updatedRemaining,
      paid_amount: newPaidAmount,
      cash_amount: currentCash,
      card_amount: currentCard,
      wallet_amount: currentWallet,
      bank_transfer_amount: currentBank,
      payment_method: finalPaymentMethod,
      payment_splits: finalSplitsJson,
    });

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'سداد متبقي إيجار',
        `تم سداد ${pay} ج.م للحجز #${id} (${finalPaymentMethod})، المتبقي الحالي: ${updatedRemaining} ج.م`,
        'Rental',
        branchId
      );
    }
  });

  return { success: true, remaining: updatedRemaining, paid_amount: newPaidAmount, payment_method: finalPaymentMethod };
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
    finalPaymentMethod = normalizePaymentMethod(methodVal || rental.payment_method || 'cash');
    let r_cash = 0;
    let r_card = 0;
    let r_wallet = 0;
    let r_bank = 0;
    if (finalPaymentMethod === 'cash') r_cash = price;
    else if (finalPaymentMethod === 'card') r_card = price;
    else if (finalPaymentMethod === 'wallet') r_wallet = price;
    else if (finalPaymentMethod === 'bank_transfer') r_bank = price;

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

async function updateRentalStatus(id, newStatus, options = {}, user = null, req = null) {
  const allowedStatuses = ['booked', 'active', 'returned', 'cancelled'];
  if (!allowedStatuses.includes(newStatus)) {
    const err = new Error('الحالة المحددة غير صالحة');
    err.statusCode = 400;
    throw err;
  }

  await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    if (!rentals.length) {
      const err = new Error('الحجز غير موجود');
      err.statusCode = 404;
      throw err;
    }
    const branchId = rentals[0].branch_id;
    if (user && user.role === 'branch_user' && Number(branchId) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    const currentStatus = rentals[0].status;
    if (currentStatus === newStatus) {
      return;
    }

    // Physical stock adjustments based on store presence
    // 'active' means item is with customer (physically out of store)
    // 'booked', 'returned', 'cancelled' mean item is physically in store
    const wasInStore = currentStatus !== 'active';
    const willBeInStore = newStatus !== 'active';

    if (wasInStore && !willBeInStore) {
      // Transitioning to 'active': decrement physical stock
      for (const rental of rentals) {
        if (!rental.rental_inventory_id) continue;
        await tx.query(
          'UPDATE rental_inventory_branches SET stock_level = GREATEST(0, stock_level - 1) WHERE rental_inventory_id = $1 AND branch_id = $2',
          [rental.rental_inventory_id, rental.branch_id]
        );
      }
    } else if (!wasInStore && willBeInStore) {
      // Transitioning back to store: increment physical stock
      for (const rental of rentals) {
        if (!rental.rental_inventory_id) continue;
        await tx.query(
          'UPDATE rental_inventory_branches SET stock_level = stock_level + 1 WHERE rental_inventory_id = $1 AND branch_id = $2',
          [rental.rental_inventory_id, rental.branch_id]
        );
      }
    }

    const noteAppend = options.notes && typeof options.notes === 'string' && options.notes.trim()
      ? ` [تعديل الحالة إلى "${newStatus}": ${options.notes.trim()}]`
      : ` [تعديل الحالة إلى "${newStatus}"]`;

    let returnDateSql = '';
    if (newStatus === 'returned') {
      returnDateSql = `, actual_return_date = ${CAIRO_DATE_SQL}`;
    } else if (newStatus === 'booked' || newStatus === 'active') {
      returnDateSql = ', actual_return_date = NULL';
    }

    await tx.query(
      `UPDATE rentals
       SET status = $1,
           notes = TRIM(COALESCE(notes, '') || $2)
           ${returnDateSql}
       WHERE id = ANY($3::int[])`,
      [newStatus, noteAppend, rentals.map((r) => r.id)]
    );

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'تعديل حالة حجز',
        `تم تعديل حالة الحجز #${id} (${rentals.length} منتج) من "${currentStatus}" إلى "${newStatus}"`,
        'Rental',
        branchId
      );
    }

    for (const rental of rentals) {
      await queueSyncOperation(tx, req, 'rental_status', 'update', rental.id, rental.branch_id, {
        rental_id: rental.id,
        rental_offline_uuid: rental.offline_uuid,
        status: newStatus,
        notes: noteAppend,
      });
    }
  });

  return { success: true, newStatus };
}

async function handleScanAction(body = {}, user = null) {
  const rawCode = String(body.barcode || '').trim();
  if (!rawCode) {
    const err = new Error('الرجاء إدخال أو مسح الباركود');
    err.statusCode = 400;
    throw err;
  }

  const isCashierOrBranch = user && (user.role === 'branch_user' || user.role === 'cashier');
  let targetBranchId = isCashierOrBranch && user.branch_id
    ? user.branch_id
    : (body.branch_id && body.branch_id !== 'all' ? Number(body.branch_id) : (user?.branch_id || null));

  const cleanId = rawCode.replace(/^RNT-/i, '').replace(/^#/i, '').trim();
  const isNumericId = /^\d+$/.test(cleanId);

  // Search rentals matching code (order by active status first: booked -> active -> others)
  let branchFilter = '';
  const searchParams = [rawCode];
  if (targetBranchId) {
    searchParams.push(targetBranchId);
    branchFilter = `AND r.branch_id = $${searchParams.length}`;
  }

  let idFilter = '';
  if (isNumericId) {
    searchParams.push(parseInt(cleanId, 10));
    idFilter = `OR r.id = $${searchParams.length}`;
  }

  const matchingRentals = await db.query(`
    SELECT r.*,
           c.name as customer_name,
           c.phone as customer_phone,
           ri.name as inventory_name,
           ri.category as inventory_category,
           ri.barcode as inventory_barcode,
           ri.color as inventory_color,
           ri.size_cut as inventory_size,
           b.name as branch_name,
           e.name as seller_name
    FROM rentals r
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
    LEFT JOIN branches b ON r.branch_id = b.id
    LEFT JOIN employees e ON r.seller_id = e.id
    WHERE (
      ri.barcode = $1
      OR r.offline_uuid::text = $1
      ${idFilter}
      OR c.phone = $1
    )
    ${branchFilter}
    ORDER BY 
      CASE 
        WHEN r.status = 'booked' THEN 1
        WHEN r.status = 'active' THEN 2
        ELSE 3
      END ASC,
      r.id DESC
    LIMIT 5
  `, searchParams);

  if (matchingRentals.rows.length === 0) {
    // Check if the barcode belongs to a rental inventory item without active reservation
    const invCheck = await db.query(
      'SELECT id, name, category, barcode, size_cut, color FROM rental_inventory WHERE barcode = $1 AND is_deleted IS NOT TRUE LIMIT 1',
      [rawCode]
    );
    if (invCheck.rows.length > 0) {
      const it = invCheck.rows[0];
      return {
        success: false,
        action: 'inventory_item',
        message: `القطعة "${it.name}" (${it.size_cut || ''} - ${it.color || ''}) متوفرة بالمخزن ولا يوجد حجز نشط أو معلق لها حالياً`,
        item: it,
      };
    }

    return {
      success: false,
      action: 'not_found',
      message: `عفواً، لم يتم العثور على حجز أو بدلة بهذا الباركود (${rawCode})`,
    };
  }

  const target = matchingRentals.rows[0];
  const remaining = Number(target.remaining || 0);

  // Case 1: Status is BOOKED (Pickup flow)
  if (target.status === 'booked') {
    if (remaining <= 0) {
      // Direct pickup with 0 clicks!
      await pickupRental(target.id, user);
      return {
        success: true,
        action: 'picked_up',
        message: `تم تسليم البدلة "${target.inventory_name || target.id}" للعميل (${target.customer_name || ''}) بنجاح! 👗`,
        rental: {
          ...target,
          status: 'active',
        },
        requiresPayment: false,
      };
    } else {
      // Requires remaining collection before releasing suit
      return {
        success: true,
        action: 'requires_payment',
        type: 'pickup',
        message: `البدلة محجوزة للعميل (${target.customer_name}) ومتبقي عليها (${remaining} ج.م) يجب سدادها قبل الاستلام`,
        remaining: remaining,
        deposit: Number(target.deposit || 0),
        total_price: Number(target.total_price || 0),
        rental: target,
        requiresPayment: true,
      };
    }
  }

  // Case 2: Status is ACTIVE (Return flow)
  if (target.status === 'active') {
    const cairoNow = await getDatabaseCairoNow(db);
    const delayDays = daysBetween(target.return_date, cairoNow.date);
    const perDay = Number(target.daily_fine || DEFAULT_RENTAL_FINE_PER_DAY);
    const calculatedFine = delayDays > 0 ? Math.max(0, roundCurrency(delayDays * perDay)) : 0;

    if (remaining <= 0 && calculatedFine <= 0) {
      // Direct return with 0 clicks!
      await returnRental(
        target.id,
        { settlement_action: 'collect', paid_amount: 0, fine: 0, notes: 'إرجاع فوري بالباركود' },
        user
      );
      return {
        success: true,
        action: 'returned',
        message: `تم إرجاع البدلة "${target.inventory_name || target.id}" وإعادتها لمخزن الفرع بنجاح! ✨`,
        rental: {
          ...target,
          status: 'returned',
        },
        requiresPayment: false,
      };
    } else {
      // Requires settling remaining or fine
      return {
        success: true,
        action: 'requires_payment',
        type: 'return',
        message: `إرجاع بدلة مع تسوية حساب (متبقي: ${remaining} ج.م${calculatedFine > 0 ? ` + غرامة تأخير: ${calculatedFine} ج.م` : ''})`,
        remaining: remaining,
        fine: calculatedFine,
        suggested_fine: calculatedFine,
        delay_days: delayDays > 0 ? delayDays : 0,
        rental: target,
        requiresPayment: true,
      };
    }
  }

  // Case 3: Already completed or cancelled
  return {
    success: true,
    action: 'info',
    message: `العقد #${target.id} منتهي مسبقاً (الحالة: ${target.status === 'returned' ? 'مسترجع بالكامل' : (target.status === 'sold' ? 'محول لبيع' : 'ملغي')})`,
    rental: target,
    requiresPayment: false,
  };
}

async function setRentalPrepared(id, body = {}, user = null) {
  const isPrepared = body.is_prepared !== false;
  const notes = body.notes || body.prep_notes || null;
  let preparedBy = body.prepared_by ? Number(body.prepared_by) : null;

  if (!preparedBy && user?.employee_id) {
    preparedBy = user.employee_id;
  }
  if (!preparedBy && user?.id) {
    const empMatch = await db.query('SELECT id FROM employees WHERE branch_id = $1 ORDER BY id LIMIT 1', [user.branch_id || 1]);
    if (empMatch.rows.length > 0) preparedBy = empMatch.rows[0].id;
  }

  const result = await db.query(`
    UPDATE rentals
    SET is_prepared = $1,
        prepared_at = CASE WHEN $1 = true THEN ${CAIRO_NOW_SQL} ELSE NULL END,
        prepared_by = CASE WHEN $1 = true THEN COALESCE($2, prepared_by) ELSE NULL END,
        prep_notes = COALESCE($3, prep_notes)
    WHERE id = $4 OR rental_group_uuid = (SELECT rental_group_uuid FROM rentals WHERE id = $4 AND rental_group_uuid IS NOT NULL)
    RETURNING id, is_prepared, prepared_at, prepared_by, branch_id
  `, [isPrepared, preparedBy, notes, id]);

  if (result.rows.length === 0) {
    const err = new Error('الحجز غير موجود');
    err.statusCode = 404;
    throw err;
  }

  if (user) {
    await logActivity(
      user.id,
      user.username,
      'تجهيز إيجار',
      isPrepared ? `تم تجهيز البدلة للحجز #${id} وجاهزة بالجراب` : `تم إلغاء تجهيز الحجز #${id}`,
      'Rental',
      result.rows[0].branch_id
    );
  }

  const fullRow = await db.query(`
    SELECT r.id, r.is_prepared, r.prepared_at, r.prepared_by, ep.name as prep_employee_name, r.prep_notes
    FROM rentals r
    LEFT JOIN employees ep ON r.prepared_by = ep.id
    WHERE r.id = $1
  `, [id]);

  return {
    success: true,
    message: isPrepared ? 'تم تسجيل البدلة كـ "جاهزة بالجراب للاستلام" بنجاح! 👔✅' : 'تم إلغاء حالة التجهيز',
    rental: fullRow.rows[0]
  };
}

async function getRentalPreparationList(query = {}, user = null) {
  const isCashierOrBranch = user && (user.role === 'branch_user' || user.role === 'cashier');
  let branchId = isCashierOrBranch && user.branch_id
    ? user.branch_id
    : (query.branch_id && query.branch_id !== 'all' ? Number(query.branch_id) : (user?.branch_id || null));

  let branchFilter = '';
  const params = [];
  if (branchId) {
    params.push(branchId);
    branchFilter = `AND r.branch_id = $${params.length}`;
  }

  let dateFilter = `AND r.pickup_date >= ${CAIRO_DATE_SQL} AND r.pickup_date <= (${CAIRO_DATE_SQL} + INTERVAL '1 day')`;
  if (query.all_upcoming === 'true') {
    dateFilter = `AND r.pickup_date >= ${CAIRO_DATE_SQL}`;
  } else if (query.date) {
    params.push(query.date);
    dateFilter = `AND r.pickup_date = $${params.length}::date`;
  }

  const { rows } = await db.query(`
    SELECT r.id,
           r.customer_id,
           c.name as customer_name,
           c.phone as customer_phone,
           ri.id as rental_inventory_id,
           ri.name as inventory_name,
           ri.category as inventory_category,
           ri.barcode as inventory_barcode,
           ri.color as inventory_color,
           ri.size_cut as inventory_size,
           r.pickup_date,
           r.return_date,
           r.status,
           r.total_price,
           r.deposit,
           r.remaining,
           r.is_prepared,
           r.prepared_at,
           r.prep_notes,
           ep.name as prep_employee_name,
           e.name as seller_name,
           b.name as branch_name,
           r.custom_items
    FROM rentals r
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
    LEFT JOIN branches b ON r.branch_id = b.id
    LEFT JOIN employees e ON r.seller_id = e.id
    LEFT JOIN employees ep ON r.prepared_by = ep.id
    WHERE r.status = 'booked'
      ${dateFilter}
      ${branchFilter}
    ORDER BY r.is_prepared ASC, r.pickup_date ASC, r.id ASC
  `, params);

  const total = rows.length;
  const preparedCount = rows.filter(r => r.is_prepared).length;
  const unpreparedCount = total - preparedCount;

  return {
    success: true,
    summary: {
      total,
      preparedCount,
      unpreparedCount,
    },
    items: rows
  };
}

async function getRentalHistoryLedger(query = {}, user = null) {
  const isCashierOrBranch = user && (user.role === 'branch_user' || user.role === 'cashier');
  let branchId = isCashierOrBranch && user.branch_id
    ? user.branch_id
    : (query.branch_id && query.branch_id !== 'all' ? Number(query.branch_id) : (user?.branch_id || null));

  const cairoNow = await getDatabaseCairoNow(db);
  const startDate = query.start_date || query.from_date || cairoNow.date;
  const endDate = query.end_date || query.to_date || cairoNow.date;

  const params = [startDate, endDate];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = `AND r.branch_id = $${params.length}`;
  }

  let statusFilter = "AND r.status IN ('active', 'returned', 'sold')";
  if (query.status === 'all') {
    statusFilter = '';
  } else if (query.status) {
    params.push(query.status);
    statusFilter = `AND r.status = $${params.length}`;
  }

  const { rows } = await db.query(`
    SELECT r.id,
           r.customer_id,
           c.name as customer_name,
           c.phone as customer_phone,
           ri.name as inventory_name,
           ri.barcode as inventory_barcode,
           ri.color as inventory_color,
           ri.size_cut as inventory_size,
           r.pickup_date,
           r.return_date,
           r.actual_return_date,
           r.status,
           r.total_price,
           r.deposit,
           r.paid_amount,
           r.remaining,
           r.fine_amount,
           r.payment_method,
           r.cash_amount,
           r.card_amount,
           r.wallet_amount,
           r.bank_transfer_amount,
           r.payment_splits,
           e.name as seller_name,
           b.name as branch_name,
           r.notes
    FROM rentals r
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN rental_inventory ri ON r.rental_inventory_id = ri.id
    LEFT JOIN branches b ON r.branch_id = b.id
    LEFT JOIN employees e ON r.seller_id = e.id
    WHERE (
      (r.pickup_date >= $1::date AND r.pickup_date <= $2::date)
      OR (r.actual_return_date >= $1::date AND r.actual_return_date <= $2::date)
      OR (r.booking_date >= $1::date AND r.booking_date <= $2::date)
    )
    ${statusFilter}
    ${branchFilter}
    ORDER BY r.id DESC
  `, params);

  const summary = {
    total_count: rows.length,
    total_contract_value: rows.reduce((s, r) => s + Number(r.total_price || 0), 0),
    total_paid: rows.reduce((s, r) => s + Number(r.paid_amount || r.deposit || 0), 0),
    total_remaining: rows.reduce((s, r) => s + Number(r.remaining || 0), 0),
    total_fines: rows.reduce((s, r) => s + Number(r.fine_amount || 0), 0),
    total_cash: rows.reduce((s, r) => {
      if (Number(r.cash_amount) > 0) return s + Number(r.cash_amount);
      if (r.payment_method === 'cash') return s + Number(r.paid_amount || r.deposit || 0);
      return s;
    }, 0),
    total_electronic: rows.reduce((s, r) => {
      const elec = Number(r.card_amount || 0) + Number(r.bank_transfer_amount || 0) + Number(r.wallet_amount || 0);
      if (elec > 0) return s + elec;
      if (['card', 'visa', 'bank_transfer', 'instapay', 'wallet'].includes(r.payment_method)) {
        return s + Number(r.paid_amount || r.deposit || 0);
      }
      return s;
    }, 0),
  };

  return {
    success: true,
    startDate,
    endDate,
    summary,
    items: rows
  };
}

async function getRentalMetadata(branchId = null) {
  const bId = branchId && branchId !== 'all' ? parseInt(branchId, 10) : null;
  const params = [];
  let query = '';

  if (bId) {
    params.push(bId);
    query = `
      SELECT COALESCE(NULLIF(TRIM(ri.category), ''), 'أخرى') as cat, count(DISTINCT ri.id)::int as count
      FROM rental_inventory ri
      JOIN rental_inventory_branches rib ON rib.rental_inventory_id = ri.id AND rib.branch_id = $1 AND rib.stock_level > 0
      WHERE ri.is_deleted = FALSE
      GROUP BY COALESCE(NULLIF(TRIM(ri.category), ''), 'أخرى')
      HAVING count(DISTINCT ri.id) > 0
      ORDER BY count DESC
    `;
  } else {
    query = `
      SELECT COALESCE(NULLIF(TRIM(ri.category), ''), 'أخرى') as cat, count(*)::int as count
      FROM rental_inventory ri
      WHERE ri.is_deleted = FALSE
      GROUP BY COALESCE(NULLIF(TRIM(ri.category), ''), 'أخرى')
      HAVING count(*) > 0
      ORDER BY count DESC
    `;
  }

  const { rows } = await db.query(query, params);
  const categoryCounts = {};
  let totalAll = 0;
  let totalSuits = 0;

  rows.forEach((r) => {
    const c = Number(r.count);
    if (c > 0) {
      categoryCounts[r.cat] = c;
      totalAll += c;
      if (r.cat.toLowerCase().includes('suit') || r.cat.includes('بدل')) {
        totalSuits += c;
      }
    }
  });

  categoryCounts['الكل'] = totalAll;
  categoryCounts['كل التصنيفات'] = totalAll;
  categoryCounts['كل الأصناف'] = totalAll;
  categoryCounts['all'] = totalAll;

  if (totalSuits > 0) {
    categoryCounts['بدل'] = totalSuits;
    categoryCounts['بدل (جميع الأنواع)'] = totalSuits;
    categoryCounts['بدل (جميع الانواع)'] = totalSuits;
  }
  if (categoryCounts['أخرى'] && categoryCounts['أخرى'] > 0) {
    categoryCounts['بدون تصنيف / أخرى'] = categoryCounts['أخرى'];
    categoryCounts['بدون تصنيف'] = categoryCounts['أخرى'];
  }
  if (categoryCounts['FORMAL SUIT'] && categoryCounts['FORMAL SUIT'] > 0) {
    categoryCounts['بدل رسمية'] = categoryCounts['FORMAL SUIT'];
    categoryCounts['بدل رسمية (FORMAL SUIT)'] = categoryCounts['FORMAL SUIT'];
  }
  if (categoryCounts['TUXEDO SUIT'] && categoryCounts['TUXEDO SUIT'] > 0) {
    categoryCounts['بدل سموكن'] = categoryCounts['TUXEDO SUIT'];
    categoryCounts['بدل سموكن (TUXEDO SUIT)'] = categoryCounts['TUXEDO SUIT'];
  }
  if (categoryCounts['SUIT'] && categoryCounts['SUIT'] > 0) {
    categoryCounts['بدل عادية'] = categoryCounts['SUIT'];
    categoryCounts['بدل عادية (SUIT)'] = categoryCounts['SUIT'];
  }
  if (categoryCounts['CASUAL SUIT'] && categoryCounts['CASUAL SUIT'] > 0) {
    categoryCounts['بدل كاجوال'] = categoryCounts['CASUAL SUIT'];
    categoryCounts['بدل كاجوال (CASUAL SUIT)'] = categoryCounts['CASUAL SUIT'];
  }
  if (categoryCounts['KIDS'] && categoryCounts['KIDS'] > 0) {
    categoryCounts['أطفال'] = categoryCounts['KIDS'];
    categoryCounts['أطفال (KIDS)'] = categoryCounts['KIDS'];
  }
  if (categoryCounts['WALLET'] && categoryCounts['WALLET'] > 0) {
    categoryCounts['محافظ'] = categoryCounts['WALLET'];
    categoryCounts['محافظ (WALLET)'] = categoryCounts['WALLET'];
  }

  const activeCats = rows.map((r) => r.cat).filter(Boolean);
  const uniqueCats = Array.from(new Set([
    ...(totalSuits > 0 ? ['بدل'] : []),
    ...activeCats,
  ]));

  return {
    categories: uniqueCats,
    categoryCounts,
    total: totalAll,
  };
}


async function addRentalItems(id, body, user) {
  const { items, custom_items, extra_price, extra_deposit, notes } = body || {};

  return await db.transaction(async (tx) => {
    const rentals = await getRentalGroupRows(tx, id, { forUpdate: true });
    if (!rentals || rentals.length === 0) {
      const err = new Error('عقد التأجير غير موجود');
      err.statusCode = 404;
      throw err;
    }

    const mainRental = rentals[0];
    const b_id = mainRental.branch_id;
    if (user && user.role === 'branch_user' && Number(b_id) !== Number(user.branch_id)) {
      const err = new Error('Unauthorized');
      err.statusCode = 403;
      throw err;
    }

    if (mainRental.status === 'cancelled' || mainRental.status === 'returned') {
      const err = new Error('لا يمكن إضافة قطع لعقد ملغي أو مسترجع');
      err.statusCode = 400;
      throw err;
    }

    let existingCustom = [];
    if (typeof mainRental.custom_items === 'string' && mainRental.custom_items.trim()) {
      try { existingCustom = JSON.parse(mainRental.custom_items); } catch {}
    } else if (Array.isArray(mainRental.custom_items)) {
      existingCustom = [...mainRental.custom_items];
    }

    let addedPrice = 0;
    const incomingCustom = Array.isArray(custom_items) ? custom_items : [];
    for (const c of incomingCustom) {
      if (!c.name) continue;
      const cPrice = Math.max(0, Number(c.price || 0));
      addedPrice += cPrice;
      existingCustom.push({
        id: c.id || `custom_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: c.name,
        category: c.category || 'إكسسوار',
        price: cPrice,
        is_custom: true,
        added_at: new Date().toISOString(),
      });
    }

    const incomingInvItems = Array.isArray(items) ? items : [];
    for (const inv of incomingInvItems) {
      const invId = Number(inv.id || inv.rental_inventory_id);
      if (!invId) continue;
      const invPrice = Math.max(0, Number(inv.price || inv.rental_price || 0));
      addedPrice += invPrice;

      const avail = await getRentalAvailability(tx, invId, b_id, mainRental.pickup_date, mainRental.return_date, { lockStockRow: true });
      if (avail.available < 1) {
        const err = new Error(`القطعة #${invId} غير متاحة في فترة الحجز المحددة`);
        err.statusCode = 400;
        throw err;
      }

      const itemOfflineUuid = newUuid();
      await tx.query(
        `INSERT INTO rentals (
           customer_id, rental_inventory_id, branch_id, pickup_date, return_date,
           total_price, national_id, deposit, remaining, paid_amount,
           id_card_guarantee, notes, status, daily_fine, seller_id,
           payment_method, rental_group_uuid, offline_uuid
         ) VALUES (
           $1, $2, $3, $4, $5,
           0, $6, 0, 0, 0,
           $7, $8, $9, $10, $11,
           $12, $13, $14
         )`,
        [
          mainRental.customer_id,
          invId,
          b_id,
          mainRental.pickup_date,
          mainRental.return_date,
          mainRental.national_id,
          mainRental.id_card_guarantee,
          notes ? `[إضافة ملحقة]: ${notes}` : null,
          mainRental.status,
          mainRental.daily_fine,
          mainRental.seller_id,
          mainRental.payment_method,
          mainRental.rental_group_uuid,
          itemOfflineUuid,
        ]
      );
    }

    if (extra_price !== undefined && extra_price !== null && Number(extra_price) > 0) {
      addedPrice = Math.max(addedPrice, Number(extra_price));
    }

    const currentTotal = Number(mainRental.total_price || 0);
    const currentRemaining = Number(mainRental.remaining || 0);
    const currentDeposit = Number(mainRental.deposit || 0);

    const newTotal = roundCurrency(currentTotal + addedPrice);
    const newRemaining = roundCurrency(currentRemaining + addedPrice);
    const newDeposit = extra_deposit ? roundCurrency(currentDeposit + Number(extra_deposit)) : currentDeposit;

    const updatedNotes = notes
      ? `${mainRental.notes ? mainRental.notes + ' | ' : ''}[إضافة قطع إضافية: +${addedPrice} ج.م - ${notes}]`
      : mainRental.notes;

    await tx.query(
      `UPDATE rentals
       SET total_price = $1,
           remaining = $2,
           deposit = $3,
           custom_items = $4,
           notes = $5
       WHERE id = $6`,
      [newTotal, newRemaining, newDeposit, JSON.stringify(existingCustom), updatedNotes, mainRental.id]
    );

    if (user) {
      await logActivity(
        user.id,
        user.username,
        'إضافة قطع لحجز تأجير',
        `تم إضافة قطع/ملحقات بقيمة ${addedPrice} ج.م للحجز #${id}`,
        'Rental',
        b_id
      );
    }

    return {
      success: true,
      rental_id: id,
      new_total: newTotal,
      new_remaining: newRemaining,
      added_price: addedPrice,
      custom_items: existingCustom,
      message: `تم إضافة القطع والملحقات بنجاح! تم تحديث الإجمالي إلى (${newTotal} ج.م) والمتبقي إلى (${newRemaining} ج.م) ✨`,
    };
  });
}

module.exports = {
  addRentalItems,
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
  updateRentalStatus,
  handleScanAction,
  setRentalPrepared,
  getRentalPreparationList,
  getRentalHistoryLedger,
  getRentalMetadata,
};
