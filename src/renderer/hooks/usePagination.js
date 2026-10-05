import { useState, useCallback } from 'react';

export function usePagination(initialLimit = 50) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const setPaginationData = useCallback((data) => {
    if (!data) return;
    if (typeof data.page === 'number') setPage(data.page);
    if (typeof data.total === 'number') setTotal(data.total);
    if (typeof data.totalPages === 'number') setTotalPages(data.totalPages);
    else if (typeof data.total === 'number' && typeof data.limit === 'number') {
      setTotalPages(Math.max(1, Math.ceil(data.total / (data.limit || 1))));
    }
  }, []);

  const nextPage = useCallback(() => {
    setPage((prev) => (prev < totalPages ? prev + 1 : prev));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setPage((prev) => (prev > 1 ? prev - 1 : 1));
  }, []);

  const resetPage = useCallback(() => {
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    limit,
    setLimit,
    total,
    totalPages,
    setPaginationData,
    nextPage,
    prevPage,
    resetPage,
  };
}

export default usePagination;
