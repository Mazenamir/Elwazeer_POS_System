const db = require('../../database/connection');
const config = require('../../config/env');
const { hasPermission, INVENTORY_ADMIN_PERMISSION, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION } = require('../../../shared/constants/permissions');

let inventoryMetadataCache = null;
const INVENTORY_METADATA_TTL_MS = 5 * 60 * 1000;

function invalidateInventoryMetadata() {
  inventoryMetadataCache = null;
}

function getInventoryMetadataCache() {
  const now = Date.now();
  if (inventoryMetadataCache && inventoryMetadataCache.expiresAt > now) {
    return inventoryMetadataCache.value;
  }
  return null;
}

function setInventoryMetadataCache(value) {
  inventoryMetadataCache = {
    value,
    expiresAt: Date.now() + INVENTORY_METADATA_TTL_MS,
  };
}

function normalizeBarcodeInput(barcode) {
  if (barcode === undefined || barcode === null) return null;
  const str = String(barcode).trim().replace(/[\x00-\x1F\x7F]/g, '');
  return str.length > 0 ? str : null;
}

function hasInventoryAdminAccess(user) {
  return Boolean(user && (user.role === 'admin' || hasPermission(user, INVENTORY_ADMIN_PERMISSION)));
}

function hasInventoryAllBranchesAccess(user) {
  return Boolean(user && (user.role === 'admin' || hasPermission(user, INVENTORY_VIEW_ALL_BRANCHES_PERMISSION)));
}

function isBranchScopedUser(user) {
  return Boolean(user && user.role !== 'admin');
}

async function assertBarcodeAvailable(tx, barcode, { inventoryId = null, rentalInventoryId = null } = {}) {
  const normalized = normalizeBarcodeInput(barcode);
  if (!normalized) return;

  if (config.IS_BRANCH_MODE) {
    // SQLite check
    const invRow = db.sqlite.prepare('SELECT id FROM inventory WHERE LOWER(TRIM(barcode)) = LOWER(?) AND id != ? AND is_deleted = 0 LIMIT 1').get(normalized, inventoryId || -1);
    if (invRow) {
      const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في المخزون');
      err.statusCode = 400;
      throw err;
    }
    const sizeRow = db.sqlite.prepare('SELECT id FROM inventory_sizes WHERE LOWER(TRIM(barcode)) = LOWER(?) AND inventory_id != ? LIMIT 1').get(normalized, inventoryId || -1);
    if (sizeRow) {
      const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في مقاسات المخزون');
      err.statusCode = 400;
      throw err;
    }
    const rentRow = db.sqlite.prepare('SELECT id FROM rental_inventory WHERE LOWER(TRIM(barcode)) = LOWER(?) AND id != ? AND is_deleted = 0 LIMIT 1').get(normalized, rentalInventoryId || -1);
    if (rentRow) {
      const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في مخزون التأجير');
      err.statusCode = 400;
      throw err;
    }
    return;
  }

  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`barcode:${normalized.toLowerCase()}`]);

  const inventoryParams = [normalized];
  let inventoryWhere = "LOWER(TRIM(barcode)) = LOWER($1) AND is_deleted = FALSE";
  if (inventoryId !== null && inventoryId !== undefined) {
    inventoryParams.push(inventoryId);
    inventoryWhere += ` AND id != $${inventoryParams.length}`;
  }
  const existingInventory = await tx.query(`SELECT id FROM inventory WHERE ${inventoryWhere} LIMIT 1`, inventoryParams);
  if (existingInventory.rows.length > 0) {
    const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في المخزون، لا يمكن تكراره منعاً لتشابه القطع');
    err.statusCode = 400;
    throw err;
  }

  const sizeParams = [normalized];
  let sizeWhere = "LOWER(TRIM(barcode)) = LOWER($1)";
  if (inventoryId !== null && inventoryId !== undefined) {
    sizeParams.push(inventoryId);
    sizeWhere += ` AND inventory_id != $${sizeParams.length}`;
  }
  const existingSize = await tx.query(`SELECT id FROM inventory_sizes WHERE ${sizeWhere} LIMIT 1`, sizeParams);
  if (existingSize.rows.length > 0) {
    const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في مقاسات المخزون، لا يمكن تكراره منعاً لتشابه القطع');
    err.statusCode = 400;
    throw err;
  }

  const rentalParams = [normalized];
  let rentalWhere = "LOWER(TRIM(barcode)) = LOWER($1) AND is_deleted = FALSE";
  if (rentalInventoryId !== null && rentalInventoryId !== undefined) {
    rentalParams.push(rentalInventoryId);
    rentalWhere += ` AND id != $${rentalParams.length}`;
  }
  const existingRental = await tx.query(`SELECT id FROM rental_inventory WHERE ${rentalWhere} LIMIT 1`, rentalParams);
  if (existingRental.rows.length > 0) {
    const err = new Error('هذا الباركود مستخدم بالفعل ومسجل مسبقاً في مخزون التأجير، لا يمكن تكراره منعاً لتشابه القطع');
    err.statusCode = 400;
    throw err;
  }
}

