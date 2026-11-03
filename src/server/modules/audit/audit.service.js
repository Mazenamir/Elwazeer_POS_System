/**
 * Elwazeer POS System — Audit Logging Service
 * Records security-sensitive operations, approvals, and mutations
 * Thread-safe, non-blocking, append-only, sanitized (never records passwords or tokens)
 */

const db = require('../../database/connection');
const config = require('../../config/env');

async function log({
  userId = null,
  username = null,
  action,
  resourceType = null,
  resourceId = null,
  branchId = null,
  outcome = 'success',
  details = null,
  ipAddress = null,
}) {
  if (!action) return;

  // Sanitize details to guarantee no credentials or sensitive tokens are stored
  let safeDetails = null;
  if (details && typeof details === 'object') {
    const copy = { ...details };
    delete copy.password;
    delete copy.password_hash;
    delete copy.current_password;
    delete copy.new_password;
    delete copy.confirm_password;
    delete copy.token;
    delete copy.approval_token;
    delete copy.approvalToken;
    delete copy.invoice_edit_password;
    delete copy.profit_password;
    delete copy.return_password;
    delete copy.inventory_password;
    delete copy.salary_password;
    safeDetails = copy;
  } else if (typeof details === 'string') {
    safeDetails = { message: details };
  }

  const cleanAction = String(action).slice(0, 100);
  const cleanOutcome = outcome === 'failure' ? 'failure' : 'success';
  const cleanUser = username ? String(username).slice(0, 100) : null;
  const cleanIp = ipAddress ? String(ipAddress).slice(0, 100) : null;
  const cleanResType = resourceType ? String(resourceType).slice(0, 100) : null;
  const cleanResId = resourceId !== null && resourceId !== undefined ? String(resourceId).slice(0, 100) : null;
  const cleanBranchId = branchId && Number(branchId) > 0 ? Number(branchId) : null;

  try {
    if (config.IS_BRANCH_MODE) {
      if (!db.sqlite) return;
      db.sqlite.prepare(`
        INSERT INTO audit_logs (
          user_id, username, action, resource_type, resource_id,
          branch_id, outcome, details, ip_address, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `).run(
        userId || null,
        cleanUser,
        cleanAction,
        cleanResType,
        cleanResId,
        cleanBranchId,
        cleanOutcome,
        safeDetails ? JSON.stringify(safeDetails) : null,
        cleanIp
      );
      return;
    }

    try {
      await db.query(`
        INSERT INTO audit_logs (
          user_id, username, action, resource_type, resource_id,
          branch_id, outcome, details, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        userId || null,
        cleanUser,
        cleanAction,
        cleanResType,
        cleanResId,
        cleanBranchId,
        cleanOutcome,
        safeDetails ? JSON.stringify(safeDetails) : null,
        cleanIp,
      ]);
    } catch (pgErr) {
      if (pgErr.code === '23503' && userId) {
        // Fallback: log with user_id = null if foreign key is not present in users table
        await db.query(`
          INSERT INTO audit_logs (
            user_id, username, action, resource_type, resource_id,
            branch_id, outcome, details, ip_address
          ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          cleanUser,
          cleanAction,
          cleanResType,
          cleanResId,
          cleanBranchId,
          cleanOutcome,
          safeDetails ? JSON.stringify(safeDetails) : null,
          cleanIp,
        ]);
        return;
      }
      throw pgErr;
    }
  } catch (err) {
    // Non-blocking: audit failure should never abort the main transaction
    console.error('Failed to write audit log:', err.message);
  }
}

async function listAuditLogs(query = {}) {
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);

  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT * FROM audit_logs
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    return rows.map((r) => {
      let detailsObj = null;
      if (r.details) {
        try { detailsObj = JSON.parse(r.details); } catch {}
      }
      return { ...r, details: detailsObj };
    });
  }

  const { rows } = await db.query(`
    SELECT * FROM audit_logs
    ORDER BY id DESC
    LIMIT $1 OFFSET $2
  `, [limit, offset]);

  return rows.map((r) => {
    let detailsObj = r.details;
    if (typeof detailsObj === 'string') {
      try { detailsObj = JSON.parse(detailsObj); } catch {}
    }
    return { ...r, details: detailsObj };
  });
}

module.exports = {
  log,
  listAuditLogs,
};
