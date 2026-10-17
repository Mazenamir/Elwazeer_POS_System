const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../database/connection');
const config = require('../../config/env');
const { getInitialsFromName, newUuid } = require('../../../shared/utils/string');
const { parsePositiveInt } = require('../../../shared/utils/numbers');
const { logActivity } = require('../../database/sync.helpers');
const offlineStore = require('./offline.store');

// Safe SSL configuration: process.env.NODE_TLS_REJECT_UNAUTHORIZED is not disabled globally

function timeoutError(timeoutMs) {
  const err = new Error(`Sync request timed out after ${timeoutMs}ms`);
  err.name = 'TimeoutError';
  return err;
}

function fetchWithTimeout(url, options = {}, timeoutMs = config.SYNC_FETCH_TIMEOUT_MS) {
  if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const originalSignal = options.signal;
  let abortListener = null;
  const timeoutId = setTimeout(() => controller.abort(timeoutError(timeoutMs)), timeoutMs);

  if (originalSignal?.aborted) {
    controller.abort(originalSignal.reason);
  } else if (originalSignal) {
    abortListener = () => controller.abort(originalSignal.reason);
    originalSignal.addEventListener('abort', abortListener, { once: true });
  }

  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    clearTimeout(timeoutId);
    if (originalSignal && abortListener) {
      originalSignal.removeEventListener('abort', abortListener);
    }
  });
}

async function getOrCreateSalesInventoryForRental(tx, rentalInventoryId, sellPrice) {
  const rentalItemRes = await tx.query(
    'SELECT name, category, size_cut, color, image_url FROM rental_inventory WHERE id = $1 AND is_deleted = FALSE',
    [rentalInventoryId]
  );
  if (!rentalItemRes.rows.length) throw new Error('Rental inventory item not found');
  const rentalItem = rentalItemRes.rows[0];

  const existingRes = await tx.query(
    `SELECT id
     FROM inventory
     WHERE name = $1
       AND category IS NOT DISTINCT FROM $2
       AND size_cut IS NOT DISTINCT FROM $3
       AND color IS NOT DISTINCT FROM $4
       AND is_deleted = FALSE
     LIMIT 1`,
    [rentalItem.name, rentalItem.category, rentalItem.size_cut, rentalItem.color]
  );
  if (existingRes.rows.length) return existingRes.rows[0].id;

  const createdRes = await tx.query(
    `INSERT INTO inventory (name, category, size_cut, color, price, cost_price, image_url, stock_level, is_deleted)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE)
     RETURNING id`,
    [rentalItem.name, rentalItem.category, rentalItem.size_cut, rentalItem.color, sellPrice, rentalItem.image_url]
  );
  const inventoryId = createdRes.rows[0].id;
  await tx.query(
    `INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
     SELECT $1, id, 0 FROM branches
     ON CONFLICT (inventory_id, branch_id) DO NOTHING`,
    [inventoryId]
  );
  return inventoryId;
}

async function pruneSyncedQueue() {
  if (config.SYNC_QUEUE_RETENTION_DAYS <= 0) return;
  await db.query(
    `DELETE FROM sync_queue
     WHERE status = 'synced'
       AND synced_at IS NOT NULL
       AND synced_at < CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')`,
    [config.SYNC_QUEUE_RETENTION_DAYS]
  );
}

