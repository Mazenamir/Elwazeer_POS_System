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
} = require('./inventory.helpers');

const { removeUploadedFile } = require('../../middleware/upload.middleware');

const TRANSFER_LIST_LIMIT = 200;

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

async function getMetadata() {
  const cached = getInventoryMetadataCache();
  if (cached) return cached;

  const defaultCategories = ['بدل', 'بنطلون', 'قميص', 'بليزر', 'كرافت', 'بيبيون', 'حذاء', 'نصف ياقة', 'صديري', 'تيشيرت', 'جينز', 'إكسسوارات'];

  if (config.IS_BRANCH_MODE) {
    const cats = db.sqlite.prepare(`
      SELECT DISTINCT category FROM (
        SELECT category FROM inventory WHERE category IS NOT NULL AND TRIM(category) != ''
        UNION
        SELECT category FROM rental_inventory WHERE category IS NOT NULL AND TRIM(category) != ''
      )
    `).all();
    const colors = db.sqlite.prepare('SELECT name FROM colors ORDER BY name COLLATE NOCASE ASC').all();
    const sizes = db.sqlite.prepare('SELECT name FROM sizes ORDER BY name COLLATE NOCASE ASC').all();
    const uniqueCats = Array.from(new Set([...cats.map((r) => r.category), ...defaultCategories]));
    const metadata = {
      categories: uniqueCats,
      colors: colors.map((r) => r.name),
      sizes: sizes.map((r) => r.name),
    };
    setInventoryMetadataCache(metadata);
    return metadata;
  }

  const categoriesRes = await db.query(`
    SELECT DISTINCT category FROM (
      SELECT category FROM inventory WHERE category IS NOT NULL AND TRIM(category) != ''
      UNION
      SELECT category FROM rental_inventory WHERE category IS NOT NULL AND TRIM(category) != ''
    ) c ORDER BY category
  `);
  const colorsRes = await db.query('SELECT name FROM colors ORDER BY name ASC');
  const sizesRes = await db.query('SELECT name FROM sizes ORDER BY name ASC');

  const uniqueCats = Array.from(new Set([...categoriesRes.rows.map((r) => r.category), ...defaultCategories]));
  const uniqueCols = colorsRes.rows.map((r) => r.name);
  const uniqueSizes = sizesRes.rows.map((r) => r.name);

  const metadata = {
    categories: uniqueCats,
    colors: uniqueCols,
    sizes: uniqueSizes,
  };
  setInventoryMetadataCache(metadata);
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
    const rent = db.sqlite.prepare("SELECT 'rental_inventory' as source, id, barcode FROM rental_inventory WHERE is_deleted = 0 AND barcode IS NOT NULL LIMIT 500").all();
    return [...inv, ...rent];
  }

  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'inventory' AS source, id, REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') AS barcode
      FROM inventory WHERE is_deleted = FALSE AND REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') != ''
      ORDER BY id DESC LIMIT 2000
    ) inv
    UNION ALL
    SELECT * FROM (
      SELECT 'rental_inventory' AS source, id, REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') AS barcode
      FROM rental_inventory WHERE is_deleted = FALSE AND REGEXP_REPLACE(COALESCE(barcode, ''), '[^0-9]', '', 'g') != ''
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
  if (!canViewAll && user) branchId = Number(user.branch_id);

  if (config.IS_BRANCH_MODE) {
    const rows = db.sqlite.prepare(`
      SELECT i.*, 0 as stock_level
      FROM inventory i
      WHERE i.is_deleted = 0 AND LOWER(TRIM(i.name)) = LOWER(TRIM(?))
      LIMIT 500
    `).all(cleanName);
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

    if (req.query.search) {
      params.push(likePattern(req.query.search));
      params.push(likePattern(req.query.search));
      params.push(likePattern(req.query.search));
      params.push(likePattern(req.query.search));
      where.push('(i.name LIKE ? OR i.barcode LIKE ? OR i.category LIKE ? OR CAST(i.id AS TEXT) LIKE ?)');
    }
    if (req.query.name) {
      params.push(likePattern(req.query.name));
      where.push('i.name LIKE ?');
    }
    if (req.query.category) {
      params.push(req.query.category);
      where.push('i.category = ?');
    }

    const whereClause = `WHERE ${where.join(' AND ')}`;
    const total = db.sqlite.prepare(`SELECT COUNT(*) as count FROM inventory i ${whereClause}`).get(...params).count;

    if (pagination.enabled) {
      const rows = db.sqlite.prepare(`
        SELECT i.*, i.stock_level
        FROM inventory i
        ${whereClause}
        ORDER BY i.id DESC
        LIMIT ? OFFSET ?
      `).all(...params, pagination.limit, pagination.offset);

      const rowsWithSizes = rows.map((r) => {
        const sizes = db.sqlite.prepare('SELECT id, size_name, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? ORDER BY id ASC').all(r.id);
        return { ...r, sizes };
      });

      return paginatedPayload(rowsWithSizes, total, pagination);
    }

    const rows = db.sqlite.prepare(`
      SELECT i.*, i.stock_level
      FROM inventory i
      ${whereClause}
      ORDER BY i.id DESC
    `).all(...params);

    const rowsWithSizes = rows.map((r) => {
      const sizes = db.sqlite.prepare('SELECT id, size_name, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? ORDER BY id ASC').all(r.id);
      return { ...r, sizes };
    });

    return paginatedPayload(rowsWithSizes, total, { page: 1, limit: total, total });
  }

  let columns = 'i.id, i.name, i.category, i.size_cut, i.color, i.barcode, i.min_stock_level, i.price, i.image_url, i.gender';
  if (isInventoryAdmin) {
    columns += ', i.preferred_supplier_id, i.wholesale_price, i.semi_wholesale_price, i.cost_price, s.name as supplier_name';
  }

  const reqBranchId = req.query.branch_id && req.query.branch_id !== 'all' ? parseInt(req.query.branch_id, 10) : null;
  const activeBranchId = !canViewAllBranches ? parseInt(user?.branch_id, 10) : reqBranchId;

  let stockLevelSql = 'COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id), 0)';
  let branchStocksSql = `(SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level, 'has_stock', stock_level > 0)) FROM inventory_branches WHERE inventory_id = i.id)`;
  let sizesSql = `COALESCE((
    SELECT json_agg(json_build_object(
      'size_name', sub.size_name,
      'stock_level', sub.total_stock,
      'size_id', sub.size_id
    ) ORDER BY sub.size_name)
    FROM (
      SELECT s.size_name, MIN(s.size_id) as size_id, SUM(s.stock_level) as total_stock
      FROM inventory_sizes s
      WHERE s.inventory_id = i.id
      GROUP BY s.size_name
    ) sub
  ), '[]'::json)`;

  if (activeBranchId && !Number.isNaN(activeBranchId)) {
    stockLevelSql = `COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id AND branch_id = ${activeBranchId}), 0)`;
    branchStocksSql = `(SELECT json_agg(json_build_object(
      'branch_id', branch_id,
      'stock_level', CASE WHEN branch_id = ${activeBranchId} THEN stock_level ELSE NULL END,
      'has_stock', stock_level > 0
    )) FROM inventory_branches WHERE inventory_id = i.id)`;
    sizesSql = `COALESCE((
      SELECT json_agg(json_build_object(
        'id', s.id,
        'size_name', s.size_name,
        'stock_level', s.stock_level,
        'size_id', s.size_id
      ) ORDER BY s.id)
      FROM inventory_sizes s
      WHERE s.inventory_id = i.id AND s.branch_id = ${activeBranchId}
    ), '[]'::json)`;
  }

  const params = [];
  const where = ['i.is_deleted = FALSE'];
  if (!canViewAllBranches && user?.branch_id) {
    params.push(user.branch_id);
    where.push(`$${params.length}::int IS NOT NULL`);
    where.push(`(
      (SELECT allowed_gender FROM branches WHERE id = $${params.length}) = 'both' 
      OR i.gender = 'both' 
      OR i.gender = (SELECT allowed_gender FROM branches WHERE id = $${params.length})
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
    )`);
  }
  if (req.query.name) {
    params.push(likePattern(req.query.name));
    where.push(`i.name ILIKE $${params.length}`);
  }
  if (req.query.barcode) {
    params.push(likePattern(req.query.barcode));
    where.push(`i.barcode ILIKE $${params.length}`);
  }
  if (req.query.category) {
    params.push(req.query.category);
    where.push(`i.category = $${params.length}`);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  let query = `
    SELECT ${columns},
           ${stockLevelSql} as stock_level,
           ${branchStocksSql} as branch_stocks,
           ${sizesSql} as sizes
    FROM inventory i 
    LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
    ${whereClause}
    ORDER BY i.id
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
    return paginatedPayload(dataRes.rows, countRes.rows[0].total, pagination);
  }

  const { rows } = await db.query(query, queryParams);
  return paginatedPayload(rows, rows.length, { page: 1, limit: rows.length, total: rows.length });
}

async function createProduct(body, user, file = null) {
  if (!hasInventoryAdminAccess(user)) {
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
    image_url = image_url.trim();
  } else {
    image_url = null;
  }

  barcode = normalizeBarcodeInput(barcode);
  if (isBranchScopedUser(user)) {
    branch_id = user.branch_id;
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
        stock: parseNonNegativeInt(s?.stock ?? s?.stock_level ?? 0, 'size stock'),
      }))
      .filter((s) => s.size);
  }

  const rawStock = (hasMultiSizes && parsedSizes.length > 0)
    ? parsedSizes.reduce((sum, s) => sum + s.stock, 0)
    : (stock_level !== undefined ? stock_level : (stock !== undefined ? stock : 0));
  const initialStock = rawStock === '' ? 0 : parseNonNegativeInt(rawStock, 'stock_level');
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');
  const b_id = parseInt(branch_id, 10) || 1;

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
      const resolvedColor = await createOrGetColor(targetColorStr);
      const resolvedSize = await createOrGetSize(targetSizeStr);
      const colorName = resolvedColor?.name || (targetColorStr || null);
      const colorId = resolvedColor?.id || null;
      const sizeName = resolvedSize?.name || (targetSizeStr || null);
      const sizeId = resolvedSize?.id || null;

      const stmt = db.sqlite.prepare(`
        INSERT INTO inventory (
          name, category, size_cut, color, stock_level, min_stock_level, price,
          cost_price, image_url, barcode, preferred_supplier_id, is_deleted,
          color_id, size_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      const info = stmt.run(
        name, category, sizeName, colorName, initialStock, minStockLevel,
        numPrice, numCost, image_url, barcode, supplier_id, colorId, sizeId
      );
      const newId = info.lastInsertRowid;

      if (hasMultiSizes && parsedSizes.length > 0) {
        for (const s of parsedSizes) {
          const resS = await createOrGetSize(s.size);
          db.sqlite.prepare(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
            VALUES (?, ?, ?, ?, ?)
          `).run(newId, resS?.id || null, s.size, s.stock, b_id);
        }
      } else if (sizeName) {
        db.sqlite.prepare(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(newId, sizeId, sizeName, initialStock, b_id);
      }

      invalidateInventoryMetadata();
      const resRow = db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(newId);
      const sizesRows = db.sqlite.prepare('SELECT id, size_name, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ?').all(newId);
      return { ...resRow, sizes: sizesRows };
    }

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

      barcode = await getAvailableBarcode(tx, barcode);
      await assertBarcodeAvailable(tx, barcode);

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
          barcode, supplier_id, gender || 'both', resolvedColorId, resolvedSizeId
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
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), COALESCE(branch_id, 1))
            DO UPDATE SET stock_level = EXCLUDED.stock_level, size_id = EXCLUDED.size_id
          `, [newId, sId, s.size, s.stock, b_id]);

          // Also initialize other branches with 0 stock
          await tx.query(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
            SELECT $1, $2, $3, 0, id FROM branches WHERE id != $4
            ON CONFLICT DO NOTHING
          `, [newId, sId, s.size, b_id]);
        }
      } else if (resolvedSizeName) {
        await tx.query(`
          INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
          SELECT $1, $2, $3, CASE WHEN id = $4 THEN $5 ELSE 0 END, id FROM branches
          ON CONFLICT DO NOTHING
        `, [newId, resolvedSizeId, resolvedSizeName, b_id, initialStock]);
      }

      if (initialStock > 0) {
        const batchId = purchase_batch_id || crypto.randomUUID();
        await tx.query(
          'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [supplier_id, newId, initialStock, numCost, 'إضافة منتج جديد برصيد', b_id, batchId]
        );
        const total_cost = initialStock * numCost;
        await tx.query(
          'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
          [supplier_id, 'purchase', total_cost, `فاتورة مشتريات (منتج جديد: ${name})`, batchId]
        );
        await tx.query(
          `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
          [total_cost, supplier_id]
        );
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
  if (!hasInventoryAdminAccess(user)) {
    if (file) removeUploadedFile(file.path);
    const err = new Error('غير مصرح لك بتعديل بيانات هذا المنتج');
    err.statusCode = 403;
    throw err;
  }

  let {
    name, category, size_cut, color, new_size, new_color,
    stock_level, min_stock_level, supplier_id, preferred_supplier_id,
    price, wholesale_price, semi_wholesale_price, cost_price, image_url,
    barcode, branch_id, is_correction
  } = body || {};

  name = String(name || '').trim();
  barcode = normalizeBarcodeInput(barcode);
  const minStockLevel = min_stock_level === undefined || min_stock_level === '' ? 5 : parseNonNegativeInt(min_stock_level, 'min_stock_level');

  if (file && file.filename) {
    image_url = `/uploads/products/${file.filename}`;
  } else if (image_url !== undefined && typeof image_url === 'string') {
    image_url = image_url.trim();
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
        stock: parseNonNegativeInt(s?.stock ?? s?.stock_level ?? 0, 'size stock'),
      }))
      .filter((s) => s.size);
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
      const existing = await db.query('SELECT id FROM inventory WHERE barcode = $1 AND id != $2 AND is_deleted = FALSE', [barcode, id]);
      if (existing.rows.length > 0) {
        const err = new Error('هذا الباركود مستخدم بالفعل لمنتج آخر');
        err.statusCode = 400;
        throw err;
      }
      const existingRental = await db.query('SELECT id FROM rental_inventory WHERE barcode = $1 AND is_deleted = FALSE', [barcode]);
      if (existingRental.rows.length > 0) {
        const err = new Error('هذا الباركود مستخدم بالفعل في مخزون التأجير');
        err.statusCode = 400;
        throw err;
      }
    }

    if (config.IS_BRANCH_MODE) {
      const resolvedColor = await createOrGetColor(targetColorStr);
      const resolvedSize = await createOrGetSize(targetSizeStr);
      const colorName = resolvedColor?.name || (targetColorStr || null);
      const colorId = resolvedColor?.id || null;
      const sizeName = resolvedSize?.name || (targetSizeStr || null);
      const sizeId = resolvedSize?.id || null;

      db.sqlite.prepare(`
        UPDATE inventory
        SET name = ?, category = ?, size_cut = ?, color = ?, min_stock_level = ?, preferred_supplier_id = ?, price = ?, cost_price = ?, image_url = COALESCE(?, image_url), barcode = ?, color_id = ?, size_id = ?
        WHERE id = ?
      `).run(name, category, sizeName, colorName, minStockLevel, supplier_id, numPrice, numCost, image_url, barcode, colorId, sizeId, id);

      if (hasMultiSizes) {
        const targetBranchId = Number(branch_id) || Number(user?.branch_id) || 1;
        db.sqlite.prepare('DELETE FROM inventory_sizes WHERE inventory_id = ? AND branch_id = ?').run(id, targetBranchId);
        let branchTotal = 0;
        for (const s of parsedSizes) {
          branchTotal += s.stock;
          const resS = await createOrGetSize(s.size);
          db.sqlite.prepare(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
            VALUES (?, ?, ?, ?, ?)
          `).run(id, resS?.id || null, s.size, s.stock, targetBranchId);
        }
        db.sqlite.prepare('UPDATE inventory SET stock_level = ? WHERE id = ?').run(branchTotal, id);
      }

      invalidateInventoryMetadata();
      const row = db.sqlite.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
      const sizesRows = db.sqlite.prepare('SELECT id, size_name, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ?').all(id);
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

      if (hasInventoryAdminAccess(user)) {
        await tx.query(
          `UPDATE inventory 
           SET name = $1, category = $2, size_cut = $3, color = $4, min_stock_level = $5,
               preferred_supplier_id = $6, price = $7, wholesale_price = $8,
               semi_wholesale_price = $9, cost_price = $10,
               image_url = CASE WHEN $11::text IS NOT NULL THEN $11 ELSE image_url END,
               barcode = $12, gender = $13, color_id = $14, size_id = $15
           WHERE id = $16`,
          [
            name, category, resolvedSizeName, resolvedColorName, minStockLevel,
            supplier_id, numPrice, wholesale_price || 0, semi_wholesale_price || 0, numCost,
            image_url, barcode, body.gender || 'both', resolvedColorId, resolvedSizeId, id
          ]
        );
      }

      const targetBranchId = Number(branch_id) || Number(user?.branch_id) || 1;

      if (hasMultiSizes) {
        const branchTotalStock = parsedSizes.reduce((sum, s) => sum + s.stock, 0);

        for (const s of parsedSizes) {
          let sId = null;
          const resolvedS = await createOrGetSize(s.size, tx);
          if (resolvedS) sId = resolvedS.id;

          await tx.query(`
            INSERT INTO inventory_sizes (inventory_id, size_id, size_name, stock_level, branch_id)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (inventory_id, LOWER(TRIM(size_name)), COALESCE(branch_id, 1))
            DO UPDATE SET stock_level = EXCLUDED.stock_level, size_id = EXCLUDED.size_id
          `, [id, sId, s.size, s.stock, targetBranchId]);
        }

        if (parsedSizes.length > 0) {
          const keptNames = parsedSizes.map((s) => s.size.toLowerCase());
          await tx.query(`
            DELETE FROM inventory_sizes
            WHERE inventory_id = $1 AND branch_id = $2
              AND LOWER(TRIM(size_name)) != ALL($3::text[])
          `, [id, targetBranchId, keptNames]);
        } else {
          await tx.query(`
            DELETE FROM inventory_sizes
            WHERE inventory_id = $1 AND branch_id = $2
          `, [id, targetBranchId]);
        }

        // Update branch stock
        await tx.query(`
          INSERT INTO inventory_branches (inventory_id, branch_id, stock_level)
          VALUES ($1, $2, $3)
          ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = EXCLUDED.stock_level
        `, [id, targetBranchId, branchTotalStock]);

        // Update overall inventory stock
        await tx.query(`
          UPDATE inventory
          SET stock_level = (SELECT COALESCE(SUM(stock_level), 0) FROM inventory_branches WHERE inventory_id = $1),
              size_cut = (SELECT STRING_AGG(DISTINCT size_name, ', ' ORDER BY size_name) FROM inventory_sizes WHERE inventory_id = $1)
          WHERE id = $1
        `, [id]);
      } else if (user && branch_id && stock_level !== undefined) {
        if (!hasInventoryAllBranchesAccess(user) && Number(branch_id) !== Number(user.branch_id)) {
          throw new Error('Unauthorized branch stock update');
        }

        const currentStockRes = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [id, branch_id]);
        const oldStock = currentStockRes.rows.length ? Number(currentStockRes.rows[0].stock_level) : 0;
        const diff = Number(stock_level) - oldStock;

        await tx.query(
          'INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) VALUES ($1, $2, $3) ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = EXCLUDED.stock_level',
          [id, branch_id, stock_level]
        );

        if (diff !== 0 && !is_correction) {
          const absDiff = Math.abs(diff);
          const total_cost = absDiff * numCost;
          const note = diff > 0 ? 'تعديل كمية (زيادة رصيد)' : 'تعديل كمية (نقص رصيد)';
          const transType = diff > 0 ? 'purchase' : 'return';
          const transNote = diff > 0 ? `تعديل رصيد بالزيادة (${name})` : `تعديل رصيد بالنقصان (${name})`;
          const batchId = crypto.randomUUID();

          await tx.query(
            'INSERT INTO supply_records (supplier_id, inventory_id, quantity, cost_price, notes, branch_id, purchase_batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [supplier_id, id, diff, numCost, note, branch_id, batchId]
          );

          await tx.query(
            'INSERT INTO supplier_transactions (supplier_id, transaction_type, amount, notes, purchase_batch_id) VALUES ($1, $2, $3, $4, $5)',
            [supplier_id, transType, total_cost, transNote, batchId]
          );

          if (diff > 0) {
            await tx.query(
              `UPDATE suppliers SET total_purchases = total_purchases + $1, balance = balance - $1, purchase_count = purchase_count + 1, last_supply_date = ${CAIRO_DATE_SQL} WHERE id = $2`,
              [total_cost, supplier_id]
            );
          } else {
            await tx.query('UPDATE suppliers SET balance = balance + $1 WHERE id = $2', [total_cost, supplier_id]);
          }
        }

        const totalStockRes = await tx.query('SELECT SUM(stock_level) as total FROM inventory_branches WHERE inventory_id = $1', [id]);
        const newTotal = totalStockRes.rows[0]?.total || 0;
        await tx.query('UPDATE inventory SET stock_level = $1 WHERE id = $2', [newTotal, id]);
      }

      const { rows } = await db.query(`
        SELECT i.*, s.name as supplier_name,
               (SELECT json_agg(json_build_object('branch_id', branch_id, 'stock_level', stock_level)) FROM inventory_branches WHERE inventory_id = i.id) as branch_stocks,
               (SELECT json_agg(json_build_object('id', id, 'size_name', size_name, 'stock_level', stock_level, 'size_id', size_id)) FROM inventory_sizes WHERE inventory_id = i.id AND branch_id = $2) as sizes
        FROM inventory i 
        LEFT JOIN suppliers s ON i.preferred_supplier_id = s.id 
        WHERE i.id = $1
      `, [id, targetBranchId || 1]);

      return rows[0];
    });

    invalidateInventoryMetadata();
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
    const row = db.sqlite.prepare('SELECT * FROM inventory WHERE id = ? AND is_deleted = 0').get(itemId);
    if (!row) {
      const err = new Error('Product not found');
      err.statusCode = 404;
      throw err;
    }
    const sizes = db.sqlite.prepare('SELECT id, size_name, stock_level, size_id FROM inventory_sizes WHERE inventory_id = ? ORDER BY id ASC').all(itemId);
    return { ...row, sizes };
  }

  const { rows } = await db.query(`
    SELECT i.*, s.name as supplier_name,
      COALESCE((SELECT SUM(stock_level) FROM inventory_branches WHERE inventory_id = i.id AND branch_id = $2), 0) as branch_stock_level,
      COALESCE((
        SELECT json_agg(json_build_object(
          'id', s.id,
          'size_name', s.size_name,
          'stock_level', s.stock_level,
          'size_id', s.size_id
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
  if (!hasInventoryAdminAccess(user)) {
    const err = new Error('Admin only');
    err.statusCode = 403;
    throw err;
  }

  if (config.IS_BRANCH_MODE) {
    db.sqlite.prepare('UPDATE inventory SET is_deleted = 1 WHERE id = ?').run(id);
    invalidateInventoryMetadata();
    return { success: true };
  }

  await db.query('UPDATE inventory SET is_deleted = TRUE WHERE id = $1', [id]);
  invalidateInventoryMetadata();
  return { success: true };
}

async function transferStock(body, user) {
  let { inventory_id, from_branch_id, to_branch_id, from_branch, to_branch, quantity, is_request } = body;
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

  if (is_request) {
    const sourceStock = await db.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2', [inventory_id, from_branch_id]);
    const available = sourceStock.rows.length ? Number(sourceStock.rows[0].stock_level) : 0;
    if (transferQty > available) {
      const err = new Error(`عفواً، الكمية المطلوبة غير متوفرة في الفرع المصدر. المتاح حالياً: ${available} قطعة`);
      err.statusCode = 400;
      throw err;
    }

    await db.query(
      'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES ($1, $2, $3, $4, $5)',
      [inventory_id, from_branch_id, to_branch_id, transferQty, 'requested']
    );
    return { success: true, message: 'تم إرسال طلب بضاعة للفرع الآخر بنجاح' };
  }

  await db.transaction(async (tx) => {
    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [inventory_id, from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('عفواً، المخزون في الفرع المصدر غير كافٍ لإتمام عملية التحويل');
    }

    await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, inventory_id, from_branch_id]);

    await tx.query(
      'INSERT INTO stock_transfers (inventory_id, from_branch_id, to_branch_id, quantity, status) VALUES ($1, $2, $3, $4, $5)',
      [inventory_id, from_branch_id, to_branch_id, transferQty, 'pending']
    );
  });

  return { success: true, message: 'تم إرسال البضاعة وهي الآن في انتظار تأكيد الفرع الوجهة' };
}

async function listTransferRequests(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) branch_id = user.branch_id;

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
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
    if (isBranchScopedUser(user) && Number(transfer.from_branch_id) !== Number(user.branch_id)) {
      throw new Error('Unauthorized');
    }
    const transferQty = transfer.quantity;

    const stockCheck = await tx.query('SELECT stock_level FROM inventory_branches WHERE inventory_id = $1 AND branch_id = $2 FOR UPDATE', [transfer.inventory_id, transfer.from_branch_id]);
    if (!stockCheck.rows.length || Number(stockCheck.rows[0].stock_level) < transferQty) {
      throw new Error('المخزون في فرعك غير كافٍ للموافقة على هذا الطلب');
    }

    await tx.query('UPDATE inventory_branches SET stock_level = stock_level - $1 WHERE inventory_id = $2 AND branch_id = $3', [transferQty, transfer.inventory_id, transfer.from_branch_id]);
    await tx.query("UPDATE stock_transfers SET status = 'pending' WHERE id = $1", [transferId]);
  });
  return { success: true, message: 'تمت الموافقة وإرسال البضاعة بنجاح' };
}

async function rejectTransfer(transferId, user) {
  const params = [transferId];
  let branchFilter = '';
  if (isBranchScopedUser(user)) {
    params.push(user.branch_id);
    branchFilter = ' AND from_branch_id = $2';
  }
  const res = await db.query(`UPDATE stock_transfers SET status = 'rejected' WHERE id = $1 AND status = 'requested'${branchFilter}`, params);
  if (res.rowCount === 0) {
    const err = new Error('الطلب غير موجود');
    err.statusCode = 404;
    throw err;
  }
  return { success: true, message: 'تم رفض طلب البضاعة بنجاح' };
}

async function listIncomingTransfers(user, branchIdParam) {
  let branch_id = branchIdParam;
  if (isBranchScopedUser(user)) branch_id = user.branch_id;

  let query = `
    SELECT st.*, i.name as inventory_name, i.barcode as inventory_barcode,
           i.category, i.color, i.size_cut, i.image_url,
           b_to.name as to_branch_name, b_from.name as from_branch_name
    FROM stock_transfers st
    JOIN inventory i ON st.inventory_id = i.id
    JOIN branches b_to ON st.to_branch_id = b_to.id
    JOIN branches b_from ON st.from_branch_id = b_from.id
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
    if (isBranchScopedUser(user) && Number(transfer.to_branch_id) !== Number(user.branch_id)) {
      throw new Error('Unauthorized');
    }

    await tx.query(`
      INSERT INTO inventory_branches (inventory_id, branch_id, stock_level) 
      VALUES ($1, $2, $3) 
      ON CONFLICT (inventory_id, branch_id) DO UPDATE SET stock_level = inventory_branches.stock_level + $3
    `, [transfer.inventory_id, transfer.to_branch_id, transfer.quantity]);

    await tx.query("UPDATE stock_transfers SET status = 'received' WHERE id = $1", [transferId]);
  });
  return { success: true, message: 'تم تأكيد استلام المخزون بنجاح' };
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
  const branchIdToUse = (branch_id && branch_id !== 'all' && Number.isFinite(Number(branch_id))) ? Number(branch_id) : ((user && user.branch_id) || 1);

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
      COALESCE(ib.stock_level, 0) as stock_level
    FROM inventory i
    LEFT JOIN inventory_branches ib ON i.id = ib.inventory_id AND ib.branch_id = $2
    WHERE i.is_deleted = FALSE
      AND (
        i.name ILIKE $1 
        OR i.barcode ILIKE $1 
        OR i.category ILIKE $1
        OR i.color ILIKE $1
        OR i.size_cut ILIKE $1
      )
    ORDER BY 
      CASE WHEN i.name ILIKE $1 THEN 1 ELSE 2 END,
      COALESCE(ib.stock_level, 0) DESC,
      i.name
    LIMIT 20
  `, [searchPattern, branchIdToUse]);

  return rows;
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
};
