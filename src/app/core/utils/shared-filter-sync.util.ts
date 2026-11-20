import { FilterState } from '../services/filter-state.service';
import { formatDateInput, periodFromDatePreset, resolveDateRangeFromFilterState } from './filter-date-range.util';

/** Build partial state when Analysis updates dates / categories. */
export function buildFilterStateFromAnalysis(input: {
  startDate: string;
  endDate: string;
  datePreset: string;
  categoryIds: string[];
}): Partial<FilterState> {
  const selectedPeriod = periodFromDatePreset(input.datePreset);
  const now = new Date();
  const partial: Partial<FilterState> = {
    selectedPeriod,
    customStartDate: input.startDate,
    customEndDate: input.endDate,
    selectedDatePreset: input.datePreset,
    selectedCategoryIds: [...input.categoryIds],
    filterCategory: input.categoryIds.length === 1 ? input.categoryIds[0] : '',
    filterYear: '',
    filterMonth: ''
  };

  if (input.datePreset === 'thisMonth') {
    partial.selectedPeriod = 'monthly';
    partial.selectedMonth = now.getMonth().toString();
    partial.selectedYear = now.getFullYear().toString();
  }

  if (input.datePreset === 'thisYear') {
    const start = new Date(now.getFullYear(), 0, 1);
    partial.customStartDate = formatDateInput(start);
    partial.customEndDate = formatDateInput(now);
  }

  if (input.datePreset === 'all') {
    partial.customStartDate = '';
    partial.customEndDate = '';
  }

  return partial;
}

/** Build partial state when Reports year/month/category changes. */
export function buildFilterStateFromReports(input: {
  filterYear: string;
  filterMonth: string;
  filterCategory: string;
}): Partial<FilterState> {
  const partial: Partial<FilterState> = {
    filterYear: input.filterYear,
    filterMonth: input.filterMonth,
    filterCategory: input.filterCategory,
    selectedCategoryIds: input.filterCategory ? [input.filterCategory] : []
  };

  if (input.filterYear && input.filterMonth) {
    const monthIndex = parseInt(input.filterMonth, 10) - 1;
    const year = parseInt(input.filterYear, 10);
    const start = new Date(year, monthIndex, 1);
    const end = new Date(year, monthIndex + 1, 0);
    partial.selectedPeriod = 'monthOnly';
    partial.selectedMonthOnly = monthIndex.toString();
    partial.selectedYearOnly = input.filterYear;
    partial.customStartDate = formatDateInput(start);
    partial.customEndDate = formatDateInput(end);
    partial.selectedDatePreset = 'custom';
  } else if (input.filterYear) {
    const year = parseInt(input.filterYear, 10);
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    partial.selectedPeriod = 'custom';
    partial.customStartDate = formatDateInput(start);
    partial.customEndDate = formatDateInput(end);
    partial.selectedDatePreset = 'custom';
    partial.selectedMonthOnly = '';
    partial.selectedYearOnly = '';
  } else if (!input.filterMonth) {
    // "All years" on Reports — show every month tile; don't keep a single-year window
    partial.selectedPeriod = 'all';
    partial.customStartDate = '';
    partial.customEndDate = '';
    partial.selectedDatePreset = 'all';
    partial.selectedMonthOnly = '';
    partial.selectedYearOnly = '';
  }

  return partial;
}