async function applyOperation(operation) {
  const rawPayload = operation.payload;
  let payload = {};
  if (typeof rawPayload === 'string') {
    try { payload = JSON.parse(rawPayload); } catch { payload = {}; }
  } else if (rawPayload && typeof rawPayload === 'object') {
    payload = rawPayload;
  }
  await db.transaction(async (tx) => {
    if (operation.entity_type === 'customer') {
      await tx.query(
        `INSERT INTO customers (name, initials, email, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), COALESCE($7, 0), COALESCE($8, 'نشط'), $9, $10)
         ON CONFLICT (offline_uuid) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           phone = EXCLUDED.phone,
           national_id = EXCLUDED.national_id,
           branch_id = EXCLUDED.branch_id`,
        [payload.name, payload.initials || getInitialsFromName(payload.name), payload.email || null, payload.phone || null, payload.national_id || null, payload.join_date || null, payload.total_spent || 0, payload.status || 'نشط', payload.branch_id || operation.branch_id || 1, payload.offline_uuid]
      );
      return;
    }

    if (operation.entity_type === 'expense') {
      await tx.query(
        `INSERT INTO expenses (branch_id, category, amount, expense_date, notes, offline_uuid, payment_method, created_by, updated_by, is_deleted, deleted_by)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, COALESCE($7, 'cash'), $8, $9, COALESCE($10, FALSE), $11)
         ON CONFLICT (offline_uuid) DO UPDATE SET
           branch_id = EXCLUDED.branch_id,
           category = EXCLUDED.category,
           amount = EXCLUDED.amount,
           expense_date = EXCLUDED.expense_date,
           notes = EXCLUDED.notes,
           payment_method = EXCLUDED.payment_method,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP,
           is_deleted = EXCLUDED.is_deleted,
           deleted_by = EXCLUDED.deleted_by,
           deleted_at = CASE WHEN EXCLUDED.is_deleted THEN CURRENT_TIMESTAMP ELSE expenses.deleted_at END`,
        [
          payload.branch_id || operation.branch_id || null,
          payload.category,
          payload.amount || 0,
          payload.expense_date || null,
          payload.notes || null,
          payload.offline_uuid,
          payload.payment_method || 'cash',
          payload.created_by || null,
          payload.updated_by || null,
          Boolean(payload.is_deleted),
          payload.deleted_by || null,
        ]
      );
      if (payload.category === 'bonus' && payload.employee_id) {
        const marker = `[EXP-${payload.offline_uuid}]`;
        if (Boolean(payload.is_deleted)) {
          await tx.query(
            "DELETE FROM employee_transactions WHERE employee_id = $1 AND type = 'bonus' AND notes LIKE $2",
            [payload.employee_id, `%${marker}%`]
          );
        } else {
          const existingBonus = await tx.query(
            "SELECT id FROM employee_transactions WHERE employee_id = $1 AND type = 'bonus' AND notes LIKE $2 LIMIT 1",
            [payload.employee_id, `%${marker}%`]
          );
          if (!existingBonus.rows.length) {
            await tx.query(
              `INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes)
               VALUES ($1, 'bonus', $2, COALESCE($3::date, CURRENT_DATE), $4)`,
              [payload.employee_id, payload.amount || 0, payload.expense_date || null, payload.notes || `مكسرات ${marker}`]
            );
          } else {
            await tx.query(
              `UPDATE employee_transactions SET amount = $1, transaction_date = COALESCE($2::date, transaction_date), notes = $3 WHERE id = $4`,
              [payload.amount || 0, payload.expense_date || null, payload.notes || `مكسرات ${marker}`, existingBonus.rows[0].id]
            );
          }
        }
      }
      return;
    }

    if (operation.entity_type === 'attendance') {
      await tx.query(
        `INSERT INTO attendance
          (employee_id, date, check_in, check_out, status, notes, total_hours, late_minutes, early_departure_minutes, overtime_minutes)
         VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3::time, $4::time, COALESCE($5, 'present'), $6, COALESCE($7, 0), COALESCE($8, 0), COALESCE($9, 0), COALESCE($10, 0))
         ON CONFLICT (employee_id, date)
         DO UPDATE SET
           check_in = EXCLUDED.check_in,
           check_out = EXCLUDED.check_out,
           status = EXCLUDED.status,
           notes = EXCLUDED.notes,
           total_hours = EXCLUDED.total_hours,
           late_minutes = EXCLUDED.late_minutes,
           early_departure_minutes = EXCLUDED.early_departure_minutes,
           overtime_minutes = EXCLUDED.overtime_minutes`,
        [
          payload.employee_id,
          payload.date || null,
          payload.check_in || null,
          payload.check_out || null,
          payload.status || 'present',
          payload.notes || null,
          payload.total_hours || 0,
          payload.late_minutes || 0,
          payload.early_departure_minutes || 0,
          payload.overtime_minutes || 0,
        ]
      );
      return;
    }

    if (operation.entity_type === 'employee_transaction') {
      await tx.query(
        `INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes, offline_uuid)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
         ON CONFLICT (offline_uuid) DO UPDATE SET
           employee_id = EXCLUDED.employee_id,
           type = EXCLUDED.type,
           amount = EXCLUDED.amount,
           transaction_date = EXCLUDED.transaction_date,
           notes = EXCLUDED.notes`,
        [
          payload.employee_id,
          payload.type,
          payload.amount || 0,
          payload.transaction_date || null,
          payload.notes || null,
          payload.offline_uuid,
        ]
      );
      return;
    }

    if (operation.entity_type === 'worn_product') {
      if (operation.action === 'update') {
        if (!payload.offline_uuid) {
          throw new Error('Missing worn product offline_uuid');
        }
        const result = await tx.query(
          `UPDATE worn_products
           SET status = COALESCE($1, status),
               notes = COALESCE($2, notes)
           WHERE offline_uuid = $3
           RETURNING id`,
          [payload.status || null, payload.notes || null, payload.offline_uuid]
        );
        if (!result.rows.length) {
          throw new Error('Worn product not found for offline update');
        }
        return;
      }

      const exists = payload.offline_uuid
        ? await tx.query('SELECT id FROM worn_products WHERE offline_uuid = $1', [payload.offline_uuid])
        : { rows: [] };
      if (exists.rows.length) return;

      const productType = payload.product_type === 'rental' ? 'rental' : 'sales';
      const qty = parsePositiveInt(payload.quantity, 'quantity');
      const branchId = payload.branch_id || operation.branch_id || 1;
      const inventoryId = productType === 'sales' ? payload.inventory_id : null;
      const rentalInventoryId = productType === 'rental' ? payload.rental_inventory_id : null;
      if (productType === 'sales' && !inventoryId) throw new Error('Missing inventory_id');
      if (productType === 'rental' && !rentalInventoryId) throw new Error('Missing rental_inventory_id');

      if (payload.deduct_stock !== false) {
        if (productType === 'sales') {
          // Lock global inventory and branch stock rows in order
          const globalStockRes = await tx.query(
            'SELECT stock_level FROM inventory WHERE id = $1 FOR UPDATE',
            [inventoryId]
          );
          const currentGlobalStock = Number(globalStockRes.rows[0]?.stock_level || 0);
          if (currentGlobalStock < qty) {
            const deficit = qty - currentGlobalStock;
            console.warn(`[Sync Conflict] Deficit detected during offline worn product replay for global inventory #${inventoryId}: required ${qty}, available ${currentGlobalStock}, deficit ${deficit}`);
            await logActivity(
              null,
              'SyncService',
              'تعارض مزامنة مخزون عام',
              `عجز في المخزون العام للمنتج التالف #${inventoryId} (المطلوب: ${qty}، المتاح: ${currentGlobalStock}، العجز: ${deficit})`,
              'Sync',
              branchId
            );
          }

          const branchStockRes = await tx.query(
            'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
            [inventoryId, branchId]
          );
          const currentBranchStock = Number(branchStockRes.rows[0]?.stock_level || 0);
          if (currentBranchStock < qty) {
            const deficit = qty - currentBranchStock;
            console.warn(`[Sync Conflict] Deficit detected during offline worn product replay for inventory #${inventoryId} at branch #${branchId}: required ${qty}, available ${currentBranchStock}, deficit ${deficit}`);
            await logActivity(
              null,
              'SyncService',
              'تعارض مزامنة مخزون فرع',
              `عجز في مخزون الفرع #${branchId} للمنتج التالف #${inventoryId} (المطلوب: ${qty}، المتاح: ${currentBranchStock}، العجز: ${deficit})`,
              'Sync',
              branchId
            );
          }

          await tx.query(
            'UPDATE inventory_branches SET stock_level = GREATEST(stock_level - $1, 0) WHERE inventory_id = $2 AND branch_id = $3',
            [qty, inventoryId, branchId]
          );
          await tx.query(
            'UPDATE inventory SET stock_level = GREATEST(stock_level - $1, 0) WHERE id = $2',
            [qty, inventoryId]
          );
        } else {
          const rentalStockRes = await tx.query(
            'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
            [rentalInventoryId, branchId]
          );
          const currentRentalStock = Number(rentalStockRes.rows[0]?.stock_level || 0);
          if (currentRentalStock < qty) {
            const deficit = qty - currentRentalStock;
            console.warn(`[Sync Conflict] Deficit detected during offline worn rental product replay for rental inventory #${rentalInventoryId} at branch #${branchId}: required ${qty}, available ${currentRentalStock}, deficit ${deficit}`);
            await logActivity(
              null,
              'SyncService',
              'تعارض مزامنة مخزون إيجار',
              `عجز في مخزون إيجار الفرع #${branchId} للمنتج التالف #${rentalInventoryId} (المطلوب: ${qty}، المتاح: ${currentRentalStock}، العجز: ${deficit})`,
              'Sync',
              branchId
            );
          }

          await tx.query(
            'UPDATE rental_inventory_branches SET stock_level = GREATEST(stock_level - $1, 0) WHERE rental_inventory_id = $2 AND branch_id = $3',
            [qty, rentalInventoryId, branchId]
          );
        }
      }

      await tx.query(
        `INSERT INTO worn_products
          (product_type, inventory_id, rental_inventory_id, branch_id, quantity, condition, reason, estimated_loss, notes, status, reported_by, occurred_at, offline_uuid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 0), $9, COALESCE($10, 'recorded'), $11, COALESCE($12::date, CURRENT_DATE), $13)
         ON CONFLICT (offline_uuid) DO NOTHING`,
        [
          productType,
          inventoryId,
          rentalInventoryId,
          branchId,
          qty,
          payload.condition || 'worn',
          payload.reason || null,
          payload.estimated_loss || 0,
          payload.notes || null,
          payload.status || 'recorded',
          payload.reported_by || null,
          payload.occurred_at || null,
          payload.offline_uuid || null,
        ]
      );
      return;
    }

    if (operation.entity_type === 'tailoring_order') {
      const branchId = payload.branch_id || operation.branch_id || 1;
      const paidAmount = Number(payload.paid_amount || 0);
      const remainingAmount = Number(payload.remaining_amount || 0);
      if (!payload.offline_uuid || !payload.invoice_number || !payload.customer_name || !payload.customer_phone
          || !payload.product_description || !payload.measurements) {
        throw new Error('Missing tailoring order data');
      }
      if (!Number.isFinite(paidAmount) || paidAmount < 0 || !Number.isFinite(remainingAmount) || remainingAmount < 0) {
        throw new Error('Invalid tailoring payment amounts');
      }
      const existing = await tx.query('SELECT id FROM tailoring_orders WHERE offline_uuid = $1', [payload.offline_uuid]);
      if (existing.rows.length) return;
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`tailoring-invoice:${branchId}`]);
      let invoiceNumber = String(payload.invoice_number || '').trim();
      const invoiceConflict = /^\d+$/.test(invoiceNumber)
        ? await tx.query(
            'SELECT id FROM tailoring_orders WHERE branch_id = $1 AND invoice_number = $2 LIMIT 1',
            [branchId, invoiceNumber]
          )
        : { rows: [{}] };
      if (invoiceConflict.rows.length) {
        const nextRes = await tx.query(
          `SELECT COALESCE(
             MAX(invoice_number::bigint) FILTER (WHERE invoice_number ~ '^[0-9]+$'),
             -1
           ) + 1 AS next_number
           FROM tailoring_orders
           WHERE branch_id = $1`,
          [branchId]
        );
        invoiceNumber = String(nextRes.rows[0].next_number);
      }
      await tx.query(
        `INSERT INTO tailoring_orders
          (invoice_number, customer_name, customer_phone, product_description, measurements, total_amount,
           paid_amount, remaining_amount, payment_method, seller_id, branch_id, created_by, offline_uuid, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14::timestamp, timezone('utc', now())))
         ON CONFLICT (offline_uuid) DO NOTHING`,
        [
          invoiceNumber,
          payload.customer_name,
          payload.customer_phone,
          payload.product_description,
          payload.measurements,
          paidAmount + remainingAmount,
          paidAmount,
          remainingAmount,
          payload.payment_method || 'cash',
          payload.seller_id || null,
          branchId,
          payload.created_by || null,
          payload.offline_uuid,
          payload.created_at || null,
        ]
      );
      return;
    }

    if (operation.entity_type === 'order' || operation.entity_type === 'sale') {
      const orderData = payload.order || payload;
      const orderOfflineUuid = payload.offline_uuid || orderData.offline_uuid;
      const exists = await tx.query('SELECT id FROM orders WHERE offline_uuid = $1', [orderOfflineUuid]);
      if (exists.rows.length) return;
      const branchId = orderData.branch_id || operation.branch_id || 1;
      const customer = payload.customer || {};
      if (customer.phone) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${customer.phone}`]);
      }
      let customerId;
      const existingCustomer = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [customer.phone || '', branchId]);
      if (existingCustomer.rows.length) {
        customerId = existingCustomer.rows[0].id;
        await tx.query('UPDATE customers SET total_spent = COALESCE(total_spent, 0) + $1 WHERE id = $2', [orderData.total_amount || 0, customerId]);
      } else {
        const customerRes = await tx.query(
          `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, 'نشط', $5, $6) RETURNING id`,
          [customer.name || 'عميل', getInitialsFromName(customer.name || 'عميل'), customer.phone || null, orderData.total_amount || 0, branchId, newUuid()]
        );
        customerId = customerRes.rows[0].id;
      }
      await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [4001, branchId]);
      const invoiceRes = await tx.query(
        "SELECT COALESCE(MAX(branch_invoice_number), 0) + 1 AS next_no FROM orders WHERE branch_id = $1 AND COALESCE(order_source, 'cashier') = 'cashier'",
        [branchId]
      );
      const nextBranchInvoiceNumber = invoiceRes.rows[0].next_no;

      let sellerId = orderData.seller_id || null;
      if (sellerId) {
        const empCheck = await tx.query('SELECT id FROM employees WHERE id = $1', [sellerId]);
        if (!empCheck.rows.length) sellerId = null;
      }

      const insertOrderRes = await tx.query(
        `INSERT INTO orders (customer_id, total_amount, order_date, branch_id, payment_method, seller_id, paid_amount, change_amount, invoice_discount, invoice_discount_type, branch_invoice_number, offline_uuid)
         VALUES ($1, $2, COALESCE($12::timestamp, timezone('utc', now())), $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [customerId, orderData.total_amount || 0, branchId, orderData.payment_method || 'cash', sellerId, orderData.paid_amount || 0, orderData.change_amount || 0, orderData.invoice_discount || 0, orderData.invoice_discount_type || 'amount', nextBranchInvoiceNumber, orderOfflineUuid, orderData.order_date || null]
      );
      const orderId = insertOrderRes.rows[0].id;

      // Pre-sort items ascending by inventory_id to prevent deadlocks during replay
      const sortedSyncItems = [...(payload.items || [])].sort((a, b) => Number(a.inventory_id) - Number(b.inventory_id));

      for (const item of sortedSyncItems) {
        const qty = parsePositiveInt(item.quantity, 'quantity');
        await tx.query(
          'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time, discount, discount_type) VALUES ($1, $2, $3, $4, $5, $6)',
          [orderId, item.inventory_id, qty, item.price || 0, item.discount || 0, item.discount_type || 'amount']
        );

        // Check & lock branch stock
        const branchStockRes = await tx.query(
          'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
          [item.inventory_id, branchId]
        );
        const currentBranchStock = Number(branchStockRes.rows[0]?.stock_level || 0);
        if (currentBranchStock < qty) {
          const deficit = qty - currentBranchStock;
          console.warn(`[Sync Conflict] Deficit detected during offline order replay for inventory #${item.inventory_id} at branch #${branchId}: required ${qty}, available ${currentBranchStock}, deficit ${deficit}`);
          await logActivity(
            null,
            'SyncService',
            'تعارض مزامنة مخزون فرع',
            `عجز في مخزون الفرع #${branchId} للمنتج #${item.inventory_id} (المطلوب: ${qty}، المتاح: ${currentBranchStock}، العجز: ${deficit}) في طلب #${orderId}`,
            'Sync',
            branchId
          );
        }

        // Check & lock global stock
        const globalStockRes = await tx.query(
          'SELECT stock_level FROM inventory WHERE id = $1 FOR UPDATE',
          [item.inventory_id]
        );
        const currentGlobalStock = Number(globalStockRes.rows[0]?.stock_level || 0);
        if (currentGlobalStock < qty) {
          const deficit = qty - currentGlobalStock;
          console.warn(`[Sync Conflict] Deficit detected during offline order replay for global inventory #${item.inventory_id}: required ${qty}, available ${currentGlobalStock}, deficit ${deficit}`);
          await logActivity(
            null,
            'SyncService',
            'تعارض مزامنة مخزون عام',
            `عجز في المخزون العام للمنتج #${item.inventory_id} (المطلوب: ${qty}، المتاح: ${currentGlobalStock}، العجز: ${deficit}) في طلب #${orderId}`,
            'Sync',
            branchId
          );
        }

        await tx.query('UPDATE inventory_branches SET stock_level = GREATEST(stock_level - $1, 0) WHERE inventory_id = $2 AND branch_id = $3', [qty, item.inventory_id, branchId]);
        await tx.query('UPDATE inventory SET stock_level = GREATEST(stock_level - $1, 0) WHERE id = $2', [qty, item.inventory_id]);
      }
      return;
    }

    if (operation.entity_type === 'return') {
      const exists = await tx.query('SELECT id FROM returns WHERE offline_uuid = $1', [payload.offline_uuid]);
      if (exists.rows.length) return;
      const branchId = payload.branch_id || operation.branch_id || 1;

      let resolvedOrderId = payload.order_id;
      if (payload.order_offline_uuid) {
        const orderLookup = await tx.query(
          'SELECT id FROM orders WHERE offline_uuid::text LIKE $1 LIMIT 1',
          [payload.order_offline_uuid + '%']
        );
        if (orderLookup.rows.length) {
          resolvedOrderId = orderLookup.rows[0].id;
        }
      } else if (typeof resolvedOrderId === 'string' && resolvedOrderId.toUpperCase().startsWith('OFF-')) {
        const offlinePart = resolvedOrderId.slice(4);
        const orderLookup = await tx.query(
          'SELECT id FROM orders WHERE offline_uuid::text LIKE $1 LIMIT 1',
          [offlinePart + '%']
        );
        if (orderLookup.rows.length) {
          resolvedOrderId = orderLookup.rows[0].id;
        }
      }

      let sellerId = payload.seller_id || null;
      if (sellerId) {
        const empCheck = await tx.query('SELECT id FROM employees WHERE id = $1', [sellerId]);
        if (!empCheck.rows.length) sellerId = null;
      }
      if (resolvedOrderId) {
        const orderCheck = await tx.query('SELECT id FROM orders WHERE id = $1', [resolvedOrderId]);
        if (!orderCheck.rows.length) resolvedOrderId = null;
      }

      const returnRes = await tx.query(
        'INSERT INTO returns (order_id, total_return_amount, branch_id, seller_id, offline_uuid) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [resolvedOrderId, payload.total_return_amount || 0, branchId, sellerId, payload.offline_uuid]
      );
      const returnId = returnRes.rows[0].id;
      for (const item of payload.items || []) {
        const qty = parsePositiveInt(item.quantity, 'quantity');
        await tx.query('INSERT INTO return_items (return_id, inventory_id, quantity, price_at_time) VALUES ($1, $2, $3, $4)', [returnId, item.inventory_id, qty, item.price || 0]);
        await tx.query(
          `INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, $2, $3)
           ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + $3`,
          [item.inventory_id, branchId, qty]
        );
        await tx.query('UPDATE inventory SET stock_level = stock_level + $1 WHERE id = $2', [qty, item.inventory_id]);
      }
      await tx.query("UPDATE orders SET status = 'returned' WHERE id = $1", [resolvedOrderId]);
      return;
    }

    if (operation.entity_type === 'rental') {
      const exists = await tx.query('SELECT id FROM rentals WHERE offline_uuid = $1', [payload.offline_uuid]);
      if (exists.rows.length) return;
      const branchId = payload.rental?.branch_id || operation.branch_id || 1;
      const customer = payload.customer || {};
      let customerId;
      if (customer.phone) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${customer.phone}`]);
      }
      const existingCustomer = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [customer.phone || '', branchId]);
      if (existingCustomer.rows.length) {
        customerId = existingCustomer.rows[0].id;
      } else {
        const initials = getInitialsFromName(customer.name || 'عميل');
        const customerOfflineUuid = newUuid();
        try {
          const customerRes = await tx.query(
            `INSERT INTO customers (name, initials, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid)
             VALUES ($1, $2, $3, $4, CURRENT_DATE, 0, 'نشط', $5, $6) RETURNING id`,
            [customer.name || 'عميل', initials, customer.phone || null, customer.national_id || null, branchId, customerOfflineUuid]
          );
          customerId = customerRes.rows[0].id;
        } catch (insertErr) {
          const retryCust = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [customer.phone || '', branchId]);
          if (retryCust.rows.length) {
            customerId = retryCust.rows[0].id;
          } else {
            throw insertErr;
          }
        }
      }
      let sellerId = payload.rental?.seller_id || null;
      if (sellerId) {
        const empCheck = await tx.query('SELECT id FROM employees WHERE id = $1', [sellerId]);
        if (!empCheck.rows.length) sellerId = null;
      }

      await tx.query(
        `INSERT INTO rentals (customer_id, rental_inventory_id, branch_id, pickup_date, return_date, total_price, national_id, deposit, remaining, id_card_guarantee, notes, status, daily_fine, seller_id, payment_method, rental_group_uuid, offline_uuid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'booked', $12, $13, $14, $15, $16)`,
        [customerId, payload.rental?.rental_inventory_id, branchId, payload.rental?.pickup_date, payload.rental?.return_date, payload.rental?.total_price || 0, payload.rental?.national_id || null, payload.rental?.deposit || 0, payload.rental?.remaining || 0, !!payload.rental?.id_card_guarantee, payload.rental?.notes || null, payload.rental?.daily_fine || 0, sellerId, payload.rental?.payment_method || 'cash', payload.rental?.rental_group_uuid || payload.rental_group_uuid || null, payload.offline_uuid]
      );
      return;
    }

    if (operation.entity_type === 'rental_status') {
      const rentalRes = payload.rental_offline_uuid
        ? await tx.query('SELECT * FROM rentals WHERE offline_uuid = $1', [payload.rental_offline_uuid])
        : await tx.query('SELECT * FROM rentals WHERE id = $1', [payload.rental_id]);
      if (!rentalRes.rows.length) return;
      const rental = rentalRes.rows[0];
      if (operation.action === 'pickup') {
        await tx.query("UPDATE rentals SET status = 'active' WHERE id = $1", [rental.id]);
        if (rental.rental_inventory_id) {
          const rentalStockRes = await tx.query(
            'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
            [rental.rental_inventory_id, rental.branch_id]
          );
          const currentStock = Number(rentalStockRes.rows[0]?.stock_level || 0);
          if (currentStock < 1) {
            console.warn(`[Sync Conflict] Deficit detected during offline rental pickup replay for rental #${rental.rental_inventory_id} at branch #${rental.branch_id}`);
            await logActivity(
              null,
              'SyncService',
              'تعارض مزامنة تسليم إيجار',
              `عجز في مخزون الفرع #${rental.branch_id} لمنتج الإيجار #${rental.rental_inventory_id} عند تسليم الحجز #${rental.id}`,
              'Sync',
              rental.branch_id
            );
          }
          await tx.query(
            'UPDATE rental_inventory_branches SET stock_level = GREATEST(stock_level - 1, 0) WHERE rental_inventory_id = $1 AND branch_id = $2',
            [rental.rental_inventory_id, rental.branch_id]
          );
        }
        return;
      }
      if (operation.action === 'cancel') {
        if (rental.status === 'booked') {
          await tx.query("UPDATE rentals SET status = 'cancelled' WHERE id = $1", [rental.id]);
        }
        return;
      }
      if (operation.action === 'return') {
        await tx.query("UPDATE rentals SET status = 'returned', actual_return_date = CURRENT_DATE, fine_amount = $1 WHERE id = $2", [payload.fine_amount || 0, rental.id]);
        if (rental.rental_inventory_id) {
          await tx.query(
            `INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
             VALUES ($1, $2, 1)
             ON CONFLICT (rental_inventory_id, branch_id)
             DO UPDATE SET stock_level = rental_inventory_branches.stock_level + 1`,
            [rental.rental_inventory_id, rental.branch_id]
          );
        }
        return;
      }
      if (operation.action === 'sell') {
        const sellPrice = Number(payload.sell_price || rental.total_price || 0);
        if (!Number.isFinite(sellPrice) || sellPrice <= 0) throw new Error('Invalid sell price');
        const salesInventoryId = await getOrCreateSalesInventoryForRental(tx, rental.rental_inventory_id, sellPrice);
        const orderOfflineUuid = payload.order_offline_uuid || payload.operation_uuid || newUuid();
        const existingOrder = await tx.query('SELECT id FROM orders WHERE offline_uuid = $1', [orderOfflineUuid]);
        if (existingOrder.rows.length) {
          await tx.query("UPDATE orders SET order_source = 'rental_sale', branch_invoice_number = NULL WHERE id = $1", [existingOrder.rows[0].id]);
          await tx.query("UPDATE rentals SET sale_order_id = $1 WHERE id = $2", [existingOrder.rows[0].id, rental.id]);
        } else {
          const orderRes = await tx.query(
            `INSERT INTO orders (customer_id, total_amount, order_date, branch_id, payment_method, seller_id, paid_amount, change_amount, order_source, branch_invoice_number, offline_uuid)
             VALUES ($1, $2, COALESCE($7::timestamp, timezone('utc', now())), $3, $4, $5, $2, 0, 'rental_sale', NULL, $6)
             RETURNING id`,
            [rental.customer_id, sellPrice, rental.branch_id, payload.payment_method || rental.payment_method || 'cash', rental.seller_id || null, orderOfflineUuid, payload.order_date || null]
          );
          await tx.query(
            'INSERT INTO order_items (order_id, inventory_id, quantity, price_at_time) VALUES ($1, $2, 1, $3)',
            [orderRes.rows[0].id, salesInventoryId, sellPrice]
          );
          await tx.query('UPDATE customers SET total_spent = COALESCE(total_spent, 0) + $1 WHERE id = $2', [sellPrice, rental.customer_id]);
          await tx.query("UPDATE rentals SET sale_order_id = $1 WHERE id = $2", [orderRes.rows[0].id, rental.id]);
        }
        await tx.query("UPDATE rentals SET status = 'sold', actual_return_date = CURRENT_DATE, total_price = $1 WHERE id = $2", [sellPrice, rental.id]);
      }
    }
  });
}

