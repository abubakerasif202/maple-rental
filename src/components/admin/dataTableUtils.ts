export type DataTableSortDirection = 'asc' | 'desc';
export type DataTableValue = boolean | Date | number | string | null | undefined;

export interface DataTableSortConfig<T> {
  columnId: string;
  direction: DataTableSortDirection;
  getValue: (row: T) => DataTableValue;
}

export interface DataTableFilterConfig<T> {
  getValue: (row: T) => DataTableValue | DataTableValue[];
  selectedValues: string[];
}

export interface DataTablePaginationConfig {
  page: number;
  pageSize: number;
}

export interface DataTablePaginationResult<T> {
  page: number;
  pageSize: number;
  rows: T[];
  totalItems: number;
  totalPages: number;
}

export const shouldApplyDataTableClientTransforms = (isServerPagination: boolean) =>
  !isServerPagination;

const toComparableValue = (value: DataTableValue) => {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  return value;
};

const compareValues = (left: DataTableValue, right: DataTableValue) => {
  const normalizedLeft = toComparableValue(left);
  const normalizedRight = toComparableValue(right);
  const leftIsEmpty = normalizedLeft === null || normalizedLeft === undefined || normalizedLeft === '';
  const rightIsEmpty = normalizedRight === null || normalizedRight === undefined || normalizedRight === '';

  if (leftIsEmpty && rightIsEmpty) {
    return 0;
  }

  if (leftIsEmpty) {
    return 1;
  }

  if (rightIsEmpty) {
    return -1;
  }

  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft - normalizedRight;
  }

  return String(normalizedLeft).localeCompare(String(normalizedRight), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

export const sortDataTableRows = <T>(
  rows: T[],
  sortConfig: DataTableSortConfig<T> | null
) => {
  if (!sortConfig) {
    return [...rows];
  }

  const directionMultiplier = sortConfig.direction === 'asc' ? 1 : -1;

  return [...rows].sort((left, right) => {
    const result = compareValues(sortConfig.getValue(left), sortConfig.getValue(right));
    return result * directionMultiplier;
  });
};

export const applyDataTableFilters = <T>(
  rows: T[],
  filters: Array<DataTableFilterConfig<T>>
) =>
  filters.reduce((currentRows, filter) => {
    if (filter.selectedValues.length === 0) {
      return currentRows;
    }

    const selectedValues = new Set(filter.selectedValues.map(String));

    return currentRows.filter((row) => {
      const rawValue = filter.getValue(row);
      const rowValues = Array.isArray(rawValue) ? rawValue : [rawValue];

      return rowValues.some((value) => selectedValues.has(String(value ?? '')));
    });
  }, rows);

export const paginateDataTableRows = <T>(
  rows: T[],
  config: DataTablePaginationConfig
): DataTablePaginationResult<T> => {
  const pageSize = Math.max(1, Math.trunc(config.pageSize) || 1);
  const totalItems = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, Math.trunc(config.page) || 1), totalPages);
  const start = (page - 1) * pageSize;

  return {
    page,
    pageSize,
    rows: rows.slice(start, start + pageSize),
    totalItems,
    totalPages,
  };
};

export const toggleSelectedRows = (
  currentSelection: Set<string>,
  visibleRowIds: string[]
) => {
  const nextSelection = new Set(currentSelection);
  const allVisibleRowsSelected =
    visibleRowIds.length > 0 && visibleRowIds.every((rowId) => nextSelection.has(rowId));

  visibleRowIds.forEach((rowId) => {
    if (allVisibleRowsSelected) {
      nextSelection.delete(rowId);
      return;
    }

    nextSelection.add(rowId);
  });

  return nextSelection;
};
