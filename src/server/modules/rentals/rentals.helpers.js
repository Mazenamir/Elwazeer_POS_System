async function getRentalAvailability(queryable, rentalInventoryId, branchId, pickupDate, returnDate, options = {}) {
  if (options.lockStockRow) {
    await queryable.query(
      'SELECT stock_level FROM rental_inventory_branches WHERE rental_inventory_id = $1 AND branch_id = $2 FOR UPDATE',
      [rentalInventoryId, branchId]
    );
  }

  const { rows } = await queryable.query(`
    WITH stock AS (
      SELECT COALESCE(stock_level, 0)::int as stock_level
      FROM rental_inventory_branches
      WHERE rental_inventory_id = $1 AND branch_id = $2
    ),
    active_out AS (
      SELECT COUNT(*)::int as qty
      FROM rentals
      WHERE rental_inventory_id = $1
        AND branch_id = $2
        AND status = 'active'
    ),
    dates AS (
      SELECT generate_series($3::date, $4::date, '1 day'::interval)::date AS day
    ),
    daily_reserved AS (
      SELECT d.day, COUNT(r.id)::int as reserved_qty
      FROM dates d
      LEFT JOIN rentals r
        ON r.rental_inventory_id = $1
       AND r.branch_id = $2
       AND r.status IN ('booked', 'active')
       AND r.pickup_date <= d.day
       AND r.return_date >= d.day
      GROUP BY d.day
    )
    SELECT
      COALESCE((SELECT stock_level FROM stock), 0) + COALESCE((SELECT qty FROM active_out), 0) AS total_qty,
      COALESCE((SELECT MAX(reserved_qty) FROM daily_reserved), 0) AS max_reserved_qty
  `, [rentalInventoryId, branchId, pickupDate, returnDate]);

  const total = Number(rows[0]?.total_qty || 0);
  const reserved = Number(rows[0]?.max_reserved_qty || 0);
  return {
    available: Math.max(0, total - reserved),
    total,
    reserved,
  };
}

async function getRentalGroupRows(tx, id, { forUpdate = false } = {}) {
  const lockClause = forUpdate ? ' FOR UPDATE' : '';
  const { rows: baseRows } = await tx.query(`SELECT rental_group_uuid FROM rentals WHERE id = $1${lockClause}`, [id]);
  if (baseRows.length === 0) {
    const err = new Error('Rental not found');
    err.statusCode = 404;
    throw err;
  }
  const groupUuid = baseRows[0].rental_group_uuid;
  if (!groupUuid) {
    const { rows } = await tx.query(`SELECT * FROM rentals WHERE id = $1${lockClause}`, [id]);
    return rows;
  }
  const { rows } = await tx.query(`SELECT * FROM rentals WHERE rental_group_uuid = $1 ORDER BY id${lockClause}`, [groupUuid]);
  return rows;
}

async function getOrCreateSalesInventoryForRental(tx, rentalInventoryId, sellPrice) {
  const rentalItemRes = await tx.query(
    'SELECT name, category, size_cut, color, image_url FROM rental_inventory WHERE id = $1 AND is_deleted = FALSE',
    [rentalInventoryId]
  );
  if (rentalItemRes.rows.length === 0) {
    const err = new Error('Rental inventory item not found');
    err.statusCode = 404;
    throw err;
  }
  const rentalItem = rentalItemRes.rows[0];

  const existingRes = await tx.query(
    `SELECT id
     FROM inventory
     WHERE name = $1
       AND category IS NOT DISTINCT FROM $2
       AND size_cut IS NOT DISTINCT FROM $3
       AND color IS NOT DISTINCT FROM $4
       AND is_deleted = FALSE
     LIMIT 1`,
    [rentalItem.name, rentalItem.category, rentalItem.size_cut, rentalItem.color]
  );
  if (existingRes.rows.length) return existingRes.rows[0].id;

  const createdRes = await tx.query(
    `INSERT INTO inventory (name, category, size_cut, color, price, cost_price, image_url, stock_level, is_deleted)
     VALUES ($1, $2, $3, $4, $5, 0, $6, 0, FALSE)
     RETURNING id`,
    [rentalItem.name, rentalItem.category, rentalItem.size_cut, rentalItem.color, sellPrice, rentalItem.image_url]
  );
  return createdRes.rows[0].id;
}

module.exports = {
  getRentalAvailability,
  getRentalGroupRows,
  getOrCreateSalesInventoryForRental,
};
