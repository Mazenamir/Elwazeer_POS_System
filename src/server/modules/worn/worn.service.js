const db = require('../../database/connection');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const { isBranchScopedUser } = require('../../../shared/constants/permissions');
const { likePattern, newUuid } = require('../../../shared/utils/string');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { roundCurrency } = require('../../../shared/utils/numbers');
const { adjustInventoryStock } = require('../inventory/inventory.helpers');
const { resolveEffectiveBranchId } = require('../../middleware/branchScope.middleware');
const { queueSyncOperation } = require('../../database/sync.helpers');

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
           COALESCE(NULLIF(TRIM(wp.color_name), ''), i.color, ri.color) as product_color,
           COALESCE(NULLIF(TRIM(wp.size_name), ''), i.size_cut, ri.size_cut) as product_size
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
    inventory_id,
    rental_inventory_id,
    branch_id,
    quantity,
    condition,
    reason,
    estimated_loss,
    notes,
    occurred_at,
    deduct_stock,
    color_name,
    size_name,
    sizes,
    sizes_data,
  } = body || {};

  const resolvedInputId = product_id ?? (product_type === 'rental' ? rental_inventory_id : inventory_id);

  // Normalize optional multi-variant selection list
  let rawVariants = Array.isArray(sizes) ? sizes : (Array.isArray(sizes_data) ? sizes_data : []);
  if (!rawVariants.length && typeof sizes_data === 'string' && sizes_data.trim()) {
    try {
      const parsed = JSON.parse(sizes_data);
      if (Array.isArray(parsed)) rawVariants = parsed;
    } catch {}
  }

  const normalizedVariants = rawVariants
    .map((v) => ({
      inventory_id: Number(v.inventory_id || resolvedInputId),
      size_name: v.size_name ? String(v.size_name).trim() : '',
      color_name: v.color_name ? String(v.color_name).trim() : '',
      quantity: Math.floor(Number(v.quantity || 0)),
    }))
    .filter((v) => v.quantity > 0 && v.inventory_id > 0);

  const qty = normalizedVariants.length > 0
    ? normalizedVariants.reduce((sum, v) => sum + v.quantity, 0)
    : Number(quantity);

  const primaryId = Number(normalizedVariants[0]?.inventory_id || resolvedInputId);

  if (!product_type || !primaryId || !qty || qty <= 0) {
    const err = new Error('الرجاء اختيار المنتج وتحديد كمية صحيحة');
    err.statusCode = 400;
    throw err;
  }

  const finalBranchId = resolveEffectiveBranchId(user, branch_id);
  const finalInventoryId = product_type === 'sales' ? primaryId : null;
  const finalRentalInventoryId = product_type === 'rental' ? primaryId : null;
  const shouldDeductStock = deduct_stock !== false;
  const roundedLoss = Math.max(0, roundCurrency(Number(estimated_loss || 0)));
  const offlineUuid = newUuid(body?.offline_uuid);

  const finalColorName = normalizedVariants.length > 0
    ? Array.from(new Set(normalizedVariants.map((v) => v.color_name).filter(Boolean))).join('، ') || (color_name ? String(color_name).trim() : null)
    : (color_name ? String(color_name).trim() : null);

  const finalSizeName = normalizedVariants.length > 0
    ? normalizedVariants.map((v) => `${v.size_name || 'موحد'}${v.quantity > 1 ? ` (${v.quantity})` : ''}`).join('، ')
    : (size_name ? String(size_name).trim() : null);

  const finalSizesJson = normalizedVariants.length > 0 ? JSON.stringify(normalizedVariants) : null;

  return await db.transaction(async (tx) => {
    if (shouldDeductStock) {
      if (product_type === 'sales') {
        const itemsToDeduct = normalizedVariants.length > 0
          ? normalizedVariants
          : [{
              inventory_id: primaryId,
              size_name: size_name ? String(size_name).trim() : '',
              color_name: color_name ? String(color_name).trim() : '',
              quantity: qty,
            }];

        // Aggregate required quantities per inventory_id in sorted order to lock without deadlocks
        const requiredByInvId = new Map();
        for (const item of itemsToDeduct) {
          requiredByInvId.set(item.inventory_id, (requiredByInvId.get(item.inventory_id) || 0) + item.quantity);
        }
        const sortedInvIds = Array.from(requiredByInvId.keys()).sort((a, b) => a - b);

        for (const invId of sortedInvIds) {
          const reqQty = requiredByInvId.get(invId);
          const invRes = await tx.query(
            'SELECT id, name, stock_level FROM inventory WHERE id = $1 FOR UPDATE',
            [invId]
          );
          if (invRes.rows.length === 0) {
            const err = new Error('المنتج غير موجود');
            err.statusCode = 404;
            throw err;
          }
          if (Number(invRes.rows[0].stock_level) < reqQty) {
            const err = new Error('الكمية المطلوبة أكبر من المخزون الإجمالي المتاح');
            err.statusCode = 400;
            throw err;
          }

          const branchStockRes = await tx.query(
            'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
            [invId, finalBranchId]
          );
          const available = branchStockRes.rows.length ? Number(branchStockRes.rows[0].stock_level || 0) : 0;
          if (available < reqQty) {
            const err = new Error('الكمية المطلوبة أكبر من المتاح في هذا الفرع');
            err.statusCode = 400;
            throw err;
          }
        }

        // Validate specific size+color rows if size rows exist in this branch
        for (const item of itemsToDeduct) {
          if (item.size_name) {
            const hasSizesInBranch = await tx.query(
              'SELECT 1 FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2 LIMIT 1',
              [item.inventory_id, finalBranchId]
            );
            if (hasSizesInBranch.rows.length > 0) {
              const szParams = [item.inventory_id, finalBranchId, item.size_name];
              let szSql = `
                SELECT COALESCE(SUM(stock_level), 0) AS avail
                FROM inventory_sizes
                WHERE inventory_id = $1 AND branch_id = $2
                  AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
              `;
              if (item.color_name) {
                szParams.push(item.color_name);
                szSql += ` AND (color_name IS NULL OR TRIM(color_name) = '' OR LOWER(TRIM(color_name)) = LOWER(TRIM($4)))`;
              }
              const szRes = await tx.query(szSql, szParams);
              const availSz = Number(szRes.rows[0]?.avail || 0);
              if (availSz < item.quantity) {
                const err = new Error(`الكمية التالفة المطلوبة للمقاس "${item.size_name}"${item.color_name ? ` (${item.color_name})` : ''} تتجاوز المتاح بالفرع (${availSz} قطعة)`);
                err.statusCode = 400;
                throw err;
              }
            }
          }
        }

        // Apply atomic deductions per variant
        for (const item of itemsToDeduct) {
          await adjustInventoryStock(tx, {
            inventoryId: item.inventory_id,
            branchId: finalBranchId,
            quantityDelta: -item.quantity,
            size: item.size_name || null,
            color: item.color_name || null,
          });
        }
      } else {
        const riRes = await tx.query('SELECT id, name FROM rental_inventory WHERE id = $1', [primaryId]);
        if (riRes.rows.length === 0) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }

        const stockRes = await tx.query(
          'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [primaryId, finalBranchId]
        );
        const available = stockRes.rows.length ? Number(stockRes.rows[0].stock_level || 0) : 0;
        if (available < qty) {
          const err = new Error('الكمية المطلوبة أكبر من المتاح في هذا الفرع');
          err.statusCode = 400;
          throw err;
        }
        await tx.query(
          'UPDATE rental_inventory_branches SET stock_level = stock_level - $1 WHERE rental_inventory_id = $2 AND branch_id = $3',
          [qty, primaryId, finalBranchId]
        );
      }
    } else {
      if (product_type === 'sales') {
        const invCheck = await tx.query('SELECT id FROM inventory WHERE id = $1', [primaryId]);
        if (!invCheck.rows.length) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }
      } else {
        const rCheck = await tx.query('SELECT id FROM rental_inventory WHERE id = $1', [primaryId]);
        if (!rCheck.rows.length) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }
      }
    }

    const result = await tx.query(
      `INSERT INTO worn_products
        (product_type, inventory_id, rental_inventory_id, branch_id, quantity, condition, reason, estimated_loss, notes, reported_by, occurred_at, offline_uuid, color_name, size_name, sizes_data, deduct_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, ${CAIRO_DATE_SQL}), $12, $13, $14, $15, $16)
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
        offlineUuid,
        finalColorName,
        finalSizeName,
        finalSizesJson,
        shouldDeductStock,
      ]
    );

    const created = result.rows[0];
    await queueSyncOperation(tx, null, 'worn_product', 'create', created.id, finalBranchId, {
      ...created,
      offline_uuid: created.offline_uuid || offlineUuid,
      deduct_stock: shouldDeductStock,
    });
    return created;
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

  const updated = rows[0];
  await queueSyncOperation(db, null, 'worn_product', 'update', updated.id, updated.branch_id, {
    id: updated.id,
    offline_uuid: updated.offline_uuid,
    status: updated.status,
    notes: updated.notes,
    branch_id: updated.branch_id,
  });
  return updated;
}

async function deleteWornProduct(id, user) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    const err = new Error('معرّف السجل غير صالح');
    err.statusCode = 400;
    throw err;
  }

  return await db.transaction(async (tx) => {
    const params = [numericId];
    let branchFilter = '';
    if (isBranchScopedUser(user)) {
      params.push(user.branch_id);
      branchFilter = ' AND branch_id = $2';
    }

    const res = await tx.query(
      `SELECT * FROM worn_products WHERE id = $1${branchFilter} FOR UPDATE`,
      params
    );
    if (!res.rows.length) {
      const err = new Error('سجل التالف غير موجود أو غير مصرح بحذفه');
      err.statusCode = 404;
      throw err;
    }

    const row = res.rows[0];
    const shouldRestore = row.deduct_stock !== false && row.deduct_stock !== 0;

    if (shouldRestore) {
      if (row.product_type === 'rental' && row.rental_inventory_id) {
        await tx.query(
          `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
           VALUES ($1, $2, $3)
           ON CONFLICT (rental_inventory_id, branch_id) DO UPDATE SET stock_level = rental_inventory_branches.stock_level + EXCLUDED.stock_level`,
          [row.rental_inventory_id, row.branch_id, Number(row.quantity || 0)]
        );
      } else if (row.inventory_id) {
        let parsedVariants = null;
        if (row.sizes_data) {
          try { parsedVariants = JSON.parse(row.sizes_data); } catch {}
        }
        if (Array.isArray(parsedVariants) && parsedVariants.length > 0) {
          for (const v of parsedVariants) {
            const vQty = Number(v.quantity || 0);
            if (vQty <= 0) continue;
            await adjustInventoryStock(tx, {
              inventoryId: Number(v.inventory_id || row.inventory_id),
              branchId: row.branch_id,
              quantityDelta: vQty,
              size: v.size_name || null,
              color: v.color_name || null,
            });
          }
        } else {
          await adjustInventoryStock(tx, {
            inventoryId: row.inventory_id,
            branchId: row.branch_id,
            quantityDelta: Number(row.quantity || 0),
            size: row.size_name || null,
            color: row.color_name || null,
          });
        }
      }
    }

    await tx.query('DELETE FROM worn_products WHERE id = $1', [numericId]);

    await queueSyncOperation(tx, null, 'worn_product', 'delete', row.id, row.branch_id, {
      id: row.id,
      offline_uuid: row.offline_uuid,
      branch_id: row.branch_id,
    });

    return { success: true, restored_stock: shouldRestore };
  });
}

module.exports = {
  getSummary,
  listWornProducts,
  createWornProduct,
  updateWornProduct,
  deleteWornProduct,
};
