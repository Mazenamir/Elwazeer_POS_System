const db = require('../../database/connection');
const config = require('../../config/env');
const { likePattern } = require('../../../shared/utils/string');

/**
 * Unified Global Search Service
 * Searches across Products, Customers, Orders/Invoices, Employees, and Suppliers.
 * Highly optimized with targeted parallel queries and branch scoping.
 */
async function globalSearch({ q = '', branchId = 'all', type = 'all' }, user = null) {
  const queryStr = String(q || '').trim();
  if (!queryStr || queryStr.length < 1) {
    return {
      query: '',
      total_matches: 0,
      products: [],
      customers: [],
      orders: [],
      employees: [],
      suppliers: [],
    };
  }

  const cleanNum = queryStr.replace(/^#/, '').trim();
  const isNumeric = /^\d+$/.test(cleanNum);
  const pattern = `%${queryStr}%`;

  const isBranchScoped = user && user.role === 'branch_user';
  const effectiveBranchId = isBranchScoped
    ? user.branch_id
    : (branchId && branchId !== 'all' ? Number(branchId) : null);

  if (config.IS_BRANCH_MODE) {
    return searchSqlite({ queryStr, pattern, cleanNum, isNumeric, effectiveBranchId, type });
  }

  return searchPostgres({ queryStr, pattern, cleanNum, isNumeric, effectiveBranchId, type });
}

async function searchPostgres({ queryStr, pattern, cleanNum, isNumeric, effectiveBranchId, type }) {
  const tasks = [];

  // 1. Search Products / Inventory
  if (type === 'all' || type === 'products') {
    tasks.push((async () => {
      try {
        const params = [pattern];
        let branchFilter = '';
        if (effectiveBranchId) {
          params.push(effectiveBranchId);
          branchFilter = `AND (EXISTS (SELECT 1 FROM inventory_branches ib WHERE ib.inventory_id = i.id AND ib.branch_id = $${params.length}))`;
        }

        const { rows } = await db.query(`
          SELECT 
            i.id,
            i.name,
            i.category,
            i.color,
            i.size_cut,
            i.barcode,
            i.price,
            i.stock_level,
            i.image_url
          FROM inventory i
          WHERE i.is_deleted = FALSE
            AND (
              i.name ILIKE $1 
              OR i.barcode ILIKE $1 
              OR i.category ILIKE $1 
              OR i.color ILIKE $1
              OR i.size_cut ILIKE $1
              ${isNumeric ? `OR i.id = ${cleanNum}` : ''}
            )
            ${branchFilter}
          ORDER BY 
            CASE 
              WHEN i.barcode = '${queryStr}' THEN 0
              WHEN i.name ILIKE '${queryStr}%' THEN 1
              ELSE 2 
            END,
            i.id DESC
          LIMIT 8
        `, params);
        return { key: 'products', items: rows };
      } catch (err) {
        console.error('[Search] Products search error:', err.message);
        return { key: 'products', items: [] };
      }
    })());
  }

  // 2. Search Customers
  if (type === 'all' || type === 'customers') {
    tasks.push((async () => {
      try {
        const params = [pattern];
        let branchFilter = '';
        if (effectiveBranchId) {
          params.push(effectiveBranchId);
          branchFilter = `AND c.branch_id = $${params.length}`;
        }

        const { rows } = await db.query(`
          SELECT 
            c.id,
            c.name,
            c.initials,
            c.phone,
            c.status,
            c.total_spent,
            c.branch_id,
            b.name as branch_name
          FROM customers c
          LEFT JOIN branches b ON c.branch_id = b.id
          WHERE (
            c.name ILIKE $1 
            OR c.phone ILIKE $1 
            OR COALESCE(c.national_id, '') ILIKE $1
            ${isNumeric ? `OR c.id = ${cleanNum}` : ''}
          )
          ${branchFilter}
          ORDER BY 
            CASE 
              WHEN c.phone = '${queryStr}' THEN 0
              WHEN c.name ILIKE '${queryStr}%' THEN 1
              ELSE 2 
            END,
            c.id ASC
          LIMIT 8
        `, params);
        return { key: 'customers', items: rows };
      } catch (err) {
        console.error('[Search] Customers search error:', err.message);
        return { key: 'customers', items: [] };
      }
    })());
  }

  // 3. Search Orders / Invoices
  if (type === 'all' || type === 'orders') {
    tasks.push((async () => {
      try {
        const params = [pattern];
        let branchFilter = '';
        if (effectiveBranchId) {
          params.push(effectiveBranchId);
          branchFilter = `AND o.branch_id = $${params.length}`;
        }

        const { rows } = await db.query(`
          SELECT 
            o.id,
            o.branch_invoice_number,
            o.total_amount,
            o.paid_amount,
            o.status,
            o.payment_method,
            o.order_date,
            o.branch_id,
            c.name as customer_name,
            c.phone as customer_phone,
            b.name as branch_name
          FROM orders o
          LEFT JOIN customers c ON o.customer_id = c.id
          LEFT JOIN branches b ON o.branch_id = b.id
          WHERE (
            c.name ILIKE $1
            OR c.phone ILIKE $1
            ${isNumeric ? `OR o.branch_invoice_number = ${cleanNum} OR o.id = ${cleanNum}` : ''}
            OR o.offline_uuid::text ILIKE $1
          )
          ${branchFilter}
          ORDER BY o.order_date DESC, o.id DESC
          LIMIT 8
        `, params);
        return { key: 'orders', items: rows };
      } catch (err) {
        console.error('[Search] Orders search error:', err.message);
        return { key: 'orders', items: [] };
      }
    })());
  }

  // 4. Search Employees
  if (type === 'all' || type === 'employees') {
    tasks.push((async () => {
      try {
        const params = [pattern];
        let branchFilter = '';
        if (effectiveBranchId) {
          params.push(effectiveBranchId);
          branchFilter = `AND e.branch_id = $${params.length}`;
        }

        const { rows } = await db.query(`
          SELECT 
            e.id,
            e.name,
            e.phone,
            e.position,
            e.status,
            e.branch_id,
            b.name as branch_name
          FROM employees e
          LEFT JOIN branches b ON e.branch_id = b.id
          WHERE (
            e.name ILIKE $1 
            OR e.phone ILIKE $1 
            OR COALESCE(e.position, '') ILIKE $1
            ${isNumeric ? `OR e.id = ${cleanNum}` : ''}
          )
          ${branchFilter}
          ORDER BY e.name ASC, e.id ASC
          LIMIT 8
        `, params);
        return { key: 'employees', items: rows };
      } catch (err) {
        console.error('[Search] Employees search error:', err.message);
        return { key: 'employees', items: [] };
      }
    })());
  }

  // 5. Search Suppliers
  if (type === 'all' || type === 'suppliers') {
    tasks.push((async () => {
      try {
        const { rows } = await db.query(`
          SELECT 
            id,
            name,
            code,
            phone
          FROM suppliers
          WHERE (
            name ILIKE $1 
            OR COALESCE(code, '') ILIKE $1 
            OR COALESCE(phone, '') ILIKE $1
            ${isNumeric ? `OR id = ${cleanNum}` : ''}
          )
          ORDER BY name ASC
          LIMIT 8
        `, [pattern]);
        return { key: 'suppliers', items: rows };
      } catch (err) {
        console.error('[Search] Suppliers search error:', err.message);
        return { key: 'suppliers', items: [] };
      }
    })());
  }

  const results = await Promise.all(tasks);
  const out = {
    query: queryStr,
    total_matches: 0,
    products: [],
    customers: [],
    orders: [],
    employees: [],
    suppliers: [],
  };

  for (const r of results) {
    out[r.key] = r.items;
    out.total_matches += r.items.length;
  }

  return out;
}

function searchSqlite({ queryStr, pattern, cleanNum, isNumeric, effectiveBranchId, type }) {
  const out = {
    query: queryStr,
    total_matches: 0,
    products: [],
    customers: [],
    orders: [],
    employees: [],
    suppliers: [],
  };

  try {
    if (type === 'all' || type === 'products') {
      const pRows = db.sqlite.prepare(`
        SELECT id, name, category, color, size_cut, barcode, price, stock_level, image_url
        FROM inventory
        WHERE is_deleted = 0
          AND (name LIKE ? OR barcode LIKE ? OR category LIKE ? OR color LIKE ? ${isNumeric ? `OR id = ${cleanNum}` : ''})
        ORDER BY id DESC
        LIMIT 8
      `).all(pattern, pattern, pattern, pattern);
      out.products = pRows;
      out.total_matches += pRows.length;
    }

    if (type === 'all' || type === 'customers') {
      const cRows = db.sqlite.prepare(`
        SELECT c.id, c.name, c.initials, c.phone, c.status, c.total_spent, c.branch_id, b.name as branch_name
        FROM customers c
        LEFT JOIN branches b ON c.branch_id = b.id
        WHERE (c.name LIKE ? OR c.phone LIKE ? ${isNumeric ? `OR c.id = ${cleanNum}` : ''})
        ${effectiveBranchId ? `AND c.branch_id = ${effectiveBranchId}` : ''}
        ORDER BY c.id ASC
        LIMIT 8
      `).all(pattern, pattern);
      out.customers = cRows;
      out.total_matches += cRows.length;
    }

    if (type === 'all' || type === 'employees') {
      const eRows = db.sqlite.prepare(`
        SELECT e.id, e.name, e.phone, e.position, e.status, e.branch_id, b.name as branch_name
        FROM employees e
        LEFT JOIN branches b ON e.branch_id = b.id
        WHERE (e.name LIKE ? OR e.phone LIKE ? OR e.position LIKE ? ${isNumeric ? `OR e.id = ${cleanNum}` : ''})
        ${effectiveBranchId ? `AND e.branch_id = ${effectiveBranchId}` : ''}
        ORDER BY e.name ASC
        LIMIT 8
      `).all(pattern, pattern, pattern);
      out.employees = eRows;
      out.total_matches += eRows.length;
    }
  } catch (err) {
    console.error('[Search] SQLite search error:', err.message);
  }

  return out;
}

module.exports = {
  globalSearch,
};