let cachedCentralConnectivity = {
  checked_at: 0,
  online: false,
  reason: null,
  message: '',
};

async function getCachedOrFreshConnectivity(maxAgeMs = 15000) {
  const now = Date.now();
  if (now - cachedCentralConnectivity.checked_at < maxAgeMs && cachedCentralConnectivity.checked_at > 0) {
    return cachedCentralConnectivity;
  }
  const check = await checkCentralConnectivity(3000);
  cachedCentralConnectivity = {
    checked_at: now,
    online: Boolean(check.ok),
    reason: check.reason || (check.ok ? 'connected' : 'unreachable'),
    message: check.message || '',
  };
  return cachedCentralConnectivity;
}

async function getSyncStatus() {
  const [countsRes, lastSyncedRes] = await Promise.all([
    db.query(`
      SELECT status, COUNT(*) AS count
      FROM sync_queue
      WHERE status IN ('pending', 'failed')
      GROUP BY status
    `),
    db.query(`
      SELECT synced_at AS last_synced_at
      FROM sync_queue
      WHERE synced_at IS NOT NULL
      ORDER BY synced_at DESC
      LIMIT 1
    `),
  ]);

  const counts = Object.fromEntries(countsRes.rows.map(row => [row.status, Number(row.count || 0)]));
  const local = (config.IS_BRANCH_MODE && !config.IS_SYNC_TARGET) ? offlineStore.status() : { pending: 0, failed: 0, last_synced_at: null };

  let connectivity = { online: true, reason: 'master', message: '' };
  if (config.IS_BRANCH_MODE) {
    connectivity = await getCachedOrFreshConnectivity(15000);
  }

  return {
    is_branch_mode: Boolean(config.IS_BRANCH_MODE),
    configured: Boolean(config.SYNC_SERVER_URL),
    target: config.IS_BRANCH_MODE ? false : config.IS_SYNC_TARGET,
    server_url: config.SYNC_SERVER_URL || null,
    online: Boolean(connectivity.online),
    connectivity_reason: connectivity.reason,
    connectivity_message: connectivity.message,
    pending: Number(counts.pending || 0) + Number(local.pending || 0),
    failed: Number(counts.failed || 0) + Number(local.failed || 0),
    last_synced_at: lastSyncedRes.rows[0]?.last_synced_at || local.last_synced_at,
    local_store_path: local.path,
  };
}

