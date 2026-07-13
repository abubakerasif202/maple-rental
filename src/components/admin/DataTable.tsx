import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Filter,
  X,
} from 'lucide-react';

import EmptyState from './EmptyState';
import {
  applyDataTableFilters,
  paginateDataTableRows,
  shouldApplyDataTableClientTransforms,
  sortDataTableRows,
  toggleSelectedRows,
  type DataTableSortDirection,
  type DataTableValue,
} from './dataTableUtils';

type IconComponent = React.ComponentType<{ className?: string }>;

export interface DataTableColumn<T> {
  accessor?: (row: T) => DataTableValue | React.ReactNode;
  align?: 'center' | 'left' | 'right';
  cell?: (row: T) => React.ReactNode;
  className?: string;
  header: React.ReactNode;
  id: string;
  minWidth?: string;
  sortable?: boolean;
  sortValue?: (row: T) => DataTableValue;
}

export interface DataTableFilterOption {
  label: string;
  value: string;
}

export interface DataTableFilter<T> {
  getValue: (row: T) => DataTableValue | DataTableValue[];
  id: string;
  label: string;
  options: DataTableFilterOption[];
}

export interface DataTableBulkAction<T> {
  icon?: IconComponent;
  label: string;
  onClick: (rows: T[]) => void;
}

export interface DataTableEmptyState {
  actionLabel?: string;
  description: string;
  icon?: IconComponent;
  onAction?: () => void;
  title: string;
}

export interface DataTablePagination {
  isFetching?: boolean;
  mode?: 'client' | 'server';
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  page?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  totalItems?: number;
  totalPages?: number;
}

export interface DataTableProps<T> {
  bulkActions?: Array<DataTableBulkAction<T>>;
  columns: Array<DataTableColumn<T>>;
  defaultPageSize?: number;
  emptyState: DataTableEmptyState;
  filters?: Array<DataTableFilter<T>>;
  getRowId: (row: T) => string;
  minWidth?: string;
  pagination?: DataTablePagination;
  rows: T[];
}

const alignClasses = {
  center: 'text-center',
  left: 'text-left',
  right: 'text-right',
};

const getPageNumbers = (currentPage: number, totalPages: number) => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage]);

  if (currentPage > 2) {
    pages.add(currentPage - 1);
  }

  if (currentPage < totalPages - 1) {
    pages.add(currentPage + 1);
  }

  return [...pages].sort((left, right) => left - right);
};

const renderAccessorValue = (value: DataTableValue | React.ReactNode) => {
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value as React.ReactNode;
};

