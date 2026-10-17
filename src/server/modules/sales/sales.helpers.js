async function resolveOrderId(db, idParam) {
  const idStr = String(idParam || '').trim();
  if (!idStr) return null;

  // If it starts with OFF- it's an offline reference, search by offline_uuid
  if (idStr.toUpperCase().startsWith('OFF-')) {
    const offlinePart = idStr.slice(4); // remove 'OFF-' prefix
    const { rows } = await db.query(
      'SELECT id FROM orders WHERE offline_uuid::text LIKE $1 LIMIT 1',
      [offlinePart + '%']
    );
    if (rows.length === 0) return null;
    return rows[0].id;
  }

  // Otherwise try as numeric ID
  const numId = parseInt(idStr, 10);
  if (Number.isNaN(numId)) return null;
  return numId;
}

module.exports = {
  resolveOrderId,
};
