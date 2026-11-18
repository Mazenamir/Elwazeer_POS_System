const bcrypt = require('bcryptjs');
const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { normalizePermissions, defaultPermissionsForRole, hasPermission } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, getMonthRange, getMonthKey, getDatabaseCairoNow, addDays } = require('../../../shared/utils/date');
const { likePattern, newUuid } = require('../../../shared/utils/string');
const { clampInt } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { queueSyncOperation } = require('../../database/sync.helpers');
const { hasBranchAccess, getUserAuthorizedBranchIds } = require('../../middleware/branchScope.middleware');

async function getEmployeeOptions(query = {}, user = null) {
  const { date: todayDate } = getCairoDateTimeParts();
  const params = [todayDate];
  const where = [];

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
        whereParams.push(targetBId);
        where.push(`e.branch_id = $${whereParams.length}`);
      } else {
        whereParams.push(-999);
        where.push(`e.branch_id = $${whereParams.length}`);
      }
    } else if (authBranchIds !== null) {
      if (authBranchIds.length > 0) {
        if (authBranchIds.length === 1) {
          whereParams.push(authBranchIds[0]);
          where.push(`e.branch_id = $${whereParams.length}`);
        } else {
          whereParams.push(authBranchIds);
          where.push(`e.branch_id = ANY($${whereParams.length})`);
        }
      } else if (user.branch_id) {
        whereParams.push(user.branch_id);
        where.push(`e.branch_id = $${whereParams.length}`);
      }
    }
  } else if (query.branch_id && query.branch_id !== 'all') {
    whereParams.push(Number(query.branch_id));
    where.push(`e.branch_id = $${whereParams.length}`);
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

  if (pagination.enabled) {
    selectQuery = appendPagination(selectQuery, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(selectQuery, queryParams),
      db.query(countQuery, whereParams),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0]?.total || 0, pagination);
  }

  const result = await db.query(selectQuery, queryParams);
  return result.rows;
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
    basic_salary,
    phone,
    join_date,
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

  const employee = await db.transaction(async (tx) => {
    const cairoNow = await getDatabaseCairoNow(tx);
    const cleanBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
    const empUuid = body.offline_uuid || (require('crypto').randomUUID ? require('crypto').randomUUID() : ('emp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9)));
    const empResult = await tx.query(
      'INSERT INTO employees (name, position, branch_id, basic_salary, phone, join_date, shift_start, shift_end, offline_uuid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [name, position, cleanBranchId, basic_salary || 0, phone, join_date || cairoNow.date, shift_start || null, shift_end || null, empUuid]
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
    basic_salary,
    phone,
    join_date,
    create_account,
    username,
    password,
    role,
    permissions,
    shift_start,
    shift_end,
  } = body || {};

  const employee = await db.transaction(async (tx) => {
    if (isBranchUser) {
      const check = await tx.query('SELECT branch_id FROM employees WHERE id = $1', [id]);
      if (check.rows.length === 0 || !hasBranchAccess(user, check.rows[0].branch_id)) {
        const err = new Error('Unauthorized access to this employee');
        err.statusCode = 403;
        throw err;
      }
      if (branch_id && hasBranchAccess(user, branch_id)) {
        // Target branch authorized
      } else {
        branch_id = check.rows[0].branch_id;
      }
    }

    const cleanBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
    const result = await tx.query(
      'UPDATE employees SET name = $1, position = $2, branch_id = $3, basic_salary = $4, phone = $5, join_date = COALESCE($6, join_date), shift_start = $7, shift_end = $8 WHERE id = $9 RETURNING *',
      [name, position, cleanBranchId, basic_salary || 0, phone, join_date || null, shift_start || null, shift_end || null, id]
    );

    if (result.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }

    const userCheck = await tx.query('SELECT id FROM users WHERE employee_id = $1', [id]);

    if (userCheck.rows.length > 0) {
      let updateQuery = 'UPDATE users SET username = $1, role = $2, branch_id = $3, permissions = $4';
      const params = [username, role || 'branch_user', branch_id || null, JSON.stringify(permissions)];

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
          await queueSyncOperation(tx, null, 'user', 'update', userCheck.rows[0].id, branch_id || user?.branch_id || 1, {
            id: userCheck.rows[0].id,
            username,
            role: role || 'branch_user',
            branch_id: branch_id || null,
            permissions,
            employee_id: id,
            employee_offline_uuid: result.rows[0].offline_uuid,
            full_name: name || result.rows[0].name,
            ...(newPassHash ? { password_hash: newPassHash } : {}),
          });
        } catch (e) {
          console.warn('Failed to queue user update sync during employee update:', e.message);
        }
      }
    } else if (create_account && username && password) {
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

async function deleteEmployee(id, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
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

  if (isBranchUser) {
    const check = await db.query('SELECT branch_id FROM employees WHERE id = $1', [employee_id]);
    if (check.rows.length === 0 || !hasBranchAccess(user, check.rows[0].branch_id)) {
      const err = new Error('Unauthorized access to this employee');
      err.statusCode = 403;
      throw err;
    }
  }

  const result = await db.query(
    `INSERT INTO attendance (employee_id, date, check_in, check_out, status, notes) 
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, date) 
     DO UPDATE SET check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, status = EXCLUDED.status, notes = EXCLUDED.notes
     RETURNING *`,
    [employee_id, date, check_in, check_out, status || 'present', notes]
  );
  const row = result.rows[0];
  const empBranchRes = await db.query('SELECT branch_id FROM employees WHERE id = $1', [employee_id]);
  const branchId = empBranchRes.rows[0]?.branch_id || user?.branch_id || config.BRANCH_ID || 1;
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

  const empRes = await db.query('SELECT branch_id, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasBranchAccess(user, empRes.rows[0].branch_id)) {
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
    let lateMinutes = 0;
    if (empRes.rows[0].shift_start) {
      const checkInDate = new Date(`${date}T${time}`);
      const shiftStartDate = new Date(`${date}T${empRes.rows[0].shift_start}`);
      if (checkInDate > shiftStartDate) {
        lateMinutes = Math.floor((checkInDate - shiftStartDate) / 60000);
      }
    }

    const result = await db.query(
      `INSERT INTO attendance (employee_id, date, check_in, status, late_minutes)
       VALUES ($1, $2, $3, 'present', $4)
       ON CONFLICT (employee_id, date)
       DO UPDATE SET check_in = EXCLUDED.check_in, status = 'present', late_minutes = EXCLUDED.late_minutes
       RETURNING *`,
      [id, date, time, lateMinutes]
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
    let earlyDepartureMinutes = 0;
    let overtimeMinutes = 0;
    if (empRes.rows[0].shift_end) {
      const checkOutDate = new Date(`${date}T${time}`);
      const shiftEndDate = new Date(`${date}T${empRes.rows[0].shift_end}`);
      if (checkOutDate < shiftEndDate) {
        earlyDepartureMinutes = Math.floor((shiftEndDate - checkOutDate) / 60000);
      } else if (checkOutDate > shiftEndDate) {
        overtimeMinutes = Math.floor((checkOutDate - shiftEndDate) / 60000);
      }
    }

    const checkInDate = new Date(`${date}T${existingRes.rows[0].check_in}`);
    const checkOutDate = new Date(`${date}T${time}`);
    if (checkOutDate < checkInDate) checkOutDate.setDate(checkOutDate.getDate() + 1);
    const totalHours = Math.round(((checkOutDate - checkInDate) / 3600000) * 100) / 100;

    const result = await db.query(
      `UPDATE attendance
       SET check_out = $1, 
           status = 'completed',
           total_hours = $6,
           early_departure_minutes = $4,
           overtime_minutes = $5
       WHERE employee_id = $2 AND date = $3
       RETURNING *`,
      [time, id, date, earlyDepartureMinutes, overtimeMinutes, totalHours]
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

  const empRes = await db.query('SELECT branch_id, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  const employee = empRes.rows[0];
  if (isBranchUser && !hasBranchAccess(user, employee.branch_id)) {
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

  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  if (employee.shift_end) {
    const shiftStart = String(employee.shift_start || '00:00');
    const shiftEnd = String(employee.shift_end);
    const checkOutTime = String(time);
    const shiftEndDate = new Date(`${date}T${shiftEnd}`);
    const checkOutDate = new Date(`${date}T${checkOutTime}`);
    if (employee.shift_start && shiftEnd < shiftStart) {
      shiftEndDate.setDate(shiftEndDate.getDate() + 1);
      if (checkOutTime <= shiftEnd) checkOutDate.setDate(checkOutDate.getDate() + 1);
    }
    if (checkOutDate < shiftEndDate) {
      earlyDepartureMinutes = Math.floor((shiftEndDate - checkOutDate) / 60000);
    } else if (checkOutDate > shiftEndDate) {
      overtimeMinutes = Math.floor((checkOutDate - shiftEndDate) / 60000);
    }
  }

  const checkInDate = new Date(`${date}T${attendance.check_in}`);
  const checkOutDate = new Date(`${date}T${time}`);
  if (checkOutDate < checkInDate) checkOutDate.setDate(checkOutDate.getDate() + 1);
  const totalHours = Math.round(((checkOutDate - checkInDate) / 3600000) * 100) / 100;

  const result = await db.query(
    `UPDATE attendance
     SET check_out = $1,
         status = 'completed',
         total_hours = $6,
         early_departure_minutes = $4,
         overtime_minutes = $5
     WHERE employee_id = $2 AND date = $3
     RETURNING *`,
    [time, id, date, earlyDepartureMinutes, overtimeMinutes, totalHours]
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

  const empRes = await db.query('SELECT branch_id, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasBranchAccess(user, empRes.rows[0].branch_id)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;
  let totalHours = 0;

  if (status === 'present') {
    if (empRes.rows[0].shift_start && check_in) {
      const checkInDate = new Date(`${date}T${check_in}`);
      const shiftStartDate = new Date(`${date}T${empRes.rows[0].shift_start}`);
      if (checkInDate > shiftStartDate) {
        lateMinutes = Math.floor((checkInDate - shiftStartDate) / 60000);
      }
    }
    if (empRes.rows[0].shift_end && check_out) {
      const checkOutDate = new Date(`${date}T${check_out}`);
      const shiftEndDate = new Date(`${date}T${empRes.rows[0].shift_end}`);
      if (checkOutDate < shiftEndDate) {
        earlyDepartureMinutes = Math.floor((shiftEndDate - checkOutDate) / 60000);
      } else if (checkOutDate > shiftEndDate) {
        overtimeMinutes = Math.floor((checkOutDate - shiftEndDate) / 60000);
      }
    }
    if (check_in && check_out) {
      const checkInDate = new Date(`${date}T${check_in}`);
      const checkOutDate = new Date(`${date}T${check_out}`);
      if (checkOutDate < checkInDate) checkOutDate.setDate(checkOutDate.getDate() + 1);
      totalHours = (checkOutDate - checkInDate) / 3600000;
    }
  }

  const result = await db.query(
    `INSERT INTO attendance (employee_id, date, status, notes, check_in, check_out, total_hours, late_minutes, early_departure_minutes, overtime_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (employee_id, date)
     DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out, total_hours = EXCLUDED.total_hours, late_minutes = EXCLUDED.late_minutes, early_departure_minutes = EXCLUDED.early_departure_minutes, overtime_minutes = EXCLUDED.overtime_minutes
     RETURNING *`,
    [id, date, status, notes || null, check_in || null, check_out || null, totalHours, lateMinutes, earlyDepartureMinutes, overtimeMinutes]
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

  const empRes = await db.query('SELECT branch_id, name FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Employee not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasBranchAccess(user, empRes.rows[0].branch_id)) {
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

  return {
    employee_name: empRes.rows[0].name,
    daily_attendance: attendanceRes.rows,
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

  if (isBranchUser) {
    const check = await db.query('SELECT branch_id FROM employees WHERE id = $1', [employee_id]);
    if (check.rows.length === 0 || !hasBranchAccess(user, check.rows[0].branch_id)) {
      const err = new Error('Unauthorized access to this employee');
      err.statusCode = 403;
      throw err;
    }
  }

  const offlineUuid = newUuid(body?.offline_uuid);
  const cairoNow = await getDatabaseCairoNow();
  const result = await db.query(
    'INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes, offline_uuid) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [employee_id, type, amount, transaction_date || cairoNow.date, notes || null, offlineUuid]
  );
  const transRow = result.rows[0];
  const empBranchRes = await db.query('SELECT branch_id FROM employees WHERE id = $1', [employee_id]);
  const branchId = empBranchRes.rows[0]?.branch_id || user?.branch_id || config.BRANCH_ID || 1;
  await queueSyncOperation(db, null, 'employee_transaction', 'create', transRow.id, branchId, {
    id: transRow.id,
    employee_id: transRow.employee_id,
    type: transRow.type,
    amount: transRow.amount,
    transaction_date: transRow.transaction_date,
    notes: transRow.notes,
    offline_uuid: transRow.offline_uuid || offlineUuid,
    branch_id: branchId,
  });
  return transRow;
}

async function getEmployeeSummary(id, monthParam, user, options = {}) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role !== 'admin';

  if (!isAdmin && !isBranchUser) {
    const err = new Error('Unauthorized');
    err.statusCode = 403;
    throw err;
  }

  const month = monthParam || getCairoDateTimeParts().date.substring(0, 7);
  const empRes = await db.query('SELECT branch_id, basic_salary FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasBranchAccess(user, empRes.rows[0].branch_id)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const isAdvanceMode = Boolean(options.advanceOnly || options.type === 'advance');
  const hasPayrollView = !isAdvanceMode && (isAdmin || Boolean(user && hasPermission(user, 'employees.payroll.view')));
  const canSeeSalary = !isAdvanceMode && (isAdmin || Boolean(hasPayrollView && user?.salaryAccessVerified));

  const rawBasicSalary = Number(empRes.rows[0].basic_salary);
  const basic_salary = canSeeSalary ? rawBasicSalary : null;
  const monthRange = getMonthRange(month);

  const transRes = await db.query(
    `SELECT type, SUM(amount) as total 
     FROM employee_transactions 
     WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
     GROUP BY type`,
    [id, monthRange.start, monthRange.end]
  );
  let advances = 0;
  let deductions = 0;
  let bonuses = 0;
  let salaryPayments = 0;

  transRes.rows.forEach((r) => {
    if (r.type === 'advance') advances = Number(r.total);
    if (!isAdvanceMode) {
      if (r.type === 'deduction') deductions = Number(r.total);
      if (r.type === 'bonus') bonuses = Number(r.total);
      if (r.type === 'salary_payment') salaryPayments = Number(r.total);
    }
  });

  const net_salary = canSeeSalary ? (salaryPayments + bonuses - advances - deductions) : null;
  const remaining_salary = canSeeSalary ? (rawBasicSalary + bonuses - advances - deductions - salaryPayments) : null;

  const [year, monthNumber] = month.split('-').map(Number);

  const dailyTransRes = await db.query(
    `SELECT TO_CHAR(transaction_date, 'YYYY-MM-DD') as day, type, SUM(amount) as total
     FROM employee_transactions
     WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
     GROUP BY day, type`,
    [id, monthRange.start, monthRange.end]
  );

  const dailyMap = new Map();
  dailyTransRes.rows.forEach((row) => {
    if (!dailyMap.has(row.day)) {
      dailyMap.set(row.day, { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 });
    }
    const entry = dailyMap.get(row.day);
    if (row.type === 'advance') entry.advances = Number(row.total);
    if (!isAdvanceMode) {
      if (row.type === 'deduction') entry.deductions = Number(row.total);
      if (row.type === 'bonus') entry.bonuses = Number(row.total);
      if (row.type === 'salary_payment') entry.salary_payments = Number(row.total);
    }
  });

  const daily_summary = [];
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
      daily_summary.push({
        day: dayKey,
        basic_salary: canSeeSalary ? rawBasicSalary : null,
        salary_payments: hasPayrollView ? entry.salary_payments : 0,
        advances: entry.advances,
        deductions: hasPayrollView ? entry.deductions : 0,
        bonuses: hasPayrollView ? entry.bonuses : 0,
        net_salary: canSeeSalary ? (entry.salary_payments + entry.bonuses - entry.advances - entry.deductions) : null,
        remaining_salary: canSeeSalary
          ? (rawBasicSalary + runningDaily.bonuses - runningDaily.advances - runningDaily.deductions - runningDaily.salary_payments)
          : null,
      });
    }
  });

  daily_summary.sort((a, b) => b.day.localeCompare(a.day));

  const selectedMonthDate = new Date(Date.UTC(year, monthNumber - 1, 1));
  const monthKeys = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    monthKeys.push(getMonthKey(new Date(Date.UTC(selectedMonthDate.getUTCFullYear(), selectedMonthDate.getUTCMonth() - offset, 1))));
  }

  const monthlyTransRes = await db.query(
    `SELECT TO_CHAR(transaction_date, 'YYYY-MM') as month, type, SUM(amount) as total
     FROM employee_transactions
     WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
     GROUP BY month, type`,
    [id, `${monthKeys[0]}-01`, getMonthRange(monthKeys[monthKeys.length - 1]).end]
  );

  const monthlyMap = new Map();
  monthlyTransRes.rows.forEach((row) => {
    if (!monthlyMap.has(row.month)) {
      monthlyMap.set(row.month, { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 });
    }
    const entry = monthlyMap.get(row.month);
    if (row.type === 'advance') entry.advances = Number(row.total);
    if (!isAdvanceMode) {
      if (row.type === 'deduction') entry.deductions = Number(row.total);
      if (row.type === 'bonus') entry.bonuses = Number(row.total);
      if (row.type === 'salary_payment') entry.salary_payments = Number(row.total);
    }
  });

  const monthly_summary = [];
  monthKeys.forEach((monthKey) => {
    const entry = monthlyMap.get(monthKey) || { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 };
    const shouldInclude = hasPayrollView
      ? (monthKey === month || entry.salary_payments > 0 || entry.advances > 0 || entry.deductions > 0 || entry.bonuses > 0)
      : (monthKey === month || entry.advances > 0);

    if (shouldInclude) {
      monthly_summary.push({
        month: monthKey,
        basic_salary: canSeeSalary ? rawBasicSalary : null,
        salary_payments: hasPayrollView ? entry.salary_payments : 0,
        advances: entry.advances,
        deductions: hasPayrollView ? entry.deductions : 0,
        bonuses: hasPayrollView ? entry.bonuses : 0,
        net_salary: canSeeSalary ? (entry.salary_payments + entry.bonuses - entry.advances - entry.deductions) : null,
        remaining_salary: canSeeSalary
          ? (rawBasicSalary + entry.bonuses - entry.advances - entry.deductions - entry.salary_payments)
          : null,
      });
    }
  });
  monthly_summary.reverse();

  return {
    basic_salary,
    salary_payments: hasPayrollView ? salaryPayments : 0,
    advances,
    deductions: hasPayrollView ? deductions : 0,
    bonuses: hasPayrollView ? bonuses : 0,
    net_salary,
    remaining_salary,
    month,
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

  const month = monthParam || getCairoDateTimeParts().date.substring(0, 7);
  const empRes = await db.query('SELECT name, position, branch_id, basic_salary, shift_start, shift_end FROM employees WHERE id = $1', [id]);
  if (empRes.rows.length === 0) {
    const err = new Error('Not found');
    err.statusCode = 404;
    throw err;
  }

  if (isBranchUser && !hasBranchAccess(user, empRes.rows[0].branch_id)) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const branchRes = await db.query('SELECT name FROM branches WHERE id = $1', [empRes.rows[0].branch_id]);
  const branchName = branchRes.rows.length > 0 ? branchRes.rows[0].name : '';

  const basic_salary = Number(empRes.rows[0].basic_salary) || 0;
  const monthRange = getMonthRange(month);

  // 1. Transactions
  const transRes = await db.query(
    `SELECT type, SUM(amount) as total 
     FROM employee_transactions 
     WHERE employee_id = $1 AND transaction_date >= $2::date AND transaction_date < $3::date
     GROUP BY type`,
    [id, monthRange.start, monthRange.end]
  );
  const transactionDetailsRes = await db.query(
    `SELECT id, type, amount, transaction_date, notes
     FROM employee_transactions
     WHERE employee_id = $1
       AND type IN ('bonus', 'deduction')
       AND transaction_date >= $2::date
       AND transaction_date < $3::date
     ORDER BY transaction_date, id`,
    [id, monthRange.start, monthRange.end]
  );

  let advances = 0;
  let deductions = 0;
  let bonuses = 0;
  let salaryPayments = 0;

  transRes.rows.forEach((r) => {
    if (r.type === 'advance') advances = Number(r.total);
    if (r.type === 'deduction') deductions = Number(r.total);
    if (r.type === 'bonus') bonuses = Number(r.total);
    if (r.type === 'salary_payment') salaryPayments = Number(r.total);
  });

  // 2. Attendance
  const attRes = await db.query(
    `SELECT 
       status,
       notes,
       COALESCE(late_minutes, 0) as late_minutes,
       COALESCE(early_departure_minutes, 0) as early_minutes,
       COALESCE(overtime_minutes, 0) as overtime_minutes,
       COALESCE(total_hours, 0) as total_hours
     FROM attendance
     WHERE employee_id = $1 AND date >= $2::date AND date < $3::date`,
    [id, monthRange.start, monthRange.end]
  );

  let lateMinutes = 0;
  let earlyMinutes = 0;
  let overtimeMinutes = 0;
  let absentDays = 0;
  let leaveDays = 0;
  let halfDays = 0;
  let totalHours = 0;

  attRes.rows.forEach((r) => {
    lateMinutes += Number(r.late_minutes || 0);
    earlyMinutes += Number(r.early_minutes || 0);
    overtimeMinutes += Number(r.overtime_minutes || 0);
    totalHours += Number(r.total_hours || 0);
    const notes = String(r.notes || '');
    const status = String(r.status || '');
    if (notes.includes('غياب') || status === 'absent') absentDays += 1;
    if (notes.includes('جاز') || notes.includes('إجازة') || status === 'leave') leaveDays += 1;
    if (notes.includes('نص يوم') || status === 'half_day') halfDays += 1;
  });

  // Calculate according to Elwazeer standard payroll invariants
  const requiredHours = 268;
  const actualHours = Math.round(totalHours * 100) / 100;
  const dailyRate = Math.round((basic_salary / 30) * 100) / 100;
  const absenceDeduction = Math.round(absentDays * dailyRate * 2); // Double penalty
  const leaveDeduction = Math.round(Math.max(0, leaveDays - 4) * dailyRate); // 4 days allowed
  const halfDayDeduction = Math.round(halfDays * (dailyRate / 2));

  let delayHours = 0;
  let overtimeHours = 0;
  if (totalHours > 0) {
    delayHours = actualHours < requiredHours ? Math.round((requiredHours - actualHours) * 100) / 100 : 0;
    overtimeHours = actualHours > requiredHours ? Math.round((actualHours - requiredHours) * 100) / 100 : 0;
  } else if (lateMinutes > 0 || earlyMinutes > 0 || overtimeMinutes > 0) {
    delayHours = Math.round(((lateMinutes + earlyMinutes) / 60) * 100) / 100;
    overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
  }

  const delayDeduction = Math.round(delayHours * (dailyRate / 10));
  const lateDeduction = delayDeduction;
  const earlyDeduction = 0;
  const overtimeAmount = Math.round(((dailyRate / 10) * 1.35) * overtimeHours);
  const overtimeBonus = overtimeAmount;

  const totalDeductions = deductions + advances + absenceDeduction + leaveDeduction + halfDayDeduction + delayDeduction;
  const totalBonuses = bonuses + overtimeBonus;

  const netSalary = Math.round(basic_salary + totalBonuses - totalDeductions);
  const remainingBalance = netSalary - salaryPayments;

  return {
    employee: {
      name: empRes.rows[0].name,
      position: empRes.rows[0].position,
      branch_name: branchName,
    },
    month,
    basic_salary,
    bonuses: totalBonuses,
    commissions: 0,
    advances,
    deductions: totalDeductions,
    already_paid: salaryPayments,
    net_salary: netSalary,
    financials: {
      advances,
      deductions_manual: deductions,
      bonuses_manual: bonuses,
      salary_payments: salaryPayments,
      bonus_details: transactionDetailsRes.rows
        .filter((row) => row.type === 'bonus')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          notes: String(row.notes || 'مكافأة').replace(/\s*\[EXP-[^\]]+\]\s*/g, ' ').trim(),
        })),
      deduction_details: transactionDetailsRes.rows
        .filter((row) => row.type === 'deduction')
        .map((row) => ({
          id: row.id,
          amount: Number(row.amount || 0),
          date: row.transaction_date,
          notes: row.notes || 'خصم',
        })),
    },
    attendance: {
      absent_days: absentDays,
      leave_days: leaveDays,
      half_days: halfDays,
      late_minutes: lateMinutes,
      early_minutes: earlyMinutes,
      overtime_minutes: overtimeMinutes,
      actual_hours: actualHours,
      required_hours: requiredHours,
      delay_hours: delayHours,
      overtime_hours: overtimeHours,
      daily_rate: dailyRate,
      absence_deduction: Number(absenceDeduction.toFixed(2)),
      leave_deduction: Number(leaveDeduction.toFixed(2)),
      half_day_deduction: Number(halfDayDeduction.toFixed(2)),
      delay_deduction: Number(delayDeduction.toFixed(2)),
      late_deduction: Number(lateDeduction.toFixed(2)),
      early_deduction: Number(earlyDeduction.toFixed(2)),
      overtime_bonus: Number(overtimeBonus.toFixed(2)),
      overtime_amount: Number(overtimeAmount.toFixed(2)),
    },
    totals: {
      total_deductions: Number(totalDeductions.toFixed(2)),
      total_bonuses: Number(totalBonuses.toFixed(2)),
      net_salary: Number(netSalary.toFixed(2)),
      remaining_balance: Number(remainingBalance.toFixed(2)),
    },
  };
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
  deleteEmployee,
  recordAttendance,
  toggleAttendance,
  handleCheckoutReminder,
  recordManualAttendance,
  getAttendanceReport,
  createEmployeeTransaction,
  getEmployeeSummary,
  getEmployeeFinancialSummary: getEmployeeSummary,
  getEmployeePayslip,
  getEmployeeSalesReport,
};