async function getAvailableBarcode(tx, requestedBarcode, { inventoryId = null, rentalInventoryId = null } = {}) {
  const baseBarcode = normalizeBarcodeInput(requestedBarcode);
  if (!baseBarcode) return null;

  // Strict enforcement: Assert requested barcode is available without appending '01' or mutating it.
  await assertBarcodeAvailable(tx, baseBarcode, { inventoryId, rentalInventoryId });
  return baseBarcode;
}

async function generateUniqueBarcode(tx, { prefix = '20' } = {}) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const ts = Date.now().toString().slice(-6);
    const rnd = Math.floor(1000 + Math.random() * 9000).toString();
    const candidate = `${prefix}${ts}${rnd}`;
    try {
      await assertBarcodeAvailable(tx, candidate);
      return candidate;
    } catch {
      // Collision, retry with new random candidate
    }
  }
  return `${prefix}${Date.now()}`;
}

async function resolveSizeId(tx, sizeName) {
  const clean = String(sizeName || '').trim();
  if (!clean) return null;
  if (config.IS_BRANCH_MODE) {
    const existing = db.sqlite.prepare('SELECT id FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1').get(clean);
    if (existing) return existing.id;
    try {
      const info = db.sqlite.prepare('INSERT INTO sizes (name) VALUES (?)').run(clean);
      return info.lastInsertRowid;
    } catch {
      const refetch = db.sqlite.prepare('SELECT id FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1').get(clean);
      return refetch?.id || null;
    }
  }
  const existingRes = await tx.query('SELECT id FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1', [clean]);
  if (existingRes.rows.length > 0) return existingRes.rows[0].id;
  const insertRes = await tx.query('INSERT INTO sizes (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id', [clean]);
  if (insertRes.rows.length > 0) return insertRes.rows[0].id;
  const refetch = await tx.query('SELECT id FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1', [clean]);
  return refetch.rows[0]?.id || null;
}

