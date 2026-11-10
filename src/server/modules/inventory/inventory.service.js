const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../database/connection');
const config = require('../../config/env');
const { parsePagination, appendPagination, paginatedPayload } = require('../../../shared/utils/pagination');
const { likePattern } = require('../../../shared/utils/string');
const { parsePositiveInt, parseNonNegativeInt } = require('../../../shared/utils/numbers');
const { CAIRO_DATE_SQL } = require('../../../shared/constants/system');
const {
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
} = require('./inventory.helpers');

const { hasPermission, getUserPermissions } = require('../../../shared/constants/permissions');
const { hasBranchAccess, getUserAuthorizedBranchIds } = require('../../middleware/branchScope.middleware');
const { removeUploadedFile } = require('../../middleware/upload.middleware');
const { queueSyncOperation } = require('../../database/sync.helpers');
const auditService = require('../audit/audit.service');

const TRANSFER_LIST_LIMIT = 200;

function saveBase64ImageIfPresent(imageInput) {
  if (!imageInput || typeof imageInput !== 'string' || !imageInput.startsWith('data:image/')) {
    return imageInput;
  }
  try {
    const matches = imageInput.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/s);
    if (!matches) return imageInput;
    let ext = matches[1].toLowerCase();
    if (ext === 'jpeg') ext = 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');
    const filename = `product_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.mkdirSync(config.PRODUCT_UPLOADS_DIR, { recursive: true });
    const filepath = path.join(config.PRODUCT_UPLOADS_DIR, filename);
    fs.writeFileSync(filepath, buffer);
    return `/uploads/products/${filename}`;
  } catch (err) {
    console.error('Failed to save base64 image to disk:', err.message);
    return null;
  }
}

// 12-digit numeric barcode used when a size row is saved without an explicit barcode.
function generateNumericBarcode() {
  const ts = Date.now().toString().slice(-6);
  const rnd = Math.floor(1000 + Math.random() * 9000).toString();
  return `20${ts}${rnd}`;
}

// Merge rows that repeat the exact same size + color (case/space insensitive) by summing
// their quantities. Without this, the upsert in inventory_sizes overwrites the earlier row
// and the product-level stock total ends up larger than the sum of the size rows.
function mergeDuplicateSizeRows(rows) {
  const merged = new Map();
  for (const row of rows) {
    const key = `${row.size.toLowerCase()}|${row.color.toLowerCase()}`;
    const current = merged.get(key);
    if (current) {
      current.stock += row.stock;
      if (!current.barcode && row.barcode) current.barcode = row.barcode;
    } else {
      merged.set(key, { ...row });
    }
  }
  return Array.from(merged.values());
}

// Recompute the branch stock and the product stock from the inventory_sizes rows so the
// displayed total always equals the sum of the size rows.
async function recalcStockFromSizes(tx, inventoryId, branchId) {
  const sizesRes = await tx.query(
    'SELECT COALESCE(SUM(stock_level), 0)::int AS branch_total FROM inventory_sizes WHERE inventory_id = $1 AND branch_id = $2',
    [inventoryId, branchId]
  );
  const branchTotal = Number(sizesRes.rows[0]?.branch_total || 0);

  await tx.query(
    `INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
     VALUES ($1, $2, $3)
     ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = EXCLUDED.stock_level`,
    [inventoryId, branchId, branchTotal]
  );

  const totalRes = await tx.query(
    'SELECT COALESCE(SUM(stock_level), 0)::int AS total FROM inventory_branches WHERE inventory_id = $1',
    [inventoryId]
  );

  await tx.query(
    `UPDATE inventory
     SET stock_level = $1,
         size_cut = (SELECT STRING_AGG(DISTINCT TRIM(size_name), ', ' ORDER BY TRIM(size_name)) FROM inventory_sizes WHERE inventory_id = $2)
     WHERE id = $2`,
    [Number(totalRes.rows[0]?.total || 0), inventoryId]
  );
  return branchTotal;
}

function recalcStockFromSizesSqlite(inventoryId, branchId) {
  const bId = Number(branchId) || 1;
  const row = db.sqlite
    .prepare('SELECT COALESCE(SUM(stock_level), 0) AS total FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ?')
    .get(inventoryId, bId);
  const branchTotal = Number(row?.total || 0);

  db.sqlite.prepare(`
    INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
    VALUES (?, ?, ?)
    ON CONFLICT(inventory_id, branch_id) DO UPDATE SET stock_level = excluded.stock_level
  `).run(inventoryId, bId, branchTotal);

  const totalRow = db.sqlite.prepare('SELECT COALESCE(SUM(stock_level), 0) as total FROM inventory_branches WHERE inventory_id = ?').get(inventoryId);
  db.sqlite.prepare('UPDATE inventory SET stock_level = ? WHERE id = ?').run(Number(totalRow?.total || 0), inventoryId);
  return branchTotal;
}

async function listColors() {
  if (config.IS_BRANCH_MODE) {
    return db.sqlite.prepare('SELECT id, name FROM colors ORDER BY name COLLATE NOCASE ASC').all();
  }
  const { rows } = await db.query('SELECT id, name FROM colors ORDER BY name ASC');
  return rows;
}

async function createOrGetColor(colorName, tx = db) {
  const clean = String(colorName || '').trim();
  if (!clean) return null;

  if (config.IS_BRANCH_MODE) {
    const existing = db.sqlite.prepare('SELECT id, name FROM colors WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1').get(clean);
    if (existing) return existing;
    const info = db.sqlite.prepare('INSERT INTO colors (name) VALUES (?)').run(clean);
    invalidateInventoryMetadata();
    return { id: info.lastInsertRowid, name: clean };
  }

  const existingRes = await tx.query(
    'SELECT id, name FROM colors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
    [clean]
  );
  if (existingRes.rows.length > 0) {
    return existingRes.rows[0];
  }

  const insertRes = await tx.query(
    'INSERT INTO colors (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id, name',
    [clean]
  );
  invalidateInventoryMetadata();
  if (insertRes.rows.length > 0) {
    return insertRes.rows[0];
  }

  const refetch = await tx.query(
    'SELECT id, name FROM colors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
    [clean]
  );
  return refetch.rows[0] || null;
}

async function listSizes() {
  if (config.IS_BRANCH_MODE) {
    return db.sqlite.prepare('SELECT id, name FROM sizes ORDER BY name COLLATE NOCASE ASC').all();
  }
  const { rows } = await db.query('SELECT id, name FROM sizes ORDER BY name ASC');
  return rows;
}

async function createOrGetSize(sizeName, tx = db) {
  const clean = String(sizeName || '').trim();
  if (!clean) return null;

  if (config.IS_BRANCH_MODE) {
    const existing = db.sqlite.prepare('SELECT id, name FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1').get(clean);
    if (existing) return existing;
    const info = db.sqlite.prepare('INSERT INTO sizes (name) VALUES (?)').run(clean);
    invalidateInventoryMetadata();
    return { id: info.lastInsertRowid, name: clean };
  }

  const existingRes = await tx.query(
    'SELECT id, name FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
    [clean]
  );
  if (existingRes.rows.length > 0) {
    return existingRes.rows[0];
  }

  const insertRes = await tx.query(
    'INSERT INTO sizes (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id, name',
    [clean]
  );
  invalidateInventoryMetadata();
  if (insertRes.rows.length > 0) {
    return insertRes.rows[0];
  }

  const refetch = await tx.query(
    'SELECT id, name FROM sizes WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1',
    [clean]
  );
  return refetch.rows[0] || null;
}

async function listProductNames(search = '') {
  const cleanSearch = String(search || '').trim();
  if (config.IS_BRANCH_MODE) {
    if (cleanSearch) {
      return db.sqlite.prepare(`
        SELECT DISTINCT TRIM(name) as name
        FROM inventory
        WHERE is_deleted = 0 AND name IS NOT NULL AND TRIM(name) != '' AND name LIKE ?
        ORDER BY TRIM(name) COLLATE NOCASE ASC
        LIMIT 500
      `).all(`%${cleanSearch}%`).map((r) => r.name);
    }
    return db.sqlite.prepare(`
      SELECT DISTINCT TRIM(name) as name
      FROM inventory
      WHERE is_deleted = 0 AND name IS NOT NULL AND TRIM(name) != ''
      ORDER BY TRIM(name) COLLATE NOCASE ASC
      LIMIT 1000
    `).all().map((r) => r.name);
  }

  if (cleanSearch) {
    const { rows } = await db.query(`
      SELECT DISTINCT TRIM(name) as name
      FROM inventory
      WHERE is_deleted = FALSE AND name IS NOT NULL AND TRIM(name) != '' AND name ILIKE $1
      ORDER BY TRIM(name) ASC
      LIMIT 500
    `, [`%${cleanSearch}%`]);
    return rows.map((r) => r.name);
  }

  const { rows } = await db.query(`
    SELECT DISTINCT TRIM(name) as name
    FROM inventory
    WHERE is_deleted = FALSE AND name IS NOT NULL AND TRIM(name) != ''
    ORDER BY TRIM(name) ASC
    LIMIT 1000
  `);
  return rows.map((r) => r.name);
}

function populateCategoryCounts(categoryCounts, totalAll, totalSuits) {
  categoryCounts['الكل'] = totalAll;
  categoryCounts['كل التصنيفات'] = totalAll;
  categoryCounts['كل الأصناف'] = totalAll;
  categoryCounts['all'] = totalAll;

  if (totalSuits > 0) {
    categoryCounts['بدل'] = totalSuits;
    categoryCounts['بدل (جميع الأنواع)'] = totalSuits;
    categoryCounts['بدل (جميع الانواع)'] = totalSuits;
  }
  if (categoryCounts['أخرى'] && categoryCounts['أخرى'] > 0) {
    categoryCounts['بدون تصنيف / أخرى'] = categoryCounts['أخرى'];
    categoryCounts['بدون تصنيف'] = categoryCounts['أخرى'];
  }
  if (categoryCounts['FORMAL SUIT'] && categoryCounts['FORMAL SUIT'] > 0) {
    categoryCounts['بدل رسمية'] = categoryCounts['FORMAL SUIT'];
    categoryCounts['بدل رسمية (FORMAL SUIT)'] = categoryCounts['FORMAL SUIT'];
  }
  if (categoryCounts['TUXEDO SUIT'] && categoryCounts['TUXEDO SUIT'] > 0) {
    categoryCounts['بدل سموكن'] = categoryCounts['TUXEDO SUIT'];
    categoryCounts['بدل سموكن (TUXEDO SUIT)'] = categoryCounts['TUXEDO SUIT'];
  }
  if (categoryCounts['SUIT'] && categoryCounts['SUIT'] > 0) {
    categoryCounts['بدل عادية'] = categoryCounts['SUIT'];
    categoryCounts['بدل عادية (SUIT)'] = categoryCounts['SUIT'];
  }
  if (categoryCounts['CASUAL SUIT'] && categoryCounts['CASUAL SUIT'] > 0) {
    categoryCounts['بدل كاجوال'] = categoryCounts['CASUAL SUIT'];
    categoryCounts['بدل كاجوال (CASUAL SUIT)'] = categoryCounts['CASUAL SUIT'];
  }
  if (categoryCounts['KIDS'] && categoryCounts['KIDS'] > 0) {
    categoryCounts['أطفال'] = categoryCounts['KIDS'];
    categoryCounts['أطفال (KIDS)'] = categoryCounts['KIDS'];
  }
  if (categoryCounts['WALLET'] && categoryCounts['WALLET'] > 0) {
    categoryCounts['محافظ'] = categoryCounts['WALLET'];
    categoryCounts['محافظ (WALLET)'] = categoryCounts['WALLET'];
  }
}

async function getMetadata(branchId = null) {
  const bId = branchId && branchId !== 'all' ? parseInt(branchId, 10) : null;
  if (!bId) {
    const cached = getInventoryMetadataCache();
    if (cached) return cached;
  }

  if (config.IS_BRANCH_MODE) {
    const colors = db.sqlite.prepare('SELECT name FROM colors ORDER BY name COLLATE NOCASE ASC').all();
    const sizes = db.sqlite.prepare('SELECT name FROM sizes ORDER BY name COLLATE NOCASE ASC').all();

    const targetBranchId = bId || (config.IS_BRANCH_MODE && config.BRANCH_ID ? parseInt(config.BRANCH_ID, 10) : null);

    const countsRows = targetBranchId
      ? db.sqlite.prepare(`
          SELECT COALESCE(NULLIF(TRIM(i.category), ''), 'أخرى') as cat, count(DISTINCT i.id) as count
          FROM inventory i
          JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = ? AND ib.stock_level > 0
          WHERE i.is_deleted = 0
          GROUP BY COALESCE(NULLIF(TRIM(i.category), ''), 'أخرى')
          HAVING count(DISTINCT i.id) > 0
          ORDER BY count DESC
        `).all(targetBranchId)
      : db.sqlite.prepare(`
          SELECT COALESCE(NULLIF(TRIM(category), ''), 'أخرى') as cat, count(*) as count
          FROM inventory
          WHERE is_deleted = 0
          GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'أخرى')
          HAVING count(*) > 0
          ORDER BY count DESC
        `).all();

    const categoryCounts = {};
    let totalAll = 0;
    let totalSuits = 0;
    countsRows.forEach((r) => {
      const c = Number(r.count);
      if (c > 0) {
        categoryCounts[r.cat] = c;
        totalAll += c;
        if (r.cat.toLowerCase().includes('suit') || r.cat.includes('بدل')) {
          totalSuits += c;
        }
      }
    });
    populateCategoryCounts(categoryCounts, totalAll, totalSuits);

    const activeCats = countsRows.map((r) => r.cat).filter(Boolean);
    const uniqueCats = Array.from(new Set([
      ...(totalSuits > 0 ? ['بدل'] : []),
      ...activeCats,
    ]));

    const metadata = {
      categories: uniqueCats,
      categoryCounts,
      colors: colors.map((r) => r.name),
      sizes: sizes.map((r) => r.name),
      branch_id: targetBranchId || 'all',
    };
    if (!bId && !targetBranchId) setInventoryMetadataCache(metadata);
    return metadata;
  }

  const colorsRes = await db.query('SELECT name FROM colors ORDER BY name ASC');
  const sizesRes = await db.query('SELECT name FROM sizes ORDER BY name ASC');

  const countsQuery = bId
    ? `SELECT COALESCE(NULLIF(TRIM(i.category), ''), 'أخرى') as cat, count(DISTINCT i.id)::int as count
       FROM inventory i
       JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = $1 AND ib.stock_level > 0
       WHERE i.is_deleted = FALSE
       GROUP BY COALESCE(NULLIF(TRIM(i.category), ''), 'أخرى')
       HAVING count(DISTINCT i.id) > 0
       ORDER BY count DESC`
    : `SELECT COALESCE(NULLIF(TRIM(category), ''), 'أخرى') as cat, count(*)::int as count
       FROM inventory
       WHERE is_deleted = FALSE
       GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'أخرى')
       HAVING count(*) > 0
       ORDER BY count DESC`;
  const countsParams = bId ? [bId] : [];
  const countsRes = await db.query(countsQuery, countsParams);

  const categoryCounts = {};
  let totalAll = 0;
  let totalSuits = 0;
  countsRes.rows.forEach((r) => {
    const c = Number(r.count);
    if (c > 0) {
      categoryCounts[r.cat] = c;
      totalAll += c;
      if (r.cat.toLowerCase().includes('suit') || r.cat.includes('بدل')) {
        totalSuits += c;
      }
    }
  });
  populateCategoryCounts(categoryCounts, totalAll, totalSuits);

  const activeCats = countsRes.rows.map((r) => r.cat).filter(Boolean);
  const uniqueCats = Array.from(new Set([
    ...(totalSuits > 0 ? ['بدل'] : []),
    ...activeCats,
  ]));

  const uniqueCols = colorsRes.rows.map((r) => r.name);
  const uniqueSizes = sizesRes.rows.map((r) => r.name);

  const metadata = {
    categories: uniqueCats,
    categoryCounts,
    colors: uniqueCols,
    sizes: uniqueSizes,
    branch_id: bId || 'all',
  };
  if (!bId) setInventoryMetadataCache(metadata);
  return metadata;
}

async function getModels(user) {
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    return db.sqlite.prepare(`
      SELECT id, name, category, price, cost_price, barcode, image_url
      FROM inventory
      WHERE is_deleted = 0 AND name IS NOT NULL AND TRIM(name) != ''
      GROUP BY name
      ORDER BY id DESC LIMIT 50
    `).all();
  }

  const { rows } = await db.query(`
    SELECT DISTINCT ON (i.name)
      i.id, i.name, i.category, i.price, i.cost_price, i.wholesale_price,
      i.semi_wholesale_price, i.preferred_supplier_id, i.min_stock_level,
      i.image_url, i.barcode
    FROM inventory i
    WHERE i.is_deleted = FALSE AND i.name IS NOT NULL AND TRIM(i.name) != ''
    ORDER BY i.name, i.id DESC
    LIMIT 50
  `);
  return rows;
}

async function getBarcodes() {
  if (config.IS_BRANCH_MODE) {
    const inv = db.sqlite.prepare("SELECT 'inventory' as source, id, barcode FROM inventory WHERE is_deleted = 0 AND barcode IS NOT NULL LIMIT 2000").all();
    const sz = db.sqlite.prepare("SELECT 'inventory_size' as source, inventory_id as id, barcode FROM inventory_sizes WHERE barcode IS NOT NULL AND TRIM(barcode) != '' LIMIT 2000").all();
    const rent = db.sqlite.prepare("SELECT 'rental_inventory' as source, id, barcode FROM rental_inventory WHERE is_deleted = 0 AND barcode IS NOT NULL LIMIT 500").all();
    return [...inv, ...sz, ...rent];
  }

  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'inventory' AS source, id, barcode
      FROM inventory WHERE is_deleted = FALSE AND barcode IS NOT NULL AND TRIM(barcode) != ''
      ORDER BY id DESC LIMIT 2000
    ) inv
    UNION ALL
    SELECT * FROM (
      SELECT 'inventory_size' AS source, inventory_id AS id, barcode
      FROM inventory_sizes WHERE barcode IS NOT NULL AND TRIM(barcode) != ''
      ORDER BY id DESC LIMIT 2000
    ) sz
    UNION ALL
    SELECT * FROM (
      SELECT 'rental_inventory' AS source, id, barcode
      FROM rental_inventory WHERE is_deleted = FALSE AND barcode IS NOT NULL AND TRIM(barcode) != ''
      ORDER BY id DESC LIMIT 500
    ) rent
  `);
  return rows;
}