async function runSync(requestedLimit = 50) {
  if (!config.SYNC_SERVER_URL) {
    const err = new Error('SYNC_SERVER_URL is not configured');
    err.statusCode = 400;
    throw err;
  }

  const limit = Math.min(Math.max(Number(requestedLimit) || 50, 1), 200);
  const result = { synced: 0, failed: 0 };

  const { rows } = await db.query(
    `SELECT * FROM sync_queue
     WHERE status IN ('pending', 'failed')
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );

  const localRows = (config.IS_BRANCH_MODE && !config.IS_SYNC_TARGET)
    ? offlineStore.pending(Math.max(0, limit - rows.length))
    : [];

  for (const op of rows) {
    try {
      let opPayload = op.payload;
      if (typeof opPayload === 'string') {
        try { opPayload = JSON.parse(opPayload); } catch {}
      }

      const response = await fetchWithTimeout(`${config.SYNC_SERVER_URL}/api/sync/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.SYNC_API_KEY ? { 'x-sync-key': config.SYNC_API_KEY } : {}),
        },
        body: JSON.stringify({
          operation_uuid: op.operation_uuid,
          entity_type: op.entity_type,
          action: op.action,
          entity_id: op.entity_id,
          branch_id: op.branch_id,
          payload: opPayload,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        const authErr = new Error('SYNC_AUTH_FAILED: مفتاح المزامنة غير صالح أو مرفوض من السيرفر');
        authErr.statusCode = response.status;
        authErr.isAuthError = true;
        throw authErr;
      }

      const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0, 500));
      await db.query("UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = $1", [op.id]);
      result.synced += 1;
    } catch (err) {
      if (err.isAuthError) throw err;
      const isNetworkErr = err.name === 'AbortError' || err.name === 'TimeoutError'
        || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('fetch failed');
      if (isNetworkErr) {
        await db.query("UPDATE sync_queue SET last_error = $2 WHERE id = $1", [op.id, err.message]);
        result.failed += 1;
        break; // stop on network drop to preserve remaining operations
      }
      await db.query(
        "UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1",
        [op.id, err.message]
      );
      result.failed += 1;
    }
  }

  for (const op of localRows) {
    try {
      let opPayload = op.payload;
      if (typeof opPayload === 'string') {
        try { opPayload = JSON.parse(opPayload); } catch {}
      }

      const response = await fetchWithTimeout(`${config.SYNC_SERVER_URL}/api/sync/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.SYNC_API_KEY ? { 'x-sync-key': config.SYNC_API_KEY } : {}),
        },
        body: JSON.stringify({
          operation_uuid: op.operation_uuid,
          entity_type: op.entity_type,
          action: op.action,
          entity_id: null,
          branch_id: op.branch_id,
          payload: opPayload,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        const authErr = new Error('SYNC_AUTH_FAILED: مفتاح المزامنة غير صالح أو مرفوض من السيرفر');
        authErr.statusCode = response.status;
        authErr.isAuthError = true;
        throw authErr;
      }

      const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0, 500));
      offlineStore.markSynced(op.id);
      result.synced += 1;
    } catch (err) {
      if (err.isAuthError) throw err;
      const isNetworkErr = err.name === 'AbortError' || err.name === 'TimeoutError'
        || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('fetch failed');
      offlineStore.markFailed(op.id, err.message);
      result.failed += 1;
      if (isNetworkErr) break;
    }
  }

  await pruneSyncedQueue();
  if (config.IS_BRANCH_MODE && !config.IS_SYNC_TARGET && offlineStore?.pruneSynced) {
    offlineStore.pruneSynced(config.SYNC_QUEUE_RETENTION_DAYS);
  }

  return result;
}

async function exportCatalogForBranch(branchId = null) {
  const [
    usersRes,
    branchesRes,
    inventoryRes,
    invBranchesRes,
    rentalInvRes,
    rentalBranchesRes,
    colorsRes,
    sizesRes,
    invSizesRes,
    settingsRes,
    customersRes,
    employeesRes,
    suppliersRes,
  ] = await Promise.all([
    db.query('SELECT id, username, password_hash, role, branch_id, permissions, employee_id FROM users'),
    db.query('SELECT id, name, location, type, is_main_warehouse, phone, logo_url, invoice_logo_height, invoice_logo_spacing, invoice_logo_filter, invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end, allowed_gender FROM branches'),
    db.query('SELECT id, name, category, size_cut, color, barcode, stock_level, min_stock_level, preferred_supplier_id, price, cost_price, image_url, is_deleted FROM inventory WHERE is_deleted = FALSE'),
    db.query('SELECT inventory_id, branch_id, stock_level FROM inventory_branches'),
    db.query('SELECT id, name, category, size_cut, color, barcode, price, image_url, is_deleted FROM rental_inventory WHERE is_deleted = FALSE'),
    db.query('SELECT rental_inventory_id, branch_id, stock_level FROM rental_inventory_branches'),
    db.query('SELECT id, name FROM colors'),
    db.query('SELECT id, name FROM sizes'),
    db.query('SELECT inventory_id, size_id, size_name, stock_level, branch_id FROM inventory_sizes'),
    db.query('SELECT key, value FROM settings'),
    db.query('SELECT id, name, initials, email, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid FROM customers'),
    db.query("SELECT id, name, position, branch_id, basic_salary, phone, status FROM employees WHERE status = 'active'"),
    db.query('SELECT id, name, initials, category, contact_person, phone, supply_type, balance, status FROM suppliers'),
  ]);

  return {
    timestamp: new Date().toISOString(),
    users: usersRes.rows,
    branches: branchesRes.rows,
    inventory: inventoryRes.rows,
    inventory_branches: invBranchesRes.rows,
    rental_inventory: rentalInvRes.rows,
    rental_inventory_branches: rentalBranchesRes.rows,
    colors: colorsRes.rows,
    sizes: sizesRes.rows,
    inventory_sizes: invSizesRes.rows,
    settings: settingsRes.rows,
    customers: customersRes.rows,
    employees: employeesRes.rows,
    suppliers: suppliersRes.rows,
  };
}

async function importCatalogIntoBranch(catalog, targetSqlite = null) {
  const sqlite = targetSqlite || db.sqlite;
  if (!sqlite) {
    return { ok: false, message: 'SQLite database instance not available' };
  }
  sqlite.exec('BEGIN TRANSACTION;');
  try {
    // 1. Users
    if (Array.isArray(catalog.users)) {
      const uStmt = sqlite.prepare(`
        INSERT INTO users (id, username, password_hash, role, branch_id, permissions, employee_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          username = excluded.username,
          password_hash = excluded.password_hash,
          role = excluded.role,
          branch_id = excluded.branch_id,
          permissions = excluded.permissions,
          employee_id = excluded.employee_id
      `);
      for (const u of catalog.users) {
        const perms = typeof u.permissions === 'object' ? JSON.stringify(u.permissions) : (u.permissions || '[]');
        uStmt.run(u.id, u.username, u.password_hash, u.role, u.branch_id, perms, u.employee_id || null);
      }
    }

    // 2. Branches
    if (Array.isArray(catalog.branches)) {
      const bStmt = sqlite.prepare(`
        INSERT INTO branches (id, name, location, type, is_main_warehouse, phone, logo_url, invoice_logo_height, invoice_logo_spacing, invoice_logo_filter, invoice_logo_bg_enabled, invoice_logo_bg_start, invoice_logo_bg_end, allowed_gender)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          location = excluded.location,
          type = excluded.type,
          is_main_warehouse = excluded.is_main_warehouse,
          phone = excluded.phone,
          logo_url = excluded.logo_url,
          invoice_logo_height = excluded.invoice_logo_height,
          invoice_logo_spacing = excluded.invoice_logo_spacing,
          invoice_logo_filter = excluded.invoice_logo_filter,
          invoice_logo_bg_enabled = excluded.invoice_logo_bg_enabled,
          invoice_logo_bg_start = excluded.invoice_logo_bg_start,
          invoice_logo_bg_end = excluded.invoice_logo_bg_end,
          allowed_gender = excluded.allowed_gender
      `);
      for (const b of catalog.branches) {
        bStmt.run(
          b.id, b.name, b.location || null, b.type || null, b.is_main_warehouse ? 1 : 0,
          b.phone || null, b.logo_url || null, b.invoice_logo_height || 160, b.invoice_logo_spacing || 8,
          b.invoice_logo_filter || 'black', b.invoice_logo_bg_enabled ? 1 : 0,
          b.invoice_logo_bg_start || '#ffffff', b.invoice_logo_bg_end || '#ffffff',
          b.allowed_gender || 'both'
        );
      }
    }

    // 3. Settings
    if (Array.isArray(catalog.settings)) {
      const sStmt = sqlite.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      for (const s of catalog.settings) {
        sStmt.run(s.key, s.value);
      }
    }

    // 4. Inventory
    if (Array.isArray(catalog.inventory)) {
      const invStmt = sqlite.prepare(`
        INSERT INTO inventory (id, name, category, size_cut, color, barcode, stock_level, min_stock_level, preferred_supplier_id, price, cost_price, image_url, is_deleted)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          size_cut = excluded.size_cut,
          color = excluded.color,
          barcode = excluded.barcode,
          stock_level = excluded.stock_level,
          min_stock_level = excluded.min_stock_level,
          preferred_supplier_id = excluded.preferred_supplier_id,
          price = excluded.price,
          cost_price = excluded.cost_price,
          image_url = excluded.image_url,
          is_deleted = excluded.is_deleted
      `);
      for (const i of catalog.inventory) {
        invStmt.run(
          i.id, i.name, i.category || null, i.size_cut || null, i.color || null,
          i.barcode || null, i.stock_level || 0, i.min_stock_level || 5,
          i.preferred_supplier_id || null, i.price || 0, i.cost_price || 0,
          i.image_url || null, i.is_deleted ? 1 : 0
        );
      }
    }

    // 5. Inventory Branches
    if (Array.isArray(catalog.inventory_branches)) {
      const ibStmt = sqlite.prepare(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
        VALUES (?, ?, ?)
        ON CONFLICT(inventory_id, branch_id) DO UPDATE SET stock_level = excluded.stock_level
      `);
      for (const ib of catalog.inventory_branches) {
        ibStmt.run(ib.inventory_id, ib.branch_id, ib.stock_level || 0);
      }
    }

    // 6. Rental Inventory
    if (Array.isArray(catalog.rental_inventory)) {
      const riStmt = sqlite.prepare(`
        INSERT INTO rental_inventory (id, name, category, size_cut, color, barcode, price, image_url, is_deleted, stock_level)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          category = excluded.category,
          size_cut = excluded.size_cut,
          color = excluded.color,
          barcode = excluded.barcode,
          price = excluded.price,
          image_url = excluded.image_url,
          is_deleted = excluded.is_deleted,
          stock_level = excluded.stock_level
      `);
      for (const ri of catalog.rental_inventory) {
        riStmt.run(
          ri.id, ri.name, ri.category || null, ri.size_cut || null, ri.color || null,
          ri.barcode || null, ri.price || 0, ri.image_url || null, ri.is_deleted ? 1 : 0, ri.stock_level || 0
        );
      }
    }

    // 7. Rental Inventory Branches
    if (Array.isArray(catalog.rental_inventory_branches)) {
      const ribStmt = sqlite.prepare(`
        INSERT INTO rental_inventory_branches (rental_inventory_id, branch_id, stock_level)
        VALUES (?, ?, ?)
        ON CONFLICT(rental_inventory_id, branch_id) DO UPDATE SET stock_level = excluded.stock_level
      `);
      for (const rib of catalog.rental_inventory_branches) {
        ribStmt.run(rib.rental_inventory_id, rib.branch_id, rib.stock_level || 0);
      }
    }

    // 8. Colors & Sizes
    if (Array.isArray(catalog.colors)) {
      const cStmt = sqlite.prepare('INSERT OR IGNORE INTO colors (id, name) VALUES (?, ?)');
      for (const c of catalog.colors) cStmt.run(c.id, c.name);
    }
    if (Array.isArray(catalog.sizes)) {
      const sStmt = sqlite.prepare('INSERT OR IGNORE INTO sizes (id, name) VALUES (?, ?)');
      for (const s of catalog.sizes) sStmt.run(s.id, s.name);
    }
    if (Array.isArray(catalog.inventory_sizes)) {
      const iszStmt = sqlite.prepare(`
        INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(inventory_id, size_name, branch_id) DO UPDATE SET stock_level = excluded.stock_level
      `);
      for (const isz of catalog.inventory_sizes) {
        iszStmt.run(isz.inventory_id, isz.size_id || null, isz.size_name, isz.stock_level || 0, isz.branch_id || 1);
      }
    }

    // Helper to safely format dates and primitives for SQLite
    const toSqliteDate = (val) => {
      if (!val) return null;
      if (val instanceof Date) return val.toISOString().slice(0, 10);
      return String(val);
    };

    // 9. Customers
    if (Array.isArray(catalog.customers)) {
      const custStmt = sqlite.prepare(`
        INSERT INTO customers (id, name, initials, email, phone, national_id, join_date, total_spent, status, branch_id, offline_uuid, pending_sync)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          initials = excluded.initials,
          email = excluded.email,
          phone = excluded.phone,
          national_id = excluded.national_id,
          total_spent = excluded.total_spent,
          status = excluded.status,
          branch_id = excluded.branch_id
      `);
      for (const cust of catalog.customers) {
        custStmt.run(
          cust.id, cust.name, cust.initials || null, cust.email || null, cust.phone || null,
          cust.national_id || null, toSqliteDate(cust.join_date), Number(cust.total_spent || 0),
          cust.status || 'نشط', cust.branch_id || 1, cust.offline_uuid || null
        );
      }
    }

    // 10. Employees
    if (Array.isArray(catalog.employees)) {
      const empStmt = sqlite.prepare(`
        INSERT INTO employees (id, name, position, branch_id, basic_salary, phone, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          position = excluded.position,
          branch_id = excluded.branch_id,
          basic_salary = excluded.basic_salary,
          phone = excluded.phone,
          status = excluded.status
      `);
      for (const emp of catalog.employees) {
        empStmt.run(emp.id, emp.name, emp.position || null, emp.branch_id || null, Number(emp.basic_salary || 0), emp.phone || null, emp.status || 'active');
      }
    }

    // 11. Suppliers
    if (Array.isArray(catalog.suppliers)) {
      const supStmt = sqlite.prepare(`
        INSERT INTO suppliers (id, name, initials, category, contact_person, phone, supply_type, balance, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          initials = excluded.initials,
          category = excluded.category,
          contact_person = excluded.contact_person,
          phone = excluded.phone,
          supply_type = excluded.supply_type,
          balance = excluded.balance,
          status = excluded.status
      `);
      for (const sup of catalog.suppliers) {
        supStmt.run(sup.id, sup.name, sup.initials || null, sup.category || null, sup.contact_person || null, sup.phone || null, sup.supply_type || null, Number(sup.balance || 0), sup.status || 'active');
      }
    }

    sqlite.exec('COMMIT;');
    return {
      ok: true,
      imported_at: new Date().toISOString(),
      counts: {
        users: catalog.users?.length || 0,
        inventory: catalog.inventory?.length || 0,
        customers: catalog.customers?.length || 0,
        branches: catalog.branches?.length || 0,
      }
    };
  } catch (err) {
    try { sqlite.exec('ROLLBACK;'); } catch {}
    console.error('Failed to import catalog into branch SQLite:', err);
    throw err;
  }
}