async function adjustInventoryStock(tx, { inventoryId, branchId, quantityDelta, size = null, color = null }) {
  const invId = Number(inventoryId);
  const bId = Number(branchId) || 1;
  const delta = Number(quantityDelta) || 0;
  if (!invId || delta === 0) return;

  const targetSize = size ? String(size).trim() : null;
  const targetColor = color ? String(color).trim() : null;

  if (config.IS_BRANCH_MODE) {
    // 1. Ensure inventory_branches row exists and update branch stock
    db.sqlite.prepare(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
      VALUES (?, ?, 0)
      ON CONFLICT(inventory_id, branch_id) DO NOTHING
    `).run(invId, bId);
    db.sqlite.prepare(`
      UPDATE inventory_branches 
      SET stock_level = MAX(stock_level + ?, 0) 
      WHERE inventory_id = ? AND branch_id = ?
    `).run(delta, invId, bId);

    // 2. Adjust inventory_sizes
    if (delta < 0) {
      let remaining = Math.abs(delta);
      if (targetSize) {
        let sizeRows;
        if (targetColor) {
          sizeRows = db.sqlite.prepare(
            'SELECT id, stock_level FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? AND LOWER(TRIM(size_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(COALESCE(color_name, \'\'))) = LOWER(TRIM(?)) ORDER BY stock_level DESC, id ASC'
          ).all(invId, bId, targetSize, targetColor);
        } else {
          sizeRows = db.sqlite.prepare(
            'SELECT id, stock_level FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? AND LOWER(TRIM(size_name)) = LOWER(TRIM(?)) ORDER BY stock_level DESC, id ASC'
          ).all(invId, bId, targetSize);
        }
        for (const sr of sizeRows) {
          if (remaining <= 0) break;
          const take = Math.min(Number(sr.stock_level || 0), remaining);
          if (take > 0) {
            db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = stock_level - ? WHERE id = ?').run(take, sr.id);
            remaining -= take;
          }
        }
        // If exact color exhausted but remaining > 0, check other colors of the SAME size
        if (remaining > 0 && targetColor) {
          const sameSizeOtherCols = db.sqlite.prepare(
            'SELECT id, stock_level FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? AND LOWER(TRIM(size_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(COALESCE(color_name, \'\'))) != LOWER(TRIM(?)) ORDER BY stock_level DESC, id ASC'
          ).all(invId, bId, targetSize, targetColor);
          for (const sr of sameSizeOtherCols) {
            if (remaining <= 0) break;
            const take = Math.min(Number(sr.stock_level || 0), remaining);
            if (take > 0) {
              db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = stock_level - ? WHERE id = ?').run(take, sr.id);
              remaining -= take;
            }
          }
        }
        // If still remaining, clamp target size row to 0 (DO NOT deduct from unrelated sizes)
        if (remaining > 0 && sizeRows.length > 0) {
          db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = MAX(stock_level - ?, 0) WHERE id = ?').run(remaining, sizeRows[0].id);
          remaining = 0;
        }
      } else {
        // Unspecified size: take from any available size
        const anySizes = db.sqlite.prepare(
          'SELECT id, stock_level FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? ORDER BY stock_level DESC, id ASC'
        ).all(invId, bId);
        for (const sr of anySizes) {
          if (remaining <= 0) break;
          const take = Math.min(Number(sr.stock_level || 0), remaining);
          if (take > 0) {
            db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = stock_level - ? WHERE id = ?').run(take, sr.id);
            remaining -= take;
          }
        }
        if (remaining > 0 && anySizes.length > 0) {
          db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = MAX(stock_level - ?, 0) WHERE id = ?').run(remaining, anySizes[0].id);
        }
      }
    } else {
      let updated = false;
      if (targetSize) {
        let match;
        if (targetColor) {
          match = db.sqlite.prepare(
            'SELECT id FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? AND LOWER(TRIM(size_name)) = LOWER(TRIM(?)) AND LOWER(TRIM(COALESCE(color_name, \'\'))) = LOWER(TRIM(?)) LIMIT 1'
          ).get(invId, bId, targetSize, targetColor);
        } else {
          match = db.sqlite.prepare(
            'SELECT id FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? AND LOWER(TRIM(size_name)) = LOWER(TRIM(?)) LIMIT 1'
          ).get(invId, bId, targetSize);
        }
        if (match) {
          db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = stock_level + ? WHERE id = ?').run(delta, match.id);
          updated = true;
        } else {
          // New size/color variant row for this product!
          const sId = await resolveSizeId(tx, targetSize);
          db.sqlite.prepare(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, stock_level, branch_id)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(invId, sId, targetSize, targetColor || '', delta, bId);
          updated = true;
        }
      }

      if (!updated) {
        const first = db.sqlite.prepare(
          'SELECT id FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ? ORDER BY stock_level DESC, id ASC LIMIT 1'
        ).get(invId, bId);
        if (first) {
          db.sqlite.prepare('UPDATE inventory_sizes SET stock_level = stock_level + ? WHERE id = ?').run(delta, first.id);
        } else {
          const inv = db.sqlite.prepare('SELECT size_cut, color, size_id FROM inventory WHERE id = ?').get(invId);
          db.sqlite.prepare(
            'INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, stock_level, branch_id) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(invId, inv?.size_id || null, targetSize || inv?.size_cut || 'عادي', targetColor || inv?.color || '', delta, bId);
        }
      }
    }

    // 3. Update overall inventory.stock_level from inventory_branches
    const totalRow = db.sqlite.prepare('SELECT COALESCE(SUM(stock_level), 0) as total FROM inventory_branches WHERE inventory_id = ?').get(invId);
    db.sqlite.prepare('UPDATE inventory SET stock_level = ? WHERE id = ?').run(Number(totalRow?.total || 0), invId);
    invalidateInventoryMetadata();
    return;
  }

  // 1. Ensure inventory_branches row exists
  await tx.query(`
    INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
    VALUES ($1, $2, 0)
    ON CONFLICT (inventory_id, branch_id) DO NOTHING
  `, [invId, bId]);

  // 2. Lock and update inventory_branches
  await tx.query(
    'SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE',
    [invId, bId]
  );
  await tx.query(
    'UPDATE inventory_branches SET stock_level = GREATEST(stock_level + $1, 0) WHERE inventory_id = $2 AND branch_id = $3',
    [delta, invId, bId]
  );

  // 3. Update inventory_sizes
  if (delta < 0) {
    let remaining = Math.abs(delta);
    if (targetSize) {
      let sizeQuery = `
        SELECT id, COALESCE(stock_level, 0)::int as stock_level 
        FROM inventory_sizes 
        WHERE inventory_id = $1 AND branch_id = $2 
          AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
      `;
      const sizeParams = [invId, bId, targetSize];
      if (targetColor) {
        sizeParams.push(targetColor);
        sizeQuery += ` AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM($${sizeParams.length}))`;
      }
      sizeQuery += ' ORDER BY stock_level DESC, id ASC FOR UPDATE';
      const sizeRes = await tx.query(sizeQuery, sizeParams);
      for (const sr of sizeRes.rows) {
        if (remaining <= 0) break;
        const take = Math.min(sr.stock_level, remaining);
        if (take > 0) {
          await tx.query(
            'UPDATE inventory_sizes SET stock_level = stock_level - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [take, sr.id]
          );
          remaining -= take;
        }
      }

      // If exact color was specified and exhausted, check same size with other colors
      if (remaining > 0 && targetColor) {
        const sameSizeOtherCols = await tx.query(`
          SELECT id, COALESCE(stock_level, 0)::int as stock_level 
          FROM inventory_sizes 
          WHERE inventory_id = $1 AND branch_id = $2 
            AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
            AND LOWER(TRIM(COALESCE(color_name, ''))) != LOWER(TRIM($4))
          ORDER BY stock_level DESC, id ASC FOR UPDATE
        `, [invId, bId, targetSize, targetColor]);
        for (const sr of sameSizeOtherCols.rows) {
          if (remaining <= 0) break;
          const take = Math.min(sr.stock_level, remaining);
          if (take > 0) {
            await tx.query(
              'UPDATE inventory_sizes SET stock_level = stock_level - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
              [take, sr.id]
            );
            remaining -= take;
          }
        }
      }

      // If remaining > 0, clamp target size row to 0 (DO NOT deduct from unrelated sizes!)
      if (remaining > 0 && sizeRes.rows.length > 0) {
        await tx.query(
          'UPDATE inventory_sizes SET stock_level = GREATEST(stock_level - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [remaining, sizeRes.rows[0].id]
        );
        remaining = 0;
      }
    } else {
      // Unspecified size: take from any available size
      const anyRes = await tx.query(
        'SELECT id, COALESCE(stock_level, 0)::int as stock_level FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2 ORDER BY stock_level DESC, id ASC FOR UPDATE',
        [invId, bId]
      );
      for (const sr of anyRes.rows) {
        if (remaining <= 0) break;
        const take = Math.min(sr.stock_level, remaining);
        if (take > 0) {
          await tx.query(
            'UPDATE inventory_sizes SET stock_level = stock_level - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [take, sr.id]
          );
          remaining -= take;
        }
      }
      if (remaining > 0 && anyRes.rows.length > 0) {
        await tx.query(
          'UPDATE inventory_sizes SET stock_level = GREATEST(stock_level - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [remaining, anyRes.rows[0].id]
        );
      }
    }
  } else {
    let updated = false;
    if (targetSize) {
      let findQuery = `
        SELECT id FROM inventory_sizes 
        WHERE inventory_id = $1 AND branch_id = $2 
          AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
      `;
      const findParams = [invId, bId, targetSize];
      if (targetColor) {
        findParams.push(targetColor);
        findQuery += ` AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM($${findParams.length}))`;
      }
      findQuery += ' LIMIT 1 FOR UPDATE';
      const matchRes = await tx.query(findQuery, findParams);
      if (matchRes.rows.length > 0) {
        await tx.query(
          'UPDATE inventory_sizes SET stock_level = stock_level + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [delta, matchRes.rows[0].id]
        );
        updated = true;
      } else {
        // targetSize was specified but NO MATCHING ROW EXISTS YET!
        // We MUST insert a new row for this size and color!
        const sId = await resolveSizeId(tx, targetSize);
        await tx.query(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, stock_level, branch_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1))
          DO UPDATE SET stock_level = inventory_sizes.stock_level + EXCLUDED.stock_level, updated_at = CURRENT_TIMESTAMP
        `, [invId, sId, targetSize, targetColor || '', delta, bId]);
        updated = true;
      }
    }

    if (!updated) {
      // Unspecified size: check if there is an existing size row to add to
      const firstRes = await tx.query(
        'SELECT id FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2 ORDER BY stock_level DESC, id ASC LIMIT 1 FOR UPDATE',
        [invId, bId]
      );
      if (firstRes.rows.length > 0) {
        await tx.query(
          'UPDATE inventory_sizes SET stock_level = stock_level + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [delta, firstRes.rows[0].id]
        );
      } else {
        // No size rows at all exist, insert a fallback size row
        const invRes = await tx.query('SELECT size_cut, color, size_id FROM inventory WHERE id = $1', [invId]);
        const inv = invRes.rows[0];
        const sName = inv?.size_cut || 'عادي';
        const cName = targetColor || inv?.color || '';
        await tx.query(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, stock_level, branch_id)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1))
          DO UPDATE SET stock_level = inventory_sizes.stock_level + EXCLUDED.stock_level, updated_at = CURRENT_TIMESTAMP
        `, [invId, inv?.size_id || null, sName, cName, delta, bId]);
      }
    }
  }

  // 4. Update overall inventory.stock_level
  await tx.query(`
    UPDATE inventory
    SET stock_level = (SELECT COALESCE(SUM(stock_level), 0) FROM inventory_branches WHERE inventory_id = $1)
    WHERE id = $1
  `, [invId]);

  invalidateInventoryMetadata();
}

function resolveCategoryQuery(catInput) {
  if (!catInput) return null;
  const raw = String(catInput).trim();
  if (!raw || raw === 'all' || raw === 'الكل' || raw === 'كل التصنيفات' || raw === 'كل الأصناف') return null;
  const lower = raw.toLowerCase();

  // Formal Suit
  if (
    lower === 'formal suit' ||
    lower.includes('formal') ||
    lower === 'بدل رسمية' ||
    lower === 'بدل رسميه' ||
    lower.includes('بدل رسمية') ||
    lower.includes('بدل رسميه') ||
    lower.includes('بدلة رسمية') ||
    lower.includes('بدله رسميه')
  ) {
    return { type: 'exact', value: 'FORMAL SUIT' };
  }

  // Tuxedo Suit
  if (
    lower === 'tuxedo suit' ||
    lower === 'tuxedo' ||
    lower.includes('tuxedo') ||
    lower === 'بدل سموكن' ||
    lower.includes('بدل سموكن') ||
    lower.includes('سموكن')
  ) {
    return { type: 'exact', value: 'TUXEDO SUIT' };
  }

  // Casual Suit
  if (
    lower === 'casual suit' ||
    lower.includes('casual') ||
    lower === 'بدل كاجوال' ||
    lower.includes('بدل كاجوال') ||
    lower.includes('بدلة كاجوال')
  ) {
    return { type: 'exact', value: 'CASUAL SUIT' };
  }

  // Regular Suit
  if (
    lower === 'suit' ||
    lower === 'بدل عادية' ||
    lower === 'بدل عاديه' ||
    lower.includes('بدل عادية') ||
    lower.includes('بدل عاديه') ||
    lower.includes('بدلة عادية')
  ) {
    return { type: 'exact', value: 'SUIT' };
  }

  // All Suits
  if (
    lower === 'بدل' ||
    lower === 'suits' ||
    lower.includes('بدل (جميع') ||
    lower.includes('بدل (جميع الانواع)') ||
    lower.includes('بدل (جميع الأنواع)') ||
    lower === 'all suits'
  ) {
    return { type: 'suits' };
  }

  // Kids
  if (
    lower === 'kids' ||
    lower === 'أطفال' ||
    lower === 'اطفال' ||
    lower.includes('أطفال') ||
    lower.includes('اطفال') ||
    lower.includes('kids')
  ) {
    return { type: 'exact', value: 'KIDS' };
  }

  // Wallets
  if (
    lower === 'wallet' ||
    lower === 'محافظ' ||
    lower.includes('محافظ') ||
    lower.includes('محفظة') ||
    lower.includes('محفظه') ||
    lower.includes('wallet')
  ) {
    return { type: 'exact', value: 'WALLET' };
  }

  // Uncategorized / Other
  if (
    lower === 'أخرى' ||
    lower === 'اخري' ||
    lower === 'other' ||
    lower === 'uncategorized' ||
    lower.includes('بدون تصنيف') ||
    lower.includes('أخرى') ||
    lower.includes('اخري') ||
    lower === 'none'
  ) {
    return { type: 'other' };
  }

  // Exact fallback
  return { type: 'exact', value: raw };
}

module.exports = {
  invalidateInventoryMetadata,
  getInventoryMetadataCache,
  setInventoryMetadataCache,
  normalizeBarcodeInput,
  hasInventoryAdminAccess,
  hasInventoryAllBranchesAccess,
  isBranchScopedUser,
  assertBarcodeAvailable,
  getAvailableBarcode,
  generateUniqueBarcode,
  adjustInventoryStock,
  resolveCategoryQuery,
};
