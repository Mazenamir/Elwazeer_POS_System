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
  const payload = operation.payload || {};
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
        `INSERT INTO expenses (branch_id, category, amount, expense_date, notes, offline_uuid)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
         ON CONFLICT (offline_uuid) DO UPDATE SET
           branch_id = EXCLUDED.branch_id,
           category = EXCLUDED.category,
           amount = EXCLUDED.amount,
           expense_date = EXCLUDED.expense_date,
           notes = EXCLUDED.notes`,
        [payload.branch_id || operation.branch_id || null, payload.category, payload.amount || 0, payload.expense_date || null, payload.notes || null, payload.offline_uuid]
      );
      if (payload.category === 'bonus' && payload.employee_id) {
        const marker = `[EXP-${payload.offline_uuid}]`;
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

    if (operation.entity_type === 'order') {
      const exists = await tx.query('SELECT id FROM orders WHERE offline_uuid = $1', [payload.offline_uuid]);
      if (exists.rows.length) return;
      const branchId = payload.order?.branch_id || operation.branch_id || 1;
      const customer = payload.customer || {};
      if (customer.phone) {
        await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`customer-phone:${customer.phone}`]);
      }
      let customerId;
      const existingCustomer = await tx.query('SELECT id FROM customers WHERE phone = $1 AND branch_id = $2 FOR UPDATE', [customer.phone || '', branchId]);
      if (existingCustomer.rows.length) {
        customerId = existingCustomer.rows[0].id;
        await tx.query('UPDATE customers SET total_spent = COALESCE(total_spent, 0) + $1 WHERE id = $2', [payload.order?.total_amount || 0, customerId]);
      } else {
        const customerRes = await tx.query(
          `INSERT INTO customers (name, initials, phone, join_date, total_spent, status, branch_id, offline_uuid)
           VALUES ($1, $2, $3, CURRENT_DATE, $4, 'نشط', $5, $6) RETURNING id`,
          [customer.name || 'عميل', getInitialsFromName(customer.name || 'عميل'), customer.phone || null, payload.order?.total_amount || 0, branchId, newUuid()]
        );
        customerId = customerRes.rows[0].id;
      }
      await tx.query('SELECT pg_advisory_xact_lock($1::int, $2::int)', [4001, branchId]);
      const invoiceRes = await tx.query(
        "SELECT COALESCE(MAX(branch_invoice_number), 0) + 1 AS next_no FROM orders WHERE branch_id = $1 AND COALESCE(order_source, 'cashier') = 'cashier'",
        [branchId]
      );
      const nextBranchInvoiceNumber = invoiceRes.rows[0].next_no;
      const insertOrderRes = await tx.query(
        `INSERT INTO orders (customer_id, total_amount, order_date, branch_id, payment_method, seller_id, paid_amount, change_amount, invoice_discount, invoice_discount_type, branch_invoice_number, offline_uuid)
         VALUES ($1, $2, COALESCE($12::timestamp, timezone('utc', now())), $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [customerId, payload.order?.total_amount || 0, branchId, payload.order?.payment_method || 'cash', payload.order?.seller_id || null, payload.order?.paid_amount || 0, payload.order?.change_amount || 0, payload.order?.invoice_discount || 0, payload.order?.invoice_discount_type || 'amount', nextBranchInvoiceNumber, payload.offline_uuid, payload.order?.order_date || null]
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
          'SELECT id FROM orders WHERE offline_uuid LIKE $1 LIMIT 1',
          [payload.order_offline_uuid + '%']
        );
        if (orderLookup.rows.length) {
          resolvedOrderId = orderLookup.rows[0].id;
        }
      } else if (typeof resolvedOrderId === 'string' && resolvedOrderId.toUpperCase().startsWith('OFF-')) {
        const offlinePart = resolvedOrderId.slice(4);
        const orderLookup = await tx.query(
          'SELECT id FROM orders WHERE offline_uuid LIKE $1 LIMIT 1',
          [offlinePart + '%']
        );
        if (orderLookup.rows.length) {
          resolvedOrderId = orderLookup.rows[0].id;
        }
      }

      const returnRes = await tx.query(
        'INSERT INTO returns (order_id, total_return_amount, branch_id, seller_id, offline_uuid) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [resolvedOrderId, payload.total_return_amount || 0, branchId, payload.seller_id || null, payload.offline_uuid]
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
      await tx.query(
        `INSERT INTO rentals (customer_id, rental_inventory_id, branch_id, pickup_date, return_date, total_price, national_id, deposit, remaining, id_card_guarantee, notes, status, daily_fine, seller_id, payment_method, rental_group_uuid, offline_uuid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'booked', $12, $13, $14, $15, $16)`,
        [customerId, payload.rental?.rental_inventory_id, branchId, payload.rental?.pickup_date, payload.rental?.return_date, payload.rental?.total_price || 0, payload.rental?.national_id || null, payload.rental?.deposit || 0, payload.rental?.remaining || 0, !!payload.rental?.id_card_guarantee, payload.rental?.notes || null, payload.rental?.daily_fine || 0, payload.rental?.seller_id || null, payload.rental?.payment_method || 'cash', payload.rental?.rental_group_uuid || payload.rental_group_uuid || null, payload.offline_uuid]
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

async function getSyncStatus() {
  const [countsRes, lastSyncedRes] = await Promise.all([
    db.query(`
      SELECT status, COUNT(*)::int AS count
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

  return {
    configured: Boolean(config.SYNC_SERVER_URL),
    target: config.IS_SYNC_TARGET,
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
          payload: op.payload,
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0, 500));
      await db.query("UPDATE sync_queue SET status = 'synced', synced_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = $1", [op.id]);
      result.synced += 1;
    } catch (err) {
      await db.query(
        "UPDATE sync_queue SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1",
        [op.id, err.message]
      );
      result.failed += 1;
    }
  }

  for (const op of localRows) {
    try {
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
          payload: op.payload,
        }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text.slice(0, 500));
      offlineStore.markSynced(op.id);
      result.synced += 1;
    } catch (err) {
      offlineStore.markFailed(op.id, err.message);
      result.failed += 1;
    }
  }

  await pruneSyncedQueue();
  if (config.IS_BRANCH_MODE && !config.IS_SYNC_TARGET && offlineStore?.pruneSynced) {
    offlineStore.pruneSynced(config.SYNC_QUEUE_RETENTION_DAYS);
  }

  return result;
}

module.exports = {
  applyOperation,
  getSyncStatus,
  runSync,
  pruneSyncedQueue,
};
