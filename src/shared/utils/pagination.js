function parsePagination(req, defaultLimit = 50, maxLimit = 200, force = false) {
  const page = Math.max(1, Number.parseInt(req?.query?.page || '1', 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(req?.query?.limit || defaultLimit, 10) || defaultLimit));
  const enabled = force || Boolean(req?.query?.page || req?.query?.limit);
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

function paginatedPayload(rows, total, pagination) {
  const totalCount = Number(total || 0);
  const totalPages = Math.ceil(totalCount / pagination.limit) || 1;
  return {
    items: rows,
    total: totalCount,
    page: pagination.page,
    limit: pagination.limit,
    totalPages,
    hasNext: pagination.page < totalPages,
    hasPrev: pagination.page > 1,
  };
}

module.exports = {
  parsePagination,
  appendPagination,
  paginatedPayload,
};
