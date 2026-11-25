const bcrypt = require('bcryptjs');
const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { normalizePermissions, defaultPermissionsForRole, hasPermission } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, getMonthRange, getMonthKey, getDatabaseCairoNow, addDays } = require('../../../shared/utils/date');
const { likePattern, newUuid } = require('../../../shared/utils/string');
const { clampInt } = require('../../../shared/utils/numbers');
const { sanitizeDate, sanitizeTime } = require('../../../shared/utils/sanitize');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { queueSyncOperation } = require('../../database/sync.helpers');
const { hasBranchAccess, getUserAuthorizedBranchIds } = require('../../middleware/branchScope.middleware');
const {
  getPreviousMonthKey,
  calculateEmployeeMonthlyPayroll,
  computeAttendanceMetrics,
  computeWorkedHours,
  normalizeTimeString,
  numOrNull,
  boolOrNull,
} = require('./payroll.calculator');

function parseBranchIds(raw) {
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeEmployeeBranchScope(scope, branchIds, primaryBranchId) {
  const cleanScope = (scope === 'all' || scope === 'selected') ? scope : 'single';
  if (cleanScope !== 'selected') {
    return { branch_scope: cleanScope, branch_ids: [] };
  }
  const set = new Set(parseBranchIds(branchIds));
  if (primaryBranchId && Number(primaryBranchId) > 0) set.add(Number(primaryBranchId));
  return { branch_scope: 'selected', branch_ids: Array.from(set) };
}

function hasEmployeeBranchAccess(user, employee) {
  if (!user || !employee) return false;
  if (user.role === 'admin' || user.branch_scope === 'all' || user.role === 'accountant') return true;
  if (employee.branch_scope === 'all') return true;
  if (hasBranchAccess(user, employee.branch_id)) return true;
  if (employee.branch_scope === 'selected') {
    const empBranchIds = parseBranchIds(employee.branch_ids);
    return empBranchIds.some((bId) => hasBranchAccess(user, bId));
  }
  return false;
}

function buildEmployeeBranchFilterSql(targetBranchIds, params) {
  const ids = (Array.isArray(targetBranchIds) ? targetBranchIds : [targetBranchIds])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) {
    params.push(-999);
    return `e.branch_id = $${params.length}`;
  }
  if (ids.length === 1) {
    const id = ids[0];
    if (config.IS_BRANCH_MODE) {
      params.push(id);
      const pIdx = params.length;
      return `(e.branch_id = $${pIdx} OR e.branch_scope = 'all' OR (e.branch_scope = 'selected' AND EXISTS (SELECT 1 FROM json_each(COALESCE(e.branch_ids, '[]')) WHERE CAST(value AS INTEGER) = $${pIdx})))`;
    }
    params.push(id);
    const pIdx = params.length;
    params.push(JSON.stringify([id]));
    const jsonIdx = params.length;
    return `(e.branch_id = $${pIdx} OR e.branch_scope = 'all' OR (e.branch_scope = 'selected' AND e.branch_ids @> $${jsonIdx}::jsonb))`;
  }
  if (config.IS_BRANCH_MODE) {
    const placeholders = ids.map((id) => {
      params.push(id);
      return `$${params.length}`;
    }).join(', ');
    return `(e.branch_id IN (${placeholders}) OR e.branch_scope = 'all' OR (e.branch_scope = 'selected' AND EXISTS (SELECT 1 FROM json_each(COALESCE(e.branch_ids, '[]')) WHERE CAST(value AS INTEGER) IN (${placeholders}))))`;
  }
  params.push(ids);
  const pIdx = params.length;
  return `(e.branch_id = ANY($${pIdx}) OR e.branch_scope = 'all' OR (e.branch_scope = 'selected' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(e.branch_ids, '[]'::jsonb)) AS bid WHERE bid::int = ANY($${pIdx}))))`;
}