async function getVariants(name, requestedBranchId, user) {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    const err = new Error('name is required');
    err.statusCode = 400;
    throw err;
  }

  const canViewAll = hasInventoryAllBranchesAccess(user);
  let branchId = Number.parseInt(requestedBranchId, 10) || Number(user?.branch_id) || 1;
  if (!canViewAll && user && !hasBranchAccess(user, branchId)) {
    branchId = Number(user.branch_id);
  }

  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT i.*, COALESCE(ib.stock_level, 0) as stock_level, s.name as supplier_name
      FROM inventory i
      LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
      LEFT JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = ?
      WHERE i.is_deleted = 0 AND LOWER(TRIM(i.name)) = LOWER(TRIM(?))
      ORDER BY COALESCE(NULLIF(TRIM(i.color), ''), 'zzzz'), COALESCE(NULLIF(TRIM(i.size_cut), ''), 'zzzz'), i.id
      LIMIT 500
    `).all(branchId, cleanName);
    return rows;
  }

  const branchStocksSql = canViewAll
    ? `(SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level, 'has_stock', stock_level > 0))
        FROM inventory_branches WHERE inventory_id = i.id)`
    : `(SELECT json_agg(json_build_object(
          'branch_id', branch_id,
          'stock_level', CASE WHEN branch_id = $2 THEN stock_level ELSE NULL END,
          'has_stock', stock_level > 0
        )) FROM inventory_branches WHERE inventory_id = i.id)`;

  const { rows } = await db.query(`
    SELECT i.id, i.name, i.category, i.size_cut, i.color, i.barcode, i.min_stock_level,
           i.price, i.image_url, i.preferred_supplier_id, i.wholesale_price,
           i.semi_wholesale_price, i.cost_price, i.gender, s.name as supplier_name,
           COALESCE(ib.stock_level, 0) as stock_level,
           ${branchStocksSql} as branch_stocks
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    LEFT JOIN inventory_branches ib ON ib.inventory_id = i.id AND ib.branch_id = $2
    WHERE i.is_deleted = FALSE AND LOWER(TRIM(COALESCE(i.name, ''))) = LOWER(TRIM($1))
    ORDER BY COALESCE(NULLIF(TRIM(i.color), ''), 'zzzz'), COALESCE(NULLIF(TRIM(i.size_cut), ''), 'zzzz'), i.id
    LIMIT 2000
  `, [cleanName, branchId]);

  return rows;
}

async function listInventory(req, user) {
  if (!req || !req.query) {
    req = { query: req || {} };
  }
  const isInventoryAdmin = hasInventoryAdminAccess(user);
  const canViewAllBranches = hasInventoryAllBranchesAccess(user);
  const pagination = parsePagination(req, 60, 10000, true);

  if (config.IS_BRANCH_MODE) {
    const where = ['i.is_deleted = 0'];
    const params = [];

    const reqBranchId = req.query.branch_id && req.query.branch_id !== 'all' ? parseInt(req.query.branch_id, 10) : null;
    let activeBranchId = null;
    if (reqBranchId && (canViewAllBranches || hasBranchAccess(user, reqBranchId))) {
      activeBranchId = reqBranchId;
    } else if (!canViewAllBranches && user?.branch_id && hasBranchAccess(user, user.branch_id)) {
      activeBranchId = parseInt(user.branch_id, 10);
    }
    const bId = activeBranchId;

    const targetBranchForGender = reqBranchId || (!canViewAllBranches ? activeBranchId : null);
    if (targetBranchForGender) {
      params.push(targetBranchForGender, targetBranchForGender);
      where.push(`(
        (SELECT allowed_gender FROM branches WHERE id = ?) = 'both' 
        OR i.gender = 'both' 
        OR i.gender = (SELECT allowed_gender FROM branches WHERE id = ?)
      )`);
    }

    if (req.query.search) {
      const sPat = likePattern(req.query.search);
      params.push(sPat, sPat, sPat, sPat, sPat, sPat, sPat, sPat);
      where.push(`(
        i.name LIKE ?
        OR i.barcode LIKE ?
        OR i.category LIKE ?
        OR i.color LIKE ?
        OR i.size_cut LIKE ?
        OR CAST(i.id AS TEXT) LIKE ?
        OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.size_name LIKE ?)
        OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.barcode LIKE ?)
      )`);
    }
    if (req.query.barcode) {
      const rawBarcode = String(req.query.barcode).trim();
      const bPat = likePattern(rawBarcode);
      params.push(bPat, rawBarcode, bPat, rawBarcode);
      where.push(`(
        i.barcode LIKE ?
        OR LOWER(TRIM(i.barcode)) = LOWER(?)
        OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND (sz.barcode LIKE ? OR LOWER(TRIM(sz.barcode)) = LOWER(?)))
      )`);
    }
    if (req.query.gender && req.query.gender !== 'all') {
      const gVal = String(req.query.gender).toLowerCase().trim();
      if (gVal === 'men' || gVal === 'رجالي') {
        where.push(`(i.gender = 'men' OR i.gender = 'رجالي')`);
      } else if (gVal === 'women' || gVal === 'حريمي') {
        where.push(`(i.gender = 'women' OR i.gender = 'حريمي')`);
      } else if (gVal === 'both' || gVal === 'مشترك' || gVal === 'كلاهما') {
        where.push(`(i.gender = 'both' OR i.gender = 'مشترك' OR i.gender = 'كلاهما')`);
      }
    }
    if (req.query.name) {
      params.push(likePattern(req.query.name));
      where.push('i.name LIKE ?');
    }
    const catQuery = resolveCategoryQuery(req.query.category);
    if (catQuery) {
      if (catQuery.type === 'suits') {
        where.push(`(i.category LIKE '%SUIT%' OR i.category LIKE '%suit%' OR i.category LIKE '%بدل%')`);
      } else if (catQuery.type === 'other') {
        where.push(`(i.category IS NULL OR TRIM(i.category) = '' OR LOWER(TRIM(i.category)) IN ('أخرى', 'اخري', 'other', 'uncategorized'))`);
      } else {
        params.push(catQuery.value);
        where.push('LOWER(TRIM(i.category)) = LOWER(?)');
      }
    }
    if (req.query.supplier_id && req.query.supplier_id !== 'all') {
      if (req.query.supplier_id === 'none' || req.query.supplier_id === 'null') {
        where.push('i.preferred_supplier_id IS NULL');
      } else {
        const sId = parseInt(req.query.supplier_id, 10);
        if (!Number.isNaN(sId) && sId > 0) {
          params.push(sId);
          where.push('i.preferred_supplier_id = ?');
        }
      }
    }
    const branchStockSql = `COALESCE((SELECT stock_level FROM inventory_branches WHERE inventory_id = i.id AND branch_id = ${bId}), 0)`;
    if (req.query.stock_status && req.query.stock_status !== 'all') {
      if (req.query.stock_status === 'in_stock') {
        where.push(`${branchStockSql} > 0`);
      } else if (req.query.stock_status === 'in_stock_safe') {
        where.push(`${branchStockSql} > COALESCE(i.min_stock_level, 5)`);
      } else if (req.query.stock_status === 'all_low' || req.query.stock_status === 'low_stock_all') {
        where.push(`${branchStockSql} <= COALESCE(i.min_stock_level, 5)`);
      } else if (req.query.stock_status === 'low_stock' || req.query.stock_status === 'low_stock_near') {
        where.push(`${branchStockSql} > 0 AND ${branchStockSql} <= COALESCE(i.min_stock_level, 5)`);
      } else if (req.query.stock_status === 'out_of_stock') {
        where.push(`${branchStockSql} <= 0`);
      } else if (req.query.stock_status === 'broken_sizes' || req.query.stock_status === 'missing_sizes') {
        where.push(`${branchStockSql} > 0 AND EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.branch_id = ${bId} AND sz.stock_level <= 0)`);
      }
    } else if (req.query.branch_only === 'true') {
      where.push(`${branchStockSql} > 0`);
    } else if (reqBranchId && req.query.include_zero !== 'true' && req.query.all_with_zero !== 'true' && req.query.all !== 'true') {
      where.push(`${branchStockSql} > 0`);
    }

    let sqliteOrder = 'ORDER BY i.id DESC';
    if (req.query.sort) {
      if (req.query.sort === 'price_desc') sqliteOrder = 'ORDER BY (i.price IS NULL), CAST(i.price AS REAL) DESC, i.id DESC';
      else if (req.query.sort === 'price_asc') sqliteOrder = 'ORDER BY (i.price IS NULL), CAST(i.price AS REAL) ASC, i.id DESC';
      else if (req.query.sort === 'name_asc') sqliteOrder = 'ORDER BY TRIM(i.name) COLLATE NOCASE ASC, i.id DESC';
      else if (req.query.sort === 'name_desc') sqliteOrder = 'ORDER BY TRIM(i.name) COLLATE NOCASE DESC, i.id DESC';
      else if (req.query.sort === 'stock_desc') sqliteOrder = 'ORDER BY CAST(i.stock_level AS REAL) DESC, i.id DESC';
      else if (req.query.sort === 'stock_asc') sqliteOrder = 'ORDER BY CAST(i.stock_level AS REAL) ASC, i.id DESC';
      else if (req.query.sort === 'oldest') sqliteOrder = 'ORDER BY i.id ASC';
      else if (req.query.sort === 'latest') sqliteOrder = 'ORDER BY i.id DESC';
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const total = db.sqlite.prepare(`SELECT COUNT(*) as count FROM inventory i ${whereClause}`).get(...params).count;

    const mapSqliteRow = (r) => {
      const sizes = db.sqlite.prepare('SELECT id, size_name, color_name, barcode, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? AND (branch_id = ? OR branch_id IS NULL) ORDER BY id ASC').all(r.id, bId);
      const branchStockRow = db.sqlite.prepare('SELECT stock_level FROM inventory_branches WHERE inventory_id = ? AND branch_id = ?').get(r.id, bId);
      const stock = branchStockRow !== undefined && branchStockRow !== null ? Number(branchStockRow.stock_level || 0) : 0;
      const branchStockRows = db.sqlite.prepare(`
        SELECT ib.branch_id, b.name as branch_name, ib.stock_level
        FROM inventory_branches ib
        JOIN branches b ON b.id = ib.branch_id
        WHERE ib.inventory_id = ? AND ib.stock_level > 0
      `).all(r.id);
      const available_branches = branchStockRows.map((bs) => ({
        branch_id: bs.branch_id,
        branch_name: bs.branch_name,
        stock_level: Number(bs.stock_level || 0),
      }));
      const totalStock = branchStockRows.reduce((acc, curr) => acc + Number(curr.stock_level || 0), 0);
      return { ...r, stock_level: stock, total_stock: totalStock, sizes, available_branches };
    };

    if (pagination.enabled) {
      const rows = db.sqlite.prepare(`
        SELECT i.*, i.stock_level, s.name as supplier_name
        FROM inventory i
        LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
        ${whereClause}
        ${sqliteOrder}
        LIMIT ? OFFSET ?
      `).all(...params, pagination.limit, pagination.offset);

      const rowsWithSizes = rows.map(mapSqliteRow);
      return paginatedPayload(rowsWithSizes, total, pagination);
    }

    const rows = db.sqlite.prepare(`
      SELECT i.*, i.stock_level, s.name as supplier_name
      FROM inventory i
      LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
      ${whereClause}
      ${sqliteOrder}
    `).all(...params);

    const rowsWithSizes = rows.map(mapSqliteRow);

    return paginatedPayload(rowsWithSizes, total, { page: 1, limit: total, total });
  }

  let columns = 'i.id, i.name, i.category, i.size_cut, i.color, i.barcode, i.min_stock_level, i.price, i.image_url, i.gender';
  if (isInventoryAdmin) {
    columns += ', i.preferred_supplier_id, i.wholesale_price, i.semi_wholesale_price, i.cost_price, s.name as supplier_name';
  }

  const reqBranchId = req.query.branch_id && req.query.branch_id !== 'all' ? parseInt(req.query.branch_id, 10) : null;
  let activeBranchId = null;
  if (reqBranchId && (canViewAllBranches || hasBranchAccess(user, reqBranchId))) {
    activeBranchId = reqBranchId;
  } else if (!canViewAllBranches && user?.branch_id && hasBranchAccess(user, user.branch_id)) {
    activeBranchId = parseInt(user.branch_id, 10);
  }

  const totalStockSql = 'COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), i.stock_level, 0)';
  let stockLevelSql = totalStockSql;
  let branchStocksSql = `COALESCE((
    SELECT json_agg(json_build_object(
      'branch_id', ib.branch_id,
      'branch_name', b.name,
      'stock_level', ib.stock_level,
      'has_stock', (ib.stock_level > 0)
    ) ORDER BY (ib.branch_id = ${activeBranchId || 0}) DESC, ib.stock_level DESC, b.name ASC)
    FROM inventory_branches ib
    JOIN branches b ON b.id = ib.branch_id
    WHERE ib.inventory_id = i.id
  ), '[]'::json)`;

  let availableBranchesSql = `COALESCE((
    SELECT json_agg(json_build_object(
      'branch_id', ib.branch_id,
      'branch_name', b.name,
      'stock_level', ib.stock_level
    ) ORDER BY (ib.branch_id = ${activeBranchId || 0}) DESC, ib.stock_level DESC, b.name ASC)
    FROM inventory_branches ib
    JOIN branches b ON b.id = ib.branch_id
    WHERE ib.inventory_id = i.id AND ib.stock_level > 0
  ), '[]'::json)`;

  let sizesSql = `COALESCE((
    SELECT json_agg(json_build_object(
      'id', sub.id,
      'size_name', sub.size_name,
      'color_name', sub.color_name,
      'barcode', sub.barcode,
      'stock_level', sub.total_stock,
      'size_id', sub.size_id
    ) ORDER BY sub.id ASC)
    FROM (
      SELECT MIN(s.id) as id, s.size_name, s.color_name, MAX(s.barcode) as barcode, MIN(s.size_id) as size_id, SUM(s.stock_level) as total_stock
      FROM inventory_sizes s
      WHERE s.inventory_id = i.id
      GROUP BY s.size_name, s.color_name
    ) sub
  ), '[]'::json)`;

  if (activeBranchId && !Number.isNaN(activeBranchId)) {
    stockLevelSql = `COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id AND branch_id = ${activeBranchId}), 0)`;
    sizesSql = `COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id,
        'size_name', s.size_name,
        'color_name', s.color_name,
        'barcode', s.barcode,
        'stock_level', COALESCE(s.stock_level, 0),
        'size_id', s.size_id
      ) ORDER BY s.id ASC)
      FROM inventory_sizes s
      WHERE s.inventory_id = i.id 
        AND s.branch_id = ${activeBranchId}
    ), '[]'::json)`;
  }

  const params = [];
  const where = ['i.is_deleted = FALSE'];
  const targetBranchForGender = reqBranchId || (!canViewAllBranches ? activeBranchId : null);
  if (targetBranchForGender) {
    params.push(targetBranchForGender);
    const pIdx = params.length;
    where.push(`(
      (SELECT allowed_gender FROM branches WHERE id = $${pIdx}) = 'both' 
      OR i.gender = 'both' 
      OR i.gender = (SELECT allowed_gender FROM branches WHERE id = $${pIdx})
    )`);
  }

  if (req.query.search) {
    params.push(likePattern(req.query.search));
    const pIdx = params.length;
    where.push(`(
      i.name ILIKE $${pIdx}
      OR i.barcode ILIKE $${pIdx}
      OR CAST(i.id AS text) ILIKE $${pIdx}
      OR i.category ILIKE $${pIdx}
      OR i.color ILIKE $${pIdx}
      OR i.size_cut ILIKE $${pIdx}
      OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.size_name ILIKE $${pIdx})
      OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.barcode ILIKE $${pIdx})
    )`);
  }
  if (req.query.name) {
    params.push(likePattern(req.query.name));
    where.push(`i.name ILIKE $${params.length}`);
  }
  if (req.query.barcode) {
    const rawBarcode = String(req.query.barcode).trim();
    params.push(likePattern(rawBarcode));
    const pIdx = params.length;
    params.push(rawBarcode);
    const exactIdx = params.length;
    where.push(`(
      i.barcode ILIKE $${pIdx}
      OR LOWER(TRIM(i.barcode)) = LOWER($${exactIdx})
      OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND (sz.barcode ILIKE $${pIdx} OR LOWER(TRIM(sz.barcode)) = LOWER($${exactIdx})))
    )`);
  }
  const catQuery = resolveCategoryQuery(req.query.category);
  if (catQuery) {
    if (catQuery.type === 'suits') {
      where.push(`(i.category ILIKE '%SUIT%' OR i.category ILIKE '%بدل%')`);
    } else if (catQuery.type === 'other') {
      where.push(`(i.category IS NULL OR TRIM(i.category) = '' OR LOWER(TRIM(i.category)) IN ('أخرى', 'اخري', 'other', 'uncategorized'))`);
    } else {
      params.push(catQuery.value);
      where.push(`LOWER(TRIM(i.category)) = LOWER($${params.length})`);
    }
  }
  if (req.query.supplier_id && req.query.supplier_id !== 'all') {
    if (req.query.supplier_id === 'none' || req.query.supplier_id === 'null') {
      where.push('i.preferred_supplier_id IS NULL');
    } else {
      const sId = parseInt(req.query.supplier_id, 10);
      if (!Number.isNaN(sId) && sId > 0) {
        params.push(sId);
        where.push(`i.preferred_supplier_id = $${params.length}`);
      }
    }
  }
  const brokenSizesSql = (activeBranchId && !Number.isNaN(activeBranchId))
    ? `EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.branch_id = ${activeBranchId} AND sz.stock_level <= 0)`
    : `EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id GROUP BY sz.size_name HAVING SUM(sz.stock_level) <= 0)`;

  if (req.query.stock_status && req.query.stock_status !== 'all') {
    if (req.query.stock_status === 'in_stock') {
      where.push(`${stockLevelSql} > 0`);
    } else if (req.query.stock_status === 'in_stock_safe') {
      where.push(`${stockLevelSql} > COALESCE(i.min_stock_level, 5)`);
    } else if (req.query.stock_status === 'all_low' || req.query.stock_status === 'low_stock_all') {
      where.push(`(${stockLevelSql} <= COALESCE(i.min_stock_level, 5))`);
    } else if (req.query.stock_status === 'low_stock' || req.query.stock_status === 'low_stock_near') {
      where.push(`(${stockLevelSql} > 0 AND ${stockLevelSql} <= COALESCE(i.min_stock_level, 5))`);
    } else if (req.query.stock_status === 'out_of_stock') {
      where.push(`(${stockLevelSql} <= 0)`);
    } else if (req.query.stock_status === 'broken_sizes' || req.query.stock_status === 'missing_sizes') {
      where.push(`(${stockLevelSql} > 0 AND ${brokenSizesSql})`);
    }
  } else if (activeBranchId && !Number.isNaN(activeBranchId)) {
    // When a specific branch is selected and stock_status is 'all',
    // show items that have stock in that branch by default, unless include_zero=true or all=true
    if (req.query.include_zero !== 'true' && req.query.all_with_zero !== 'true' && req.query.all !== 'true') {
      where.push(`${stockLevelSql} > 0`);
    }
  }

  if (req.query.gender && req.query.gender !== 'all') {
    const gVal = String(req.query.gender).toLowerCase().trim();
    if (gVal === 'men' || gVal === 'رجالي') {
      where.push(`(i.gender = 'men' OR i.gender = 'رجالي')`);
    } else if (gVal === 'women' || gVal === 'حريمي') {
      where.push(`(i.gender = 'women' OR i.gender = 'حريمي')`);
    } else if (gVal === 'both' || gVal === 'مشترك' || gVal === 'كلاهما') {
      where.push(`(i.gender = 'both' OR i.gender = 'مشترك' OR i.gender = 'كلاهما')`);
    }
  }

  let orderBySql = 'ORDER BY i.id DESC';
  if (req.query.sort) {
    if (req.query.sort === 'price_desc') orderBySql = 'ORDER BY (i.price IS NULL), i.price DESC, i.id DESC';
    else if (req.query.sort === 'price_asc') orderBySql = 'ORDER BY (i.price IS NULL), i.price ASC, i.id DESC';
    else if (req.query.sort === 'name_asc') orderBySql = 'ORDER BY TRIM(i.name) ASC, i.id DESC';
    else if (req.query.sort === 'name_desc') orderBySql = 'ORDER BY TRIM(i.name) DESC, i.id DESC';
    else if (req.query.sort === 'stock_desc') orderBySql = `ORDER BY ${stockLevelSql} DESC, i.id DESC`;
    else if (req.query.sort === 'stock_asc') orderBySql = `ORDER BY ${stockLevelSql} ASC, i.id DESC`;
    else if (req.query.sort === 'oldest') orderBySql = 'ORDER BY i.id ASC';
    else if (req.query.sort === 'latest') orderBySql = 'ORDER BY i.id DESC';
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  let query = `
    SELECT ${columns},
           ${totalStockSql} as total_stock,
           ${stockLevelSql} as stock_level,
           ${branchStocksSql} as branch_stocks,
           ${availableBranchesSql} as available_branches,
           ${sizesSql} as sizes
    FROM inventory i 
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
    ${whereClause}
    ${orderBySql}
  `;
  const countQuery = `
    SELECT COUNT(*)::int as total
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    ${whereClause}
  `;

  const queryParams = [...params];
  if (pagination.enabled) {
    query = appendPagination(query, queryParams, pagination);
    const [dataRes, countRes] = await Promise.all([
      db.query(query, queryParams),
      db.query(countQuery, params),
    ]);
    return paginatedPayload(dataRes.rows, countRes.rows[0].total, pagination, 'items');
  }

  const { rows } = await db.query(query, queryParams);
  return paginatedPayload(rows, rows.length, { page: 1, limit: rows.length, total: rows.length }, 'items');
}

async function createProduct(body, user, file = null) {
  const isBranch = Boolean(config.IS_BRANCH_MODE || db._isBranchMode || db.sqlite || process.env.APP_MODE === 'branch');
  const userPerms = user ? getUserPermissions(user) : [];
  const canCreate = user && (
    user.role === 'admin' ||
    userPerms.includes('inventory_admin') ||
    userPerms.includes('admin') ||
    userPerms.includes('manage_inventory') ||
    hasPermission(user, 'inventory.products.create') ||
    (isBranch && (user.role === 'branch_user' || user.branch_id || user.branch_scope))
  );
  if (!canCreate) {
    if (file) removeUploadedFile(file.path);
    const err = new Error('غير مصرح لك بإضافة منتجات للمخزون');
    err.statusCode = 403;
    throw err;
  }

  let {
    name, category, size_cut, color, new_size, new_color,
    stock_level, min_stock_level, branch_id, price, wholesale_price,
    semi_wholesale_price, cost_price, image_url, barcode, supplier_id,
    preferred_supplier_id, gender, purchase_batch_id, stock
  } = body || {};

  name = String(name || '').trim();
  if (!name) {
    if (file) removeUploadedFile(file.path);
    const err = new Error('يرجى إدخال اسم المنتج');
    err.statusCode = 400;
    throw err;
  }

  // Image precedence:
  // 1. Uploaded file via Multer
  // 2. Existing valid URL
  // 3. null
  if (file && file.filename) {
    image_url = `/uploads/products/${file.filename}`;
  } else if (image_url && typeof image_url === 'string') {
    image_url = saveBase64ImageIfPresent(image_url.trim());
  } else {
    image_url = null;
  }

  barcode = normalizeBarcodeInput(barcode);
  if (isBranchScopedUser(user)) {
    const targetBranchId = branch_id ? parseInt(branch_id, 10) : parseInt(user?.branch_id, 10);
    if (hasBranchAccess(user, targetBranchId)) {
      branch_id = targetBranchId;
    } else {
      branch_id = parseInt(user?.branch_id, 10) || 1;
    }
  }
  if (!supplier_id) {
    supplier_id = preferred_supplier_id;
  }
  if (!supplier_id) {
    const supRes = await db.query('SELECT id FROM suppliers ORDER BY id LIMIT 1');
    if (supRes.rows.length > 0) {
      supplier_id = supRes.rows[0].id;
    }
  }

  let sizes = body.sizes;
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = null;
    }
  }

  const hasMultiSizes = Array.isArray(sizes) && sizes.length > 0;
  let parsedSizes = [];
  if (hasMultiSizes) {
    parsedSizes = sizes
      .map((s) => ({
        size: String(s?.size || s?.size_name || '').trim(),
        color: String(s?.color || s?.color_name || '').trim(),
        stock: parseNonNegativeInt(s?.stock ?? s?.stock_level ?? 0, 'size stock'),
        barcode: String(s?.barcode || '').trim() || generateNumericBarcode(),
      }))
      .filter((s) => s.size);

    parsedSizes = mergeDuplicateSizeRows(parsedSizes);
  }

  const rawStock = (hasMultiSizes && parsedSizes.length > 0)
    ? parsedSizes.reduce((sum, s) => sum + s.stock, 0)
    : (stock_level !== undefined ? stock_level : (stock !== undefined ? stock : 0));
  const initialStock = rawStock === '' ? 0 : parseNonNegativeInt(rawStock, 'stock_level');
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');
  const b_id = parseInt(branch_id, 10) || 1;

  let normalizedGender = 'men';
  if (gender) {
    const gLower = String(gender).toLowerCase().trim();
    if (gLower === 'women' || gLower === 'حريمي') normalizedGender = 'women';
    else if (gLower === 'both' || gLower === 'مشترك' || gLower === 'كلاهما') normalizedGender = 'both';
    else normalizedGender = 'men';
  } else if (b_id) {
    try {
      if (config.IS_BRANCH_MODE && db.sqlite) {
        const bRow = db.sqlite.prepare('SELECT allowed_gender FROM branches WHERE id = ?').get(b_id);
        if (bRow?.allowed_gender === 'women') {
          normalizedGender = 'women';
        }
      }
    } catch {}
  }

  const numPrice = Number(price) || 0;
  const numCost = Number(cost_price) || 0;
  if (numPrice < 0 || numCost < 0) {
    if (file) removeUploadedFile(file.path);
    const err = new Error('لا يمكن أن تكون الأسعار أقل من الصفر');
    err.statusCode = 400;
    throw err;
  }

  const targetColorStr = String(new_color || color || '').trim();
  let targetSizeStr = '';
  if (hasMultiSizes && parsedSizes.length > 0) {
    targetSizeStr = parsedSizes.map((s) => s.size).join(', ');
  } else {
    targetSizeStr = String(new_size || size_cut || body.size || '').trim();
  }

  try {
    if (config.IS_BRANCH_MODE) {
      if (barcode) {
        await assertBarcodeAvailable(db, barcode);
      } else {
        barcode = await generateUniqueBarcode(db);
      }
      const resolvedColor = await createOrGetColor(targetColorStr);
      const resolvedSize = await createOrGetSize(targetSizeStr);
      const colorName = resolvedColor?.name || (targetColorStr || null);
      const colorId = resolvedColor?.id || null;
      const sizeName = resolvedSize?.name || (targetSizeStr || null);
      const sizeId = resolvedSize?.id || null;

      const safeSupplierId = (supplier_id || preferred_supplier_id) ? (Number(supplier_id || preferred_supplier_id) || null) : null;
      const safeColorId = colorId || null;
      const safeSizeId = sizeId || null;
      const safeImageUrl = image_url || null;
      const safeCategory = category || null;
      const safeNormalizedGender = normalizedGender || 'both';

      const numWholesale = Number(wholesale_price) || 0;
      const numSemiWholesale = Number(semi_wholesale_price) || 0;

      const stmt = db.sqlite.prepare(`
        INSERT INTO inventory (
          name, category, size_cut, color, stock_level, min_stock_level, price,
          cost_price, image_url, barcode, preferred_supplier_id, is_deleted,
          color_id, size_id, gender, wholesale_price, semi_wholesale_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      `);
      const info = stmt.run(
        name, safeCategory, sizeName, colorName, initialStock, minStockLevel,
        numPrice, numCost, safeImageUrl, barcode, safeSupplierId, safeColorId, safeSizeId, safeNormalizedGender,
        numWholesale, numSemiWholesale
      );
      const newId = info.lastInsertRowid;

      db.sqlite.prepare(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
        SELECT ?, id, CASE WHEN id = ? THEN ? ELSE 0 END FROM branches
      `).run(newId, b_id, initialStock);

      if (hasMultiSizes && parsedSizes.length > 0) {
        for (const s of parsedSizes) {
          const resS = await createOrGetSize(s.size);
          db.sqlite.prepare(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(newId, resS?.id || null, s.size, s.color || colorName, s.barcode || null, s.stock, b_id);
        }
      } else if (sizeName) {
        db.sqlite.prepare(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(newId, safeSizeId, sizeName, initialStock, b_id);
      }

      if ((hasMultiSizes && parsedSizes.length > 0) || sizeName) {
        recalcStockFromSizesSqlite(newId, b_id);
      }

      if (initialStock > 0 && safeSupplierId) {
        const batchId = purchase_batch_id || crypto.randomUUID();
        const total_cost = initialStock * numCost;
        try {
          db.sqlite.prepare(`
            INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id, supply_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(safeSupplierId, newId, initialStock, numCost, 'إضافة منتج جديد برصيد', b_id, batchId);
        } catch (srErr) {
          console.warn('[Branch SupplyRecord Warning]:', srErr.message);
        }

        try {
          db.sqlite.prepare(`
            INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id, branch_id, transaction_date)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(safeSupplierId, 'purchase', total_cost, `فاتورة مشتريات (منتج جديد: ${name})`, batchId, b_id);
        } catch (stErr) {
          console.warn('[Branch SupplierTransaction Warning]:', stErr.message);
        }

        try {
          db.sqlite.prepare(`
            UPDATE suppliers 
            SET total_purchases = COALESCE(total_purchases, 0) + ?,
                balance = COALESCE(balance, 0) - ?,
                purchase_count = COALESCE(purchase_count, 0) + 1,
                last_supply_date = datetime('now')
            WHERE id = ?
          `).run(total_cost, total_cost, safeSupplierId);
        } catch (supErr) {
          try {
            db.sqlite.prepare(`
              UPDATE suppliers 
              SET total_purchases = COALESCE(total_purchases, 0) + ?,
                  balance = COALESCE(balance, 0) - ?
              WHERE id = ?
            `).run(total_cost, total_cost, safeSupplierId);
          } catch (supFallbackErr) {
            console.warn('[Branch Supplier Balance Update Warning]:', supFallbackErr.message);
          }
        }
      }

      let supSnapshot = null;
      if (safeSupplierId) {
        try {
          supSnapshot = db.sqlite.prepare('SELECT id, name, phone, code FROM suppliers WHERE id = ?').get(safeSupplierId);
        } catch {}
      }

      try {
        await queueSyncOperation(db, null, 'product', 'create', newId, b_id, {
          id: newId,
          name,
          category: safeCategory,
          size_cut: sizeName,
          color: colorName,
          barcode,
          stock_level: initialStock,
          min_stock_level: minStockLevel,
          price: numPrice,
          cost_price: numCost,
          image_url: safeImageUrl,
          preferred_supplier_id: safeSupplierId,
          supplier_ref: supSnapshot ? { id: supSnapshot.id, name: supSnapshot.name, phone: supSnapshot.phone, code: supSnapshot.code } : null,
          color_id: null, // Branch SQLite IDs must not be sent to Central PostgreSQL to prevent foreign key errors
          size_id: null,  // Central Server automatically resolves size_cut into Central sizes table
          gender: safeNormalizedGender,
          wholesale_price: numWholesale,
          semi_wholesale_price: numSemiWholesale,
          branch_id: b_id,
          sizes: (hasMultiSizes && parsedSizes.length > 0) ? parsedSizes : (sizeName ? [{ size: sizeName, color: colorName, stock: initialStock }] : [])
        });
      } catch (e) {
        console.warn('Failed to queue product sync operation:', e.message);
      }

      if (initialStock > 0 && safeSupplierId && numCost > 0) {
        try {
          const total_cost = initialStock * numCost;
          const batchId = purchase_batch_id || crypto.randomUUID();
          await queueSyncOperation(db, null, 'supplier_transaction', 'create', newId, safeSupplierId, {
            supplier_id: safeSupplierId,
            supplier_ref: supSnapshot ? { id: supSnapshot.id, name: supSnapshot.name, phone: supSnapshot.phone, code: supSnapshot.code } : null,
            transaction_type: 'purchase',
            amount: total_cost,
            notes: `فاتورة مشتريات (منتج جديد: ${name})`,
            branch_id: b_id,
            purchase_batch_id: batchId,
            supply_items: [{
              inventory_id: newId,
              barcode: barcode,
              name: name,
              quantity: initialStock,
              cost_price: numCost,
            }]
          });
        } catch (e) {
          console.warn('Failed to queue initial purchase supplier_transaction:', e.message);
        }
      }

      invalidateInventoryMetadata();
      const resRow = db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(newId);
      const sizesRows = db.sqlite.prepare('SELECT id, size_name, color_name, barcode, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ?').all(newId);
      return { ...resRow, sizes: sizesRows };
    }

    const safeSupplierId = (supplier_id || preferred_supplier_id) ? (Number(supplier_id || preferred_supplier_id) || null) : null;

    const item = await db.transaction(async (tx) => {
      // Resolve color within transaction
      let resolvedColorId = null;
      let resolvedColorName = null;
      if (targetColorStr) {
        const resolvedColor = await createOrGetColor(targetColorStr, tx);
        if (resolvedColor) {
          resolvedColorId = resolvedColor.id;
          resolvedColorName = resolvedColor.name;
        }
      }

      // Resolve size within transaction
      let resolvedSizeId = null;
      let resolvedSizeName = null;
      if (targetSizeStr) {
        const resolvedSize = await createOrGetSize(targetSizeStr, tx);
        if (resolvedSize) {
          resolvedSizeId = resolvedSize.id;
          resolvedSizeName = resolvedSize.name;
        }
      }

      if (barcode) {
        await assertBarcodeAvailable(tx, barcode);
      } else {
        barcode = await generateUniqueBarcode(tx);
      }

      const { rows } = await tx.query(
        `INSERT INTO inventory (
          name, category, size_cut, color, stock_level, min_stock_level, price,
          wholesale_price, semi_wholesale_price, cost_price, image_url, barcode,
          preferred_supplier_id, gender, color_id, size_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          name, category, resolvedSizeName, resolvedColorName, initialStock, minStockLevel,
          numPrice, wholesale_price || 0, semi_wholesale_price || 0, numCost, image_url,
          barcode, safeSupplierId, normalizedGender, resolvedColorId, resolvedSizeId
        ]
      );
      const newId = rows[0].id;

      // Initialize stock for all branches
      await tx.query(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) 
        SELECT $1, id, CASE WHEN id = $2 THEN $3 ELSE 0 END FROM branches
      `, [newId, b_id, initialStock]);

      // Insert size rows into inventory_sizes
      if (hasMultiSizes && parsedSizes.length > 0) {
        for (const s of parsedSizes) {
          let sId = null;
          const resolvedS = await createOrGetSize(s.size, tx);
          if (resolvedS) sId = resolvedS.id;

          await tx.query(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1))
            DO UPDATE SET stock_level = inventory_sizes.stock_level + EXCLUDED.stock_level, size_id = EXCLUDED.size_id, barcode = COALESCE(EXCLUDED.barcode, inventory_sizes.barcode)
          `, [newId, sId, s.size, s.color || resolvedColorName, s.barcode || null, s.stock, b_id]);

          // Also initialize other branches with 0 stock
          await tx.query(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
            SELECT $1, $2, $3, $4, $5, 0, id FROM branches WHERE id != $6
            ON CONFLICT DO NOTHING
          `, [newId, sId, s.size, s.color || resolvedColorName, s.barcode || null, b_id]);
        }
      } else if (resolvedSizeName) {
        await tx.query(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
          SELECT $1, $2, $3, CASE WHEN id = $4 THEN $5 ELSE 0 END, id FROM branches
          ON CONFLICT DO NOTHING
        `, [newId, resolvedSizeId, resolvedSizeName, b_id, initialStock]);
      }

      // Keep product/branch totals in sync with the actual size rows.
      if ((hasMultiSizes && parsedSizes.length > 0) || resolvedSizeName) {
        await recalcStockFromSizes(tx, newId, b_id);
      }

      if (initialStock > 0 && safeSupplierId && numCost > 0) {
        const batchId = purchase_batch_id || crypto.randomUUID();
        const total_cost = initialStock * numCost;
        await tx.query(
          'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [safeSupplierId, newId, initialStock, numCost, 'إضافة منتج جديد برصيد', b_id, batchId]
        );
        await tx.query(
          'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [safeSupplierId, 'purchase', total_cost, `فاتورة مشتريات (منتج جديد: ${name})`, batchId, b_id]
        );
        await tx.query(
          `UPDATE suppliers SET total_purchases = COALESCE(total_purchases, 0) + $1, balance = COALESCE(balance, 0) - $1, purchase_count = COALESCE(purchase_count, 0) + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
          [total_cost, safeSupplierId]
        );
      }

      if (hasMultiSizes && parsedSizes.length > 0) {
        rows[0].sizes = parsedSizes.map((s, idx) => ({
          id: idx + 1,
          size_name: s.size,
          color_name: s.color || resolvedColorName,
          stock_level: s.stock,
        }));
      }

      return rows[0];
    });

    invalidateInventoryMetadata();
    return item;
  } catch (err) {
    if (file) removeUploadedFile(file.path);
    throw err;
  }
}