async function pullCatalogFromCentral() {
  if (!config.SYNC_SERVER_URL) {
    return { ok: false, error: 'SYNC_SERVER_URL is not configured' };
  }

  const url = `${config.SYNC_SERVER_URL}/api/sync/catalog?branch_id=${config.BRANCH_ID || ''}`;
  console.log(`[Sync] Pulling latest catalog from central: ${url}`);
  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      ...(config.SYNC_API_KEY ? { 'x-sync-key': config.SYNC_API_KEY } : {}),
    },
  }, 25000);

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Catalog pull failed (${response.status}): ${errText.slice(0, 300)}`);
  }

  const catalog = await response.json();
  const importResult = await importCatalogIntoBranch(catalog);
  console.log(`[Sync] Successfully imported catalog at ${importResult.imported_at}:`, importResult.counts);
  return importResult;
}

let syncIntervalHandle = null;
let isSyncCycleActive = false;
let lastCatalogPull = 0;

async function checkCentralConnectivity(timeoutMs = 5000) {
  const targetUrl = config.SYNC_SERVER_URL || process.env.SYNC_SERVER_URL;
  if (!targetUrl) {
    const res = { ok: false, reason: 'unconfigured', message: 'لم يتم ضبط رابط السيرفر المركزي (SYNC_SERVER_URL)' };
    cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
    return res;
  }

  try {
    const pingRes = await fetchWithTimeout(`${targetUrl}/api/sync/ping`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(config.SYNC_API_KEY ? { 'x-sync-key': config.SYNC_API_KEY } : {}),
      },
    }, timeoutMs);

    if (pingRes.status === 503) {
      const res = { ok: false, reason: 'server_db_down', message: 'السيرفر المركزي متاح لكن قاعدة بياناته غير متصلة' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }

    if (pingRes.status === 401 || pingRes.status === 403) {
      const res = { ok: false, reason: 'auth_failed', message: 'خطأ في المصادقة: مفتاح المزامنة (SYNC_API_KEY) غير صالح أو مرفوض' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }

    if (!pingRes.ok) {
      const res = { ok: false, reason: 'server_error', message: `السيرفر المركزي أعاد رمز خطأ (${pingRes.status})` };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }

    let pingData = null;
    try {
      pingData = await pingRes.json();
    } catch {}

    if (pingData && pingData.ok === false) {
      const res = { ok: false, reason: 'server_db_down', message: pingData.error || 'قاعدة بيانات السيرفر غير متاحة' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }

    const res = { ok: true, serverTime: pingData?.time };
    cachedCentralConnectivity = { checked_at: Date.now(), online: true, reason: 'connected', message: '' };
    return res;
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError'
      || err.code === 'ETIMEDOUT' || err.cause?.code === 'ETIMEDOUT'
      || err.message?.includes('timed out') || err.message?.includes('timeout');
    if (isTimeout) {
      const res = { ok: false, reason: 'timeout', message: 'انتهت مهلة الاتصال بالسيرفر المركزي' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }
    const isRefused = err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED';
    if (isRefused) {
      const res = { ok: false, reason: 'unreachable', message: 'تعذر الاتصال بالسيرفر المركزي (أوفلاين - الاتصال مرفوض)' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }
    const isDns = err.code === 'ENOTFOUND' || err.cause?.code === 'ENOTFOUND';
    if (isDns) {
      const res = { ok: false, reason: 'unreachable', message: 'تعذر الاتصال بالسيرفر المركزي (أوفلاين - خطأ DNS)' };
      cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
      return res;
    }
    const res = { ok: false, reason: 'unreachable', message: 'تعذر الاتصال بالسيرفر المركزي (أوفلاين)' };
    cachedCentralConnectivity = { checked_at: Date.now(), online: false, reason: res.reason, message: res.message };
    return res;
  }
}

async function runSyncCycle({ isManual = false, limit = 50 } = {}) {
  if (!config.IS_BRANCH_MODE) {
    return { ok: true, isMaster: true, message: 'النظام يعمل كخادم مركزي رئيسي' };
  }

  if (isSyncCycleActive) {
    return { ok: false, inProgress: true, message: 'عملية المزامنة جارية بالفعل...' };
  }

  isSyncCycleActive = true;
  try {
    // 1. Check central server connectivity & health
    const connCheck = await checkCentralConnectivity(isManual ? 15000 : 8000);
    if (!connCheck.ok) {
      return connCheck;
    }

    // 2. Push pending offline operations
    let pushResult = { synced: 0, failed: 0 };
    try {
      pushResult = await runSync(limit);
    } catch (err) {
      if (err.isAuthError) {
        return {
          ok: false,
          reason: 'auth_failed',
          message: 'خطأ في المصادقة: مفتاح المزامنة غير صالح أو مرفوض من السيرفر',
        };
      }
    }

    // 3. Pull catalog from central
    let pullResult = null;
    let pullError = null;
    const shouldPull = isManual || (Date.now() - lastCatalogPull > 5 * 60 * 1000);

    if (shouldPull) {
      try {
        pullResult = await pullCatalogFromCentral();
        lastCatalogPull = Date.now();
      } catch (err) {
        pullError = err;
      }
    }

    // Determine pending remaining operations
    let pendingRemaining = 0;
    try {
      const pendingRes = await db.query("SELECT COUNT(*) AS count FROM sync_queue WHERE status = 'pending'");
      pendingRemaining = Number(pendingRes.rows[0]?.count || 0);
    } catch {}

    if (pullError && pushResult.synced === 0 && pushResult.failed === 0) {
      if (pullError.message?.includes('401') || pullError.message?.includes('403')) {
        return {
          ok: false,
          reason: 'auth_failed',
          message: 'خطأ في المصادقة أثناء سحب الأصناف (مفتاح المزامنة غير صالح)',
        };
      }
      return {
        ok: false,
        reason: 'pull_failed',
        message: `فشل تحديث الأصناف من السيرفر: ${pullError.message}`,
      };
    }

    if (pullError && pushResult.synced > 0) {
      return {
        ok: false,
        partial: true,
        pushed: { ...pushResult, pending: pendingRemaining },
        reason: 'pull_failed',
        message: `تم رفع ${pushResult.synced} عملية لكن تعذر تحديث الأصناف`,
      };
    }

    if (pushResult.failed > 0) {
      return {
        ok: false,
        partial: true,
        pushed: { ...pushResult, pending: pendingRemaining },
        pulled: pullResult,
        reason: 'push_failed',
        message: `تم رفع ${pushResult.synced} عملية وفشلت ${pushResult.failed} عملية`,
      };
    }

    let summaryMessage = 'تمت المزامنة بنجاح!';
    if (pushResult.synced > 0) {
      summaryMessage = `تمت المزامنة بنجاح (تم رفع ${pushResult.synced} عملية وتحديث البيانات)`;
    } else if (pullResult) {
      summaryMessage = `البيانات محدثة (تم مزامنة الأصناف بنجاح)`;
    } else {
      summaryMessage = `البيانات محدثة بالكامل مع السيرفر الرئيسي`;
    }

    return {
      ok: true,
      pushed: { ...pushResult, pending: pendingRemaining },
      pulled: pullResult,
      message: summaryMessage,
      synced_at: new Date().toISOString(),
    };
  } finally {
    isSyncCycleActive = false;
  }
}

function startBackgroundSyncWorker(intervalMs = 30000) {
  if (!config.IS_BRANCH_MODE || !config.SYNC_SERVER_URL) {
    console.log(`[Sync Worker] Background sync disabled (Mode: ${config.IS_BRANCH_MODE ? 'Branch' : 'Master'}, Server: ${config.SYNC_SERVER_URL || 'None'})`);
    return;
  }

  if (syncIntervalHandle) {
    clearInterval(syncIntervalHandle);
  }

  console.log(`📡 [Sync Worker] Background auto-sync worker started (Interval: ${Math.round(intervalMs / 1000)}s, Central: ${config.SYNC_SERVER_URL})`);

  const runCycle = async () => {
    try {
      const res = await runSyncCycle({ isManual: false, limit: 50 });
      if (res.ok && res.pushed?.synced > 0) {
        console.log(`[Sync Worker] Pushed ${res.pushed.synced} offline operations to central server.`);
      }
    } catch (e) {
      // background worker never throws unhandled
    }
  };

  // Run first cycle 2 seconds after startup
  setTimeout(runCycle, 2000);

  syncIntervalHandle = setInterval(runCycle, intervalMs);
}

function saveEnvKeyValue(envFilePath, updates) {
  let content = '';
  if (fs.existsSync(envFilePath)) {
    try {
      content = fs.readFileSync(envFilePath, 'utf8');
    } catch {}
  }
  let lines = content.split(/\r?\n/);
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null) continue;
    let found = false;
    lines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
        found = true;
        return `${key}=${value}`;
      }
      return line;
    });
    if (!found) {
      lines.push(`${key}=${value}`);
    }
  }
  try {
    const dir = path.dirname(envFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(envFilePath, lines.join('\n'), 'utf8');
    return true;
  } catch (err) {
    console.warn(`[Sync] Could not write to ${envFilePath}:`, err.message);
    return false;
  }
}

async function getSyncDiagnostics() {
  const startTime = Date.now();
  let conn = { ok: false, reason: 'unreachable', message: '' };
  let latencyMs = null;
  if (config.IS_BRANCH_MODE) {
    conn = await checkCentralConnectivity(8000);
    latencyMs = Date.now() - startTime;
  } else {
    conn = { ok: true, reason: 'master', message: 'النظام يعمل كخادم مركزي رئيسي' };
  }

  let queueCounts = { pending: 0, failed: 0, synced: 0 };
  try {
    const res = await db.query(`
      SELECT status, COUNT(*) AS count
      FROM sync_queue
      GROUP BY status
    `);
    for (const r of res.rows) {
      queueCounts[r.status] = Number(r.count || 0);
    }
  } catch {}

  const local = (config.IS_BRANCH_MODE && !config.IS_SYNC_TARGET)
    ? offlineStore.status()
    : { pending: 0, failed: 0, last_synced_at: null };

  let lastErrorRecord = null;
  try {
    const errRes = await db.query(`
      SELECT entity_type, action, last_error, updated_at
      FROM sync_queue
      WHERE last_error IS NOT NULL AND status IN ('pending', 'failed')
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    if (errRes.rows.length) {
      lastErrorRecord = errRes.rows[0];
    }
  } catch {}

  return {
    is_branch_mode: Boolean(config.IS_BRANCH_MODE),
    server_url: config.SYNC_SERVER_URL || '',
    branch_id: config.BRANCH_ID || '',
    online: Boolean(conn.ok),
    connectivity_reason: conn.reason || (conn.ok ? 'connected' : 'unreachable'),
    connectivity_message: conn.message || '',
    latency_ms: conn.ok ? latencyMs : null,
    queue: {
      pending: Number(queueCounts.pending || 0) + Number(local.pending || 0),
      failed: Number(queueCounts.failed || 0) + Number(local.failed || 0),
      synced: Number(queueCounts.synced || 0),
      last_error: lastErrorRecord?.last_error || null,
      last_error_entity: lastErrorRecord ? `${lastErrorRecord.entity_type} (${lastErrorRecord.action})` : null,
    },
    server_time: conn.serverTime || null,
    client_time: new Date().toISOString(),
  };
}