async function getEmployeeOptions(query = {}, user = null) {
  const { date: todayDate } = getCairoDateTimeParts();
  const params = [todayDate];
  const where = [];
  if (query.include_inactive !== 'true') {
    where.push("COALESCE(e.status, 'active') = 'active'");
  }

  if (user && user.role !== 'admin') {
    const authBranchIds = getUserAuthorizedBranchIds(user);
    if (query.branch_id && query.branch_id !== 'all') {
      const targetBId = Number(query.branch_id);
      if (authBranchIds === null || authBranchIds.includes(targetBId)) {
        params.push(targetBId);
        where.push(`e.branch_id = $${params.length}`);
      } else {
        params.push(-999);
        where.push(`e.branch_id = $${params.length}`);
      }
    } else if (authBranchIds !== null) {
      if (authBranchIds.length > 0) {
        if (authBranchIds.length === 1) {
          params.push(authBranchIds[0]);
          where.push(`e.branch_id = $${params.length}`);
        } else {
          params.push(authBranchIds);
          where.push(`e.branch_id = ANY($${params.length})`);
        }
      } else if (user.branch_id) {
        params.push(user.branch_id);
        where.push(`e.branch_id = $${params.length}`);
      }
    }
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(e.name ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
  }

  const limit = clampInt(query.limit, 200, 10, 5000);
  params.push(limit);
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT e.id, e.name, e.branch_id, a.check_in as today_check_in, a.check_out as today_check_out
     FROM employees e
     LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $1
     ${whereClause}
     ORDER BY e.name, e.id
     LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function getActiveSellers(query = {}, user = null) {
  const { date: todayDate } = getCairoDateTimeParts();
  const params = [todayDate];
  const where = [
    "COALESCE(e.status, 'active') = 'active'",
    'a.check_in IS NOT NULL',
    'a.check_out IS NULL',
  ];

  if (user && user.role !== 'admin') {
    const authBranchIds = getUserAuthorizedBranchIds(user);
    if (query.branch_id && query.branch_id !== 'all') {
      const targetBId = Number(query.branch_id);
      if (authBranchIds === null || authBranchIds.includes(targetBId)) {
        params.push(targetBId);
        where.push(`e.branch_id = $${params.length}`);
      } else {
        params.push(-999);
        where.push(`e.branch_id = $${params.length}`);
      }
    } else if (authBranchIds !== null) {
      if (authBranchIds.length > 0) {
        if (authBranchIds.length === 1) {
          params.push(authBranchIds[0]);
          where.push(`e.branch_id = $${params.length}`);
        } else {
          params.push(authBranchIds);
          where.push(`e.branch_id = ANY($${params.length})`);
        }
      } else if (user.branch_id) {
        params.push(user.branch_id);
        where.push(`e.branch_id = $${params.length}`);
      }
    }
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(e.name ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT e.id, e.name, e.position, e.branch_id, b.name as branch_name,
            a.check_in as today_check_in, a.check_out as today_check_out
     FROM employees e
     JOIN attendance a ON a.employee_id = e.id AND a.date = $1
     LEFT JOIN branches b ON b.id = e.branch_id
     ${whereClause}
     ORDER BY e.name ASC, e.id ASC`,
    params
  );
  return rows;
}

async function getCheckoutReminders(branchId, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const params = [];
  const where = [
    'a.check_in IS NOT NULL',
    'a.check_out IS NULL',
    'e.shift_end IS NOT NULL',
    `a.date >= ${CAIRO_DATE_SQL} - INTERVAL '1 day'`,
  ];

  if (isBranchUser && user.branch_scope !== 'all' && user.role !== 'accountant') {
    if (branchId && branchId !== 'all' && hasBranchAccess(user, branchId)) {
      params.push(Number(branchId));
      where.push(`e.branch_id = $${params.length}`);
    } else {
      params.push(user.branch_id);
      where.push(`e.branch_id = $${params.length}`);
    }
  } else if (branchId && branchId !== 'all') {
    params.push(branchId);
    where.push(`e.branch_id = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(`
    SELECT
      e.id,
      e.name,
      e.position,
      e.branch_id,
      b.name AS branch_name,
      e.shift_start,
      e.shift_end,
      TO_CHAR(a.date, 'YYYY-MM-DD') AS attendance_date,
      a.check_in,
      a.check_out
    FROM employees e
    JOIN attendance a ON a.employee_id = e.id
    LEFT JOIN branches b ON b.id = e.branch_id
    ${whereClause}
    ORDER BY a.date ASC, e.name ASC, e.id ASC
  `, params);

  const nowParts = getCairoDateTimeParts();
  const nowMs = Date.now();
  const reminders = [];

  for (const r of rows) {
    if (!r.shift_end) continue;
    const attDate = r.attendance_date || '';
    let dueDateStr = attDate;
    if (r.shift_start && r.shift_end < r.shift_start) {
      dueDateStr = addDays(attDate, 1);
    }
    const dueIso = `${dueDateStr}T${r.shift_end}:00`;
    const dueMs = new Date(dueIso).getTime();
    if (!isNaN(dueMs) && dueMs <= nowMs) {
      const overdueMinutes = Math.max(0, Math.floor((nowMs - dueMs) / 60000));
      reminders.push({
        ...r,
        shift_due_at: dueIso,
        overdue_minutes: overdueMinutes,
      });
    }
  }

  reminders.sort((a, b) => (a.shift_due_at || '').localeCompare(b.shift_due_at || '') || (a.name || '').localeCompare(b.name || '', 'ar'));
  return { reminders };
}

async function listEmployees(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 100, 10000, true);
  const { date: todayDate } = getCairoDateTimeParts();
  const selectedMonth = query.month && /^\d{4}-\d{2}$/.test(query.month)
    ? query.month
    : todayDate.substring(0, 7);
  const monthRange = getMonthRange(selectedMonth);

  const whereParams = [];
  const where = [];

  if (user && user.role !== 'admin') {
    const authBranchIds = getUserAuthorizedBranchIds(user);
    if (query.branch_id && query.branch_id !== 'all') {
      const targetBId = Number(query.branch_id);
      if (authBranchIds === null || authBranchIds.includes(targetBId)) {
        where.push(buildEmployeeBranchFilterSql(targetBId, whereParams));
      } else {
        whereParams.push(-999);
        where.push(`e.branch_id = $${whereParams.length}`);
      }
    } else if (authBranchIds !== null) {
      if (authBranchIds.length > 0) {
        where.push(buildEmployeeBranchFilterSql(authBranchIds, whereParams));
      } else if (user.branch_id) {
        where.push(buildEmployeeBranchFilterSql(user.branch_id, whereParams));
      }
    }
  } else if (query.branch_id && query.branch_id !== 'all') {
    where.push(buildEmployeeBranchFilterSql(query.branch_id, whereParams));
  }

  if (query.search) {
    whereParams.push(likePattern(query.search));
    where.push(`(e.name ILIKE $${whereParams.length} OR e.phone ILIKE $${whereParams.length})`);
  }
  if (query.name) {
    whereParams.push(likePattern(query.name));
    where.push(`e.name ILIKE $${whereParams.length}`);
  }
  if (query.position) {
    whereParams.push(likePattern(query.position));
    where.push(`e.position ILIKE $${whereParams.length}`);
  }
  if (query.phone) {
    whereParams.push(likePattern(query.phone));
    where.push(`e.phone ILIKE $${whereParams.length}`);
  }
  if (query.status === 'active' || query.status === 'inactive') {
    whereParams.push(query.status);
    where.push(`COALESCE(e.status, 'active') = $${whereParams.length}`);
  }

  const countWhereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const countQuery = `SELECT COUNT(*)::int as total FROM employees e ${countWhereClause}`;

  // Shift where parameter indices by 3 for selectQuery ($1=todayDate, $2=monthStart, $3=monthEnd)
  const selectWhere = where.map((clause) =>
    clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 3}`)
  );
  const selectWhereClause = selectWhere.length ? `WHERE ${selectWhere.join(' AND ')}` : '';

  let selectQuery = `
    SELECT DISTINCT ON (e.id)
      e.*,
      b.name as branch_name,
      u.username,
      u.role as user_role,
      u.permissions as user_permissions,
      a.check_in as today_check_in,
      a.check_out as today_check_out,
      a.status as today_attendance_status,
      COALESCE((
        SELECT SUM(et.amount)
        FROM employee_transactions et
        WHERE et.employee_id = e.id
          AND et.type = 'bonus'
          AND et.transaction_date >= $2::date
          AND et.transaction_date < $3::date
      ), 0) AS current_month_bonuses,
      (
        SELECT COUNT(*)::int
        FROM employee_transactions et
        WHERE et.employee_id = e.id
          AND et.type = 'bonus'
          AND et.transaction_date >= $2::date
          AND et.transaction_date < $3::date
      ) AS current_month_bonus_count,
      (
        SELECT et.notes
        FROM employee_transactions et
        WHERE et.employee_id = e.id
          AND et.type = 'bonus'
          AND et.transaction_date >= $2::date
          AND et.transaction_date < $3::date
        ORDER BY et.transaction_date DESC, et.id DESC
        LIMIT 1
      ) AS latest_bonus_notes,
      (
        SELECT TO_CHAR(et.transaction_date, 'YYYY-MM-DD')
        FROM employee_transactions et
        WHERE et.employee_id = e.id
          AND et.type = 'bonus'
          AND et.transaction_date >= $2::date
          AND et.transaction_date < $3::date
        ORDER BY et.transaction_date DESC, et.id DESC
        LIMIT 1
      ) AS latest_bonus_date
    FROM employees e
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN users u ON u.employee_id = e.id AND u.role != 'admin'
    LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = $1
    ${selectWhereClause}
    ORDER BY e.id ASC
  `;

  const queryParams = [todayDate, monthRange.start, monthRange.end, ...whereParams];

  const enrichWithMonthlyPayroll = async (rows) => {
    if (!rows || rows.length === 0) return [];
    const canViewPayroll = !user || user.role === 'admin' || hasPermission(user, 'employees.payroll.view');
    const canEditEmp = !user || user.role === 'admin' || hasPermission(user, 'employees.edit');
    if (!canViewPayroll) {
      return rows.map((r) => ({
        ...r,
        branch_scope: r.branch_scope || 'single',
        branch_ids: parseBranchIds(r.branch_ids),
        master_basic_salary: canEditEmp ? Number(r.basic_salary || 0) : null,
        basic_salary: canEditEmp ? Number(r.basic_salary || 0) : null,
        has_basic_salary_override: false,
        current_month_bonus_count: 0,
        current_month_bonuses: 0,
        latest_bonus_notes: null,
        latest_bonus_date: null,
        current_month_advances: 0,
        current_month_deductions: 0,
        current_month_salary_payments: 0,
        current_month_work_days: null,
        current_month_earned_base: null,
        current_month_net_salary: null,
        current_month_remaining_balance: null,
        has_saved_adjustment: false,
      }));
    }
    const empIds = rows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0);
    if (empIds.length === 0) return rows;

    const idListSql = empIds.join(',');
    const currentCairoMonth = todayDate.substring(0, 7);
    const [attRes, txRes, adjRes, salesRes] = await Promise.all([
      db.query(
        `SELECT employee_id, status, notes, check_in, check_out, COALESCE(total_hours, 0) AS total_hours
         FROM attendance
         WHERE employee_id IN (${idListSql}) AND date >= $1::date AND date < $2::date`,
        [monthRange.start, monthRange.end]
      ),
      db.query(
        `SELECT employee_id, type, amount
         FROM employee_transactions
         WHERE employee_id IN (${idListSql}) AND transaction_date >= $1::date AND transaction_date < $2::date`,
        [monthRange.start, monthRange.end]
      ),
      db.query(
        `SELECT *
         FROM employee_payroll_adjustments
         WHERE employee_id IN (${idListSql}) AND month = $1`,
        [selectedMonth]
      ),
      db.query(
        `SELECT seller_id AS employee_id, COALESCE(SUM(total_amount), 0) AS total_sales
         FROM orders
         WHERE seller_id IN (${idListSql})
           AND order_date >= $1::date AND order_date < $2::date
           AND COALESCE(status, 'completed') NOT IN ('cancelled', 'canceled', 'returned', 'ملغاة', 'ملغي')
         GROUP BY seller_id`,
        [monthRange.start, monthRange.end]
      ),
    ]);

    const attByEmp = new Map();
    attRes.rows.forEach((row) => {
      const k = Number(row.employee_id);
      if (!attByEmp.has(k)) attByEmp.set(k, []);
      attByEmp.get(k).push(row);
    });
    const txByEmp = new Map();
    txRes.rows.forEach((row) => {
      const k = Number(row.employee_id);
      if (!txByEmp.has(k)) txByEmp.set(k, []);
      txByEmp.get(k).push(row);
    });
    const adjByEmp = new Map();
    adjRes.rows.forEach((row) => {
      adjByEmp.set(Number(row.employee_id), row);
    });
    const salesByEmp = new Map();
    salesRes.rows.forEach((row) => {
      salesByEmp.set(Number(row.employee_id), Number(row.total_sales || 0));
    });

    return rows.map((r) => {
      const k = Number(r.id);
      const calc = calculateEmployeeMonthlyPayroll({
        employee: r,
        month: selectedMonth,
        currentCairoMonth,
        attendanceRows: attByEmp.get(k) || [],
        transactionRows: txByEmp.get(k) || [],
        adjustment: adjByEmp.get(k) || null,
        monthlySalesAmount: salesByEmp.get(k) || 0,
      });
      const totalAdditionsForMonth = Math.round((calc.total_additions || 0) * 100) / 100;
      return {
        ...r,
        branch_scope: r.branch_scope || 'single',
        branch_ids: parseBranchIds(r.branch_ids),
        master_basic_salary: Number(r.basic_salary || 0),
        basic_salary: calc.basic_salary,
        has_basic_salary_override: calc.has_basic_salary_override,
        current_month_bonuses: totalAdditionsForMonth,
        current_month_advances: calc.advances,
        current_month_deductions: calc.deductions_without_advances,
        current_month_salary_payments: calc.salary_payments,
        current_month_work_days: calc.work_days,
        current_month_earned_base: calc.earned_base_salary,
        current_month_net_salary: calc.net_salary,
        current_month_remaining_balance: calc.remaining_balance,
        has_saved_adjustment: calc.has_saved_adjustment,
      };
    });
  };

  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, whereParams),
    ]);
    const enriched = await enrichWithMonthlyPayroll(dataRes.rows);
    return paginatedPayload(enriched, countRes.rows[0]?.total || 0, pagination);
  }

  const result = await db.query(selectQuery, queryParams);
  return enrichWithMonthlyPayroll(result.rows);
}

async function createEmployee(body, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  let {
    name,
    position,
    branch_id,
    branch_scope,
    branch_ids,
    basic_salary,
    commission_rate,
    phone,
    join_date,
    end_date,
    status,
    create_account,
    username,
    password,
    role,
    permissions,
    shift_start,
    shift_end,
  } = body || {};

  if (isBranchUser) {
    if (branch_id && hasBranchAccess(user, branch_id)) {
      // Authorized branch specified
    } else {
      branch_id = user.branch_id;
    }
  }

  let normalizedPerms = normalizePermissions(permissions);
  if (normalizedPerms.length === 0) normalizedPerms = defaultPermissionsForRole(role);

  const cleanCommissionRate = Number.isFinite(Number(commission_rate))
    ? Math.max(0, Math.min(100, Math.round(Number(commission_rate) * 100) / 100))
    : 0;

  const employee = await db.transaction(async (tx) => {
    const cairoNow = await getDatabaseCairoNow(tx);
    const cleanBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
    const scopeInfo = normalizeEmployeeBranchScope(branch_scope, branch_ids, cleanBranchId);
    const empUuid = body.offline_uuid || (require('crypto').randomUUID ? require('crypto').randomUUID() : ('emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)));
    const cleanStatus = status === 'inactive' ? 'inactive' : 'active';
    const cleanJoinDate = sanitizeDate(join_date) || cairoNow.date;
    const cleanEndDate = cleanStatus === 'inactive' ? (sanitizeDate(end_date) || cairoNow.date) : null;
    const cleanShiftStart = sanitizeTime(shift_start);
    const cleanShiftEnd = sanitizeTime(shift_end);
    const empResult = await tx.query(
      'INSERT INTO employees (name, position, branch_id, branch_scope, branch_ids, basic_salary, commission_rate, phone, join_date, end_date, status, shift_start, shift_end, offline_uuid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
      [name, position, cleanBranchId, scopeInfo.branch_scope, JSON.stringify(scopeInfo.branch_ids), basic_salary || 0, cleanCommissionRate, phone, cleanJoinDate, cleanEndDate, cleanStatus, cleanShiftStart, cleanShiftEnd, empUuid]
    );

    let createdUser = null;
    if (create_account && username && password) {
      const userCheck = await tx.query('SELECT id FROM users WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        const err = new Error('Username already exists');
        err.statusCode = 400;
        throw err;
      }

      const password_hash = await bcrypt.hash(password, 10);
      const uRes = await tx.query(
        'INSERT INTO users (username, password_hash, role, branch_id, permissions, employee_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [username, password_hash, role || 'branch_user', cleanBranchId, JSON.stringify(normalizedPerms), empResult.rows[0].id]
      );
      createdUser = uRes.rows?.[0] || null;
    }

    if (config.IS_BRANCH_MODE) {
      try {
        await queueSyncOperation(tx, null, 'employee', 'create', empResult.rows[0].id, cleanBranchId || user?.branch_id || 1, {
          ...empResult.rows[0],
          offline_uuid: empUuid,
        });
        if (createdUser) {
          await queueSyncOperation(tx, null, 'user', 'create', createdUser.id, cleanBranchId || user?.branch_id || 1, {
            id: createdUser.id,
            username: createdUser.username,
            password_hash: createdUser.password_hash,
            role: createdUser.role,
            branch_id: createdUser.branch_id,
            permissions: createdUser.permissions,
            employee_id: empResult.rows[0].id,
            employee_offline_uuid: empUuid,
            full_name: name,
          });
        }
      } catch (e) {
        console.warn('Failed to queue employee/user create sync:', e.message);
      }
    }

    return empResult.rows[0];
  });

  return employee;
}

async function updateEmployee(id, body, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  let {
    name,
    position,
    branch_id,
    branch_scope,
    branch_ids,
    basic_salary,
    commission_rate,
    phone,
    join_date,
    end_date,
    status,
    create_account,
    username,
    password,
    role,
    permissions,
    shift_start,
    shift_end,
  } = body || {};

  const employee = await db.transaction(async (tx) => {
    const existingRes = await tx.query('SELECT branch_id, branch_scope, branch_ids, status, end_date, commission_rate FROM employees WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }
    if (isBranchUser) {
      if (!hasBranchAccess(user, existingRes.rows[0].branch_id)) {
        const err = new Error('Unauthorized access to this employee');
        err.statusCode = 403;
        throw err;
      }
      if (branch_id && hasBranchAccess(user, branch_id)) {
        // Target branch authorized
      } else {
        branch_id = existingRes.rows[0].branch_id;
      }
    }

    const cleanBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
    const scopeInfo = normalizeEmployeeBranchScope(
      branch_scope !== undefined ? branch_scope : existingRes.rows[0].branch_scope,
      branch_ids !== undefined ? branch_ids : existingRes.rows[0].branch_ids,
      cleanBranchId
    );
    const nextStatus = status || existingRes.rows[0].status || 'active';
    const nextJoinDate = sanitizeDate(join_date);
    const nextEndDate = end_date !== undefined
      ? sanitizeDate(end_date)
      : (nextStatus === 'active' ? null : (sanitizeDate(existingRes.rows[0].end_date) || null));
    const nextShiftStart = sanitizeTime(shift_start);
    const nextShiftEnd = sanitizeTime(shift_end);
    const nextCommissionRate = commission_rate !== undefined && commission_rate !== null && commission_rate !== ''
      ? (Number.isFinite(Number(commission_rate)) ? Math.max(0, Math.min(100, Math.round(Number(commission_rate) * 100) / 100)) : 0)
      : Number(existingRes.rows[0].commission_rate || 0);

    const result = await tx.query(
      'UPDATE employees SET name = $1, position = $2, branch_id = $3, branch_scope = $4, branch_ids = $5, basic_salary = $6, commission_rate = $7, phone = $8, join_date = COALESCE($9, join_date), end_date = $10, status = $11, shift_start = $12, shift_end = $13 WHERE id = $14 RETURNING *',
      [name, position, cleanBranchId, scopeInfo.branch_scope, JSON.stringify(scopeInfo.branch_ids), basic_salary || 0, nextCommissionRate, phone, nextJoinDate, nextEndDate, nextStatus, nextShiftStart, nextShiftEnd, id]
    );

    if (result.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }

    const userCheck = await tx.query('SELECT id, username, role, branch_id, permissions FROM users WHERE employee_id = $1', [id]);
    const hasAccountFields = username !== undefined || role !== undefined || permissions !== undefined || Boolean(password);

    if (userCheck.rows.length > 0 && hasAccountFields) {
      const existingUser = userCheck.rows[0];
      const nextUsername = username || existingUser.username;
      const nextRole = role || existingUser.role || 'branch_user';
      const nextUserBranchId = branch_id !== undefined ? (cleanBranchId || null) : existingUser.branch_id;
      const nextPermsJson = permissions !== undefined
        ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions || []))
        : (typeof existingUser.permissions === 'string' ? existingUser.permissions : JSON.stringify(existingUser.permissions || []));

      let updateQuery = 'UPDATE users SET username = $1, role = $2, branch_id = $3, permissions = $4';
      const params = [nextUsername, nextRole, nextUserBranchId, nextPermsJson];

      let newPassHash = null;
      if (password) {
        newPassHash = await bcrypt.hash(password, 10);
        updateQuery += ', password_hash = $5 WHERE employee_id = $6';
        params.push(newPassHash, id);
      } else {
        updateQuery += ' WHERE employee_id = $5';
        params.push(id);
      }

      await tx.query(updateQuery, params);

      if (config.IS_BRANCH_MODE) {
        try {
          await queueSyncOperation(tx, null, 'user', 'update', existingUser.id, nextUserBranchId || user?.branch_id || 1, {
            id: existingUser.id,
            username: nextUsername,
            role: nextRole,
            branch_id: nextUserBranchId,
            permissions: nextPermsJson,
            employee_id: id,
            employee_offline_uuid: result.rows[0].offline_uuid,
            full_name: name || result.rows[0].name,
            ...(newPassHash ? { password_hash: newPassHash } : {}),
          });
        } catch (e) {
          console.warn('Failed to queue user update sync during employee update:', e.message);
        }
      }
    } else if (userCheck.rows.length === 0 && create_account && username && password) {
      const usernameExists = await tx.query('SELECT id FROM users WHERE username = $1', [username]);
      if (usernameExists.rows.length > 0) {
        const err = new Error('Username already exists');
        err.statusCode = 400;
        throw err;
      }

      const password_hash = await bcrypt.hash(password, 10);
      const newURes = await tx.query(
        'INSERT INTO users (username, password_hash, role, branch_id, permissions, employee_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [username, password_hash, role || 'branch_user', branch_id || null, JSON.stringify(permissions), id]
      );
      if (config.IS_BRANCH_MODE && newURes.rows?.[0]) {
        const nu = newURes.rows[0];
        try {
          await queueSyncOperation(tx, null, 'user', 'create', nu.id, branch_id || user?.branch_id || 1, {
            id: nu.id,
            username: nu.username,
            password_hash: nu.password_hash,
            role: nu.role,
            branch_id: nu.branch_id,
            permissions: nu.permissions,
            employee_id: id,
            employee_offline_uuid: result.rows[0].offline_uuid,
            full_name: name || result.rows[0].name,
          });
        } catch (e) {
          console.warn('Failed to queue user create sync during employee update:', e.message);
        }
      }
    }

    if (config.IS_BRANCH_MODE) {
      try {
        await queueSyncOperation(tx, null, 'employee', 'update', id, branch_id || user?.branch_id || 1, {
          id,
          ...body,
          status: result.rows[0].status,
          end_date: nextEndDate,
          clear_end_date: nextEndDate === null,
          offline_uuid: result.rows[0].offline_uuid,
        });
      } catch (e) {
        console.warn('Failed to queue employee update sync:', e.message);
      }
    }

    return result.rows[0];
  });

  return employee;
}

async function transferEmployee(id, targetBranchId, user) {
  if (!user || user.role !== 'admin') {
    const err = new Error('Admin access required');
    err.statusCode = 403;
    throw err;
  }
  if (!targetBranchId) {
    const err = new Error('branch_id is required');
    err.statusCode = 400;
    throw err;
  }

  const result = await db.transaction(async (tx) => {
    const emp = await tx.query('SELECT id, name, branch_id, offline_uuid FROM employees WHERE id = $1', [id]);
    if (emp.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }
    const updated = await tx.query(
      'UPDATE employees SET branch_id = $1 WHERE id = $2 RETURNING *',
      [targetBranchId, id]
    );
    const userCheck = await tx.query('SELECT id, username FROM users WHERE employee_id = $1', [id]);
    await tx.query('UPDATE users SET branch_id = $1 WHERE employee_id = $2', [targetBranchId, id]);
    if (config.IS_BRANCH_MODE) {
      try {
        await queueSyncOperation(tx, null, 'employee', 'update', id, targetBranchId, {
          id,
          branch_id: targetBranchId,
          offline_uuid: emp.rows[0].offline_uuid,
        });
        if (userCheck.rows.length > 0) {
          for (const u of userCheck.rows) {
            await queueSyncOperation(tx, null, 'user', 'update', u.id, targetBranchId, {
              id: u.id,
              username: u.username,
              branch_id: targetBranchId,
              employee_id: id,
              employee_offline_uuid: emp.rows[0].offline_uuid,
            });
          }
        }
      } catch (e) {
        console.warn('Failed to queue employee transfer sync:', e.message);
      }
    }
    return updated.rows[0];
  });

  return { success: true, employee: result };
}

async function deactivateEmployee(id, body = {}, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const result = await db.transaction(async (tx) => {
    const check = await tx.query('SELECT id, name, phone, branch_id, offline_uuid FROM employees WHERE id = $1', [id]);
    if (check.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }
    if (isBranchUser && !hasEmployeeBranchAccess(user, check.rows[0])) {
      const err = new Error('Unauthorized access to this employee');
      err.statusCode = 403;
      throw err;
    }

    const cairoNow = await getDatabaseCairoNow(tx);
    const endDate = (body && body.end_date) ? String(body.end_date).slice(0, 10) : cairoNow.date;
    const updatedRes = await tx.query(
      "UPDATE employees SET status = 'inactive', end_date = $1 WHERE id = $2 RETURNING *",
      [endDate, id]
    );
    const userCheck = await tx.query('SELECT id, username FROM users WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM users WHERE employee_id = $1', [id]);

    if (config.IS_BRANCH_MODE) {
      const bId = check.rows[0].branch_id || user?.branch_id || 1;
      try {
        await queueSyncOperation(tx, null, 'employee', 'update', id, bId, {
          id,
          status: 'inactive',
          end_date: endDate,
          offline_uuid: check.rows[0].offline_uuid,
        });
        for (const u of userCheck.rows) {
          await queueSyncOperation(tx, null, 'user', 'delete', u.id, bId, {
            id: u.id,
            username: u.username,
            employee_id: id,
            employee_offline_uuid: check.rows[0].offline_uuid,
          });
        }
      } catch (e) {
        console.warn('Failed to queue employee deactivate sync:', e.message);
      }
    }
    return updatedRes.rows[0];
  });

  return {
    success: true,
    deactivated: true,
    employee: result,
    message: 'تم إيقاف الموظف وحفظ سجله المالي وتاريخ ترك العمل بنجاح',
  };
}

async function deleteEmployee(id, user, options = {}) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  // If employee has historical attendance, transactions, or sales, soft-deactivate with end_date instead of wiping history!
  const histCheck = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM attendance WHERE employee_id = $1) AS att_cnt,
       (SELECT COUNT(*) FROM employee_transactions WHERE employee_id = $1) AS tx_cnt,
       (SELECT COUNT(*) FROM employee_payroll_adjustments WHERE employee_id = $1) AS adj_cnt,
       (SELECT COUNT(*) FROM orders WHERE seller_id = $1) AS ord_cnt`,
    [id]
  );
  const h = histCheck.rows[0] || {};
  const hasHistory = (Number(h.att_cnt) + Number(h.tx_cnt) + Number(h.adj_cnt) + Number(h.ord_cnt)) > 0;
  if (hasHistory && !options.force_hard_delete) {
    return deactivateEmployee(id, { end_date: options.end_date }, user);
  }

  const result = await db.transaction(async (tx) => {
    if (isBranchUser) {
      const check = await tx.query('SELECT branch_id FROM employees WHERE id = $1', [id]);
      if (check.rows.length === 0 || !hasBranchAccess(user, check.rows[0].branch_id)) {
        const err = new Error('Unauthorized access to this employee');
        err.statusCode = 403;
        throw err;
      }
    }

    const userCheck = await tx.query('SELECT id, username FROM users WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM attendance WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM employee_payroll_adjustments WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM employee_transactions WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM users WHERE employee_id = $1', [id]);
    const delRes = await tx.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    if (config.IS_BRANCH_MODE && delRes.rows.length > 0) {
      try {
        await queueSyncOperation(tx, null, 'employee', 'delete', id, delRes.rows[0].branch_id || user?.branch_id || 1, {
          id,
          offline_uuid: delRes.rows[0].offline_uuid,
        });
        if (userCheck.rows.length > 0) {
          for (const u of userCheck.rows) {
            await queueSyncOperation(tx, null, 'user', 'delete', u.id, delRes.rows[0].branch_id || user?.branch_id || 1, {
              id: u.id,
              username: u.username,
              employee_id: id,
              employee_offline_uuid: delRes.rows[0].offline_uuid,
            });
          }
        }
      } catch (e) {
        console.warn('Failed to queue employee delete sync:', e.message);
      }
    }
    return delRes;
  });

  if (result.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  return { message: 'Employee deleted successfully' };
}

async function recordAttendance(body, user) {
  const { employee_id, date, check_in, check_out, status, notes } = body || {};
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, branch_scope, branch_ids, shift_start, shift_end FROM employees WHERE id = $1', [employee_id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasEmployeeBranchAccess(user, empRes.rows[0])) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const resolvedStatus = status || (check_in && check_out ? 'completed' : 'present');
  const metrics = computeAttendanceMetrics({
    checkIn: check_in,
    checkOut: check_out,
    shiftStart: empRes.rows[0].shift_start,
    shiftEnd: empRes.rows[0].shift_end,
    status: resolvedStatus,
    notes,
  });

  const result = await db.query(
    `INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes, total_hours, late_minutes, early_departure_minutes, overtime_minutes) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (employee_id, date) 
     DO UPDATE SET
       check_in = EXCLUDED.check_in,
       check_out = EXCLUDED.check_out,
       status = EXCLUDED.status,
       notes = EXCLUDED.notes,
       total_hours = EXCLUDED.total_hours,
       late_minutes = EXCLUDED.late_minutes,
       early_departure_minutes = EXCLUDED.early_departure_minutes,
       overtime_minutes = EXCLUDED.overtime_minutes
     RETURNING *`,
    [
      employee_id,
      date,
      metrics.check_in,
      metrics.check_out,
      resolvedStatus,
      notes || null,
      metrics.total_hours,
      metrics.late_minutes,
      metrics.early_departure_minutes,
      metrics.overtime_minutes,
    ]
  );
  const row = result.rows[0];
  const branchId = empRes.rows[0]?.branch_id || user?.branch_id || config.BRANCH_ID || 1;
  await queueSyncOperation(db, null, 'attendance', 'upsert', row.id, branchId, {
    employee_id: row.employee_id,
    date: row.date,
    check_in: row.check_in,
    check_out: row.check_out,
    status: row.status,
    notes: row.notes,
    total_hours: Math.round((Number(row.total_hours) || 0) * 100) / 100,
    late_minutes: Math.round(Number(row.late_minutes) || 0),
    early_departure_minutes: Math.round(Number(row.early_departure_minutes) || 0),
    overtime_minutes: Math.round(Number(row.overtime_minutes) || 0),
  });
  return row;
}

async function toggleAttendance(id, manualTime, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, branch_scope, branch_ids, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasEmployeeBranchAccess(user, empRes.rows[0])) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const { date, time: serverTime } = getCairoDateTimeParts();
  const time = manualTime || serverTime;
  const existingRes = await db.query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
    [id, date]
  );

  if (existingRes.rows.length === 0 || !existingRes.rows[0].check_in) {
    const metrics = computeAttendanceMetrics({
      checkIn: time,
      checkOut: null,
      shiftStart: empRes.rows[0].shift_start,
      shiftEnd: empRes.rows[0].shift_end,
      status: 'present',
    });
    const cleanCheckIn = metrics.check_in || time;
    const lateMinutes = metrics.late_minutes;

    const result = await db.query(
      `INSERT INTO attendance (employee_id, date, check_in, status, late_minutes)
       VALUES ($1, $2, $3, 'present', $4)
       ON CONFLICT (employee_id, date)
       DO UPDATE SET check_in = EXCLUDED.check_in, status = 'present', late_minutes = EXCLUDED.late_minutes
       RETURNING *`,
      [id, date, cleanCheckIn, lateMinutes]
    );
    const branchId = empRes.rows[0].branch_id || config.BRANCH_ID || 1;
    await queueSyncOperation(db, null, 'attendance', 'upsert', result.rows[0].id, branchId, {
      employee_id: result.rows[0].employee_id,
      date: result.rows[0].date,
      check_in: result.rows[0].check_in,
      check_out: result.rows[0].check_out,
      status: result.rows[0].status,
      notes: result.rows[0].notes,
      total_hours: Math.round((Number(result.rows[0].total_hours) || 0) * 100) / 100,
      late_minutes: Math.round(Number(result.rows[0].late_minutes) || 0),
      early_departure_minutes: Math.round(Number(result.rows[0].early_departure_minutes) || 0),
      overtime_minutes: Math.round(Number(result.rows[0].overtime_minutes) || 0),
    });
    return { action: 'check_in', attendance: result.rows[0] };
  }

  if (!existingRes.rows[0].check_out) {
    const metrics = computeAttendanceMetrics({
      checkIn: existingRes.rows[0].check_in,
      checkOut: time,
      shiftStart: empRes.rows[0].shift_start,
      shiftEnd: empRes.rows[0].shift_end,
      status: 'completed',
    });
    const cleanCheckOut = metrics.check_out || time;
    const earlyDepartureMinutes = metrics.early_departure_minutes;
    const overtimeMinutes = metrics.overtime_minutes;
    const totalHours = metrics.total_hours;

    const result = await db.query(
      `UPDATE attendance
       SET check_out = $1, 
           status = 'completed',
           total_hours = $6,
           early_departure_minutes = $4,
           overtime_minutes = $5
       WHERE employee_id = $2 AND date = $3
       RETURNING *`,
      [cleanCheckOut, id, date, earlyDepartureMinutes, overtimeMinutes, totalHours]
    );
    const branchId = empRes.rows[0].branch_id || config.BRANCH_ID || 1;
    await queueSyncOperation(db, null, 'attendance', 'upsert', result.rows[0].id, branchId, {
      employee_id: result.rows[0].employee_id,
      date: result.rows[0].date,
      check_in: result.rows[0].check_in,
      check_out: result.rows[0].check_out,
      status: result.rows[0].status,
      notes: result.rows[0].notes,
      total_hours: Math.round((Number(result.rows[0].total_hours) || 0) * 100) / 100,
      late_minutes: Math.round(Number(result.rows[0].late_minutes) || 0),
      early_departure_minutes: Math.round(Number(result.rows[0].early_departure_minutes) || 0),
      overtime_minutes: Math.round(Number(result.rows[0].overtime_minutes) || 0),
    });
    return { action: 'check_out', attendance: result.rows[0] };
  }

  return { action: 'already_completed', attendance: existingRes.rows[0] };
}

async function handleCheckoutReminder(id, attendanceDate, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, branch_scope, branch_ids, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  const employee = empRes.rows[0];
  if (isBranchUser && !hasEmployeeBranchAccess(user, employee)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const cairoNow = getCairoDateTimeParts();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(attendanceDate || '')) ? attendanceDate : cairoNow.date;
  const time = cairoNow.time;

  const existingRes = await db.query(
    'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
    [id, date]
  );
  const attendance = existingRes.rows[0];
  if (!attendance || !attendance.check_in) {
    const err = new Error('لا يوجد حضور مفتوح لهذا الموظف في تاريخ الإشعار');
    err.statusCode = 400;
    throw err;
  }
  if (attendance.check_out) {
    return { action: 'already_completed', attendance };
  }

  const metrics = computeAttendanceMetrics({
    checkIn: attendance.check_in,
    checkOut: time,
    shiftStart: employee.shift_start,
    shiftEnd: employee.shift_end,
    status: 'completed',
  });
  const cleanCheckOut = metrics.check_out || time;
  const earlyDepartureMinutes = metrics.early_departure_minutes;
  const overtimeMinutes = metrics.overtime_minutes;
  const totalHours = metrics.total_hours;

  const result = await db.query(
    `UPDATE attendance
     SET check_out = $1,
         status = 'completed',
         total_hours = $6,
         early_departure_minutes = $4,
         overtime_minutes = $5
     WHERE employee_id = $2 AND date = $3
     RETURNING *`,
    [cleanCheckOut, id, date, earlyDepartureMinutes, overtimeMinutes, totalHours]
  );
  if (result.rows.length > 0) {
    const branchId = employee.branch_id || config.BRANCH_ID || 1;
    await queueSyncOperation(db, null, 'attendance', 'upsert', result.rows[0].id, branchId, {
      employee_id: result.rows[0].employee_id,
      date: result.rows[0].date,
      check_in: result.rows[0].check_in,
      check_out: result.rows[0].check_out,
      status: result.rows[0].status,
      notes: result.rows[0].notes,
      total_hours: Math.round((Number(result.rows[0].total_hours) || 0) * 100) / 100,
      late_minutes: Math.round(Number(result.rows[0].late_minutes) || 0),
      early_departure_minutes: Math.round(Number(result.rows[0].early_departure_minutes) || 0),
      overtime_minutes: Math.round(Number(result.rows[0].overtime_minutes) || 0),
    });
  }
  return { action: 'check_out', attendance: result.rows[0] };
}

async function recordManualAttendance(id, body, user) {
  const { date, status, notes, check_in, check_out } = body || {};
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  if (!date || !status) {
    const err = new Error('Date and Status are required');
    err.statusCode = 400;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, branch_scope, branch_ids, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasEmployeeBranchAccess(user, empRes.rows[0])) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const metrics = computeAttendanceMetrics({
    checkIn: check_in,
    checkOut: check_out,
    shiftStart: empRes.rows[0].shift_start,
    shiftEnd: empRes.rows[0].shift_end,
    status,
    notes,
  });

  const result = await db.query(
    `INSERT INTO attendance (employee_id, date, status, notes, check_in, check_out, total_hours, late_minutes, early_departure_minutes, overtime_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (employee_id, date)
     DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, total_hours = EXCLUDED.total_hours, late_minutes = EXCLUDED.late_minutes, early_departure_minutes = EXCLUDED.early_departure_minutes, overtime_minutes = EXCLUDED.overtime_minutes
     RETURNING *`,
    [
      id,
      date,
      status,
      notes || null,
      metrics.check_in,
      metrics.check_out,
      metrics.total_hours,
      metrics.late_minutes,
      metrics.early_departure_minutes,
      metrics.overtime_minutes,
    ]
  );

  const branchId = empRes.rows[0].branch_id || config.BRANCH_ID || 1;
  await queueSyncOperation(db, null, 'attendance', 'upsert', result.rows[0].id, branchId, {
    employee_id: result.rows[0].employee_id,
    date: result.rows[0].date,
    check_in: result.rows[0].check_in,
    check_out: result.rows[0].check_out,
    status: result.rows[0].status,
    notes: result.rows[0].notes,
    total_hours: Math.round((Number(result.rows[0].total_hours) || 0) * 100) / 100,
    late_minutes: Math.round(Number(result.rows[0].late_minutes) || 0),
    early_departure_minutes: Math.round(Number(result.rows[0].early_departure_minutes) || 0),
    overtime_minutes: Math.round(Number(result.rows[0].overtime_minutes) || 0),
  });
  return { action: 'manual_update', attendance: result.rows[0] };
}

async function getAttendanceReport(id, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query('SELECT branch_id, branch_scope, branch_ids, name FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasEmployeeBranchAccess(user, empRes.rows[0])) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const attendanceRes = await db.query(
    `SELECT
      TO_CHAR(date, 'YYYY-MM-DD') as day,
      check_in,
      check_out,
      status,
      notes,
      ROUND(total_hours, 2) as total_hours,
      late_minutes,
      early_departure_minutes,
      overtime_minutes
     FROM attendance
     WHERE employee_id = $1
     ORDER BY date DESC
     LIMIT 180`,
    [id]
  );

  const healedRows = (attendanceRes.rows || []).map((row) => {
    const notesStr = String(row.notes || '');
    const statusStr = String(row.status || '');
    const isAbsentOrLeave = statusStr === 'absent' || statusStr === 'leave' || notesStr.includes('غياب') || notesStr.includes('إجازة') || notesStr.includes('جاز');
    let hours = Number(row.total_hours || 0);
    if (isAbsentOrLeave) {
      hours = 0;
    } else if ((!Number.isFinite(hours) || hours <= 0) && row.check_in && row.check_out) {
      hours = computeWorkedHours(row.check_in, row.check_out);
    }
    return {
      ...row,
      date: row.day,
      total_hours: Math.round((Number(hours) || 0) * 100) / 100,
    };
  });

  return {
    employee_name: empRes.rows[0].name,
    daily_attendance: healedRows,
    logs: healedRows,
  };
}

async function createEmployeeTransaction(body, user) {
  const { employee_id, type, amount, transaction_date, notes } = body || {};
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empCheckRes = await db.query(
    'SELECT id, name, phone, branch_id, branch_scope, branch_ids, offline_uuid FROM employees WHERE id = $1',
    [employee_id]
  );
  if (empCheckRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  const empRow = empCheckRes.rows[0];
  if (isBranchUser && !hasEmployeeBranchAccess(user, empRow)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const paymentMethod = body?.payment_method || 'cash';
  const isCashMethod = ['cash', 'نقدي', 'كاش'].includes(String(paymentMethod).trim().toLowerCase());
  const rawPaidFromDrawer = body?.paid_from_drawer;
  const paidFromDrawer = type === 'salary_payment'
    ? (isCashMethod && (rawPaidFromDrawer === true || rawPaidFromDrawer === 1 || rawPaidFromDrawer === 'true' || rawPaidFromDrawer === '1'))
    : false;
  const dbPaidFromDrawer = config.IS_BRANCH_MODE ? (paidFromDrawer ? 1 : 0) : Boolean(paidFromDrawer);

  const offlineUuid = newUuid(body?.offline_uuid);
  const cairoNow = await getDatabaseCairoNow();
  const rawBranchId = body?.branch_id ? Number(body.branch_id) : null;
  const branchId = (Number.isFinite(rawBranchId) && rawBranchId > 0 && hasBranchAccess(user, rawBranchId))
    ? rawBranchId
    : (user?.branch_id || (config.IS_BRANCH_MODE ? config.BRANCH_ID : null) || empRow.branch_id || 1);

  const result = await db.query(
    'INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes, payment_method, paid_from_drawer, branch_id, offline_uuid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
    [employee_id, type, amount, transaction_date || cairoNow.date, notes || null, paymentMethod, dbPaidFromDrawer, branchId, offlineUuid]
  );
  const transRow = result.rows[0];
  await queueSyncOperation(db, null, 'employee_transaction', 'create', transRow.id, branchId, {
    id: transRow.id,
    employee_id: transRow.employee_id,
    employee_ref: {
      name: empRow.name,
      phone: empRow.phone,
      offline_uuid: empRow.offline_uuid,
    },
    type: transRow.type,
    amount: transRow.amount,
    transaction_date: transRow.transaction_date,
    notes: transRow.notes,
    payment_method: paymentMethod,
    paid_from_drawer: paidFromDrawer,
    offline_uuid: transRow.offline_uuid || offlineUuid,
    branch_id: branchId,
  });
  return transRow;
}

async function deleteEmployeeTransaction(txId, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const txRes = await db.query(
    `SELECT et.*, e.name AS emp_name, e.phone AS emp_phone, e.branch_id, e.branch_scope, e.branch_ids, e.offline_uuid AS emp_offline_uuid
     FROM employee_transactions et
     JOIN employees e ON e.id = et.employee_id
     WHERE et.id = $1`,
    [txId]
  );
  if (txRes.rows.length === 0) {
    const err = new Error('الحركة المالية غير موجودة');
    err.statusCode = 404;
    throw err;
  }
  const row = txRes.rows[0];

  if (!isAdmin) {
    if (!hasEmployeeBranchAccess(user, row)) {
      const err = new Error('غير مصرح لك بالوصول إلى هذا الموظف');
      err.statusCode = 403;
      throw err;
    }
    if (row.type === 'advance') {
      if (!hasPermission(user, 'employees.advances.create')) {
        const err = new Error('ليس لديك صلاحية حذف السلف');
        err.statusCode = 403;
        throw err;
      }
    } else if (!hasPermission(user, 'employees.payroll.execute')) {
      const err = new Error('ليس لديك صلاحية حذف حركات الرواتب والخصومات والمكافآت');
      err.statusCode = 403;
      throw err;
    }
  }

  await db.transaction(async (tx) => {
    await tx.query('DELETE FROM employee_transactions WHERE id = $1', [txId]);

    // If this was a bonus synced from an expense, soft-delete the linked expense as well
    if (row.type === 'bonus' && row.offline_uuid) {
      const expRes = await tx.query(
        `UPDATE expenses
         SET is_deleted = TRUE, deleted_by = $1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE offline_uuid = $2 AND category = 'bonus' AND is_deleted IS NOT TRUE
         RETURNING *`,
        [user?.id || null, row.offline_uuid]
      );
      if (expRes.rows.length > 0 && config.IS_BRANCH_MODE) {
        await queueSyncOperation(tx, null, 'expense', 'upsert', expRes.rows[0].id, expRes.rows[0].branch_id, {
          ...expRes.rows[0],
          is_deleted: true,
        });
      }
    }

    const branchId = row.branch_id || user?.branch_id || config.BRANCH_ID || 1;
    await queueSyncOperation(tx, null, 'employee_transaction', 'delete', row.id, branchId, {
      id: row.id,
      employee_id: row.employee_id,
      employee_ref: {
        name: row.emp_name,
        phone: row.emp_phone,
        offline_uuid: row.emp_offline_uuid,
      },
      type: row.type,
      offline_uuid: row.offline_uuid,
      branch_id: branchId,
    });
  });

  return { success: true, deleted_id: Number(txId), type: row.type };
}

async function getEmployeeSummary(id, monthParam, user, options = {}) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const cairoNow = await getDatabaseCairoNow(db);
  const currentCairoMonth = cairoNow.month || getCairoDateTimeParts().date.substring(0, 7);
  const month = (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) ? monthParam : currentCairoMonth;
  const empRes = await db.query(
    'SELECT id, branch_id, branch_scope, branch_ids, basic_salary, join_date, end_date, status FROM employees WHERE id = $1',
    [id]
  );
  if (empRes.rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  const employee = empRes.rows[0];

  if (isBranchUser && !hasEmployeeBranchAccess(user, employee)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const isAdvanceMode = Boolean(options.advanceOnly || options.type === 'advance');
  const hasPayrollView = !isAdvanceMode && (isAdmin || Boolean(user && hasPermission(user, 'employees.payroll.view')));
  const canSeeSalary = !isAdvanceMode && (isAdmin || Boolean(hasPayrollView && user?.salaryAccessVerified));

  const monthRange = getMonthRange(month);
  const [year, monthNumber] = month.split('-').map(Number);
  const selectedMonthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const monthKeys = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    monthKeys.push(getMonthKey(new Date(Date.UTC(selectedMonthDate.getUTCFullYear(), selectedMonthDate.getUTCMonth() - offset, 1))));
  }
  const windowStart = `${monthKeys[0]}-01`;
  const windowEnd = getMonthRange(monthKeys[monthKeys.length - 1]).end;

  const [monthTxRowsRes, windowTxRes, windowAttRes, windowAdjRes] = await Promise.all([
    db.query(
      `SELECT id, employee_id, type, amount, TO_CHAR(transaction_date, 'YYYY-MM-DD') as transaction_date, notes,
              COALESCE(payment_method, 'cash') as payment_method,
              COALESCE(paid_from_drawer, FALSE) as paid_from_drawer,
              offline_uuid
       FROM employee_transactions
       WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
       ORDER BY transaction_date DESC, id DESC`,
      [id, monthRange.start, monthRange.end]
    ),
    db.query(
      `SELECT id, type, amount, TO_CHAR(transaction_date, 'YYYY-MM-DD') as transaction_date,
              TO_CHAR(transaction_date, 'YYYY-MM') as month
       FROM employee_transactions
       WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date`,
      [id, windowStart, windowEnd]
    ),
    db.query(
      `SELECT TO_CHAR(date, 'YYYY-MM') as month, status, notes, check_in, check_out, COALESCE(total_hours, 0) as total_hours
       FROM attendance
       WHERE employee_id = $1 AND date >= $2::date AND date < $3::date`,
      [id, windowStart, windowEnd]
    ),
    db.query(
      `SELECT *
       FROM employee_payroll_adjustments
       WHERE employee_id = $1 AND month >= $2 AND month <= $3`,
      [id, monthKeys[0], monthKeys[monthKeys.length - 1]]
    ),
  ]);

  const txByMonth = new Map();
  windowTxRes.rows.forEach((r) => {
    if (!txByMonth.has(r.month)) txByMonth.set(r.month, []);
    txByMonth.get(r.month).push(r);
  });

  const attByMonth = new Map();
  windowAttRes.rows.forEach((r) => {
    if (!attByMonth.has(r.month)) attByMonth.set(r.month, []);
    attByMonth.get(r.month).push(r);
  });

  const adjByMonth = new Map();
  windowAdjRes.rows.forEach((r) => {
    adjByMonth.set(r.month, r);
  });

  const currentMonthCalc = calculateEmployeeMonthlyPayroll({
    employee,
    month,
    currentCairoMonth,
    attendanceRows: attByMonth.get(month) || [],
    transactionRows: txByMonth.get(month) || [],
    adjustment: adjByMonth.get(month) || null,
  });

  const advances = currentMonthCalc.advances;
  const deductions = isAdvanceMode ? 0 : currentMonthCalc.deductions_without_advances;
  const bonuses = isAdvanceMode ? 0 : currentMonthCalc.total_additions;
  const salaryPayments = isAdvanceMode ? 0 : currentMonthCalc.salary_payments;

  const rawBasicSalary = currentMonthCalc.basic_salary;
  const basic_salary = canSeeSalary ? rawBasicSalary : null;
  const net_salary = canSeeSalary ? currentMonthCalc.net_salary : null;
  const remaining_salary = canSeeSalary ? currentMonthCalc.remaining_balance : null;

  const dailyMap = new Map();
  (txByMonth.get(month) || []).forEach((row) => {
    const dayKey = row.transaction_date;
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 });
    }
    const entry = dailyMap.get(dayKey);
    if (row.type === 'advance') entry.advances += Number(row.amount || 0);
    if (!isAdvanceMode) {
      if (row.type === 'deduction') entry.deductions += Number(row.amount || 0);
      if (row.type === 'bonus') entry.bonuses += Number(row.amount || 0);
      if (row.type === 'salary_payment') entry.salary_payments += Number(row.amount || 0);
    }
  });

  const daily_summary = [];
  const basePlusNonTxAdditions = currentMonthCalc.earned_base_salary
    + currentMonthCalc.unused_leave_amount
    + currentMonthCalc.overtime_amount
    + currentMonthCalc.commissions
    + currentMonthCalc.transportation_allowance
    + currentMonthCalc.previous_dues
    - (currentMonthCalc.absent_deduction + currentMonthCalc.leave_deduction + currentMonthCalc.half_day_deduction + currentMonthCalc.delay_deduction + currentMonthCalc.penalty_days_amount + currentMonthCalc.old_advances);

  const runningDaily = { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 };
  Array.from(dailyMap.keys()).sort().forEach((dayKey) => {
    const entry = dailyMap.get(dayKey);
    runningDaily.salary_payments += entry.salary_payments;
    runningDaily.advances += entry.advances;
    runningDaily.deductions += entry.deductions;
    runningDaily.bonuses += entry.bonuses;

    const shouldInclude = hasPayrollView
      ? (entry.salary_payments > 0 || entry.advances > 0 || entry.deductions > 0 || entry.bonuses > 0)
      : (entry.advances > 0);

    if (shouldInclude) {
      const effBonuses = currentMonthCalc.adjustment?.manual_bonuses_override !== null && currentMonthCalc.adjustment?.manual_bonuses_override !== undefined
        ? currentMonthCalc.manual_bonuses
        : runningDaily.bonuses;
      const effDeds = currentMonthCalc.adjustment?.manual_deductions_override !== null && currentMonthCalc.adjustment?.manual_deductions_override !== undefined
        ? currentMonthCalc.manual_deductions
        : runningDaily.deductions;
      daily_summary.push({
        day: dayKey,
        basic_salary: canSeeSalary ? rawBasicSalary : null,
        salary_payments: hasPayrollView ? entry.salary_payments : 0,
        advances: entry.advances,
        deductions: hasPayrollView ? entry.deductions : 0,
        bonuses: hasPayrollView ? entry.bonuses : 0,
        net_salary: canSeeSalary ? (entry.salary_payments + entry.bonuses - entry.advances - entry.deductions) : null,
        remaining_salary: canSeeSalary
          ? Math.round(basePlusNonTxAdditions + effBonuses - runningDaily.advances - effDeds - runningDaily.salary_payments)
          : null,
      });
    }
  });

  daily_summary.sort((a, b) => b.day.localeCompare(a.day));

  const monthly_summary = [];
  monthKeys.forEach((monthKey) => {
    const mCalc = calculateEmployeeMonthlyPayroll({
      employee,
      month: monthKey,
      currentCairoMonth,
      attendanceRows: attByMonth.get(monthKey) || [],
      transactionRows: txByMonth.get(monthKey) || [],
      adjustment: adjByMonth.get(monthKey) || null,
    });
    const shouldInclude = hasPayrollView
      ? (monthKey === month || mCalc.salary_payments > 0 || mCalc.advances > 0 || mCalc.deductions_without_advances > 0 || mCalc.total_additions > 0 || mCalc.has_saved_adjustment)
      : (monthKey === month || mCalc.advances > 0);

    if (shouldInclude) {
      monthly_summary.push({
        month: monthKey,
        basic_salary: canSeeSalary ? mCalc.basic_salary : null,
        work_days: mCalc.work_days,
        salary_payments: hasPayrollView ? mCalc.salary_payments : 0,
        advances: mCalc.advances,
        deductions: hasPayrollView ? mCalc.deductions_without_advances : 0,
        bonuses: hasPayrollView ? mCalc.total_additions : 0,
        net_salary: canSeeSalary ? mCalc.net_salary : null,
        remaining_salary: canSeeSalary ? mCalc.remaining_balance : null,
        has_saved_adjustment: mCalc.has_saved_adjustment,
      });
    }
  });
  monthly_summary.reverse();

  const transactions = monthTxRowsRes.rows
    .filter((r) => (isAdvanceMode ? r.type === 'advance' : (hasPayrollView ? true : r.type === 'advance')))
    .map((r) => ({
      id: r.id,
      employee_id: r.employee_id,
      type: r.type,
      amount: Number(r.amount || 0),
      transaction_date: r.transaction_date,
      notes: String(r.notes || '').replace(/\s*\[EXP-[^\]]+\]\s*/g, ' ').trim(),
      payment_method: r.payment_method || 'cash',
      paid_from_drawer: Boolean(r.paid_from_drawer === true || r.paid_from_drawer === 1),
    }));

  return {
    basic_salary,
    salary_payments: hasPayrollView ? salaryPayments : 0,
    advances,
    deductions: hasPayrollView ? deductions : 0,
    bonuses: hasPayrollView ? bonuses : 0,
    net_salary,
    remaining_salary,
    work_days: currentMonthCalc.work_days,
    has_saved_adjustment: currentMonthCalc.has_saved_adjustment,
    month,
    transactions,
    daily_summary,
    monthly_summary,
  };
}

