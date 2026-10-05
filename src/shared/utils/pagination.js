function parsePagination(req, defaultLimit = 50, maxLimit = 200, force = false) {
  const query = req?.query ? req.query : (req || {});
  if (query.all === 'true' || query.paginate === 'false' || query.limit === 'all' || query.limit === '-1') {
    return {
      enabled: false,
      page: 1,
      limit: null,
      offset: 0,
    };
  }
  const page = Math.max(1, Number.parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit || defaultLimit, 10) || defaultLimit));
  const enabled = force || Boolean(query.page || query.limit);
  return {
    enabled,
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

function appendPagination(query, params, pagination) {
  params.push(pagination.limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(pagination.offset);
  const offsetPlaceholder = `$${params.length}`;
  return `${query} LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`;
}

function paginatedPayload(rows, total, pagination, customKey = null) {
  const totalCount = Number(total || 0);
  const limit = pagination?.limit || 50;
  const page = pagination?.page || 1;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));
  const paginationObj = {
    page,
    limit,
    total: totalCount,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
  const payload = {
    data: rows,
    items: rows,
    customers: rows,
    orders: rows,
    rentals: rows,
    alterations: rows,
    suppliers: rows,
    employees: rows,
    inventory: rows,
    expenses: rows,
    pagination: paginationObj,
    total: totalCount,
    page,
    limit,
    totalPages,
    hasNext: paginationObj.hasNext,
    hasPrev: paginationObj.hasPrev,
  };
  if (customKey && typeof customKey === 'string') {
    payload[customKey] = rows;
  }
  return payload;
}

module.exports = {
  parsePagination,
  appendPagination,
  paginatedPayload,
};