export default function DataTable<T>({
  bulkActions = [],
  columns,
  defaultPageSize = 10,
  emptyState,
  filters = [],
  getRowId,
  minWidth = '760px',
  pagination,
  rows,
}: DataTableProps<T>) {
  const [activeFilters, setActiveFilters] = useState<Record<string, string[]>>({});
  const [localPage, setLocalPage] = useState(1);
  const [localPageSize, setLocalPageSize] = useState(defaultPageSize);
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [sortState, setSortState] = useState<{
    columnId: string;
    direction: DataTableSortDirection;
  } | null>(null);

  const isServerPagination = pagination?.mode === 'server';
  const applyClientTransforms = shouldApplyDataTableClientTransforms(isServerPagination);
  const availableFilters = useMemo(
    () => (applyClientTransforms ? filters : []),
    [applyClientTransforms, filters]
  );
  const page = isServerPagination ? pagination?.page ?? 1 : localPage;
  const pageSize = isServerPagination ? pagination?.pageSize ?? defaultPageSize : localPageSize;
  const pageSizeOptions = pagination?.pageSizeOptions ?? [10, 25, 50];

  const rowIdSet = useMemo(
    () => new Set(rows.map((row) => getRowId(row))),
    [getRowId, rows]
  );

  useEffect(() => {
    setSelectedRowIds((current) => {
      const next = new Set([...current].filter((rowId) => rowIdSet.has(rowId)));
      return next.size === current.size ? current : next;
    });
  }, [rowIdSet]);

  useEffect(() => {
    if (isServerPagination) {
      return;
    }

    setLocalPage(1);
  }, [activeFilters, isServerPagination, sortState]);

  const sortedRows = useMemo(() => {
    if (!applyClientTransforms) {
      return rows;
    }

    const filterConfigs = availableFilters.map((filterConfig) => ({
      getValue: filterConfig.getValue,
      selectedValues: activeFilters[filterConfig.id] ?? [],
    }));
    const filteredRows = applyDataTableFilters(rows, filterConfigs);
    const sortedColumn = sortState
      ? columns.find((column) => column.id === sortState.columnId)
      : undefined;

    return sortDataTableRows(
      filteredRows,
      sortState && sortedColumn
        ? {
            columnId: sortState.columnId,
            direction: sortState.direction,
            getValue: sortedColumn.sortValue ?? ((row) => sortedColumn.accessor?.(row) as DataTableValue),
          }
        : null
    );
  }, [activeFilters, applyClientTransforms, availableFilters, columns, rows, sortState]);

  const clientPagination = useMemo(
    () => paginateDataTableRows(sortedRows, { page: localPage, pageSize: localPageSize }),
    [localPage, localPageSize, sortedRows]
  );
  const visibleRows = isServerPagination ? sortedRows : clientPagination.rows;
  const visibleRowIds = visibleRows.map((row) => getRowId(row));
  const selectedRows = rows.filter((row) => selectedRowIds.has(getRowId(row)));
  const allVisibleRowsSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((rowId) => selectedRowIds.has(rowId));
  const totalPages = isServerPagination
    ? pagination?.totalPages ?? 1
    : clientPagination.totalPages;
  const totalItems = isServerPagination
    ? pagination?.totalItems ?? sortedRows.length
    : clientPagination.totalItems;

  const handleSort = (column: DataTableColumn<T>) => {
    if (
      !applyClientTransforms ||
      column.sortable === false ||
      (!column.sortValue && !column.accessor)
    ) {
      return;
    }

    setSortState((current) => {
      if (current?.columnId !== column.id) {
        return { columnId: column.id, direction: 'asc' };
      }

      if (current.direction === 'asc') {
        return { columnId: column.id, direction: 'desc' };
      }

      return null;
    });
  };

  const handlePageChange = (nextPage: number) => {
    const clampedPage = Math.min(Math.max(1, nextPage), totalPages);

    if (isServerPagination) {
      pagination?.onPageChange?.(clampedPage);
      return;
    }

    setLocalPage(clampedPage);
  };

  const handlePageSizeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextPageSize = Number(event.target.value);

    if (isServerPagination) {
      pagination?.onPageSizeChange?.(nextPageSize);
      return;
    }

    setLocalPageSize(nextPageSize);
    setLocalPage(1);
  };

  const toggleFilterValue = (filterId: string, value: string) => {
    setActiveFilters((current) => {
      const currentValues = current[filterId] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [filterId]: nextValues,
      };
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {availableFilters.map((filterConfig) => {
            const selectedValues = activeFilters[filterConfig.id] ?? [];

            return (
              <div key={filterConfig.id} className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenFilterId((current) =>
                      current === filterConfig.id ? null : filterConfig.id
                    )
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#1e3a5f] bg-[#061425] px-4 text-xs font-bold uppercase tracking-widest text-white transition-all hover:border-[#dfb125]/60"
                >
                  <Filter className="h-4 w-4 text-[#dfb125]" />
                  {filterConfig.label}
                  {selectedValues.length > 0 && (
                    <span className="rounded-full bg-[#dfb125] px-2 py-0.5 text-[10px] text-[#061425]">
                      {selectedValues.length}
                    </span>
                  )}
                </button>

                {openFilterId === filterConfig.id && (
                  <div className="absolute left-0 z-30 mt-2 w-64 rounded-lg border border-[#1e3a5f] bg-[#061425] p-3 shadow-2xl">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Filter {filterConfig.label}
                      </p>
                      {selectedValues.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveFilters((current) => ({
                              ...current,
                              [filterConfig.id]: [],
                            }))
                          }
                          className="text-slate-400 transition-colors hover:text-white"
                          aria-label={`Clear ${filterConfig.label} filter`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {filterConfig.options.map((option) => (
                        <label
                          key={option.value}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-xs text-white transition-all hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            checked={selectedValues.includes(option.value)}
                            onChange={() => toggleFilterValue(filterConfig.id, option.value)}
                            className="h-4 w-4 rounded border-[#1e3a5f] bg-[#061425] accent-[#dfb125]"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-slate-400">
          {totalItems} records
          {pagination?.isFetching ? ' | Updating...' : ''}
        </p>
      </div>

      {selectedRows.length > 0 && (
        <div className="sticky top-4 z-20 flex flex-col gap-3 rounded-lg border border-[#dfb125]/30 bg-[#061425] p-3 shadow-2xl shadow-black/30 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-bold uppercase tracking-widest text-white">
            {selectedRows.length} selected
          </p>
          <div className="flex flex-wrap gap-2">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => action.onClick(selectedRows)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#dfb125] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[#061425] transition-all hover:bg-[#f0c94a]"
              >
                {action.icon && <action.icon className="h-4 w-4" />}
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedRowIds(new Set())}
              className="min-h-11 rounded-lg border border-[#1e3a5f] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-[#1e3a5f] bg-[#0b1f36]">
        <div className="space-y-3 p-3 md:hidden">
          {visibleRows.map((row) => {
            const rowId = getRowId(row);

            return (
              <article
                key={rowId}
                className="rounded-lg border border-[#1e3a5f] bg-[#061425] p-4"
              >
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <label className="flex min-h-11 items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.has(rowId)}
                      onChange={() =>
                        setSelectedRowIds((current) => {
                          const next = new Set(current);

                          if (next.has(rowId)) {
                            next.delete(rowId);
                          } else {
                            next.add(rowId);
                          }

                          return next;
                        })
                      }
                      className="h-5 w-5 rounded border-[#1e3a5f] bg-[#061425] accent-[#dfb125]"
                      aria-label={`Select row ${rowId}`}
                    />
                    Select
                  </label>
                  <span className="max-w-[55%] truncate font-mono text-[10px] text-slate-500">
                    #{rowId}
                  </span>
                </div>

                <div className="mt-4 space-y-4">
                  {columns.map((column) => (
                    <div
                      key={column.id}
                      className={column.id === 'actions' ? 'space-y-2' : 'min-w-0'}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        {column.header}
                      </p>
                      <div className="mt-1 min-w-0 text-sm text-white">
                        {column.cell
                          ? column.cell(row)
                          : renderAccessorValue(column.accessor?.(row))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            );
          })}

          {visibleRows.length === 0 && <EmptyState {...emptyState} />}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left" style={{ minWidth }}>
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[#1e3a5f] bg-[#061425]">
                <th className="w-12 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={allVisibleRowsSelected}
                    disabled={visibleRowIds.length === 0}
                    onChange={() =>
                      setSelectedRowIds((current) => toggleSelectedRows(current, visibleRowIds))
                    }
                    className="h-4 w-4 rounded border-[#1e3a5f] bg-[#061425] accent-[#dfb125] disabled:opacity-40"
                    aria-label="Select visible rows"
                  />
                </th>
                {columns.map((column) => {
                  const isSortable =
                    applyClientTransforms &&
                    column.sortable !== false &&
                    Boolean(column.sortValue || column.accessor);
                  const isSorted = sortState?.columnId === column.id;

                  return (
                    <th
                      key={column.id}
                      className={`px-5 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 ${alignClasses[column.align ?? 'left']}`}
                      style={column.minWidth ? { minWidth: column.minWidth } : undefined}
                    >
                      {isSortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(column)}
                          className={`inline-flex items-center gap-2 transition-colors hover:text-white ${
                            column.align === 'right' ? 'justify-end' : ''
                          }`}
                        >
                          {column.header}
                          {isSorted && sortState?.direction === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-[#dfb125]" />
                          ) : isSorted && sortState?.direction === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-[#dfb125]" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e3a5f]">
              {visibleRows.map((row) => {
                const rowId = getRowId(row);

                return (
                  <tr key={rowId} className="transition-all hover:bg-white/[0.03]">
                    <td className="px-4 py-5">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.has(rowId)}
                        onChange={() =>
                          setSelectedRowIds((current) => {
                            const next = new Set(current);

                            if (next.has(rowId)) {
                              next.delete(rowId);
                            } else {
                              next.add(rowId);
                            }

                            return next;
                          })
                        }
                        className="h-4 w-4 rounded border-[#1e3a5f] bg-[#061425] accent-[#dfb125]"
                        aria-label={`Select row ${rowId}`}
                      />
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={`px-5 py-5 ${alignClasses[column.align ?? 'left']} ${column.className ?? ''}`}
                      >
                        {column.cell
                          ? column.cell(row)
                          : renderAccessorValue(column.accessor?.(row))}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1}>
                    <EmptyState {...emptyState} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-4 border-t border-[#1e3a5f] bg-[#061425] px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
            <span>
              Page {page} of {totalPages}
            </span>
            <span>|</span>
            <label className="flex items-center gap-2">
              Rows
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                className="min-h-11 rounded-lg border border-[#1e3a5f] bg-[#0b1f36] px-3 py-2 text-white outline-none focus:border-[#dfb125]"
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || pagination?.isFetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#1e3a5f] px-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </button>
            {getPageNumbers(page, totalPages).map((pageNumber, index, pageNumbers) => (
              <React.Fragment key={pageNumber}>
                {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && (
                  <span className="px-1 text-slate-400">...</span>
                )}
                <button
                  type="button"
                  onClick={() => handlePageChange(pageNumber)}
                  disabled={pagination?.isFetching}
                  className={`min-h-11 min-w-11 rounded-lg border px-3 text-xs font-bold transition-all ${
                    pageNumber === page
                      ? 'border-[#dfb125] bg-[#dfb125] text-[#061425]'
                      : 'border-[#1e3a5f] text-white hover:bg-white/5'
                  } disabled:opacity-40`}
                >
                  {pageNumber}
                </button>
              </React.Fragment>
            ))}
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages || pagination?.isFetching}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#1e3a5f] px-3 text-[10px] font-bold uppercase tracking-widest text-white transition-all hover:bg-white/5 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
