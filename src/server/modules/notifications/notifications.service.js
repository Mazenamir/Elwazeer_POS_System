const db = require('../../database/connection');
const config = require('../../config/env');
const syncService = require('../sync/sync.service');

// In-memory branch heartbeat cache: branch_id -> { lastSeen: number (ms), isOnline: boolean, meta: object }
const branchHeartbeats = new Map();
let tablesInitialized = false;

// Heartbeat timeout threshold in milliseconds (90 seconds)
const DISCONNECT_THRESHOLD_MS = 90 * 1000;

async function ensureTables() {
  if (tablesInitialized) return;
  try {
    if (config.IS_BRANCH_MODE) {
      if (db.sqlite) {
        db.sqlite.exec(`
          CREATE TABLE IF NOT EXISTS notification_reads (
            notification_id TEXT PRIMARY KEY,
            user_id INTEGER,
            read_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_dismissed INTEGER DEFAULT 0
          );
          CREATE TABLE IF NOT EXISTS branch_heartbeats (
            branch_id INTEGER PRIMARY KEY,
            last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP,
            is_online INTEGER DEFAULT 1,
            meta TEXT
          );
        `);
        try {
          db.sqlite.exec(`ALTER TABLE notification_reads ADD COLUMN is_dismissed INTEGER DEFAULT 0`);
        } catch (_) {}
        try {
          db.sqlite.exec(`ALTER TABLE stock_transfers ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`);
        } catch (_) {}
      }
    } else {
      await db.query(`
        CREATE TABLE IF NOT EXISTS notification_reads (
          notification_id VARCHAR(255) PRIMARY KEY,
          user_id INTEGER,
          read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_dismissed BOOLEAN DEFAULT FALSE
        );
        CREATE TABLE IF NOT EXISTS branch_heartbeats (
          branch_id INTEGER PRIMARY KEY,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_online BOOLEAN DEFAULT TRUE,
          meta TEXT
        );
      `);
      try {
        await db.query(`ALTER TABLE notification_reads ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN DEFAULT FALSE`);
      } catch (_) {}
      try {
        await db.query(`ALTER TABLE stock_transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      } catch (_) {}
    }
    tablesInitialized = true;
  } catch (err) {
    console.warn('[Notifications] ensureTables warning:', err.message);
  }
}

/**
 * Record a heartbeat/ping from a branch.
 */
async function recordHeartbeat(branchId, status = 'online', meta = {}) {
  const numericId = Number(branchId);
  if (!numericId || isNaN(numericId)) return;

  const isOnline = status === 'online';
  const now = Date.now();

  branchHeartbeats.set(numericId, {
    lastSeen: now,
    isOnline,
    meta,
  });

  try {
    await ensureTables();
    if (config.IS_BRANCH_MODE) {
      if (db.sqlite) {
        const stmt = db.sqlite.prepare(`
          INSERT INTO branch_heartbeats (branch_id, last_seen_at, is_online, meta)
          VALUES (?, datetime('now', 'localtime'), ?, ?)
          ON CONFLICT (branch_id) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            is_online = excluded.is_online,
            meta = excluded.meta
        `);
        stmt.run(numericId, isOnline ? 1 : 0, JSON.stringify(meta));

        // When branch comes back online, clear stale disconnect read status
        if (isOnline) {
          try {
            db.sqlite.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(`branch-disconnect-${numericId}`);
          } catch (_) {}
        }
      }
    } else {
      await db.query(
        `INSERT INTO branch_heartbeats (branch_id, last_seen_at, is_online, meta)
         VALUES ($1, CURRENT_TIMESTAMP, $2, $3)
         ON CONFLICT (branch_id) DO UPDATE SET
           last_seen_at = CURRENT_TIMESTAMP,
           is_online = EXCLUDED.is_online,
           meta = EXCLUDED.meta`,
        [numericId, isOnline, JSON.stringify(meta)]
      );

      // When branch comes back online, clear stale disconnect read status
      if (isOnline) {
        try {
          await db.query('DELETE FROM notification_reads WHERE notification_id = $1', [`branch-disconnect-${numericId}`]);
        } catch (_) {}
      }
    }
  } catch (e) {
    // Non-fatal if DB is momentarily busy
  }
}

function formatItemQtyArabic(itemName, quantity) {
  if (!quantity) return ` (${itemName})`;
  if (quantity === 1) return ` (${itemName} - قطعة واحدة)`;
  if (quantity === 2) return ` (${itemName} - قطعتان)`;
  return ` (${itemName} - ${quantity} قطعة)`;
}

/**
 * Gather all notifications for the active user/context.
 */
async function getNotifications(user = null) {
  await ensureTables();

  let notifications = [];
  const nowMs = Date.now();

  // 1. BRANCH CONNECTIVITY ALERTS
  try {
    if (config.IS_BRANCH_MODE) {
      const activeBranchId = Number(config.BRANCH_ID || 1);
      let branchName = 'الفرع';
      try {
        const branchRes = await db.query('SELECT name FROM branches WHERE id = $1', [activeBranchId]);
        if (branchRes.rows && branchRes.rows[0]) {
          branchName = branchRes.rows[0].name;
        }
      } catch (_) {}

      let isConnected = true;
      try {
        const status = await syncService.getSyncStatus();
        if (status && status.online === false) {
          isConnected = false;
        }
      } catch (_) {
        isConnected = false;
      }

      if (!isConnected) {
        notifications.push({
          id: `branch-disconnect-${activeBranchId}`,
          type: 'branch_connectivity',
          category: 'branch',
          severity: 'warning',
          title: 'انقطاع اتصال فرع',
          message: `⚠️ انقطع اتصال فرع [${branchName}] بالإنترنت`,
          timestamp: new Date().toISOString(),
          metadata: {
            branch_id: activeBranchId,
            branch_name: branchName,
            is_online: false,
          },
        });
      } else {
        // Connected: clear stale disconnect read record so future disconnects will alert fresh
        try {
          if (db.sqlite) {
            db.sqlite.prepare('DELETE FROM notification_reads WHERE notification_id = ?').run(`branch-disconnect-${activeBranchId}`);
          }
        } catch (_) {}
      }
    } else {
      // In Master mode, evaluate connectivity of all non-central branches
      const branchesRes = await db.query('SELECT id, name, is_main_warehouse FROM branches ORDER BY id ASC');
      const branches = branchesRes.rows || [];

      // Query persisted heartbeats from DB to refresh cache
      try {
        const hbRes = await db.query('SELECT branch_id, last_seen_at, is_online FROM branch_heartbeats');
        for (const row of hbRes.rows || []) {
          const bId = Number(row.branch_id);
          const dbTime = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
          const existing = branchHeartbeats.get(bId);
          if (!existing || dbTime >= existing.lastSeen) {
            branchHeartbeats.set(bId, {
              lastSeen: dbTime,
              isOnline: Boolean(row.is_online),
            });
          }
        }
      } catch (_) {}

      for (const branch of branches) {
        // Skip central main warehouse itself
        if (branch.is_main_warehouse || branch.id === 1) continue;

        const hb = branchHeartbeats.get(Number(branch.id));
        const lastSeen = hb?.lastSeen || null;
        const isFresh = lastSeen && (nowMs - lastSeen < DISCONNECT_THRESHOLD_MS);
        const isOnline = isFresh && hb?.isOnline !== false;

        if (!isOnline) {
          notifications.push({
            id: `branch-disconnect-${branch.id}`,
            type: 'branch_connectivity',
            category: 'branch',
            severity: 'warning',
            title: 'انقطاع اتصال فرع',
            message: `⚠️ انقطع اتصال فرع [${branch.name}] بالإنترنت`,
            timestamp: lastSeen ? new Date(lastSeen).toISOString() : new Date().toISOString(),
            metadata: {
              branch_id: branch.id,
              branch_name: branch.name,
              last_seen: lastSeen ? new Date(lastSeen).toISOString() : null,
              is_online: false,
            },
          });
        } else {
          // Branch is healthy and online: purge past disconnect read record
          try {
            await db.query('DELETE FROM notification_reads WHERE notification_id = $1', [`branch-disconnect-${branch.id}`]);
          } catch (_) {}
        }
      }
    }
  } catch (branchErr) {
    console.error('[Notifications] Branch check error:', branchErr);
  }

  // 2. INTER-BRANCH STOCK TRANSFERS
  try {
    let transferQuery = `
      SELECT st.id, st.inventory_id, st.from_branch_id, st.to_branch_id, st.quantity,
             st.transfer_date, st.status,
             COALESCE(st.updated_at, st.transfer_date) AS event_date,
             i.name AS inventory_name, i.barcode AS inventory_barcode,
             b_from.name AS from_branch_name, b_to.name AS to_branch_name
      FROM stock_transfers st
      LEFT JOIN inventory i ON st.inventory_id = i.id
      LEFT JOIN branches b_from ON st.from_branch_id = b_from.id
      LEFT JOIN branches b_to ON st.to_branch_id = b_to.id
    `;
    const params = [];

    // Branch scoping: if user belongs to a specific branch and is not admin
    const effectiveBranchId = user?.branch_id || (config.IS_BRANCH_MODE ? config.BRANCH_ID : null);
    if (effectiveBranchId && user?.role !== 'admin' && String(effectiveBranchId) !== 'all') {
      transferQuery += ` WHERE (st.from_branch_id = $1 OR st.to_branch_id = $1) `;
      params.push(effectiveBranchId);
    }

    transferQuery += ` ORDER BY st.id DESC LIMIT 40`;
    const transfersRes = await db.query(transferQuery, params);

    for (const st of transfersRes.rows || []) {
      const fromName = st.from_branch_name || `فرع #${st.from_branch_id}`;
      const toName = st.to_branch_name || `فرع #${st.to_branch_id}`;
      const itemName = st.inventory_name || 'بضاعة';
      const qtyText = formatItemQtyArabic(itemName, st.quantity);
      const eventTimestamp = st.event_date ? new Date(st.event_date).toISOString() : new Date().toISOString();

      if (st.status === 'pending' || st.status === 'requested') {
        notifications.push({
          id: `transfer-pending-${st.id}`,
          type: 'stock_transfer',
          category: 'transfer',
          severity: 'info',
          title: 'تحويل بضاعة',
          message: `📦 تحويل بضاعة: قام فرع [${fromName}] بإرسال شحنة إلى فرع [${toName}]${qtyText}`,
          timestamp: eventTimestamp,
          metadata: {
            transfer_id: st.id,
            from_branch_id: st.from_branch_id,
            from_branch_name: fromName,
            to_branch_id: st.to_branch_id,
            to_branch_name: toName,
            item_name: itemName,
            quantity: st.quantity,
            status: st.status,
          },
        });
      } else if (st.status === 'received' || st.status === 'completed') {
        notifications.push({
          id: `transfer-received-${st.id}`,
          type: 'stock_transfer',
          category: 'transfer',
          severity: 'success',
          title: 'استلام شحنة',
          message: `✅ استلام شحنة: أكد فرع [${toName}] استلام الشحنة المحولة من [${fromName}]${qtyText}`,
          timestamp: eventTimestamp,
          metadata: {
            transfer_id: st.id,
            from_branch_id: st.from_branch_id,
            from_branch_name: fromName,
            to_branch_id: st.to_branch_id,
            to_branch_name: toName,
            item_name: itemName,
            quantity: st.quantity,
            status: st.status,
          },
        });
      } else if (st.status === 'rejected') {
        notifications.push({
          id: `transfer-rejected-${st.id}`,
          type: 'stock_transfer',
          category: 'transfer',
          severity: 'warning',
          title: 'رفض طلب بضاعة',
          message: `❌ تم رفض طلب التحويل من فرع [${fromName}] إلى فرع [${toName}]${qtyText}`,
          timestamp: eventTimestamp,
          metadata: {
            transfer_id: st.id,
            from_branch_id: st.from_branch_id,
            from_branch_name: fromName,
            to_branch_id: st.to_branch_id,
            to_branch_name: toName,
            item_name: itemName,
            quantity: st.quantity,
            status: st.status,
          },
        });
      }
    }
  } catch (transErr) {
    console.error('[Notifications] Transfer query error:', transErr);
  }

  // 3. LOW-STOCK INVENTORY ALERTS
  try {
    let lowStockQuery;
    const lowStockParams = [];

    if (config.IS_BRANCH_MODE) {
      const bId = Number(config.BRANCH_ID || 1);
      lowStockQuery = `
        SELECT i.id AS inventory_id, ${bId} AS branch_id,
               COALESCE(ib.stock_level, i.stock_level, 0) AS stock_level,
               i.name AS inventory_name, i.min_stock_level,
               b.name AS branch_name
        FROM inventory i
        LEFT JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = ${bId}
        LEFT JOIN branches b ON b.id = ${bId}
        WHERE COALESCE(ib.stock_level, i.stock_level, 0) <= COALESCE(i.min_stock_level, 5)
          AND (i.is_deleted IS NULL OR NOT i.is_deleted)
        ORDER BY stock_level ASC LIMIT 15
      `;
    } else {
      lowStockQuery = `
        SELECT ib.inventory_id, ib.branch_id, ib.stock_level,
               i.name AS inventory_name, i.min_stock_level,
               b.name AS branch_name
        FROM inventory_branches ib
        JOIN inventory i ON ib.inventory_id = i.id
        LEFT JOIN branches b ON ib.branch_id = b.id
        WHERE ib.stock_level <= COALESCE(i.min_stock_level, 5)
          AND (i.is_deleted IS NULL OR NOT i.is_deleted)
      `;
      if (user && user.branch_id && user.role !== 'admin' && String(user.branch_id) !== 'all') {
        lowStockQuery += ` AND ib.branch_id = $1 `;
        lowStockParams.push(user.branch_id);
      }
      lowStockQuery += ` ORDER BY ib.stock_level ASC LIMIT 15`;
    }

    const lowStockRes = await db.query(lowStockQuery, lowStockParams);

    for (const row of lowStockRes.rows || []) {
      const bName = row.branch_name || `فرع #${row.branch_id}`;
      notifications.push({
        id: `low-stock-${row.branch_id}-${row.inventory_id}`,
        type: 'inventory_alert',
        category: 'inventory',
        severity: 'warning',
        title: 'تنبيه نقص مخزون',
        message: `⚠️ تنبيه مخزون: الصنف [${row.inventory_name}] قارب على النفاد في فرع [${bName}] (${row.stock_level} قطعة متبقية)`,
        timestamp: new Date().toISOString(),
        metadata: {
          inventory_id: row.inventory_id,
          inventory_name: row.inventory_name,
          branch_id: row.branch_id,
          branch_name: bName,
          stock_level: row.stock_level,
        },
      });
    }
  } catch (stockErr) {
    console.error('[Notifications] Low stock query error:', stockErr);
  }

  // 4. READ & DISMISSAL STATUS RESOLUTION
  try {
    const readsRes = await db.query('SELECT notification_id, is_dismissed FROM notification_reads');
    const readSet = new Set();
    const dismissedSet = new Set();

    for (const r of readsRes.rows || []) {
      readSet.add(r.notification_id);
      if (r.is_dismissed === true || r.is_dismissed === 1 || r.is_dismissed === '1') {
        dismissedSet.add(r.notification_id);
      }
    }

    // Filter out dismissed notifications
    notifications = notifications.filter((n) => !dismissedSet.has(n.id));

    // Assign read status
    notifications.forEach((n) => {
      n.read = readSet.has(n.id);
    });
  } catch (readErr) {
    console.error('[Notifications] Read status check error:', readErr);
  }

  // Sort: unread first, then by timestamp (newest first)
  notifications.sort((a, b) => {
    if (a.read !== b.read) {
      return a.read ? 1 : -1;
    }
    const tA = new Date(a.timestamp || 0).getTime();
    const tB = new Date(b.timestamp || 0).getTime();
    return tB - tA;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const stats = {
    total: notifications.length,
    unread: unreadCount,
    branches: notifications.filter((n) => n.category === 'branch').length,
    transfers: notifications.filter((n) => n.category === 'transfer').length,
    inventory: notifications.filter((n) => n.category === 'inventory').length,
  };

  return {
    notifications,
    unreadCount,
    stats,
  };
}

/**
 * Mark specified notification IDs (or all) as read.
 */
async function markAsRead({ ids = [], all = false, userId = null, user = null } = {}) {
  await ensureTables();

  let targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];

  if (all) {
    const current = await getNotifications(user);
    targetIds = (current.notifications || []).map((n) => n.id);
  }

  if (targetIds.length === 0) {
    return { success: true, count: 0 };
  }

  for (const notifId of targetIds) {
    try {
      if (config.IS_BRANCH_MODE) {
        if (db.sqlite) {
          const stmt = db.sqlite.prepare(`
            INSERT INTO notification_reads (notification_id, user_id, read_at, is_dismissed)
            VALUES (?, ?, datetime('now', 'localtime'), 0)
            ON CONFLICT (notification_id) DO UPDATE SET
              read_at = datetime('now', 'localtime'),
              user_id = COALESCE(excluded.user_id, notification_reads.user_id)
          `);
          stmt.run(notifId, userId || null);
        }
      } else {
        await db.query(
          `INSERT INTO notification_reads (notification_id, user_id, read_at, is_dismissed)
           VALUES ($1, $2, CURRENT_TIMESTAMP, FALSE)
           ON CONFLICT (notification_id) DO UPDATE SET
             read_at = CURRENT_TIMESTAMP,
             user_id = COALESCE(EXCLUDED.user_id, notification_reads.user_id)`,
          [notifId, userId || null]
        );
      }
    } catch (_) {}
  }

  return { success: true, count: targetIds.length };
}

/**
 * Clear specified notification IDs (or all) by marking them dismissed.
 */
async function clearNotifications({ ids = [], all = false, userId = null, user = null } = {}) {
  await ensureTables();

  let targetIds = Array.isArray(ids) ? ids.filter(Boolean) : [];

  if (all) {
    const current = await getNotifications(user);
    targetIds = (current.notifications || []).map((n) => n.id);
  }

  if (targetIds.length === 0) {
    return { success: true, count: 0 };
  }

  for (const notifId of targetIds) {
    try {
      if (config.IS_BRANCH_MODE) {
        if (db.sqlite) {
          const stmt = db.sqlite.prepare(`
            INSERT INTO notification_reads (notification_id, user_id, read_at, is_dismissed)
            VALUES (?, ?, datetime('now', 'localtime'), 1)
            ON CONFLICT (notification_id) DO UPDATE SET
              is_dismissed = 1,
              read_at = datetime('now', 'localtime')
          `);
          stmt.run(notifId, userId || null);
        }
      } else {
        await db.query(
          `INSERT INTO notification_reads (notification_id, user_id, read_at, is_dismissed)
           VALUES ($1, $2, CURRENT_TIMESTAMP, TRUE)
           ON CONFLICT (notification_id) DO UPDATE SET
             is_dismissed = TRUE,
             read_at = CURRENT_TIMESTAMP`,
          [notifId, userId || null]
        );
      }
    } catch (_) {}
  }

  return { success: true, count: targetIds.length };
}

module.exports = {
  recordHeartbeat,
  getNotifications,
  markAsRead,
  clearNotifications,
  ensureTables,
  DISCONNECT_THRESHOLD_MS,
};
