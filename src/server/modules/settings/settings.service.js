const bcrypt = require('bcryptjs');
const db = require('../../database/connection');
const config = require('../../config/env');
const { DEFAULT_SETTINGS, BACKUP_GROUPS } = require('../../../shared/constants/system');
const {
  quoteIdent,
  normalizeBackupGroups,
  tablesForBackupGroups,
  shouldLimitUsersToBranchAccounts,
  isBackupRowObject,
  filterBackupRowsForGroup,
  backupHasAdminUser,
  normalizeBackupValue,
  getTableColumns,
  getTableColumnTypes,
  getPrimaryKeyColumns,
  resetTableSequence,
} = require('./backup.helpers');

const PUBLIC_SETTINGS_KEYS = new Set([
  'store_name',
  'tax_rate',
  'store_email',
  'store_phone',
  'store_address',
  'show_email',
  'show_phone',
  'show_address',
  'cashier_footer',
  'rental_footer',
  'rental_fine_per_day',
  'currency',
  'logo',
  'system_logo',
]);

async function getPublicSettings() {
  const result = {};
  for (const key of PUBLIC_SETTINGS_KEYS) {
    if (DEFAULT_SETTINGS[key] !== undefined) {
      result[key] = DEFAULT_SETTINGS[key];
    }
  }
  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare('SELECT key, value FROM settings').all();
    for (const r of rows) {
      if (PUBLIC_SETTINGS_KEYS.has(r.key)) {
        result[r.key] = r.value;
      }
    }
    return result;
  }
  const { rows } = await db.query('SELECT key, value FROM settings');
  for (const r of rows) {
    if (PUBLIC_SETTINGS_KEYS.has(r.key)) {
      result[r.key] = r.value;
    }
  }
  return result;
}

async function getSettings() {
  const result = { ...DEFAULT_SETTINGS };
  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare('SELECT key, value FROM settings').all();
    for (const r of rows) result[r.key] = r.value;
    return result;
  }
  const { rows } = await db.query('SELECT key, value FROM settings');
  for (const r of rows) result[r.key] = r.value;
  return result;
}

async function saveSettings(settingsObj) {
  if (config.IS_BRANCH_MODE) {
    const stmt = db.sqlite.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    for (const [key, value] of Object.entries(settingsObj)) {
      stmt.run(key, String(value ?? ''));
    }
    return { success: true };
  }

  await db.transaction(async (tx) => {
    for (const [key, value] of Object.entries(settingsObj)) {
      await tx.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, String(value ?? '')]
      );
    }
  });

  return { success: true };
}

function getBackupGroups() {
  return Object.entries(BACKUP_GROUPS).map(([key, group]) => ({
    key,
    label: group.label,
    tables: group.tables,
  }));
}

async function exportBackup(groupsParam, user) {
  if (config.IS_BRANCH_MODE) {
    const err = new Error('تصدير النسخة الاحتياطية متاح في وضع السيرفر الرئيسي فقط');
    err.statusCode = 400;
    throw err;
  }

  const selectedGroups = normalizeBackupGroups(groupsParam);
  const tables = tablesForBackupGroups(selectedGroups);
  if (!tables.length) {
    const err = new Error('اختر مجموعة بيانات واحدة على الأقل');
    err.statusCode = 400;
    throw err;
  }

  const backup = {
    app: 'Bebyoon System',
    version: '1',
    created_at: new Date().toISOString(),
    created_by: {
      id: user.id,
      username: user.username,
    },
    groups: selectedGroups,
    tables: {},
  };

  for (const table of tables) {
    const columns = await getTableColumns(table);
    if (!columns.length) continue;
    const pk = await getPrimaryKeyColumns(table);
    const orderBy = pk.length ? ` ORDER BY ${pk.map(quoteIdent).join(', ')}` : '';
    const whereSql = table === 'users' && shouldLimitUsersToBranchAccounts(selectedGroups) ? " WHERE role != 'admin'" : '';
    const { rows } = await db.query(`SELECT * FROM ${quoteIdent(table)}${whereSql}${orderBy}`);
    backup.tables[table] = {
      columns,
      primary_key: pk,
      filter: table === 'users' && shouldLimitUsersToBranchAccounts(selectedGroups) ? 'branch_accounts' : 'all',
      rows,
    };
  }

  return {
    backup,
    filename: `bebyoon-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`,
  };
}