async function getEmployeePayslip(id, monthParam, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const cairoNow = await getDatabaseCairoNow(db);
  const currentCairoMonth = cairoNow.month || getCairoDateTimeParts().date.substring(0, 7);
  const month = (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) ? monthParam : currentCairoMonth;

  const empRes = await db.query(
    'SELECT id, name, position, branch_id, branch_scope, branch_ids, basic_salary, join_date, end_date, status, shift_start, shift_end, offline_uuid FROM employees WHERE id = $1',
    [id]
  );
  if (empRes.rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }
  const employee = empRes.rows[0];

  if (isBranchUser && !hasEmployeeBranchAccess(user, employee)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const branchRes = await db.query('SELECT name FROM branches WHERE id = $1', [employee.branch_id]);
  const branchName = branchRes.rows.length > 0 ? branchRes.rows[0].name : '';

  const monthRange = getMonthRange(month);
  const prevMonth = getPreviousMonthKey(month);
  const prevRange = prevMonth ? getMonthRange(prevMonth) : null;

  const [txRes, attRes, adjRes, salesRes, prevTxRes, prevAttRes, prevAdjRes, prevSalesRes] = await Promise.all([
    db.query(
      `SELECT id, type, amount, TO_CHAR(transaction_date, 'YYYY-MM-DD') AS transaction_date, notes,
              COALESCE(payment_method, 'cash') AS payment_method,
              COALESCE(paid_from_drawer, FALSE) AS paid_from_drawer
       FROM employee_transactions
       WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
       ORDER BY transaction_date, id`,
      [id, monthRange.start, monthRange.end]
    ),
    db.query(
      `SELECT status, notes, check_in, check_out,
              COALESCE(late_minutes, 0) as late_minutes,
              COALESCE(early_departure_minutes, 0) as early_minutes,
              COALESCE(overtime_minutes, 0) as overtime_minutes,
              COALESCE(total_hours, 0) as total_hours
       FROM attendance
       WHERE employee_id = $1 AND date >= $2::date AND date < $3::date`,
      [id, monthRange.start, monthRange.end]
    ),
    db.query(
      'SELECT * FROM employee_payroll_adjustments WHERE employee_id = $1 AND month = $2 LIMIT 1',
      [id, month]
    ),
    db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
       FROM orders
       WHERE seller_id = $1
         AND order_date >= $2::date AND order_date < $3::date
         AND COALESCE(status, 'completed') NOT IN ('cancelled', 'canceled', 'returned', 'ملغاة', 'ملغي')`,
      [id, monthRange.start, monthRange.end]
    ),
    prevRange
      ? db.query(
          `SELECT id, type, amount
           FROM employee_transactions
           WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date`,
          [id, prevRange.start, prevRange.end]
        )
      : Promise.resolve({ rows: [] }),
    prevRange
      ? db.query(
          `SELECT status, notes, check_in, check_out, COALESCE(total_hours, 0) as total_hours
           FROM attendance
           WHERE employee_id = $1 AND date >= $2::date AND date < $3::date`,
          [id, prevRange.start, prevRange.end]
        )
      : Promise.resolve({ rows: [] }),
    prevMonth
      ? db.query(
          'SELECT * FROM employee_payroll_adjustments WHERE employee_id = $1 AND month = $2 LIMIT 1',
          [id, prevMonth]
        )
      : Promise.resolve({ rows: [] }),
    prevRange
      ? db.query(
          `SELECT COALESCE(SUM(total_amount), 0) AS total_sales
           FROM orders
           WHERE seller_id = $1
             AND order_date >= $2::date AND order_date < $3::date
             AND COALESCE(status, 'completed') NOT IN ('cancelled', 'canceled', 'returned', 'ملغاة', 'ملغي')`,
          [id, prevRange.start, prevRange.end]
        )
      : Promise.resolve({ rows: [{ total_sales: 0 }] }),
  ]);

  const txRows = txRes.rows;
  const calc = calculateEmployeeMonthlyPayroll({
    employee,
    month,
    currentCairoMonth,
    attendanceRows: attRes.rows,
    transactionRows: txRows,
    adjustment: adjRes.rows[0] || null,
    monthlySalesAmount: Number(salesRes.rows[0]?.total_sales || 0),
  });

  let carryoverSuggestion = {
    prev_month: prevMonth,
    prev_remaining_balance: 0,
    suggested_old_advances: 0,
    suggested_previous_dues: 0,
  };

  if (prevMonth) {
    const prevHadActivity = prevTxRes.rows.length > 0 || prevAttRes.rows.length > 0 || prevAdjRes.rows.length > 0;
    if (prevHadActivity || calc.default_work_days > 0) {
      const prevCalc = calculateEmployeeMonthlyPayroll({
        employee,
        month: prevMonth,
        currentCairoMonth,
        attendanceRows: prevAttRes.rows,
        transactionRows: prevTxRes.rows,
        adjustment: prevAdjRes.rows[0] || null,
        monthlySalesAmount: Number(prevSalesRes.rows[0]?.total_sales || 0),
      });
      carryoverSuggestion = {
        prev_month: prevMonth,
        prev_remaining_balance: prevCalc.remaining_balance,
        suggested_old_advances: prevCalc.remaining_balance < 0 ? Math.abs(prevCalc.remaining_balance) : 0,
        suggested_previous_dues: (prevMonth < currentCairoMonth && prevCalc.remaining_balance > 0) ? prevCalc.remaining_balance : 0,
      };
    }
  }

  return {
    employee: {
      id: employee.id,
      name: employee.name,
      position: employee.position,
      branch_name: branchName,
      join_date: employee.join_date,
      end_date: employee.end_date,
      status: employee.status || 'active',
    },
    month,
    basic_salary: calc.basic_salary,
    employee_master_basic_salary: calc.employee_master_basic_salary,
    has_basic_salary_override: calc.has_basic_salary_override,
    daily_rate: calc.daily_rate,
    work_days: calc.work_days,
    default_work_days: calc.default_work_days,
    earned_base_salary: calc.earned_base_salary,

    allowed_leave_days: calc.allowed_leave_days,
    default_allowed_leave_days: calc.default_allowed_leave_days,
    include_unused_leave_payout: calc.include_unused_leave_payout,
    effective_unused_leave_enabled: calc.effective_unused_leave_enabled,
    unused_leave_days: calc.unused_leave_days,
    unused_leave_amount: calc.unused_leave_amount,
    has_unused_leave_override: calc.has_unused_leave_override,

    actual_hours: calc.actual_hours,
    required_hours: calc.required_hours,
    overtime_hours: calc.overtime_hours,
    overtime_amount: calc.overtime_amount,
    calc_overtime_amount: calc.calc_overtime_amount,
    has_overtime_override: calc.has_overtime_override,
    delay_hours: calc.delay_hours,
    delay_deduction: calc.delay_deduction,
    calc_delay_deduction: calc.calc_delay_deduction,
    has_delay_override: calc.has_delay_override,

    bonuses: calc.manual_bonuses,
    manual_bonuses: calc.manual_bonuses,
    commissions: calc.commissions,
    transportation_allowance: calc.transportation_allowance,
    previous_dues: calc.previous_dues,
    total_additions: calc.total_additions,
    gross_salary: calc.gross_salary,

    advances: calc.advances,
    old_advances: calc.old_advances,
    external_debts: calc.external_debts,
    deductions: calc.deductions_without_advances,
    deductions_without_advances: calc.deductions_without_advances,
    penalty_days: calc.penalty_days,
    penalty_days_amount: calc.penalty_days_amount,
    already_paid: calc.already_paid,
    net_salary: calc.net_salary,
    remaining_balance: calc.remaining_balance,
    has_saved_adjustment: calc.has_saved_adjustment,
    adjustment: calc.adjustment,
    carryover_suggestion: carryoverSuggestion,

    financials: {
      advances: calc.advances,
      deductions_manual: calc.manual_deductions,
      tx_deductions: calc.tx_deductions,
      bonuses_manual: calc.manual_bonuses,
      tx_bonuses: calc.tx_bonuses,
      salary_payments: calc.salary_payments,
      old_advances: calc.old_advances,
      previous_dues: calc.previous_dues,
      penalty_days: calc.penalty_days,
      penalty_days_amount: calc.penalty_days_amount,
      advance_details: txRows
        .filter((row) => row.type === 'advance')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          payment_method: row.payment_method || 'cash',
          notes: row.notes || 'سلفة',
        })),
      bonus_details: txRows
        .filter((row) => row.type === 'bonus')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          notes: String(row.notes || 'مكافأة').replace(/\s*\[EXP-[^\]]+\]\s*/g, ' ').trim(),
        })),
      deduction_details: txRows
        .filter((row) => row.type === 'deduction')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          notes: row.notes || 'خصم',
        })),
      salary_payment_details: txRows
        .filter((row) => row.type === 'salary_payment')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          payment_method: row.payment_method || 'cash',
          paid_from_drawer: Boolean(row.paid_from_drawer === true || row.paid_from_drawer === 1),
          notes: row.notes || 'صرف راتب',
        })),
    },
    attendance: {
      present_days: calc.present_days,
      absent_days: calc.absent_days,
      leave_days: calc.leave_days,
      half_days: calc.half_days,
      actual_hours: calc.actual_hours,
      required_hours: calc.required_hours,
      delay_hours: calc.delay_hours,
      overtime_hours: calc.overtime_hours,
      daily_rate: calc.daily_rate,
      absence_deduction: calc.absent_deduction,
      leave_deduction: calc.leave_deduction,
      half_day_deduction: calc.half_day_deduction,
      delay_deduction: calc.delay_deduction,
      late_deduction: calc.delay_deduction,
      early_deduction: 0,
      overtime_bonus: calc.overtime_amount,
      overtime_amount: calc.overtime_amount,
      unused_leave_days: calc.unused_leave_days,
      unused_leave_amount: calc.unused_leave_amount,
    },
    totals: {
      total_additions: calc.total_additions,
      gross_salary: calc.gross_salary,
      total_deductions: calc.deductions_without_advances,
      total_bonuses: calc.total_additions,
      net_salary: calc.net_salary,
      remaining_balance: calc.remaining_balance,
    },
  };
}

async function saveEmployeePayrollAdjustment(id, body = {}, user = null) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';
  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query(
    'SELECT id, name, phone, branch_id, branch_scope, branch_ids, offline_uuid FROM employees WHERE id = $1',
    [id]
  );
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }
  const employee = empRes.rows[0];
  if (isBranchUser && !hasEmployeeBranchAccess(user, employee)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const cairoNow = await getDatabaseCairoNow(db);
  const month = (body.month && /^\d{4}-\d{2}$/.test(body.month)) ? body.month : cairoNow.month;
  const branchId = employee.branch_id || user?.branch_id || config.BRANCH_ID || 1;
  const employeeRef = {
    name: employee.name,
    phone: employee.phone,
    offline_uuid: employee.offline_uuid,
  };

  if (body.reset === true) {
    await db.transaction(async (tx) => {
      await tx.query('DELETE FROM employee_payroll_adjustments WHERE employee_id = $1 AND month = $2', [id, month]);
      if (config.IS_BRANCH_MODE) {
        await queueSyncOperation(tx, null, 'employee_payroll_adjustment', 'delete', Number(id), branchId, {
          employee_id: Number(id),
          employee_ref: employeeRef,
          month,
        });
      }
    });
    return getEmployeePayslip(id, month, user);
  }

  const workDays = numOrNull(body.work_days);
  const basicSalaryOverride = numOrNull(body.basic_salary_override);
  const applyBasicSalaryToEmployee = body.apply_basic_salary_to_employee === true;
  if (applyBasicSalaryToEmployee && basicSalaryOverride !== null && !isAdmin && !hasPermission(user, 'employees.edit')) {
    const err = new Error('ليس لديك صلاحية تعديل الراتب الأساسي الدائم للموظف');
    err.statusCode = 403;
    throw err;
  }
  const allowedLeaveDays = numOrNull(body.allowed_leave_days);
  const includeUnusedPref = boolOrNull(body.include_unused_leave_payout);
  const unusedLeaveOverride = numOrNull(body.unused_leave_amount_override);
  const requiredHours = numOrNull(body.required_hours);
  const overtimeOverride = numOrNull(body.overtime_amount_override);
  const delayOverride = numOrNull(body.delay_deduction_override);
  const absentOverride = numOrNull(body.absent_days_override);
  const leaveOverride = numOrNull(body.leave_days_override);
  const halfOverride = numOrNull(body.half_days_override);
  const penaltyDays = numOrNull(body.penalty_days) ?? 0;
  const manualDedOverride = numOrNull(body.manual_deductions_override);
  const manualBonusOverride = numOrNull(body.manual_bonuses_override);
  const commissions = numOrNull(body.commissions);
  const transportationAllowance = numOrNull(body.transportation_allowance) ?? 0;
  const oldAdvances = numOrNull(body.old_advances) ?? 0;
  const previousDues = numOrNull(body.previous_dues) ?? 0;
  const externalDebts = numOrNull(body.external_debts) ?? 0;
  const notes = body.notes ? String(body.notes).trim() : null;

  const dbIncludeUnused = includeUnusedPref === null
    ? null
    : (config.IS_BRANCH_MODE ? (includeUnusedPref ? 1 : 0) : includeUnusedPref);
  const offlineUuid = newUuid(body.offline_uuid);

  await db.transaction(async (tx) => {
    const res = await tx.query(
      `INSERT INTO employee_payroll_adjustments (
         employee_id, month, basic_salary_override, work_days, allowed_leave_days, include_unused_leave_payout,
         unused_leave_amount_override, required_hours, overtime_amount_override, delay_deduction_override,
         absent_days_override, leave_days_override, half_days_override, penalty_days,
         manual_deductions_override, manual_bonuses_override, commissions, transportation_allowance,
         old_advances, previous_dues, external_debts, notes, updated_by, updated_at, offline_uuid
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, CURRENT_TIMESTAMP, $24)
       ON CONFLICT (employee_id, month) DO UPDATE SET
         basic_salary_override = EXCLUDED.basic_salary_override,
         work_days = EXCLUDED.work_days,
         allowed_leave_days = EXCLUDED.allowed_leave_days,
         include_unused_leave_payout = EXCLUDED.include_unused_leave_payout,
         unused_leave_amount_override = EXCLUDED.unused_leave_amount_override,
         required_hours = EXCLUDED.required_hours,
         overtime_amount_override = EXCLUDED.overtime_amount_override,
         delay_deduction_override = EXCLUDED.delay_deduction_override,
         absent_days_override = EXCLUDED.absent_days_override,
         leave_days_override = EXCLUDED.leave_days_override,
         half_days_override = EXCLUDED.half_days_override,
         penalty_days = EXCLUDED.penalty_days,
         manual_deductions_override = EXCLUDED.manual_deductions_override,
         manual_bonuses_override = EXCLUDED.manual_bonuses_override,
         commissions = EXCLUDED.commissions,
         transportation_allowance = EXCLUDED.transportation_allowance,
         old_advances = EXCLUDED.old_advances,
         previous_dues = EXCLUDED.previous_dues,
         external_debts = EXCLUDED.external_debts,
         notes = EXCLUDED.notes,
         updated_by = EXCLUDED.updated_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id, offline_uuid`,
      [
        id,
        month,
        basicSalaryOverride,
        workDays,
        allowedLeaveDays,
        dbIncludeUnused,
        unusedLeaveOverride,
        requiredHours,
        overtimeOverride,
        delayOverride,
        absentOverride,
        leaveOverride,
        halfOverride,
        penaltyDays,
        manualDedOverride,
        manualBonusOverride,
        commissions,
        transportationAllowance,
        oldAdvances,
        previousDues,
        externalDebts,
        notes,
        user?.id || null,
        offlineUuid,
      ]
    );

    const savedId = res.rows?.[0]?.id || null;
    const savedUuid = res.rows?.[0]?.offline_uuid || offlineUuid;

    if (applyBasicSalaryToEmployee && basicSalaryOverride !== null) {
      await tx.query('UPDATE employees SET basic_salary = $1 WHERE id = $2', [basicSalaryOverride, id]);
      if (config.IS_BRANCH_MODE) {
        await queueSyncOperation(tx, null, 'employee', 'update', Number(id), branchId, {
          id: Number(id),
          basic_salary: basicSalaryOverride,
          offline_uuid: employee.offline_uuid,
        });
      }
    }

    if (config.IS_BRANCH_MODE) {
      await queueSyncOperation(tx, null, 'employee_payroll_adjustment', 'update', savedId, branchId, {
        employee_id: Number(id),
        employee_ref: employeeRef,
        month,
        basic_salary_override: basicSalaryOverride,
        work_days: workDays,
        allowed_leave_days: allowedLeaveDays,
        include_unused_leave_payout: includeUnusedPref,
        unused_leave_amount_override: unusedLeaveOverride,
        required_hours: requiredHours,
        overtime_amount_override: overtimeOverride,
        delay_deduction_override: delayOverride,
        absent_days_override: absentOverride,
        leave_days_override: leaveOverride,
        half_days_override: halfOverride,
        penalty_days: penaltyDays,
        manual_deductions_override: manualDedOverride,
        manual_bonuses_override: manualBonusOverride,
        commissions,
        transportation_allowance: transportationAllowance,
        old_advances: oldAdvances,
        previous_dues: previousDues,
        external_debts: externalDebts,
        notes,
        updated_by: user?.id || null,
        offline_uuid: savedUuid,
      });
    }
  });

  return getEmployeePayslip(id, month, user);
}

async function setBulkMonthlyRequiredHours(body = {}, user = null) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';
  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const cairoNow = await getDatabaseCairoNow(db);
  const month = (body.month && /^\d{4}-\d{2}$/.test(body.month)) ? body.month : cairoNow.month;
  const requiredHours = numOrNull(body.required_hours);
  if (requiredHours === null || requiredHours < 0) {
    const err = new Error('يرجى إدخال عدد ساعات صحيح (0 أو أكثر)');
    err.statusCode = 400;
    throw err;
  }

  const empParams = [];
  const empWhere = [];
  if (isBranchUser) {
    const authBranchIds = getUserAuthorizedBranchIds(user);
    if (body.branch_id && body.branch_id !== 'all') {
      const targetBId = Number(body.branch_id);
      if (authBranchIds !== null && !authBranchIds.includes(targetBId)) {
        const err = new Error('Unauthorized branch');
        err.statusCode = 403;
        throw err;
      }
      empWhere.push(buildEmployeeBranchFilterSql(targetBId, empParams));
    } else if (authBranchIds !== null) {
      empWhere.push(buildEmployeeBranchFilterSql(authBranchIds.length ? authBranchIds : [user.branch_id], empParams));
    }
  } else if (body.branch_id && body.branch_id !== 'all') {
    empWhere.push(buildEmployeeBranchFilterSql(body.branch_id, empParams));
  }

  const whereSql = empWhere.length ? `WHERE ${empWhere.join(' AND ')}` : '';
  const empsRes = await db.query(
    `SELECT id, name, phone, branch_id, offline_uuid, status, join_date, end_date FROM employees e ${whereSql}`,
    empParams
  );

  const monthRange = getMonthRange(month);
  let updatedCount = 0;

  await db.transaction(async (tx) => {
    for (const emp of empsRes.rows) {
      const hasActRes = await tx.query(
        `SELECT
           EXISTS(SELECT 1 FROM attendance WHERE employee_id = $1 AND date >= $2::date AND date < $3::date) AS has_att,
           EXISTS(SELECT 1 FROM employee_transactions WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date) AS has_tx,
           EXISTS(SELECT 1 FROM employee_payroll_adjustments WHERE employee_id = $1 AND month = $4) AS has_adj`,
        [emp.id, monthRange.start, monthRange.end, month]
      );
      const act = hasActRes.rows[0] || {};
      const hasActivity = Boolean(act.has_att || act.has_tx || act.has_adj);
      const { shouldIncludeEmployeeInMonth } = require('./payroll.calculator');
      if (!shouldIncludeEmployeeInMonth(emp, month, hasActivity)) continue;

      const offlineUuid = newUuid();
      const res = await tx.query(
        `INSERT INTO employee_payroll_adjustments (employee_id, month, required_hours, updated_by, updated_at, offline_uuid)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
         ON CONFLICT (employee_id, month) DO UPDATE SET
           required_hours = EXCLUDED.required_hours,
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [emp.id, month, requiredHours, user?.id || null, offlineUuid]
      );
      updatedCount += 1;

      if (config.IS_BRANCH_MODE && res.rows[0]) {
        const saved = res.rows[0];
        await queueSyncOperation(tx, null, 'employee_payroll_adjustment', 'update', saved.id, emp.branch_id || user?.branch_id || 1, {
          ...saved,
          employee_id: emp.id,
          employee_ref: { name: emp.name, phone: emp.phone, offline_uuid: emp.offline_uuid },
          month,
          required_hours: requiredHours,
          include_unused_leave_payout: boolOrNull(saved.include_unused_leave_payout),
        });
      }
    }
  });

  return { success: true, month, required_hours: requiredHours, updated_count: updatedCount };
}

