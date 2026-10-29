const bcrypt = require('bcryptjs');
const db = require('../../database/connection');
const config = require('../../config/env');
const { CAIRO_DATE_SQL, CAIRO_NOW_SQL } = require('../../../shared/constants/system');
const { normalizePermissions, defaultPermissionsForRole } = require('../../../shared/constants/permissions');
const { getCairoDateTimeParts, getMonthRange, getMonthKey, getDatabaseCairoNow } = require('../../../shared/utils/date');
const { likePattern } = require('../../../shared/utils/string');
const { clampInt } = require('../../../shared/utils/numbers');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');

async function getEmployeeOptions(query = {}, user = null) {
  const { date: todayDate } = getCairoDateTimeParts();
  const params = [todayDate];
  const where = [];

  if (user && user.role !== 'admin') {
    params.push(user.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  } else if (query.branch_id && query.branch_id !== 'all') {
    params.push(query.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  }

  if (query.search) {
    params.push(likePattern(query.search));
    where.push(`(e.name ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
  }

  const limit = clampInt(query.limit, 50, 10, 100);
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
    params.push(user.branch_id);
    where.push(`e.branch_id = $${params.length}`);
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

  if (isBranchUser) {
    params.push(user.branch_id);
    where.push(`e.branch_id = $${params.length}`);
  } else if (branchId && branchId !== 'all') {
    params.push(branchId);
    where.push(`e.branch_id = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await db.query(`
    WITH open_attendance AS (
      SELECT
        e.id,
        e.name,
        e.position,
        e.branch_id,
        b.name AS branch_name,
        e.shift_start,
        e.shift_end,
        a.date AS attendance_date,
        a.check_in,
        a.check_out,
        CASE
          WHEN e.shift_start IS NOT NULL AND e.shift_end < e.shift_start
            THEN (a.date + e.shift_end + INTERVAL '1 day')
          ELSE (a.date + e.shift_end)
        END AS shift_due_at
      FROM employees e
      JOIN attendance a ON a.employee_id = e.id
      LEFT JOIN branches b ON b.id = e.branch_id
      ${whereClause}
    )
    SELECT
      id,
      name,
      position,
      branch_id,
      branch_name,
      shift_start,
      shift_end,
      TO_CHAR(attendance_date, 'YYYY-MM-DD') AS attendance_date,
      check_in,
      check_out,
      TO_CHAR(shift_due_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS shift_due_at,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${CAIRO_NOW_SQL} - shift_due_at)) / 60))::int AS overdue_minutes
    FROM open_attendance
    WHERE shift_due_at <= ${CAIRO_NOW_SQL}
    ORDER BY shift_due_at ASC, name ASC, id ASC
  `, params);

  return { reminders: rows };
}

async function listEmployees(query = {}, user = null, req = null) {
  const pagination = parsePagination(req || { query }, 50, 200, true);
  const { date: todayDate } = getCairoDateTimeParts();
  const selectedMonth = query.month && /^\d{4}-\d{2}$/.test(query.month)
    ? query.month
    : todayDate.substring(0, 7);
  const monthRange = getMonthRange(selectedMonth);

  const whereParams = [];
  const where = [];

  if (user && user.role !== 'admin') {
    whereParams.push(user.branch_id);
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
  if (query.branch_id && query.branch_id !== 'all' && (!user || user.role === 'admin')) {
    whereParams.push(query.branch_id);
    where.push(`e.branch_id = $${whereParams.length}`);
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
    branch_id = user.branch_id;
  }

  let normalizedPerms = normalizePermissions(permissions);
  if (normalizedPerms.length === 0) normalizedPerms = defaultPermissionsForRole(role);

  const employee = await db.transaction(async (tx) => {
    const cairoNow = await getDatabaseCairoNow(tx);
    const cleanBranchId = (branch_id && Number(branch_id) > 0) ? Number(branch_id) : null;
    const empResult = await tx.query(
      'INSERT INTO employees (name, position, branch_id, basic_salary, phone, join_date, shift_start, shift_end) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, position, cleanBranchId, basic_salary || 0, phone, join_date || cairoNow.date, shift_start || null, shift_end || null]
    );

    if (create_account && username && password) {
      const userCheck = await tx.query('SELECT id FROM users WHERE username = $1', [username]);
      if (userCheck.rows.length > 0) {
        const err = new Error('Username already exists');
        err.statusCode = 400;
        throw err;
      }

      const password_hash = await bcrypt.hash(password, 10);
      await tx.query(
        'INSERT INTO users (username, password_hash, role, branch_id, permissions, employee_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [username, password_hash, role || 'branch_user', cleanBranchId, JSON.stringify(normalizedPerms), empResult.rows[0].id]
      );
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
      if (check.rows.length === 0 || check.rows[0].branch_id !== user.branch_id) {
        const err = new Error('Unauthorized access to this employee');
        err.statusCode = 403;
        throw err;
      }
      branch_id = user.branch_id;
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

      if (password) {
        const password_hash = await bcrypt.hash(password, 10);
        updateQuery += ', password_hash = $5 WHERE employee_id = $6';
        params.push(password_hash, id);
      } else {
        updateQuery += ' WHERE employee_id = $5';
        params.push(id);
      }

      await tx.query(updateQuery, params);
    } else if (create_account && username && password) {
      const usernameExists = await tx.query('SELECT id FROM users WHERE username = $1', [username]);
      if (usernameExists.rows.length > 0) {
        const err = new Error('Username already exists');
        err.statusCode = 400;
        throw err;
      }

      const password_hash = await bcrypt.hash(password, 10);
      await tx.query(
        'INSERT INTO users (username, password_hash, role, branch_id, permissions, employee_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [username, password_hash, role || 'branch_user', branch_id || null, JSON.stringify(permissions), id]
      );
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
    const emp = await tx.query('SELECT id, name, branch_id FROM employees WHERE id = $1', [id]);
    if (emp.rows.length === 0) {
      const err = new Error('Employee not found');
      err.statusCode = 404;
      throw err;
    }
    const updated = await tx.query(
      'UPDATE employees SET branch_id = $1 WHERE id = $2 RETURNING *',
      [targetBranchId, id]
    );
    await tx.query('UPDATE users SET branch_id = $1 WHERE employee_id = $2', [targetBranchId, id]);
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
      if (check.rows.length === 0 || check.rows[0].branch_id !== user.branch_id) {
        const err = new Error('Unauthorized access to this employee');
        err.statusCode = 403;
        throw err;
      }
    }

    await tx.query('DELETE FROM attendance WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM employee_transactions WHERE employee_id = $1', [id]);
    await tx.query('DELETE FROM users WHERE employee_id = $1', [id]);
    return tx.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
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
    if (check.rows.length === 0 || check.rows[0].branch_id !== user.branch_id) {
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
  return result.rows[0];
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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
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

    const result = await db.query(
      `UPDATE attendance
       SET check_out = $1, 
           status = 'completed',
           total_hours = CASE 
              WHEN $1::time >= check_in::time THEN EXTRACT(EPOCH FROM ($1::time - check_in::time))/3600.0
              ELSE EXTRACT(EPOCH FROM ($1::time + interval '24 hours' - check_in::time))/3600.0
           END,
           early_departure_minutes = $4,
           overtime_minutes = $5
       WHERE employee_id = $2 AND date = $3
       RETURNING *`,
      [time, id, date, earlyDepartureMinutes, overtimeMinutes]
    );
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
  if (isBranchUser && Number(employee.branch_id) !== Number(user.branch_id)) {
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

  const result = await db.query(
    `UPDATE attendance
     SET check_out = $1,
         status = 'completed',
         total_hours = CASE
            WHEN $1::time >= check_in::time THEN EXTRACT(EPOCH FROM ($1::time - check_in::time))/3600.0
            ELSE EXTRACT(EPOCH FROM ($1::time + interval '24 hours' - check_in::time))/3600.0
         END,
         early_departure_minutes = $4,
         overtime_minutes = $5
     WHERE employee_id = $2 AND date = $3
     RETURNING *`,
    [time, id, date, earlyDepartureMinutes, overtimeMinutes]
  );
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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
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
    if (check.rows.length === 0 || check.rows[0].branch_id !== user.branch_id) {
      const err = new Error('Unauthorized access to this employee');
      err.statusCode = 403;
      throw err;
    }
  }

  const cairoNow = await getDatabaseCairoNow();
  const result = await db.query(
    'INSERT INTO employee_transactions (employee_id, type, amount, transaction_date, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [employee_id, type, amount, transaction_date || cairoNow.date, notes]
  );
  return result.rows[0];
}

async function getEmployeeSummary(id, monthParam, user) {
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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
    const err = new Error('Unauthorized access to this employee');
    err.statusCode = 403;
    throw err;
  }

  const basic_salary = Number(empRes.rows[0].basic_salary);
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
    if (r.type === 'deduction') deductions = Number(r.total);
    if (r.type === 'bonus') bonuses = Number(r.total);
    if (r.type === 'salary_payment') salaryPayments = Number(r.total);
  });

  const net_salary = salaryPayments + bonuses - advances - deductions;
  const remaining_salary = basic_salary + bonuses - advances - deductions - salaryPayments;

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
    if (row.type === 'deduction') entry.deductions = Number(row.total);
    if (row.type === 'bonus') entry.bonuses = Number(row.total);
    if (row.type === 'salary_payment') entry.salary_payments = Number(row.total);
  });

  const daily_summary = [];
  const runningDaily = { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 };
  Array.from(dailyMap.keys()).sort().forEach((dayKey) => {
    const entry = dailyMap.get(dayKey);
    runningDaily.salary_payments += entry.salary_payments;
    runningDaily.advances += entry.advances;
    runningDaily.deductions += entry.deductions;
    runningDaily.bonuses += entry.bonuses;
    if (entry.salary_payments > 0 || entry.advances > 0 || entry.deductions > 0 || entry.bonuses > 0) {
      daily_summary.push({
        day: dayKey,
        basic_salary,
        salary_payments: entry.salary_payments,
        advances: entry.advances,
        deductions: entry.deductions,
        bonuses: entry.bonuses,
        net_salary: entry.salary_payments + entry.bonuses - entry.advances - entry.deductions,
        remaining_salary: basic_salary + runningDaily.bonuses - runningDaily.advances - runningDaily.deductions - runningDaily.salary_payments,
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
    if (row.type === 'deduction') entry.deductions = Number(row.total);
    if (row.type === 'bonus') entry.bonuses = Number(row.total);
    if (row.type === 'salary_payment') entry.salary_payments = Number(row.total);
  });

  const monthly_summary = [];
  monthKeys.forEach((monthKey) => {
    const entry = monthlyMap.get(monthKey) || { salary_payments: 0, advances: 0, deductions: 0, bonuses: 0 };
    if (monthKey === month || entry.salary_payments > 0 || entry.advances > 0 || entry.deductions > 0 || entry.bonuses > 0) {
      monthly_summary.push({
        month: monthKey,
        basic_salary,
        salary_payments: entry.salary_payments,
        advances: entry.advances,
        deductions: entry.deductions,
        bonuses: entry.bonuses,
        net_salary: entry.salary_payments + entry.bonuses - entry.advances - entry.deductions,
        remaining_salary: basic_salary + entry.bonuses - entry.advances - entry.deductions - entry.salary_payments,
      });
    }
  });
  monthly_summary.reverse();

  return {
    basic_salary,
    salary_payments: salaryPayments,
    advances,
    deductions,
    bonuses,
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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
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

async function getEmployeeSalesReport(id, user) {
  const isAdmin = user && user.role === 'admin';
  const isBranchUser = user && user.role === 'branch_user';

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

  if (isBranchUser && empRes.rows[0].branch_id !== user.branch_id) {
    const err = new Error('Unauthorized access');
    err.statusCode = 403;
    throw err;
  }

  const dailyOrdersRes = await db.query(`
    SELECT
      o.id,
      COALESCE(o.branch_invoice_number, o.id) as invoice_number,
      o.order_date,
      TO_CHAR((o.order_date AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Cairo')::date, 'YYYY-MM-DD') as day,
      o.total_amount,
      o.status,
      COALESCE(c.name, 'عميل نقدي') as customer_name
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.seller_id = $1
      AND o.order_date >= ${CAIRO_DATE_SQL} - ($2::int * INTERVAL '1 day')
    ORDER BY o.order_date DESC
    LIMIT $3
  `, [id, config.EMPLOYEE_SALES_REPORT_DAYS, config.EMPLOYEE_SALES_REPORT_LIMIT]);

  const dailySalesDetailsMap = new Map();
  dailyOrdersRes.rows.forEach((order) => {
    if (!dailySalesDetailsMap.has(order.day)) {
      dailySalesDetailsMap.set(order.day, {
        day: order.day,
        order_count: 0,
        total_sales: 0,
        orders: [],
      });
    }

    const dayEntry = dailySalesDetailsMap.get(order.day);
    const totalAmount = Number(order.total_amount || 0);
    dayEntry.order_count += 1;
    dayEntry.total_sales += totalAmount;
    dayEntry.orders.push({
      id: order.id,
      invoice_number: order.invoice_number,
      order_date: order.order_date,
      total_amount: totalAmount,
      status: order.status,
      customer_name: order.customer_name,
    });
  });

  const dailySalesDetails = Array.from(dailySalesDetailsMap.values());

  const monthlySummary = await db.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM') as month,
      COUNT(o.id) as order_count,
      COUNT(DISTINCT o.customer_id) FILTER (WHERE o.customer_id IS NOT NULL) as customer_count,
      COALESCE(SUM(o.total_amount), 0) as total_sales,
      COALESCE(AVG(o.total_amount), 0) as avg_order
    FROM orders o
    WHERE o.seller_id = $1
      AND o.order_date >= DATE_TRUNC('month', ${CAIRO_DATE_SQL}) - INTERVAL '23 months'
    GROUP BY DATE_TRUNC('month', o.order_date)
    ORDER BY DATE_TRUNC('month', o.order_date) DESC
    LIMIT 24
  `, [id]);

  return {
    employee_name: empRes.rows[0].name,
    daily_sales_details: dailySalesDetails,
    monthly_summary: monthlySummary.rows,
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