async function updateProduct(id, body, user, file = null) {
  const userPerms = user ? getUserPermissions(user) : [];
  if (!user || (user.role !== 'admin' && !hasPermission(user, 'inventory.products.edit') && !userPerms.includes('inventory_admin') && !userPerms.includes('admin') && !userPerms.includes('manage_inventory'))) {
    if (file) removeUploadedFile(file.path);
    const err = new Error('غير مصرح لك بتعديل بيانات هذا المنتج');
    err.statusCode = 403;
    throw err;
  }

  let {
    name, category, size_cut, color, new_size, new_color,
    stock_level, min_stock_level, supplier_id, preferred_supplier_id,
    price, wholesale_price, semi_wholesale_price, cost_price, image_url,
    barcode, branch_id, is_correction, gender
  } = body || {};

  name = String(name || '').trim();
  barcode = normalizeBarcodeInput(barcode);
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');

  if (file && file.filename) {
    image_url = `/uploads/products/${file.filename}`;
  } else if (image_url !== undefined && typeof image_url === 'string') {
    image_url = saveBase64ImageIfPresent(image_url.trim());
  }

  if (!supplier_id) {
    supplier_id = preferred_supplier_id;
  }
  if (!supplier_id) {
    const cur = await db.query('SELECT preferred_supplier_id FROM inventory WHERE id = $1', [id]);
    supplier_id = cur.rows[0]?.preferred_supplier_id;
  }
  if (!supplier_id) {
    const supRes = await db.query('SELECT id FROM suppliers ORDER BY id LIMIT 1');
    if (supRes.rows.length > 0) {
      supplier_id = supRes.rows[0].id;
    }
  }

  let sizes = body.sizes;
  if (typeof sizes === 'string') {
    try {
      sizes = JSON.parse(sizes);
    } catch {
      sizes = null;
    }
  }

  const hasMultiSizes = Array.isArray(sizes);
  let parsedSizes = [];
  if (hasMultiSizes) {
    parsedSizes = sizes
      .map((s) => ({
        size: String(s?.size || s?.size_name || '').trim(),
        color: String(s?.color || s?.color_name || '').trim(),
        stock: parseNonNegativeInt(s?.stock ?? s?.stock_level ?? 0, 'size stock'),
        barcode: String(s?.barcode || '').trim() || generateNumericBarcode(),
      }))
      .filter((s) => s.size);

    parsedSizes = mergeDuplicateSizeRows(parsedSizes);
  }

  let normalizedGender = null;
  if (gender !== undefined && gender !== null && gender !== '') {
    const gLower = String(gender).toLowerCase().trim();
    if (gLower === 'women' || gLower === 'حريمي') normalizedGender = 'women';
    else if (gLower === 'both' || gLower === 'مشترك' || gLower === 'كلاهما') normalizedGender = 'both';
    else normalizedGender = 'men';
  }

  const numPrice = Number(price) || 0;
  const numCost = Number(cost_price) || 0;
  const targetColorStr = String(new_color || color || '').trim();
  let targetSizeStr = '';
  if (hasMultiSizes && parsedSizes.length > 0) {
    targetSizeStr = parsedSizes.map((s) => s.size).join(', ');
  } else {
    targetSizeStr = String(new_size || size_cut || body.size || '').trim();
  }

  try {
    if (barcode) {
      await assertBarcodeAvailable(db, barcode, { inventoryId: id });
    }

    if (config.IS_BRANCH_MODE) {
      if (!barcode) {
        barcode = await generateUniqueBarcode(db);
      }
      const resolvedColor = await createOrGetColor(targetColorStr);
      const resolvedSize = await createOrGetSize(targetSizeStr);
      const colorName = resolvedColor?.name || (targetColorStr || null);
      const colorId = resolvedColor?.id || null;
      const sizeName = resolvedSize?.name || (targetSizeStr || null);
      const sizeId = resolvedSize?.id || null;

      const safeSupplierId = (supplier_id || preferred_supplier_id) ? (Number(supplier_id || preferred_supplier_id) || null) : null;
      const safeColorId = colorId || null;
      const safeSizeId = sizeId || null;
      const safeImageUrl = image_url || null;
      const safeCategory = category || null;
      const safeNormalizedGender = normalizedGender || 'both';
      const numWholesale = wholesale_price !== undefined ? (Number(wholesale_price) || 0) : null;
      const numSemiWholesale = semi_wholesale_price !== undefined ? (Number(semi_wholesale_price) || 0) : null;
      const targetBranchId = Number(branch_id) || Number(user?.branch_id) || Number(config.BRANCH_ID) || 1;
      const oldBranchRow = db.sqlite.prepare('SELECT stock_level FROM inventory_branches WHERE inventory_id = ? AND branch_id = ?').get(id, targetBranchId);
      const oldStock = oldBranchRow ? Number(oldBranchRow.stock_level || 0) : 0;

      db.sqlite.prepare(`
        UPDATE inventory
        SET name = ?, category = ?, size_cut = ?, color = ?, min_stock_level = ?, preferred_supplier_id = ?, price = ?, cost_price = ?, image_url = COALESCE(?, image_url), barcode = ?, color_id = ?, size_id = ?, gender = COALESCE(?, gender), wholesale_price = COALESCE(?, wholesale_price), semi_wholesale_price = COALESCE(?, semi_wholesale_price)
        WHERE id = ?
      `).run(name, safeCategory, sizeName, colorName, minStockLevel, safeSupplierId, numPrice, numCost, safeImageUrl, barcode, safeColorId, safeSizeId, safeNormalizedGender, numWholesale, numSemiWholesale, id);

      if (hasMultiSizes && parsedSizes.length > 0) {
        db.sqlite.prepare('DELETE FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ?').run(id, targetBranchId);
        for (const s of parsedSizes) {
          const resS = await createOrGetSize(s.size);
          db.sqlite.prepare(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(id, resS?.id || null, s.size, s.color || colorName, s.barcode || null, s.stock, targetBranchId);
        }
        recalcStockFromSizesSqlite(id, targetBranchId);
      } else if (stock_level !== undefined && stock_level !== '' && stock_level !== null) {
        const nextStock = Math.max(0, Number.parseInt(stock_level, 10) || 0);
        db.sqlite.prepare(`
          INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
          VALUES (?, ?, ?)
          ON CONFLICT(inventory_id, branch_id) DO UPDATE SET stock_level = excluded.stock_level
        `).run(id, targetBranchId, nextStock);
        const totalRes = db.sqlite.prepare('SELECT COALESCE(SUM(stock_level), 0) AS total FROM inventory_branches WHERE inventory_id = ?').get(id);
        db.sqlite.prepare('UPDATE inventory SET stock_level = ? WHERE id = ?').run(Number(totalRes?.total || 0), id);
      }

      const row = db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
      const branchStockRow = db.sqlite.prepare('SELECT stock_level FROM inventory_branches WHERE inventory_id = ? AND branch_id = ?').get(id, targetBranchId);
      const sizesRows = db.sqlite.prepare('SELECT id, size_name, color_name, barcode, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? AND (branch_id = ? OR branch_id IS NULL)').all(id, targetBranchId);
      const newStock = branchStockRow ? Number(branchStockRow.stock_level || 0) : 0;
      const diff = newStock - oldStock;

      let effectiveSupplierId = safeSupplierId;
      if (!effectiveSupplierId) {
        try {
          const prodSup = db.sqlite.prepare('SELECT preferred_supplier_id FROM inventory WHERE id = ?').get(id);
          if (prodSup?.preferred_supplier_id) {
            effectiveSupplierId = Number(prodSup.preferred_supplier_id);
          }
        } catch {}
      }

      if (diff > 0 && !is_correction && effectiveSupplierId && numCost > 0) {
        const total_cost = diff * numCost;
        const batchId = crypto.randomUUID();
        try {
          db.sqlite.prepare(`
            INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id, supply_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(effectiveSupplierId, id, diff, numCost, 'تعديل كمية (زيادة رصيد)', targetBranchId, batchId);
        } catch (srErr) {
          console.warn('[Branch Update SupplyRecord Warning]:', srErr.message);
        }

        try {
          db.sqlite.prepare(`
            INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id, branch_id, transaction_date)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `).run(effectiveSupplierId, 'purchase', total_cost, `تعديل رصيد بالزيادة (${name})`, batchId, targetBranchId);
        } catch (stErr) {
          console.warn('[Branch Update SupplierTransaction Warning]:', stErr.message);
        }

        try {
          db.sqlite.prepare(`
            UPDATE suppliers 
            SET total_purchases = COALESCE(total_purchases, 0) + ?,
                balance = COALESCE(balance, 0) - ?,
                purchase_count = COALESCE(purchase_count, 0) + 1,
                last_supply_date = datetime('now')
            WHERE id = ?
          `).run(total_cost, total_cost, effectiveSupplierId);
        } catch (supErr) {
          try {
            db.sqlite.prepare(`
              UPDATE suppliers 
              SET total_purchases = COALESCE(total_purchases, 0) + ?,
                  balance = COALESCE(balance, 0) - ?
              WHERE id = ?
            `).run(total_cost, total_cost, effectiveSupplierId);
          } catch (supFallbackErr) {
            console.warn('[Branch Update Supplier Balance Warning]:', supFallbackErr.message);
          }
        }
      }

      try {
        await queueSyncOperation(db, null, 'product', 'update', id, targetBranchId, {
          id,
          name,
          category: safeCategory,
          size_cut: sizeName,
          color: colorName,
          barcode,
          min_stock_level: minStockLevel,
          price: numPrice,
          cost_price: numCost,
          image_url: safeImageUrl,
          preferred_supplier_id: safeSupplierId,
          color_id: null, // Branch SQLite IDs must not be sent to Central PostgreSQL to prevent foreign key errors
          size_id: null,  // Central Server automatically resolves size_cut into Central sizes table
          gender: safeNormalizedGender,
          wholesale_price: numWholesale,
          semi_wholesale_price: numSemiWholesale,
          branch_id: targetBranchId,
          stock_level: branchStockRow ? Number(branchStockRow.stock_level || 0) : undefined,
          sizes: hasMultiSizes ? sizesRows : undefined,
        });
      } catch (e) {
        console.warn('Failed to queue product update sync:', e.message);
      }

      invalidateInventoryMetadata();
      return { ...row, sizes: sizesRows };
    }

    const item = await db.transaction(async (tx) => {
      await assertBarcodeAvailable(tx, barcode, { inventoryId: id });

      let resolvedColorId = null;
      let resolvedColorName = null;
      if (targetColorStr) {
        const resolvedColor = await createOrGetColor(targetColorStr, tx);
        if (resolvedColor) {
          resolvedColorId = resolvedColor.id;
          resolvedColorName = resolvedColor.name;
        }
      }

      let resolvedSizeId = null;
      let resolvedSizeName = null;
      if (targetSizeStr) {
        const resolvedSize = await createOrGetSize(targetSizeStr, tx);
        if (resolvedSize) {
          resolvedSizeId = resolvedSize.id;
          resolvedSizeName = resolvedSize.name;
        }
      }

      const safeSupplierId = (supplier_id || preferred_supplier_id) ? (Number(supplier_id || preferred_supplier_id) || null) : null;

      if (hasInventoryAdminAccess(user)) {
        await tx.query(
          `UPDATE inventory 
           SET name = $1, category = $2, size_cut = $3, color = $4, min_stock_level = $5,
               preferred_supplier_id = COALESCE($6, preferred_supplier_id), price = $7, wholesale_price = $8,
               semi_wholesale_price = $9, cost_price = $10,
               image_url = CASE WHEN $11::text IS NOT NULL THEN $11 ELSE image_url END,
               barcode = $12, gender = COALESCE($13, gender), color_id = $14, size_id = $15
           WHERE id = $16`,
          [
            name, category, resolvedSizeName, resolvedColorName, minStockLevel,
            safeSupplierId, numPrice, wholesale_price || 0, semi_wholesale_price || 0, numCost,
            image_url, barcode, normalizedGender, resolvedColorId, resolvedSizeId, id
          ]
        );
      }

      const targetBranchId = Number(branch_id) || Number(user?.branch_id) || 1;
      const currentStockRes = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [id, targetBranchId]);
      const oldStock = currentStockRes.rows.length ? Number(currentStockRes.rows[0].stock_level) : 0;

      if (hasMultiSizes && parsedSizes.length > 0) {
        const keptKeys = [];

        for (const s of parsedSizes) {
          let sId = null;
          const resolvedS = await createOrGetSize(s.size, tx);
          if (resolvedS) sId = resolvedS.id;

          const rowColor = s.color || resolvedColorName || '';
          keptKeys.push(`${s.size.toLowerCase()}|${rowColor.toLowerCase()}`);

          await tx.query(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, color_name, barcode, stock_level, branch_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), LOWER(TRIM(COALESCE(color_name, ''))), COALESCE(branch_id, 1))
            DO UPDATE SET stock_level = EXCLUDED.stock_level, size_id = EXCLUDED.size_id, barcode = COALESCE(EXCLUDED.barcode, inventory_sizes.barcode)
          `, [id, sId, s.size, rowColor, s.barcode || null, s.stock, targetBranchId]);
        }

        await tx.query(`
          DELETE FROM inventory_sizes
          WHERE inventory_id = $1 AND branch_id = $2
            AND (LOWER(TRIM(size_name)) || '|' || LOWER(TRIM(COALESCE(color_name, '')))) != ALL($3::text[])
        `, [id, targetBranchId, keptKeys]);

        // Derive the branch/product totals from the rows that are actually stored.
        await recalcStockFromSizes(tx, id, targetBranchId);
      } else if (user && branch_id && stock_level !== undefined) {
        if (!hasInventoryAllBranchesAccess(user) && Number(branch_id) !== Number(user.branch_id)) {
          throw new Error('Unauthorized branch stock update');
        }

        await tx.query(
          'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, $2, $3) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = EXCLUDED.stock_level',
          [id, targetBranchId, stock_level]
        );
      }

      const afterStockRes = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [id, targetBranchId]);
      const newStock = afterStockRes.rows.length ? Number(afterStockRes.rows[0].stock_level) : oldStock;
      const diff = newStock - oldStock;

      let effectiveSupplierId = safeSupplierId;
      if (!effectiveSupplierId) {
        const prodSupRes = await tx.query('SELECT preferred_supplier_id FROM inventory WHERE id = $1', [id]);
        if (prodSupRes.rows.length && prodSupRes.rows[0].preferred_supplier_id) {
          effectiveSupplierId = Number(prodSupRes.rows[0].preferred_supplier_id);
        }
      }

      if (diff !== 0 && !is_correction && effectiveSupplierId && numCost > 0) {
        const absDiff = Math.abs(diff);
        const total_cost = absDiff * numCost;
        const note = diff > 0 ? 'تعديل كمية (زيادة رصيد)' : 'تعديل كمية (نقص رصيد)';
        const transType = diff > 0 ? 'purchase' : 'return';
        const transNote = diff > 0 ? `تعديل رصيد بالزيادة (${name})` : `تعديل رصيد بالنقصان (${name})`;
        const batchId = crypto.randomUUID();

        await tx.query(
          'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [effectiveSupplierId, id, diff, numCost, note, targetBranchId, batchId]
        );

        await tx.query(
          'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id, branch_id) VALUES ($1, $2, $3, $4, $5, $6)',
          [effectiveSupplierId, transType, total_cost, transNote, batchId, targetBranchId]
        );

        if (diff > 0) {
          await tx.query(
            `UPDATE suppliers SET total_purchases = COALESCE(total_purchases, 0) + $1, balance = COALESCE(balance, 0) - $1, purchase_count = COALESCE(purchase_count, 0) + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
            [total_cost, effectiveSupplierId]
          );
        } else {
          await tx.query('UPDATE suppliers SET balance = COALESCE(balance, 0) + $1 WHERE id = $2', [total_cost, effectiveSupplierId]);
        }
      }

      const totalStockRes = await tx.query('SELECT SUM(stock_level) as total FROM inventory_branches WHERE inventory_id = $1', [id]);
      const newTotal = totalStockRes.rows[0]?.total || 0;
      await tx.query('UPDATE inventory SET stock_level = $1 WHERE id = $2', [newTotal, id]);

      const { rows } = await tx.query(`
        SELECT i.*, s.name as supplier_name,
               (SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level)) FROM inventory_branches WHERE inventory_id = i.id) as branch_stocks,
               (SELECT json_agg(json_build_object('id', id, 'size_name', size_name, 'color_name', color_name, 'stock_level', stock_level, 'size_id', size_id, 'barcode', barcode)) FROM inventory_sizes WHERE inventory_id = i.id AND branch_id = $2) as sizes
        FROM inventory i 
        LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
        WHERE i.id = $1
      `, [id, targetBranchId || 1]);

      return rows[0];
    });

    invalidateInventoryMetadata();
    await auditService.log({
      userId: user?.id,
      username: user?.username,
      action: 'inventory_product_update',
      resourceType: 'inventory',
      resourceId: id,
      branchId: user?.branch_id,
      outcome: 'success',
    });
    return item;
  } catch (err) {
    if (file) removeUploadedFile(file.path);
    throw err;
  }
}

async function getInventoryById(id, requestedBranchId, user) {
  const itemId = Number(id);
  if (!itemId) {
    const err = new Error('Product ID is required');
    err.statusCode = 400;
    throw err;
  }

  const canViewAll = hasInventoryAllBranchesAccess(user);
  let branchId = Number.parseInt(requestedBranchId, 10) || Number(user?.branch_id) || 1;
  if (!canViewAll && user) branchId = Number(user.branch_id);

  if (config.IS_BRANCH_MODE) {
    const row = db.sqlite.prepare(`
      SELECT i.*, s.name as supplier_name
      FROM inventory i
      LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
      WHERE i.id = ? AND i.is_deleted = 0
    `).get(itemId);
    if (!row) {
      const err = new Error('Product not found');
      err.statusCode = 404;
      throw err;
    }
    const sizes = db.sqlite.prepare('SELECT id, size_name, color_name, barcode, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? ORDER BY id ASC').all(itemId);
    return { ...row, sizes };
  }

  const { rows } = await db.query(`
    SELECT i.*, s.name as supplier_name,
      COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $2), 0) as branch_stock_level,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', s.id,
          'size_name', s.size_name,
          'color_name', s.color_name,
          'stock_level', s.stock_level,
          'size_id', s.size_id,
          'barcode', s.barcode
        ) ORDER BY s.id)
        FROM inventory_sizes s
        WHERE s.inventory_id = i.id AND s.branch_id = $2
      ), '[]'::json) as sizes
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    WHERE i.id = $1 AND i.is_deleted = FALSE
  `, [itemId, branchId]);

  if (rows.length === 0) {
    const err = new Error('Product not found');
    err.statusCode = 404;
    throw err;
  }

  return rows[0];
}

async function deleteProduct(id, user) {
  const userPerms = user ? getUserPermissions(user) : [];
  if (!user || (user.role !== 'admin' && !hasPermission(user, 'inventory.products.delete') && !userPerms.includes('inventory_admin') && !userPerms.includes('admin') && !userPerms.includes('manage_inventory'))) {
    const err = new Error('Admin only');
    err.statusCode = 403;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare('UPDATE inventory SET is_deleted = 1 WHERE id = ?').run(id);
    try {
      await queueSyncOperation(db, null, 'product', 'delete', id, user?.branch_id || config.BRANCH_ID || 1, {
        id,
        is_deleted: true
      });
    } catch (e) {
      console.warn('Failed to queue product delete sync operation:', e.message);
    }
  } else {
    await db.query('UPDATE inventory SET is_deleted = TRUE WHERE id = $1', [id]);
  }

  invalidateInventoryMetadata();
  await auditService.log({
    userId: user?.id,
    username: user?.username,
    action: 'inventory_product_delete',
    resourceType: 'inventory',
    resourceId: id,
    branchId: user?.branch_id,
    outcome: 'success',
  });

  return { success: true };
}

async function duplicateProduct(id, body = {}, user) {
  const userPerms = user ? getUserPermissions(user) : [];
  if (!user || (user.role !== 'admin' && !hasPermission(user, 'inventory.products.duplicate') && !userPerms.includes('inventory_admin') && !userPerms.includes('admin') && !userPerms.includes('manage_inventory'))) {
    const err = new Error('غير مصرح لك بنسخ وتكرار الأصناف');
    err.statusCode = 403;
    throw err;
  }
  const itemId = Number(id);
  if (!itemId) {
    const err = new Error('Product ID is required');
    err.statusCode = 400;
    throw err;
  }

  const orig = await getInventoryById(itemId, user?.branch_id || 1, user);
  const newName = (body.name || `${orig.name} (نسخة)`).trim();
  const randSuffix = Math.floor(1000 + Math.random() * 9000);
  const newBarcode = (body.barcode || `${orig.barcode || 'PRD'}-${randSuffix}`).trim();

  const newProductData = {
    ...orig,
    name: newName,
    barcode: newBarcode,
    stock_level: 0,
    sizes: Array.isArray(orig.sizes) ? orig.sizes.map((s) => ({ ...s, stock: 0 })) : [],
  };

  const created = await createProduct(newProductData, user);
  await auditService.log({
    userId: user?.id,
    username: user?.username,
    action: 'inventory_product_duplicate',
    resourceType: 'inventory',
    resourceId: created.id,
    branchId: user?.branch_id,
    outcome: 'success',
    details: { original_id: itemId, new_name: newName, new_barcode: newBarcode },
  });

  return created;
}

async function transferStock(body, user) {
  let { inventory_id, from_branch_id, to_branch_id, from_branch, to_branch, quantity, is_request, sizes, direct_transfer } = body;
  if (!from_branch_id && from_branch) from_branch_id = from_branch;
  if (!to_branch_id && to_branch) to_branch_id = to_branch;

  if (user && (!hasInventoryAdminAccess(user) || (is_request && !hasInventoryAllBranchesAccess(user)))) {
    if (is_request) to_branch_id = user.branch_id;
    else from_branch_id = user.branch_id;
  }

  if (!inventory_id || !from_branch_id || !to_branch_id || !quantity) {
    const err = new Error('الرجاء تحديد المنتج، الفرع المصدر، الفرع الوجهة، والكمية');
    err.statusCode = 400;
    throw err;
  }

  if (Number(from_branch_id) === Number(to_branch_id)) {
    const err = new Error('لا يمكن التحويل لنفس الفرع');
    err.statusCode = 400;
    throw err;
  }

  const transferQty = parsePositiveInt(quantity, 'quantity');
  const sizesDataJson = Array.isArray(sizes) && sizes.length > 0 ? JSON.stringify(sizes) : null;

  if (is_request) {
    const sourceStock = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [inventory_id, from_branch_id]);
    const available = sourceStock.rows.length ? Number(sourceStock.rows[0].stock_level) : 0;
    if (transferQty > available) {
      const err = new Error(`عفواً، الكمية المطلوبة غير متوفرة في الفرع المصدر. المتاح حالياً: ${available} قطعة`);
      err.statusCode = 400;
      throw err;
    }

    if (Array.isArray(sizes) && sizes.length > 0) {
      for (const s of sizes) {
        const sqty = Number(s.quantity || 0);
        if (sqty <= 0) continue;
        const szCheck = await db.query(`
          SELECT stock_level FROM inventory_sizes
          WHERE inventory_id = $1 AND branch_id = $2
            AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
            AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
        `, [inventory_id, from_branch_id, s.size_name, s.color_name || '']);
        const availSz = szCheck.rows.length ? Number(szCheck.rows[0].stock_level) : 0;
        if (sqty > availSz) {
          const err = new Error(`عفواً، الكمية المطلوبة للمقاس "${s.size_name}" غير متوفرة في الفرع المصدر (المتاح: ${availSz} قطعة)`);
          err.statusCode = 400;
          throw err;
        }
      }
    }

    const creatorId = user?.id ? Number(user.id) : null;
    const creatorName = user?.full_name || user?.name || user?.username || null;
    await db.query(
      'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, created_by, created_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [inventory_id, from_branch_id, to_branch_id, transferQty, 'requested', sizesDataJson, creatorId, creatorName]
    );
    return { success: true, message: 'تم إرسال طلب بضاعة للفرع الآخر بنجاح' };
  }

  const isDirect = direct_transfer !== false;

  await db.transaction(async (tx) => {
    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [inventory_id, from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('عفواً، المخزون في الفرع المصدر غير كافٍ لإتمام عملية التحويل');
    }

    // Validate size stock in from_branch if sizes are specified
    if (Array.isArray(sizes) && sizes.length > 0) {
      for (const s of sizes) {
        const sqty = Number(s.quantity || 0);
        if (sqty <= 0) continue;
        const sizeCheck = await tx.query(`
          SELECT stock_level FROM inventory_sizes
          WHERE inventory_id = $1 AND branch_id = $2
            AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
            AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
        `, [inventory_id, from_branch_id, s.size_name, s.color_name || '']);
        const availSize = sizeCheck.rows.length ? Number(sizeCheck.rows[0].stock_level) : 0;
        if (sqty > availSize) {
          throw new Error(`عفواً، الكمية المطلوبة للمقاس "${s.size_name}" غير متوفرة في الفرع المصدر (المتاح: ${availSize} قطعة)`);
        }
      }
    }

    if (Array.isArray(sizes) && sizes.length > 0) {
      // Deduct total from source branch
      await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, inventory_id, from_branch_id]);

      // Deduct sizes from source branch
      for (const s of sizes) {
        const sqty = Number(s.quantity || 0);
        if (sqty <= 0) continue;
        await tx.query(`
          UPDATE inventory_sizes
          SET stock_level = GREATEST(0, stock_level - $1), updated_at = CURRENT_TIMESTAMP
          WHERE inventory_id = $2 AND branch_id = $3
            AND LOWER(TRIM(size_name)) = LOWER(TRIM($4))
            AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($5, '')))
        `, [sqty, inventory_id, from_branch_id, s.size_name, s.color_name || '']);
      }
    } else {
      await adjustInventoryStock(tx, {
        inventoryId: inventory_id,
        branchId: from_branch_id,
        quantityDelta: -transferQty,
      });
    }

    const senderId = user?.id ? Number(user.id) : null;
    const senderName = user?.full_name || user?.name || user?.username || null;
    let transferRecordId = null;

    if (isDirect) {
      if (Array.isArray(sizes) && sizes.length > 0) {
        // Add total to destination branch
        await tx.query(`
          INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
          VALUES ($1, $2, $3)
          ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + $3
        `, [inventory_id, to_branch_id, transferQty]);

        // Add sizes to destination branch
        for (const s of sizes) {
          const sqty = Number(s.quantity || 0);
          if (sqty <= 0) continue;
          const existingSizeRes = await tx.query(`
            SELECT id FROM inventory_sizes
            WHERE inventory_id = $1
              AND COALESCE(branch_id, 1) = COALESCE($2, 1)
              AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
              AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
            LIMIT 1
          `, [inventory_id, to_branch_id, s.size_name, s.color_name || '']);
          if (existingSizeRes.rows.length > 0) {
            await tx.query(`
              UPDATE inventory_sizes
              SET stock_level = stock_level + $1, updated_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [sqty, existingSizeRes.rows[0].id]);
          } else {
            await tx.query(`
              INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id, barcode, size_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [inventory_id, s.size_name, s.color_name || '', sqty, to_branch_id, s.barcode || null, s.size_id || null]);
          }
        }
      } else {
        await adjustInventoryStock(tx, {
          inventoryId: inventory_id,
          branchId: to_branch_id,
          quantityDelta: transferQty,
        });
      }

      const stRes = await tx.query(
        'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, created_by, created_by_name, sender_id, sender_name, received_by, received_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id',
        [inventory_id, from_branch_id, to_branch_id, transferQty, 'completed', sizesDataJson, senderId, senderName, senderId, senderName, senderId, senderName]
      );
      transferRecordId = stRes.rows?.[0]?.id || null;
    } else {
      const stRes = await tx.query(
        'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status, sizes_data, created_by, created_by_name, sender_id, sender_name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [inventory_id, from_branch_id, to_branch_id, transferQty, 'pending', sizesDataJson, senderId, senderName, senderId, senderName]
      );
      transferRecordId = stRes.rows?.[0]?.id || null;
    }

    if (config.IS_BRANCH_MODE) {
        try {
          await queueSyncOperation(tx, null, 'stock_transfer', 'transfer', transferRecordId, from_branch_id, {
            id: transferRecordId,
            inventory_id,
            from_branch_id,
            to_branch_id,
            quantity: transferQty,
            is_direct: isDirect,
            status: isDirect ? 'completed' : 'pending',
            sizes: sizes || null,
            sender_id: senderId,
            sender_name: senderName,
          });
        } catch (e) {
          console.warn('Failed to queue stock_transfer sync:', e.message);
        }
      }

    // Refresh overall inventory stock_level
    await tx.query(`
      UPDATE inventory
      SET stock_level = (SELECT COALESCE(SUM(stock_level), 0) FROM inventory_branches WHERE inventory_id = $1)
      WHERE id = $1
    `, [inventory_id]);
  });

  invalidateInventoryMetadata();
  return { 
    success: true, 
    message: isDirect 
      ? 'تم تحويل كمية المخزون للفرع الآخر بنجاح' 
      : 'تم إرسال البضاعة وهي الآن في انتظار تأكيد استلام الفرع الوجهة' 
  };
}

async function listTransferRequests(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) {
    if (branchIdParam && hasBranchAccess(user, branchIdParam)) {
      branch_id = branchIdParam;
    } else {
      branch_id = user.branch_id;
    }
  }

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name,
           COALESCE(u_creator.full_name, e_creator.name, st.created_by_name, u_creator.username, 'غير محدد') as created_by_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
    LEFT JOIN users u_creator ON st.created_by = u_creator.id
    LEFT JOIN employees e_creator ON u_creator.employee_id = e_creator.id
    WHERE st.status = 'requested'
  `;
  const params = [];

  if (branch_id && branch_id !== 'all') {
    query += ' AND st.from_branch_id = $1';
    params.push(branch_id);
  } else if (user && !hasInventoryAdminAccess(user)) {
    return [];
  }

  params.push(TRANSFER_LIST_LIMIT);
  query += ` ORDER BY st.transfer_date DESC LIMIT $${params.length}`;
  const { rows } = await db.query(query, params);
  return rows;
}

async function approveTransfer(transferId, user) {
  await db.transaction(async (tx) => {
    const transferRes = await tx.query("SELECT * FROM stock_transfers WHERE id = $1 AND status = 'requested' FOR UPDATE", [transferId]);
    if (transferRes.rows.length === 0) throw new Error('الطلب غير موجود أو تم التعامل معه بالفعل');

    const transfer = transferRes.rows[0];
    if (isBranchScopedUser(user) && !hasBranchAccess(user, transfer.from_branch_id)) {
      const err = new Error('غير مصرح لك بالموافقة على طلب التحويل من هذا الفرع');
      err.statusCode = 403;
      throw err;
    }
    const transferQty = transfer.quantity;

    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [transfer.inventory_id, transfer.from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('المخزون في فرعك غير كافٍ للموافقة على هذا الطلب');
    }

    if (transfer.sizes_data) {
      let parsedSizes = null;
      try {
        parsedSizes = typeof transfer.sizes_data === 'string' ? JSON.parse(transfer.sizes_data) : transfer.sizes_data;
      } catch (err) {
        console.warn('Failed to parse sizes_data in approveTransfer:', err.message);
      }

      if (Array.isArray(parsedSizes) && parsedSizes.length > 0) {
        // Validate each size availability in from_branch_id
        for (const s of parsedSizes) {
          const sqty = Number(s.quantity || 0);
          if (sqty <= 0) continue;
          const szCheck = await tx.query(`
            SELECT stock_level FROM inventory_sizes
            WHERE inventory_id = $1 AND branch_id = $2
              AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
              AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
            FOR UPDATE
          `, [transfer.inventory_id, transfer.from_branch_id, s.size_name, s.color_name || '']);
          const availSz = szCheck.rows.length ? Number(szCheck.rows[0].stock_level) : 0;
          if (sqty > availSz) {
            throw new Error(`المخزون غير كافٍ للمقاس "${s.size_name}" في الفرع المصدر (المتاح: ${availSz} قطعة)`);
          }
        }

        await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, transfer.inventory_id, transfer.from_branch_id]);

        for (const s of parsedSizes) {
          const sqty = Number(s.quantity || 0);
          if (sqty <= 0) continue;
          await tx.query(`
            UPDATE inventory_sizes
            SET stock_level = GREATEST(0, stock_level - $1), updated_at = CURRENT_TIMESTAMP
            WHERE inventory_id = $2 AND branch_id = $3
              AND LOWER(TRIM(size_name)) = LOWER(TRIM($4))
              AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($5, '')))
          `, [sqty, transfer.inventory_id, transfer.from_branch_id, s.size_name, s.color_name || '']);
        }
      } else {
        await adjustInventoryStock(tx, {
          inventoryId: transfer.inventory_id,
          branchId: transfer.from_branch_id,
          quantityDelta: -transferQty,
        });
      }
    } else {
      await adjustInventoryStock(tx, {
        inventoryId: transfer.inventory_id,
        branchId: transfer.from_branch_id,
        quantityDelta: -transferQty,
      });
    }

    // Refresh overall inventory stock_level
    await tx.query(`
      UPDATE inventory
      SET stock_level = (SELECT COALESCE(SUM(stock_level), 0) FROM inventory_branches WHERE inventory_id = $1)
      WHERE id = $1
    `, [transfer.inventory_id]);

    const senderId = user?.id ? Number(user.id) : null;
    const senderName = user?.full_name || user?.name || user?.username || null;
    await tx.query("UPDATE stock_transfers SET status = 'pending', sender_id = $1, sender_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", [senderId, senderName, transferId]);
  });

  invalidateInventoryMetadata();
  return { success: true, message: 'تمت الموافقة وإرسال البضاعة بنجاح' };
}