async function configureSyncServer({ serverUrl, branchId, syncApiKey } = {}) {
  let normalizedUrl = String(serverUrl || '').trim();
  if (!normalizedUrl) {
    throw new Error('رابط السيرفر مطلوب');
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `http://${normalizedUrl}`;
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.port && parsed.protocol.startsWith('http')) {
      parsed.port = '6253';
      normalizedUrl = parsed.origin;
    }
  } catch {
    // URL parsing fallback
  }

  normalizedUrl = normalizedUrl.replace(/\/+$/, '');

  const effectiveKey = (syncApiKey && String(syncApiKey).trim()) || config.SYNC_API_KEY || '';

  let testPingOk = false;
  let testMessage = '';
  let testReason = 'unreachable';
  try {
    const pingRes = await fetchWithTimeout(`${normalizedUrl}/api/sync/ping`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...(effectiveKey ? { 'x-sync-key': effectiveKey } : {}),
      },
    }, 8000);

    if (pingRes.status === 200) {
      testPingOk = true;
      testReason = 'connected';
      testMessage = 'تم الاتصال بالسيرفر المركزي بنجاح';
    } else if (pingRes.status === 401 || pingRes.status === 403) {
      testReason = 'auth_failed';
      testMessage = 'السيرفر المركزي متاح لكن مفتاح المزامنة (SYNC_API_KEY) غير صالح';
    } else if (pingRes.status === 503) {
      testReason = 'server_db_down';
      testMessage = 'السيرفر المركزي متاح لكن قاعدة بياناته غير متصلة';
    } else {
      testReason = 'server_error';
      testMessage = `السيرفر أعاد رمز خطأ (${pingRes.status})`;
    }
  } catch (err) {
    testReason = 'unreachable';
    testMessage = err.message?.includes('timeout')
      ? 'انتهت مهلة الاتصال بالرابط المحدد (تأكد من الـ IP وعمل الراوتر)'
      : 'تعذر الاتصال بالرابط المحدد (تأكد من فتح المنفذ 6253 في الراوتر وصحة الرابط)';
  }

  config.SYNC_SERVER_URL = normalizedUrl;
  process.env.SYNC_SERVER_URL = normalizedUrl;

  const updates = {
    SYNC_SERVER_URL: normalizedUrl,
  };

  if (branchId !== undefined && branchId !== null && String(branchId).trim() !== '') {
    const cleanBranchId = String(branchId).trim();
    config.BRANCH_ID = cleanBranchId;
    process.env.BRANCH_ID = cleanBranchId;
    updates.BRANCH_ID = cleanBranchId;
  }

  if (syncApiKey && String(syncApiKey).trim()) {
    const cleanKey = String(syncApiKey).trim();
    config.SYNC_API_KEY = cleanKey;
    process.env.SYNC_API_KEY = cleanKey;
    updates.SYNC_API_KEY = cleanKey;
  }

  cachedCentralConnectivity = {
    checked_at: Date.now(),
    online: testPingOk,
    reason: testReason,
    message: testMessage,
  };

  const dataEnv = path.join(config.dataDir, '.env');
  saveEnvKeyValue(dataEnv, updates);

  if (config.appRoot && config.appRoot !== config.dataDir) {
    const appEnv = path.join(config.appRoot, '.env');
    saveEnvKeyValue(appEnv, updates);
  }

  return {
    ok: true,
    server_url: normalizedUrl,
    branch_id: config.BRANCH_ID,
    test_ping: testPingOk,
    connectivity_reason: testReason,
    message: testPingOk
      ? 'تم حفظ الإعدادات والاتصال بالسيرفر المركزي بنجاح! 🚀'
      : `تم حفظ الإعدادات، ولكن: ${testMessage}`,
  };
}

module.exports = {
  applyOperation,
  getSyncStatus,
  runSync,
  pruneSyncedQueue,
  exportCatalogForBranch,
  importCatalogIntoBranch,
  pullCatalogFromCentral,
  checkCentralConnectivity,
  runSyncCycle,
  startBackgroundSyncWorker,
  getSyncDiagnostics,
  configureSyncServer,
};

