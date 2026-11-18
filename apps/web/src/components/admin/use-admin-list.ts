'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import type { Meta } from '@/lib/admin';

const PAGE_SIZE = 20;

export function useAdminList<T>(path: string) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<T[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const request = ++latest.current;
    setLoading(true);
    setError('');

    const params: Record<string, string | number | undefined> = { page, limit: PAGE_SIZE };
    if (debouncedSearch) params.search = debouncedSearch;
    for (const [key, value] of Object.entries(filters)) {
      if (value) params[key] = value;
    }

    apiClient
      .get(path, { params })
      .then((res) => {
        if (request !== latest.current) return;
        setRows(res.data.data);
        setMeta(res.data.meta);
      })
      .catch((err) => {
        if (request !== latest.current) return;
        setError(getErrorMessage(err, 'Could not load this data. Please try again.'));
      })
      .finally(() => {
        if (request === latest.current) setLoading(false);
      });
  }, [path, page, debouncedSearch, filters]);

  const setFilter = useCallback((key: string, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }, []);

  const retry = useCallback(() => setFilters((f) => ({ ...f })), []);

  return { rows, meta, loading, error, page, setPage, search, setSearch, filters, setFilter, retry };
}