async function rejectTransfer(transferId, user) {
  const params = [transferId];
  let branchFilter = '';
  if (isBranchScopedUser(user)) {
    const authIds = getUserAuthorizedBranchIds(user);
    if (authIds && authIds.length > 0) {
      if (authIds.length === 1) {
        params.push(authIds[0]);
        branchFilter = ' AND from_branch_id = $2';
      } else {
        params.push(authIds);
        branchFilter = ' AND from_branch_id = ANY($2)';
      }
    } else {
      params.push(user.branch_id);
      branchFilter = ' AND from_branch_id = $2';
    }
  }
  const res = await db.query(`UPDATE stock_transfers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'requested'${branchFilter}`, params);
  if (res.rowCount === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }
  return { success: true, message: 'تم رفض طلب البضاعة بنجاح' };
}

async function listIncomingTransfers(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) {
    if (branchIdParam && hasBranchAccess(user, branchIdParam)) {
      branch_id = branchIdParam;
    } else {
      branch_id = user.branch_id;
    }
  }

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name,
           COALESCE(u_sender.full_name, e_sender.name, st.sender_name, u_sender.username, 'غير محدد') as sender_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
    LEFT JOIN users u_sender ON st.sender_id = u_sender.id
    LEFT JOIN employees e_sender ON u_sender.employee_id = e_sender.id
    LEFT JOIN users u_creator ON st.created_by = u_creator.id
    LEFT JOIN employees e_creator ON u_creator.employee_id = e_creator.id
    WHERE st.status = 'pending'
  `;
  const params = [];

  if (branch_id && branch_id !== 'all') {
    query += ' AND st.to_branch_id = $1';
    params.push(branch_id);
  } else if (user && !hasInventoryAdminAccess(user)) {
    return [];
  }

  params.push(TRANSFER_LIST_LIMIT);
  query += ` ORDER BY st.transfer_date DESC LIMIT $${params.length}`;
  const { rows } = await db.query(query, params);
  return rows;
}

async function receiveTransfer(transferId, user) {
  await db.transaction(async (tx) => {
    const transferRes = await tx.query("SELECT * FROM stock_transfers WHERE id = $1 AND status = 'pending' FOR UPDATE", [transferId]);
    if (transferRes.rows.length === 0) throw new Error('التحويل غير موجود أو تم استلامه بالفعل');

    const transfer = transferRes.rows[0];
    if (isBranchScopedUser(user) && !hasBranchAccess(user, transfer.to_branch_id)) {
      const err = new Error('غير مصرح لك باستلام شحنة موجهة لفرع آخر');
      err.statusCode = 403;
      throw err;
    }

    if (transfer.sizes_data) {
      await tx.query(`
        INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + $3
      `, [transfer.inventory_id, transfer.to_branch_id, transfer.quantity]);

      try {
        const sizes = typeof transfer.sizes_data === 'string' ? JSON.parse(transfer.sizes_data) : transfer.sizes_data;
        if (Array.isArray(sizes) && sizes.length > 0) {
          for (const s of sizes) {
            const sqty = Number(s.quantity || 0);
            if (sqty <= 0) continue;
            const existingSizeRes = await tx.query(`
              SELECT id FROM inventory_sizes
              WHERE inventory_id = $1
                AND COALESCE(branch_id, 1) = COALESCE($2, 1)
                AND LOWER(TRIM(size_name)) = LOWER(TRIM($3))
                AND LOWER(TRIM(COALESCE(color_name, ''))) = LOWER(TRIM(COALESCE($4, '')))
              LIMIT 1
            `, [transfer.inventory_id, transfer.to_branch_id, s.size_name, s.color_name || '']);
            if (existingSizeRes.rows.length > 0) {
              await tx.query(`
                UPDATE inventory_sizes
                SET stock_level = stock_level + $1, updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
              `, [sqty, existingSizeRes.rows[0].id]);
            } else {
              await tx.query(`
                INSERT INTO inventory_sizes (inventory_id, size_name, color_name, stock_level, branch_id, barcode, size_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
              `, [transfer.inventory_id, s.size_name, s.color_name || '', sqty, transfer.to_branch_id, s.barcode || null, s.size_id || null]);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to parse sizes_data in receiveTransfer:', err.message);
      }
    } else {
      await adjustInventoryStock(tx, {
        inventoryId: transfer.inventory_id,
        branchId: transfer.to_branch_id,
        quantityDelta: transfer.quantity,
      });
    }

    const receiverId = user?.id ? Number(user.id) : null;
    const receiverName = user?.full_name || user?.name || user?.username || null;
    await tx.query("UPDATE stock_transfers SET status = 'received', received_by = $1, received_by_name = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3", [receiverId, receiverName, transferId]);

    // Refresh overall inventory stock_level
    await tx.query(`
      UPDATE inventory
      SET stock_level = (SELECT COALESCE(SUM(stock_level), 0) FROM inventory_branches WHERE inventory_id = $1)
      WHERE id = $1
    `, [transfer.inventory_id]);

    if (config.IS_BRANCH_MODE) {
      try {
        await queueSyncOperation(tx, null, 'stock_transfer', 'receive', transferId, transfer.to_branch_id, {
          id: transferId,
          inventory_id: transfer.inventory_id,
          from_branch_id: transfer.from_branch_id,
          to_branch_id: transfer.to_branch_id,
          quantity: transfer.quantity,
          status: 'received',
          sizes: transfer.sizes_data,
          received_by: receiverId,
          received_by_name: receiverName,
        });
      } catch (e) {
        console.warn('Failed to queue stock_transfer receive sync:', e.message);
      }
    }
  });

  invalidateInventoryMetadata();
  return { success: true, message: 'تم تأكيد استلام المخزون بنجاح' };
}

async function listTransferLogs(query = {}, user = {}) {
  const canViewAll = hasInventoryAllBranchesAccess(user);
  let scopedBranchId = null;

  if (!canViewAll) {
    // Non-admin without inventory_view_all_branches permission:
    // Strictly isolate to the user's assigned branch.
    // If user has no branch_id, lock to -1 (so they see no other branch's data).
    scopedBranchId = user?.branch_id ? Number(user.branch_id) : -1;
  } else if (query.branch_id && query.branch_id !== 'all') {
    scopedBranchId = Number(query.branch_id);
  }

  const whereConditions = [];
  const params = [];
  const direction = (query.direction || 'all').toLowerCase().trim();

  // Scoping / branch condition
  if (scopedBranchId) {
    if (scopedBranchId === -1) {
      whereConditions.push('1 = 0');
    } else if (direction === 'outgoing') {
      params.push(scopedBranchId);
      whereConditions.push(`st.from_branch_id = $${params.length}`);
    } else if (direction === 'incoming') {
      params.push(scopedBranchId);
      whereConditions.push(`st.to_branch_id = $${params.length}`);
    } else {
      params.push(scopedBranchId);
      whereConditions.push(`(st.from_branch_id = $${params.length} OR st.to_branch_id = $${params.length})`);
    }
  } else {
    // Unscoped admin / manager with view-all permission:
    // If direction was selected along with a reference branch (e.g. user.branch_id)
    const refBranch = user?.branch_id ? Number(user.branch_id) : null;
    if (direction === 'outgoing' && refBranch) {
      params.push(refBranch);
      whereConditions.push(`st.from_branch_id = $${params.length}`);
    } else if (direction === 'incoming' && refBranch) {
      params.push(refBranch);
      whereConditions.push(`st.to_branch_id = $${params.length}`);
    }

    // Allow specific from / to filters
    if (query.from_branch_id && query.from_branch_id !== 'all') {
      params.push(Number(query.from_branch_id));
      whereConditions.push(`st.from_branch_id = $${params.length}`);
    }
    if (query.to_branch_id && query.to_branch_id !== 'all') {
      params.push(Number(query.to_branch_id));
      whereConditions.push(`st.to_branch_id = $${params.length}`);
    }
  }

  // Status filter
  const status = (query.status || 'all').toLowerCase().trim();
  if (status && status !== 'all') {
    params.push(status);
    whereConditions.push(`st.status = $${params.length}`);
  }

  // Search filter (Product name, barcode, branch names, sizes/colors, or ID)
  const search = (query.search || '').trim();
  if (search) {
    const cleanId = search.replace(/^#/, '').trim();
    const isNum = /^\d+$/.test(cleanId);
    const searchPattern = `%${search.toLowerCase()}%`;
    params.push(searchPattern);
    const patternIdx = params.length;

    if (isNum) {
      params.push(Number(cleanId));
      const idIdx = params.length;
      whereConditions.push(`(
        st.id = $${idIdx}
        OR LOWER(COALESCE(i.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(i.barcode, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(b_from.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(b_to.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.sizes_data, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_sender.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_sender.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_sender.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.sender_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_receiver.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_receiver.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_receiver.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.received_by_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_creator.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_creator.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_creator.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.created_by_name, '')) LIKE $${patternIdx}
      )`);
    } else {
      whereConditions.push(`(
        LOWER(COALESCE(i.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(i.barcode, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(b_from.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(b_to.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.sizes_data, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_sender.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_sender.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_sender.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.sender_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_receiver.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_receiver.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_receiver.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.received_by_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_creator.full_name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(u_creator.username, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(e_creator.name, '')) LIKE $${patternIdx}
        OR LOWER(COALESCE(st.created_by_name, '')) LIKE $${patternIdx}
      )`);
    }
  }

  // Date range filters
  if (query.start_date) {
    const sDate = String(query.start_date).trim().slice(0, 10);
    params.push(`${sDate} 00:00:00`);
    whereConditions.push(`st.transfer_date >= $${params.length}`);
  }
  if (query.end_date) {
    const eDate = String(query.end_date).trim().slice(0, 10);
    params.push(`${eDate} 23:59:59`);
    whereConditions.push(`st.transfer_date <= $${params.length}`);
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Summary counts query
  let summaryWhereClause = '';
  const summaryParams = [];
  if (scopedBranchId) {
    if (scopedBranchId === -1) {
      summaryWhereClause = 'WHERE 1 = 0';
    } else {
      summaryParams.push(scopedBranchId);
      summaryWhereClause = `WHERE (st.from_branch_id = $1 OR st.to_branch_id = $1)`;
    }
  } else if (user?.branch_id && (direction === 'outgoing' || direction === 'incoming')) {
    summaryParams.push(Number(user.branch_id));
    summaryWhereClause = `WHERE (st.from_branch_id = $1 OR st.to_branch_id = $1)`;
  }

  const summarySql = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN st.status = 'requested' THEN 1 END) as requested,
      COUNT(CASE WHEN st.status = 'pending' THEN 1 END) as pending,
      COUNT(CASE WHEN st.status = 'received' THEN 1 END) as received,
      COUNT(CASE WHEN st.status = 'completed' THEN 1 END) as completed,
      COUNT(CASE WHEN st.status = 'rejected' THEN 1 END) as rejected,
      COALESCE(SUM(st.quantity), 0) as total_quantity
      ${summaryParams.length > 0 ? `,
        COUNT(CASE WHEN st.from_branch_id = $1 THEN 1 END) as outgoing_count,
        COUNT(CASE WHEN st.to_branch_id = $1 THEN 1 END) as incoming_count
      ` : ''}
    FROM stock_transfers st
    ${summaryWhereClause}
  `;

  // Count query for pagination
  const countSql = `
    SELECT COUNT(*) as total
    FROM stock_transfers st
    LEFT JOIN inventory i ON st.inventory_id = i.id
    LEFT JOIN branches b_from ON st.from_branch_id = b_from.id
    LEFT JOIN branches b_to ON st.to_branch_id = b_to.id
    LEFT JOIN users u_sender ON st.sender_id = u_sender.id
    LEFT JOIN employees e_sender ON u_sender.employee_id = e_sender.id
    LEFT JOIN users u_receiver ON st.received_by = u_receiver.id
    LEFT JOIN employees e_receiver ON u_receiver.employee_id = e_receiver.id
    LEFT JOIN users u_creator ON st.created_by = u_creator.id
    LEFT JOIN employees e_creator ON u_creator.employee_id = e_creator.id
    ${whereClause}
  `;

  // Pagination params
  const isAll = query.limit === 'all' || query.all === 'true';
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = isAll ? 1000 : Math.min(200, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  // Main data query
  const dataParams = [...params];
  let dataSql = `
    SELECT
      st.id,
      st.inventory_id,
      st.from_branch_id,
      st.to_branch_id,
      st.quantity,
      st.transfer_date,
      st.status,
      st.updated_at,
      st.sizes_data,
      st.created_by,
      st.sender_id,
      st.received_by,
      COALESCE(
        u_sender.full_name,
        e_sender.name,
        st.sender_name,
        u_sender.username,
        CASE
          WHEN st.status = 'requested' THEN 'بانتظار الموافقة والإرسال'
          WHEN st.status = 'rejected' THEN 'لم يتم الإرسال (مرفوض)'
          ELSE COALESCE(u_creator.full_name, e_creator.name, st.created_by_name, u_creator.username, 'غير محدد')
        END
      ) as sender_name,
      COALESCE(u_receiver.full_name, e_receiver.name, st.received_by_name, u_receiver.username,
        CASE
          WHEN st.status = 'received' THEN 'تم الاستلام'
          WHEN st.status = 'completed' THEN COALESCE(u_sender.full_name, e_sender.name, st.sender_name, u_sender.username, 'تم الاستلام فوري')
          WHEN st.status = 'pending' THEN 'بانتظار الاستلام'
          WHEN st.status = 'requested' THEN 'بانتظار الموافقة'
          WHEN st.status = 'rejected' THEN 'مرفوض'
          ELSE '—'
        END
      ) as receiver_name,
      COALESCE(u_creator.full_name, e_creator.name, st.created_by_name, u_creator.username, 'غير محدد') as created_by_name,
      COALESCE(i.name, 'صنف #' || st.inventory_id) as inventory_name,
      i.barcode as inventory_barcode,
      i.category,
      i.color,
      i.size_cut,
      i.image_url,
      i.price,
      i.cost_price,
      COALESCE(b_from.name, 'فرع #' || st.from_branch_id) as from_branch_name,
      COALESCE(b_to.name, 'فرع #' || st.to_branch_id) as to_branch_name
    FROM stock_transfers st
    LEFT JOIN inventory i ON st.inventory_id = i.id
    LEFT JOIN branches b_from ON st.from_branch_id = b_from.id
    LEFT JOIN branches b_to ON st.to_branch_id = b_to.id
    LEFT JOIN users u_sender ON st.sender_id = u_sender.id
    LEFT JOIN employees e_sender ON u_sender.employee_id = e_sender.id
    LEFT JOIN users u_receiver ON st.received_by = u_receiver.id
    LEFT JOIN employees e_receiver ON u_receiver.employee_id = e_receiver.id
    LEFT JOIN users u_creator ON st.created_by = u_creator.id
    LEFT JOIN employees e_creator ON u_creator.employee_id = e_creator.id
    ${whereClause}
    ORDER BY st.transfer_date DESC, st.id DESC
  `;

  if (!isAll) {
    dataParams.push(limit);
    dataParams.push(offset);
    dataSql += ` LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
  }

  const [summaryRes, countRes, dataRes] = await Promise.all([
    db.query(summarySql, summaryParams),
    db.query(countSql, params),
    db.query(dataSql, dataParams),
  ]);

  const totalFiltered = parseInt(countRes.rows[0]?.total || 0, 10);
  const summaryRow = summaryRes.rows[0] || {};
  const userBranchNum = user?.branch_id ? Number(user.branch_id) : null;

  const items = dataRes.rows.map((row) => {
    let parsedSizes = null;
    if (row.sizes_data) {
      try {
        parsedSizes = typeof row.sizes_data === 'string' ? JSON.parse(row.sizes_data) : row.sizes_data;
      } catch {
        parsedSizes = null;
      }
    }

    const fromBranchId = Number(row.from_branch_id);
    const toBranchId = Number(row.to_branch_id);
    const refBranch = (scopedBranchId && scopedBranchId > 0) ? scopedBranchId : userBranchNum;

    const isOutgoing = refBranch ? fromBranchId === refBranch : false;
    const isIncoming = refBranch ? toBranchId === refBranch : false;

    // Permissions / action flags
    const hasAdmin = hasInventoryAdminAccess(user);
    const canApprove = (hasAdmin || fromBranchId === userBranchNum) && row.status === 'requested';
    const canReject = (hasAdmin || fromBranchId === userBranchNum) && row.status === 'requested';
    const canReceive = (hasAdmin || toBranchId === userBranchNum) && row.status === 'pending';

    return {
      ...row,
      sizes_breakdown: parsedSizes,
      is_outgoing: isOutgoing,
      is_incoming: isIncoming,
      direction_label: isOutgoing ? 'صادر' : (isIncoming ? 'وارد' : 'تحويل'),
      can_approve: canApprove,
      can_reject: canReject,
      can_receive: canReceive,
    };
  });

  return {
    items,
    pagination: {
      page,
      limit: isAll ? totalFiltered : limit,
      total: totalFiltered,
      totalPages: isAll ? 1 : Math.ceil(totalFiltered / limit) || 1,
    },
    summary: {
      total: parseInt(summaryRow.total || 0, 10),
      requested: parseInt(summaryRow.requested || 0, 10),
      pending: parseInt(summaryRow.pending || 0, 10),
      received: parseInt(summaryRow.received || 0, 10),
      completed: parseInt(summaryRow.completed || 0, 10),
      rejected: parseInt(summaryRow.rejected || 0, 10),
      total_quantity: parseInt(summaryRow.total_quantity || 0, 10),
      outgoing_count: parseInt(summaryRow.outgoing_count || 0, 10),
      incoming_count: parseInt(summaryRow.incoming_count || 0, 10),
    },
    scoped_branch_id: scopedBranchId,
    is_branch_scoped: !canViewAll,
  };
}

async function checkDuplicatesBatch(body) {
  const productType = body?.product_type === 'rental' ? 'rental' : 'sales';
  const table = productType === 'rental' ? 'rental_inventory' : 'inventory';
  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  const normalizedCandidates = candidates
    .slice(0, 1000)
    .map(candidate => ({
      name: String(candidate?.name || '').trim(),
      category: String(candidate?.category || '').trim(),
      color: String(candidate?.color || '').trim(),
      size: String(candidate?.size || '').trim(),
    }))
    .filter(candidate => candidate.name && candidate.category && candidate.color && candidate.size);

  if (normalizedCandidates.length === 0) {
    return { duplicates: [] };
  }

  if (config.IS_BRANCH_MODE && db.sqlite) {
    const duplicates = [];
    const selectStmt = db.sqlite.prepare(`
      SELECT id, name, category, color, size_cut, barcode, price, image_url
      FROM ${table}
      WHERE is_deleted = 0
        AND LOWER(TRIM(COALESCE(name, ''))) = ?
        AND LOWER(TRIM(COALESCE(category, ''))) = ?
        AND LOWER(TRIM(COALESCE(color, ''))) = ?
        AND LOWER(TRIM(COALESCE(size_cut, ''))) = ?
      ORDER BY id DESC
      LIMIT 5
    `);

    for (const c of normalizedCandidates) {
      const nameKey = c.name.toLowerCase().trim();
      const catKey = c.category.toLowerCase().trim();
      const colorKey = c.color.toLowerCase().trim();
      const sizeKey = c.size.toLowerCase().trim();

      const matchedRows = selectStmt.all(nameKey, catKey, colorKey, sizeKey);
      if (matchedRows.length > 0) {
        duplicates.push({
          candidate: c,
          matched_count: matchedRows.length,
          matches: matchedRows.map(m => ({
            id: m.id,
            name: m.name,
            category: m.category,
            color: m.color,
            size: m.size_cut,
            barcode: m.barcode,
            price: Number(m.price || 0),
            image_url: m.image_url,
          })),
        });
      }
    }
    return { duplicates };
  }

  const { rows } = await db.query(
    `WITH candidates AS (
       SELECT DISTINCT
              LOWER(TRIM(COALESCE(name, ''))) as name_key,
              LOWER(TRIM(COALESCE(category, ''))) as category_key,
              LOWER(TRIM(COALESCE(color, ''))) as color_key,
              LOWER(TRIM(COALESCE(size, ''))) as size_key,
              TRIM(COALESCE(name, '')) as name,
              TRIM(COALESCE(category, '')) as category,
              TRIM(COALESCE(color, '')) as color,
              TRIM(COALESCE(size, '')) as size
       FROM jsonb_to_recordset($1::jsonb) AS c(name text, category text, color text, size text)
       WHERE TRIM(COALESCE(name, '')) <> ''
         AND TRIM(COALESCE(category, '')) <> ''
         AND TRIM(COALESCE(color, '')) <> ''
         AND TRIM(COALESCE(size, '')) <> ''
     )
     SELECT c.name_key,
            c.category_key,
            c.color_key,
            c.size_key,
            c.name,
            c.category,
            c.color,
            c.size,
            matched_item.id,
            matched_item.name as match_name,
            matched_item.category as match_category,
            matched_item.color as match_color,
            matched_item.size_cut as match_size_cut,
            matched_item.barcode,
            matched_item.price,
            matched_item.image_url
     FROM candidates c
     JOIN LATERAL (
       SELECT id, name, category, color, size_cut, barcode, price, image_url
       FROM ${table}
       WHERE is_deleted = FALSE
         AND LOWER(TRIM(COALESCE(name, ''))) = c.name_key
         AND LOWER(TRIM(COALESCE(category, ''))) = c.category_key
         AND LOWER(TRIM(COALESCE(color, ''))) = c.color_key
         AND LOWER(TRIM(COALESCE(size_cut, ''))) = c.size_key
       ORDER BY id DESC
       LIMIT 5
     ) matched_item ON TRUE
     ORDER BY c.name, c.category, c.color, c.size, matched_item.id DESC`,
    [JSON.stringify(normalizedCandidates)]
  );

  const duplicateMap = new Map();
  for (const row of rows) {
    const key = [row.name_key, row.category_key, row.color_key, row.size_key].join('|');
    if (!duplicateMap.has(key)) {
      duplicateMap.set(key, {
        key,
        candidate: {
          name: row.name,
          category: row.category,
          color: row.color,
          size: row.size,
        },
        matches: [],
      });
    }
    duplicateMap.get(key).matches.push({
      id: row.id,
      name: row.match_name,
      category: row.match_category,
      color: row.match_color,
      size_cut: row.match_size_cut,
      barcode: row.barcode,
      price: row.price,
      image_url: row.image_url,
    });
  }

  return { duplicates: [...duplicateMap.values()] };
}

async function checkDuplicateSingle(query) {
  const productType = query?.product_type === 'rental' ? 'rental' : 'sales';
  const name = String(query?.name || '').trim();
  const category = String(query?.category || '').trim();
  const color = String(query?.color || '').trim();
  const size = String(query?.size || '').trim();
  const excludeId = Number.parseInt(query?.exclude_id, 10);

  if (!name || !category || !color || !size) {
    return { exists: false, matches: [] };
  }

  const table = productType === 'rental' ? 'rental_inventory' : 'inventory';
  const params = [name, category, color, size];
  let excludeSql = '';
  if (Number.isInteger(excludeId) && excludeId > 0) {
    params.push(excludeId);
    excludeSql = ` AND id != $${params.length}`;
  }

  const { rows } = await db.query(
    `SELECT id, name, category, color, size_cut, barcode, price, image_url
     FROM ${table}
     WHERE is_deleted = FALSE
       AND LOWER(TRIM(COALESCE(name, ''))) = LOWER(TRIM($1))
       AND LOWER(TRIM(COALESCE(category, ''))) = LOWER(TRIM($2))
       AND LOWER(TRIM(COALESCE(color, ''))) = LOWER(TRIM($3))
       AND LOWER(TRIM(COALESCE(size_cut, ''))) = LOWER(TRIM($4))
       ${excludeSql}
     ORDER BY id DESC
     LIMIT 5`,
    params
  );
  return { exists: rows.length > 0, matches: rows };
}

async function searchInventory(query = {}, user = null) {
  const { query: searchQuery, branch_id } = query;
  if (!searchQuery || searchQuery.trim().length < 2) {
    return [];
  }

  const searchPattern = `%${searchQuery.trim()}%`;
  const canViewAll = hasInventoryAllBranchesAccess(user);
  let branchIdToUse = (branch_id && branch_id !== 'all' && Number.isFinite(Number(branch_id))) ? Number(branch_id) : ((user && user.branch_id) || 1);
  if (!canViewAll && user) {
    branchIdToUse = Number(user.branch_id) || 1;
  }

  if (config.IS_BRANCH_MODE) {
    let genderClause = '';
    const params = [branchIdToUse];
    if (!canViewAll && branchIdToUse) {
      const bRow = db.sqlite.prepare('SELECT allowed_gender FROM branches WHERE id = ?').get(branchIdToUse);
      const bGender = bRow?.allowed_gender || 'both';
      if (bGender !== 'both') {
        genderClause = ` AND (i.gender = 'both' OR i.gender = ? OR i.gender IS NULL)`;
        params.push(bGender);
      }
    }
    for (let k = 0; k < 8; k++) {
      params.push(searchPattern);
    }

    const rows = db.sqlite.prepare(`
      SELECT 
        i.id, 
        i.name, 
        i.category, 
        i.size_cut, 
        i.color, 
        i.barcode, 
        i.price,
        i.wholesale_price,
        i.semi_wholesale_price,
        s.name as supplier_name,
        COALESCE(ib.stock_level, 0) as stock_level
      FROM inventory i
      LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
      LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id AND ib.branch_id = ?
      WHERE i.is_deleted = 0
        ${genderClause}
        AND (
          i.name LIKE ? 
          OR i.barcode LIKE ? 
          OR i.category LIKE ? 
          OR i.color LIKE ? 
          OR i.size_cut LIKE ?
          OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND (sz.barcode LIKE ? OR sz.size_name LIKE ?))
        )
      ORDER BY 
        CASE WHEN i.name LIKE ? THEN 1 ELSE 2 END,
        COALESCE(ib.stock_level, 0) DESC,
        i.name
      LIMIT 20
    `).all(...params);
    return rows;
  }

  let genderClause = '';
  const pgParams = [searchPattern, branchIdToUse];
  if (branchIdToUse) {
    try {
      const bCheck = await db.query('SELECT allowed_gender FROM branches WHERE id = $1', [branchIdToUse]);
      const bGender = bCheck.rows[0]?.allowed_gender || 'both';
      if (bGender !== 'both') {
        pgParams.push(bGender);
        genderClause = ` AND (i.gender = 'both' OR i.gender = $${pgParams.length} OR i.gender IS NULL)`;
      }
    } catch {}
  }

  const { rows } = await db.query(`
    SELECT 
      i.id, 
      i.name, 
      i.category, 
      i.size_cut, 
      i.color, 
      i.barcode, 
      i.price,
      i.wholesale_price,
      i.semi_wholesale_price,
      s.name as supplier_name,
      COALESCE(ib.stock_level, 0) as stock_level
    FROM inventory i
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id
    LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id AND ib.branch_id = $2
    WHERE i.is_deleted = FALSE${genderClause}
      AND (
        i.name ILIKE $1 
        OR i.barcode ILIKE $1 
        OR i.category ILIKE $1
        OR i.color ILIKE $1
        OR i.size_cut ILIKE $1
        OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND (sz.barcode ILIKE $1 OR sz.size_name ILIKE $1))
      )
    ORDER BY 
      CASE WHEN i.name ILIKE $1 THEN 1 ELSE 2 END,
      COALESCE(ib.stock_level, 0) DESC,
      i.name
    LIMIT 20
  `, pgParams);

  return rows;
}

async function getBranchMatrix(query = {}, user = null) {
  const branchesRes = await db.query(`
    SELECT id, name, location, is_main_warehouse 
    FROM branches 
    ORDER BY is_main_warehouse DESC, id ASC
  `);
  const allBranches = branchesRes.rows;

  const isInventoryAdmin = hasInventoryAdminAccess(user);
  const selectedBranchId = (query.branch_id && query.branch_id !== 'all') ? parseInt(query.branch_id, 10) : null;

  let activeBranches = allBranches;
  let selectedBranchObj = null;
  if (selectedBranchId && !Number.isNaN(selectedBranchId)) {
    selectedBranchObj = allBranches.find((b) => b.id === selectedBranchId) || null;
    const mainWarehouseObj = allBranches.find((b) => b.is_main_warehouse || b.id === 1) || allBranches[0];
    if (selectedBranchObj && mainWarehouseObj) {
      if (selectedBranchObj.id === mainWarehouseObj.id) {
        activeBranches = [mainWarehouseObj];
      } else {
        activeBranches = [selectedBranchObj, mainWarehouseObj];
      }
    }
  }

  const where = ['i.is_deleted = FALSE'];
  const params = [];

  if (query.gender && query.gender !== 'all') {
    params.push(query.gender);
    where.push(`i.gender = $${params.length}`);
  }

  const catQuery = resolveCategoryQuery(query.category);
  if (catQuery) {
    if (catQuery.type === 'suits') {
      where.push(`(i.category ILIKE '%SUIT%' OR i.category ILIKE '%بدل%')`);
    } else if (catQuery.type === 'other') {
      where.push(`(i.category IS NULL OR TRIM(i.category) = '' OR LOWER(TRIM(i.category)) IN ('أخرى', 'اخري', 'other', 'uncategorized'))`);
    } else {
      params.push(catQuery.value);
      where.push(`LOWER(TRIM(i.category)) = LOWER(TRIM($${params.length}))`);
    }
  }

  if (query.search && query.search.trim()) {
    params.push(likePattern(query.search.trim()));
    const pIdx = params.length;
    where.push(`(
      i.name ILIKE $${pIdx}
      OR i.barcode ILIKE $${pIdx}
      OR CAST(i.id AS text) ILIKE $${pIdx}
      OR i.category ILIKE $${pIdx}
      OR i.color ILIKE $${pIdx}
      OR i.size_cut ILIKE $${pIdx}
      OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.size_name ILIKE $${pIdx})
      OR EXISTS (SELECT 1 FROM inventory_sizes sz WHERE sz.inventory_id = i.id AND sz.barcode ILIKE $${pIdx})
    )`);
  }

  if (query.stock_status === 'in_stock') {
    if (selectedBranchId) {
      params.push(selectedBranchId);
      where.push(`COALESCE((SELECT stock_level FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $${params.length}), 0) > 0`);
    } else {
      where.push(`COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), 0) > 0`);
    }
  } else if (query.stock_status === 'out_of_stock') {
    if (selectedBranchId) {
      params.push(selectedBranchId);
      where.push(`COALESCE((SELECT stock_level FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $${params.length}), 0) <= 0`);
    } else {
      where.push(`COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), 0) <= 0`);
    }
  } else if (selectedBranchId && query.stock_status !== 'all_with_zero') {
    params.push(selectedBranchId);
    where.push(`COALESCE((SELECT stock_level FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $${params.length}), 0) > 0`);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // 1. Overall & Branch Summary
  const selBranchParamIdx = selectedBranchId ? (params.length + 1) : null;
  const summaryParams = selectedBranchId ? [...params, selectedBranchId] : [...params];

  const summaryRes = await db.query(`
    SELECT 
      COUNT(DISTINCT i.id)::int as total_products,
      COALESCE(SUM(ib.stock_level), 0)::int as total_company_stock,
      COALESCE(SUM(CASE WHEN b.is_main_warehouse = TRUE OR b.id = 1 THEN ib.stock_level ELSE 0 END), 0)::int as main_warehouse_stock,
      ${selectedBranchId ? `COALESCE(SUM(CASE WHEN b.id = $${selBranchParamIdx} THEN ib.stock_level ELSE 0 END), 0)::int as selected_branch_stock,` : '0 as selected_branch_stock,'}
      ${selectedBranchId ? `COALESCE(SUM(CASE WHEN b.id = $${selBranchParamIdx} THEN ib.stock_level * i.price ELSE 0 END), 0)::numeric as selected_branch_retail_value,` : '0 as selected_branch_retail_value,'}
      ${selectedBranchId ? `COALESCE(SUM(CASE WHEN b.id = $${selBranchParamIdx} THEN ib.stock_level * COALESCE(i.cost_price, 0) ELSE 0 END), 0)::numeric as selected_branch_cost_value,` : '0 as selected_branch_cost_value,'}
      COALESCE(SUM(ib.stock_level * i.price), 0)::numeric as total_retail_value,
      COALESCE(SUM(ib.stock_level * COALESCE(i.cost_price, 0)), 0)::numeric as total_cost_value
    FROM inventory i
    LEFT JOIN inventory_branches ib ON ib.inventory_id = i.id
    LEFT JOIN branches b ON b.id = ib.branch_id
    ${whereClause}
  `, summaryParams);

  // 2. Per-branch summaries
  const branchSummariesRes = await db.query(`
    SELECT 
      b.id as branch_id,
      b.name as branch_name,
      b.is_main_warehouse,
      COUNT(DISTINCT CASE WHEN ib.stock_level > 0 THEN i.id END)::int as active_items_count,
      COALESCE(SUM(ib.stock_level), 0)::int as total_stock,
      COALESCE(SUM(ib.stock_level * i.price), 0)::numeric as retail_value,
      COALESCE(SUM(ib.stock_level * COALESCE(i.cost_price, 0)), 0)::numeric as cost_value
    FROM branches b
    LEFT JOIN inventory_branches ib ON ib.branch_id = b.id
    LEFT JOIN inventory i ON i.id = ib.inventory_id AND ${where.join(' AND ')}
    GROUP BY b.id, b.name, b.is_main_warehouse
    ORDER BY b.is_main_warehouse DESC, b.id ASC
  `, params);

  // 3. Products count for pagination
  const countRes = await db.query(`SELECT COUNT(*)::int as total FROM inventory i ${whereClause}`, params);
  const total = countRes.rows[0]?.total || 0;

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = query.limit === 'all' || parseInt(query.limit, 10) > 1000 ? 10000 : Math.max(10, parseInt(query.limit, 10) || 50);
  const offset = (page - 1) * limit;

  // 4. Products query
  const productsQuery = `
    SELECT 
      i.id, i.name, i.category, i.gender, i.barcode, i.color, i.size_cut,
      i.price, ${isInventoryAdmin ? 'i.cost_price' : 'NULL as cost_price'},
      COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), 0)::int as total_stock,
      COALESCE((
        SELECT json_object_agg(ib.branch_id::text, ib.stock_level)
        FROM inventory_branches ib
        WHERE ib.inventory_id = i.id
      ), '{}'::json) as branch_stocks,
      COALESCE((
        SELECT json_agg(json_build_object(
          'size_name', s.size_name,
          'color_name', s.color_name,
          'total_stock', s.total_size_stock,
          'branch_stocks', s.branch_stocks
        ) ORDER BY s.size_name ASC)
        FROM (
          SELECT 
            sz.size_name,
            sz.color_name,
            SUM(COALESCE(sz.stock_level, 0))::int as total_size_stock,
            json_object_agg(sz.branch_id::text, COALESCE(sz.stock_level, 0)) as branch_stocks
          FROM inventory_sizes sz
          WHERE sz.inventory_id = i.id
          GROUP BY sz.size_name, sz.color_name
        ) s
      ), '[]'::json) as sizes
    FROM inventory i
    ${whereClause}
    ORDER BY i.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const productsRes = await db.query(productsQuery, params);

  const summary = summaryRes.rows[0] || {
    total_products: 0,
    total_company_stock: 0,
    main_warehouse_stock: 0,
    selected_branch_stock: 0,
    selected_branch_retail_value: 0,
    selected_branch_cost_value: 0,
    total_retail_value: 0,
    total_cost_value: 0,
  };

  if (selectedBranchObj) {
    summary.selected_branch_id = selectedBranchObj.id;
    summary.selected_branch_name = selectedBranchObj.name;
    summary.is_main_warehouse = selectedBranchObj.is_main_warehouse || selectedBranchObj.id === 1;
  }

  return {
    branches: activeBranches,
    allBranches,
    selectedBranchId,
    summary,
    branchSummaries: branchSummariesRes.rows,
    items: productsRes.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
    isAdmin: isInventoryAdmin,
  };
}

module.exports = {
  getMetadata,
  getModels,
  getBarcodes,
  getVariants,
  listInventory,
  getInventoryById,
  createProduct,
  updateProduct,
  deleteProduct,
  duplicateProduct,
  transferStock,
  listTransferRequests,
  approveTransfer,
  rejectTransfer,
  listIncomingTransfers,
  receiveTransfer,
  checkDuplicatesBatch,
  checkDuplicateSingle,
  searchInventory,
  listColors,
  createOrGetColor,
  listSizes,
  createOrGetSize,
  listProductNames,
  getBranchMatrix,
  listTransferLogs,
};