async function restoreBackup(body) {
  if (config.IS_BRANCH_MODE) {
    const err = new Error('استعادة النسخة الاحتياطية متاحة في وضع السيرفر الرئيسي فقط');
    err.statusCode = 400;
    throw err;
  }

  const { backup, groups, replace_all } = body || {};
  if (!backup || !backup.tables || typeof backup.tables !== 'object') {
    const err = new Error('ملف النسخة الاحتياطية غير صالح');
    err.statusCode = 400;
    throw err;
  }

  const selectedGroups = normalizeBackupGroups(groups?.length ? groups : backup.groups);
  const expectedTables = tablesForBackupGroups(selectedGroups);
  const tables = expectedTables.filter((table) => backup.tables[table]);

  if (!tables.length) {
    const err = new Error('لا توجد بيانات مطابقة للاختيار داخل ملف النسخة');
    err.statusCode = 400;
    throw err;
  }

  const allGroupsSelected = selectedGroups.length === Object.keys(BACKUP_GROUPS).length;
  const replaceAll = (replace_all === true || replace_all === 'true') && allGroupsSelected;

  if (replaceAll && tables.length !== expectedTables.length) {
    const missingTables = expectedTables.filter((t) => !backup.tables[t]);
    const err = new Error(`لا يمكن تنفيذ استبدال كامل لأن ملف النسخة ناقص الجداول التالية: ${missingTables.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  if (replaceAll && !backupHasAdminUser(backup)) {
    const err = new Error('لا يمكن تنفيذ استبدال كامل لأن ملف النسخة لا يحتوي على حساب مدير');
    err.statusCode = 400;
    throw err;
  }

  const summary = {};

  await db.transaction(async (tx) => {
    if (replaceAll) {
      await tx.query(`TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`);
    }

    for (const table of tables) {
      const tableBackup = backup.tables[table] || {};
      const backupRows = Array.isArray(tableBackup.rows) ? tableBackup.rows : [];
      const rawRows = backupRows.filter(isBackupRowObject);
      const rows = filterBackupRowsForGroup(table, rawRows, selectedGroups);
      const actualColumns = await getTableColumns(table);
      const columnTypes = await getTableColumnTypes(table);
      const allowedColumns = new Set(actualColumns);
      const columns = (Array.isArray(tableBackup.columns) ? tableBackup.columns : actualColumns)
        .filter((col) => allowedColumns.has(col));
      const primaryKey = (Array.isArray(tableBackup.primary_key) && tableBackup.primary_key.length
        ? tableBackup.primary_key
        : await getPrimaryKeyColumns(table)).filter((col) => columns.includes(col));

      const skippedByFilter = (backupRows.length - rawRows.length) + (rawRows.length - rows.length);

      if (!columns.length) {
        summary[table] = { restored: 0, skipped: backupRows.length };
        continue;
      }

      let restored = 0;
      let skipped = skippedByFilter;

      for (const row of rows) {
        const values = columns.map((col) => normalizeBackupValue(row[col], columnTypes.get(col)));
        const placeholders = columns.map((_, idx) => `$${idx + 1}`);

        if (primaryKey.length) {
          const updateAssignments = columns
            .filter((col) => !primaryKey.includes(col))
            .map((col) => `${quoteIdent(col)} = EXCLUDED.${quoteIdent(col)}`);

          const conflictAction = updateAssignments.length
            ? `DO UPDATE SET ${updateAssignments.join(', ')}`
            : 'DO NOTHING';

          await tx.query(
            `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')})
             VALUES (${placeholders.join(', ')})
             ON CONFLICT (${primaryKey.map(quoteIdent).join(', ')}) ${conflictAction}`,
            values
          );
        } else {
          await tx.query(
            `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')})
             VALUES (${placeholders.join(', ')})`,
            values
          );
        }
        restored += 1;
      }

      await resetTableSequence(tx, table);
      summary[table] = { restored, skipped };
    }
  });

  return { success: true, replace_all: replaceAll, summary };
}

async function resetSystem({ password, full_wipe }, user) {
  const fullWipe = full_wipe === true || full_wipe === 'true';
  if (!password) {
    const err = new Error('كلمة المرور مطلوبة');
    err.statusCode = 400;
    throw err;
  }

  // Verify admin password
  const userRes = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  const valid = await bcrypt.compare(password, userRes.rows[0].password_hash);
  if (!valid) {
    const err = new Error('كلمة المرور غير صحيحة');
    err.statusCode = 401;
    throw err;
  }

  await db.transaction(async (tx) => {
    await tx.query(`
      TRUNCATE TABLE
        tailoring_orders, alterations, attendance, employee_transactions, employees,
        expenses, inventory_branches, inventory, order_items, orders,
        rentals, stock_transfers, supplier_transactions, supply_records,
        suppliers, customers, returns, return_items, rental_inventory,
        rental_inventory_branches, worn_products, sync_queue
      RESTART IDENTITY CASCADE
    `);

    if (fullWipe) {
      await tx.query('DELETE FROM settings');
      await tx.query('DELETE FROM users WHERE id != $1', [user.id]);
      await tx.query('UPDATE users SET branch_id = NULL, employee_id = NULL WHERE id = $1', [user.id]);
      await tx.query('DELETE FROM branches');

      for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        await tx.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
      }

      await tx.query(`
        SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
        SELECT setval(pg_get_serial_sequence('branches', 'id'), 1, false);
      `);
    } else {
      await tx.query('UPDATE users SET employee_id = NULL');
      await tx.query(`
        SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
        SELECT setval(pg_get_serial_sequence('branches', 'id'), COALESCE((SELECT MAX(id) FROM branches), 1), true);
      `);
    }
  });

  return {
    success: true,
    full_wipe: fullWipe,
    message: fullWipe ? 'Full wipe completed' : 'Operational data wiped',
  };
}

module.exports = {
  getPublicSettings,
  getSettings,
  saveSettings,
  getBackupGroups,
  exportBackup,
  restoreBackup,
  resetSystem,
};