async function getEmployeeSalesReport(id, queryOrUser = {}, maybeUser = null) {
  let query = {};
  let user = maybeUser;
  if (!user && queryOrUser && (queryOrUser.role || queryOrUser.username || queryOrUser.branch_id || queryOrUser.permissions)) {
    user = queryOrUser;
  } else {
    query = queryOrUser || {};
  }

  const isAdmin = user && user.role === 'admin';
  const isPrivileged = isAdmin || user?.branch_scope === 'all' || user?.role === 'accountant' || user?.role === 'supervisor';
  const isBranchUser = Boolean(user && (user.role === 'branch_user' || user.branch_id));
  const canViewSalesReport = isPrivileged || isBranchUser || hasPermission(user, 'employees.list.view') || hasPermission(user, 'reports.sales.view');

  if (!user || !canViewSalesReport) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const empRes = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (!hasBranchAccess(user, empRes.rows[0].branch_id)) {
    const err = new Error('Unauthorized access');
    err.statusCode = 403;
    throw err;
  }

  const commissionRate = Number(empRes.rows[0].commission_rate || 0);
  const daysLimit = Math.max(1, Number(query.days || config.EMPLOYEE_SALES_REPORT_DAYS || 90));
  const rowLimit = Math.max(1, Number(query.limit || config.EMPLOYEE_SALES_REPORT_LIMIT || 200));
  const { date: todayDate } = getCairoDateTimeParts();
  const cutoffDate = addDays(todayDate, -daysLimit);

  // Use portable SQL compatible with both PostgreSQL (Master) and SQLite (Branch)
  const dailyOrdersRes = await db.query(`
    SELECT
      o.id,
      COALESCE(o.branch_invoice_number, o.id) as invoice_number,
      o.branch_invoice_number,
      o.order_date,
      o.total_amount,
      o.paid_amount,
      o.status,
      COALESCE(c.name, 'عميل نقدي') as customer_name
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.seller_id = $1
      AND COALESCE(o.status, 'completed') NOT IN ('cancelled', 'canceled', 'ملغاة', 'ملغي')
    ORDER BY o.order_date DESC, o.id DESC
    LIMIT $2
  `, [id, rowLimit]);

  const toCairoDay = (val) => {
    try {
      if (!val) return todayDate;
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return String(val).slice(0, 10);
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    } catch {
      return todayDate;
    }
  };

  const dailySalesDetailsMap = new Map();
  const monthlySummaryMap = new Map();
  const sales = [];
  let totalSales = 0;
  let totalCommission = 0;

  (dailyOrdersRes.rows || []).forEach((order) => {
    const day = toCairoDay(order.order_date);
    const totalAmount = Number(order.total_amount || 0);
    const isReturned = String(order.status || '').toLowerCase() === 'returned';
    const effectiveAmount = isReturned ? 0 : totalAmount;
    const commissionAmount = Math.round(((effectiveAmount * commissionRate) / 100) * 100) / 100;

    sales.push({
      id: order.id,
      order_number: order.invoice_number || order.id,
      invoice_number: order.invoice_number || order.id,
      order_date: order.order_date,
      created_at: order.order_date,
      customer_name: order.customer_name || 'عميل نقدي',
      total_amount: totalAmount,
      paid_amount: Number(order.paid_amount ?? totalAmount),
      status: order.status || 'completed',
      commission_amount: commissionAmount,
    });

    totalSales += effectiveAmount;
    totalCommission += commissionAmount;

    if (day >= cutoffDate) {
      if (!dailySalesDetailsMap.has(day)) {
        dailySalesDetailsMap.set(day, {
          day,
          order_count: 0,
          total_sales: 0,
          orders: [],
        });
      }
      const dayEntry = dailySalesDetailsMap.get(day);
      dayEntry.order_count += 1;
      dayEntry.total_sales += effectiveAmount;
      dayEntry.orders.push({
        id: order.id,
        invoice_number: order.invoice_number,
        order_date: order.order_date,
        total_amount: totalAmount,
        status: order.status,
        customer_name: order.customer_name,
      });
    }

    const monthKey = day.slice(0, 7);
    if (!monthlySummaryMap.has(monthKey)) {
      monthlySummaryMap.set(monthKey, {
        month: monthKey,
        order_count: 0,
        customer_names: new Set(),
        total_sales: 0,
      });
    }
    const mEntry = monthlySummaryMap.get(monthKey);
    mEntry.order_count += 1;
    if (order.customer_name) mEntry.customer_names.add(order.customer_name);
    mEntry.total_sales += effectiveAmount;
  });

  const dailySalesDetails = Array.from(dailySalesDetailsMap.values());
  const monthlySummary = Array.from(monthlySummaryMap.values())
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 24)
    .map((m) => ({
      month: m.month,
      order_count: m.order_count,
      customer_count: m.customer_names.size,
      total_sales: m.total_sales,
      avg_order: m.order_count > 0 ? Math.round((m.total_sales / m.order_count) * 100) / 100 : 0,
    }));

  return {
    employee_name: empRes.rows[0].name,
    commission_rate: commissionRate,
    sales,
    total_sales: Math.round(totalSales * 100) / 100,
    total_commission: Math.round(totalCommission * 100) / 100,
    daily_sales_details: dailySalesDetails,
    monthly_summary: monthlySummary,
  };
}

module.exports = {
  getEmployeeOptions,
  getActiveSellers,
  getCheckoutReminders,
  listEmployees,
  createEmployee,
  updateEmployee,
  transferEmployee,
  deactivateEmployee,
  deleteEmployee,
  recordAttendance,
  toggleAttendance,
  handleCheckoutReminder,
  recordManualAttendance,
  getAttendanceReport,
  createEmployeeTransaction,
  deleteEmployeeTransaction,
  getEmployeeSummary,
  getEmployeeFinancialSummary: getEmployeeSummary,
  getEmployeePayslip,
  saveEmployeePayrollAdjustment,
  setBulkMonthlyRequiredHours,
  getEmployeeSalesReport,
};
