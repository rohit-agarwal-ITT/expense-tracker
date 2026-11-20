import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { FirebaseService } from '../../core/services/firebase.service';
import { FilterStateService } from '../../core/services/filter-state.service';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { IndianCurrencyComponent } from '../../shared/components/indian-currency/indian-currency.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { Subscription, combineLatest } from 'rxjs';
import { Expense } from '../../core/models/expense.model';
import { Category } from '../../core/models/category.model';
import { deferHeavyWork } from '../../core/utils/defer-heavy-work.util';
import { resolveDateRangeFromFilterState } from '../../core/utils/filter-date-range.util';
import { FilterState } from '../../core/services/filter-state.service';
import { BackupRestoreService } from '../../core/services/backup-restore.service';

interface Alert {
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  icon: string;
}



interface BudgetProgress {
  percentage: number;
  remaining: number;
  status: 'good' | 'warning' | 'danger';
}

interface MonthlyTrend {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

interface Insight {
  title: string;
  description: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LoadingComponent, IndianCurrencyComponent, PageHeaderComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardComponent implements OnInit, OnDestroy {
  expenses: Expense[] = [];
  categories: Category[] = [];
  
  // Summary data
  totalSpent: number = 0;
  averageSpent: number = 0;
  expenseCount: number = 0;
  monthlyComparison: any = {};
  
  // Filter properties
  selectedPeriod: string = 'all';
  selectedMonth: string = '';
  selectedYear: string = '';
  customStartDate: string = '';
  customEndDate: string = '';
  selectedMonthOnly: string = '';
  selectedYearOnly: string = '';
  selectedCategoryId = '';

  // Monthly data
  currentMonthTotal: number = 0;
  
  // Weekly data
  weeklyTotal: number = 0;
  
  // New features
  showInsights: boolean = false;

  quickSummaryCards: {
    title: string;
    value: string;
    amount?: number;
    change: string;
    trend: 'up' | 'down' | 'stable';
    icon: string;
  }[] = [];

  spendingAnalytics: any = null;
  smartRecommendations: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] = [];
  
  // Loading states
  isLoading = false;
  
  private subscription: Subscription = new Subscription();
  private categoryMap: Map<string, Category> = new Map();
  private selectedCategoryIds: string[] = [];
  private syncingSharedFilters = false;
  private calculationCache: { expenses: Expense[], categories: Category[] } | null = null;

  constructor(
    private firebaseService: FirebaseService,
    private filterStateService: FilterStateService,
    private backupRestoreService: BackupRestoreService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isLoading = !this.firebaseService.hasCoreDataCached;

    this.loadFilterState();

    this.subscription.add(
      this.filterStateService.filterState$.subscribe((state) => {
        if (this.syncingSharedFilters) {
          return;
        }
        this.applySharedFilterState(state);
      })
    );

    // Initialize available years
    const currentYear = new Date().getFullYear();
    for (let year = 2020; year <= currentYear + 1; year++) {
      this.availableYears.push(year.toString());
    }
    
    // Subscribe to Firebase observables for real-time updates using combineLatest for efficiency
    this.subscription.add(
      combineLatest([
        this.firebaseService.expenses$,
        this.firebaseService.categories$
      ]).subscribe(([expenses, categories]) => {
        this.expenses = expenses;
        this.categories = categories;

        this.categoryMap.clear();
        this.categories.forEach(cat => this.categoryMap.set(cat.id, cat));
        this.cdr.markForCheck();

        deferHeavyWork(() => {
          if (
            !this.calculationCache ||
            this.calculationCache.expenses.length !== expenses.length ||
            this.calculationCache.categories.length !== categories.length
          ) {
            this.calculateTotals();
            this.calculateWeeklyData();
            this.calculationCache = { expenses, categories };
          }

          this.refreshQuickSummaryCards();
          this.refreshInsightsCache();
          this.cdr.markForCheck();
        });
      })
    );

    // Subscribe to loading state
    this.subscription.add(
      this.firebaseService.getPageLoading$().subscribe((loading) => {
        this.isLoading = loading;
        this.cdr.markForCheck();
      })
    );

  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  // loadData() method removed - Firebase observables handle data loading automatically

  calculateTotals() {
    this.totalSpent = this.expenses.reduce((sum, expense) => sum + expense.amount, 0);
    this.expenseCount = this.expenses.length;
    this.averageSpent = this.expenseCount > 0 ? this.totalSpent / this.expenseCount : 0;
  }

  calculateWeeklyData() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
    startOfWeek.setHours(0, 0, 0, 0);
    
    this.weeklyTotal = this.expenses
      .filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate >= startOfWeek;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
  }


  // Filter methods
  getFilteredExpenses(): Expense[] {
    let filtered = [...this.expenses];
    
    // Apply period filter
    if (this.selectedPeriod !== 'all') {
      const now = new Date();
      
      switch (this.selectedPeriod) {
        case 'monthly':
          // Selected month expenses
          const selectedMonthIndex = parseInt(this.selectedMonth);
          const selectedYear = parseInt(this.selectedYear);
          filtered = filtered.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() === selectedMonthIndex && 
                   expenseDate.getFullYear() === selectedYear;
          });
          break;
        case 'yearly':
          // Current year expenses
          filtered = filtered.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getFullYear() === now.getFullYear();
          });
          break;
        case 'last30':
          // Last 30 days
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          filtered = filtered.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= thirtyDaysAgo;
          });
          break;
        case 'last7':
          // Last 7 days
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          filtered = filtered.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate >= sevenDaysAgo;
          });
          break;
        case 'custom':
          if (this.customStartDate && this.customEndDate) {
            filtered = filtered.filter(expense => {
              const expenseDate = new Date(expense.date);
              const start = new Date(this.customStartDate);
              const end = new Date(this.customEndDate);
              return expenseDate >= start && expenseDate <= end;
            });
          }
          break;
        case 'monthOnly':
          if (this.selectedMonthOnly && this.selectedYearOnly) {
            const monthIndex = parseInt(this.selectedMonthOnly);
            const year = parseInt(this.selectedYearOnly);
            filtered = filtered.filter(expense => {
              const expenseDate = new Date(expense.date);
              return expenseDate.getMonth() === monthIndex && 
                     expenseDate.getFullYear() === year;
            });
          }
          break;
      }
    }

  const categoryIds = this.selectedCategoryIds;
    if (categoryIds.length > 0) {
      filtered = filtered.filter((expense) => categoryIds.includes(expense.categoryId));
    }

    return filtered;
  }

  getFilteredTotal(): number {
    return this.getFilteredExpenses().reduce((sum, expense) => sum + expense.amount, 0);
  }

  getFilterLabel(): string {
    switch (this.selectedPeriod) {
      case 'monthly': return 'This Month';
      case 'yearly': return 'This Year';
      case 'last30': return 'Last 30 Days';
      case 'last7': return 'Last 7 Days';
      case 'custom': return this.getCustomDateRangeLabel();
      default: return 'All Time';
    }
  }

  getCustomDateRangeLabel(): string {
    if (!this.customStartDate || !this.customEndDate) {
      return 'Custom Range';
    }
    
    const startDate = new Date(this.customStartDate);
    const endDate = new Date(this.customEndDate);
    
    const startFormatted = startDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
    const endFormatted = endDate.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
    
    return `${startFormatted} - ${endFormatted}`;
  }

  // Load filter state from service
  loadFilterState() {
    const filterState = this.filterStateService.getFilterState();
    
    this.selectedPeriod = filterState.selectedPeriod;
    this.selectedMonth = filterState.selectedMonth;
    this.selectedYear = filterState.selectedYear;
    this.customStartDate = filterState.customStartDate;
    this.customEndDate = filterState.customEndDate;
    this.selectedMonthOnly = filterState.selectedMonthOnly || '';
    this.selectedYearOnly = filterState.selectedYearOnly || '';
    this.selectedCategoryIds = [...(filterState.selectedCategoryIds ?? [])];
    if (!this.selectedCategoryIds.length && filterState.filterCategory) {
      this.selectedCategoryIds = [filterState.filterCategory];
    }
    this.selectedCategoryId =
      this.selectedCategoryIds.length === 1 ? this.selectedCategoryIds[0] : '';

    // Auto-select current month and year if "This Month" is selected but no month/year is set
    if (this.selectedPeriod === 'monthly' && (!this.selectedMonth || !this.selectedYear)) {
      const now = new Date();
      this.selectedMonth = now.getMonth().toString();
      this.selectedYear = now.getFullYear().toString();
    }
    
    // Auto-select current month and year if "Month Only" is selected but no month/year is set
    if (this.selectedPeriod === 'monthOnly' && (!this.selectedMonthOnly || !this.selectedYearOnly)) {
      const now = new Date();
      this.selectedMonthOnly = now.getMonth().toString();
      this.selectedYearOnly = now.getFullYear().toString();
      
      // Trigger the month only change to set the date range
      this.onMonthOnlyChange();
    }
  }

  onFilterChange() {
    // Auto-select current month and year when "This Month" is selected
    if (this.selectedPeriod === 'monthly') {
      const now = new Date();
      this.selectedMonth = now.getMonth().toString();
      this.selectedYear = now.getFullYear().toString();
    }
    
    // Auto-select current month and year when "Month Only" is selected
    if (this.selectedPeriod === 'monthOnly') {
      const now = new Date();
      this.selectedMonthOnly = now.getMonth().toString();
      this.selectedYearOnly = now.getFullYear().toString();
      
      // Trigger the month only change to set the date range
      this.onMonthOnlyChange();
    }
    
    this.persistSharedFilters();

    this.refreshQuickSummaryCards();
    this.refreshInsightsCache();
    this.cdr.markForCheck();
  }

  private refreshInsightsCache(): void {
    this.spendingAnalytics = this.getSpendingAnalytics();
    this.smartRecommendations = this.getSmartRecommendations();
  }

  onCategoryFilterChange(): void {
    this.selectedCategoryIds = this.selectedCategoryId ? [this.selectedCategoryId] : [];
    this.onFilterChange();
  }

  private applySharedFilterState(state: FilterState): void {
    this.selectedPeriod = state.selectedPeriod;
    this.selectedMonth = state.selectedMonth;
    this.selectedYear = state.selectedYear;
    this.customStartDate = state.customStartDate;
    this.customEndDate = state.customEndDate;
    this.selectedMonthOnly = state.selectedMonthOnly || '';
    this.selectedYearOnly = state.selectedYearOnly || '';
    this.selectedCategoryIds = [...(state.selectedCategoryIds ?? [])];
    if (!this.selectedCategoryIds.length && state.filterCategory) {
      this.selectedCategoryIds = [state.filterCategory];
    }
    this.selectedCategoryId =
      this.selectedCategoryIds.length === 1 ? this.selectedCategoryIds[0] : '';
    this.refreshQuickSummaryCards();
    this.refreshInsightsCache();
    this.cdr.markForCheck();
  }

  private persistSharedFilters(): void {
    const range = resolveDateRangeFromFilterState({
      selectedPeriod: this.selectedPeriod,
      selectedMonth: this.selectedMonth,
      selectedYear: this.selectedYear,
      customStartDate: this.customStartDate,
      customEndDate: this.customEndDate,
      selectedMonthOnly: this.selectedMonthOnly,
      selectedYearOnly: this.selectedYearOnly
    });

    this.syncingSharedFilters = true;
    this.filterStateService.updateFilterState({
      selectedPeriod: this.selectedPeriod,
      selectedMonth: this.selectedMonth,
      selectedYear: this.selectedYear,
      customStartDate:
        this.selectedPeriod === 'custom' ? this.customStartDate : range.startDate,
      customEndDate:
        this.selectedPeriod === 'custom' ? this.customEndDate : range.endDate,
      selectedMonthOnly: this.selectedMonthOnly,
      selectedYearOnly: this.selectedYearOnly,
      selectedCategoryIds: [...this.selectedCategoryIds],
      filterCategory:
        this.selectedCategoryIds.length === 1 ? this.selectedCategoryIds[0] : '',
      selectedDatePreset: this.mapPeriodToDatePreset(),
      filterYear: '',
      filterMonth: ''
    });
    queueMicrotask(() => {
      this.syncingSharedFilters = false;
    });
  }

  private mapPeriodToDatePreset(): string {
    switch (this.selectedPeriod) {
      case 'all':
        return 'all';
      case 'monthly':
        return 'thisMonth';
      case 'yearly':
        return 'thisYear';
      case 'last30':
        return 'last30';
      case 'last7':
        return 'last7';
      default:
        return 'custom';
    }
  }

  // Custom date range methods
  onCustomDateChange() {
    // This method is called when either start or end date changes
    // Automatically apply the filter when both dates are selected and valid
    if (this.customStartDate && this.customEndDate && this.isCustomDateRangeValid()) {
      this.onFilterChange();
    }
  }

  onMonthOnlyChange() {
    if (this.selectedMonthOnly && this.selectedYearOnly) {
      // Set the custom date range to the selected month
      const monthIndex = parseInt(this.selectedMonthOnly);
      const year = parseInt(this.selectedYearOnly);
      
      // Create start date (first day of the month) - use UTC to avoid timezone issues
      const startDate = new Date(Date.UTC(year, monthIndex, 1));
      
      // Create end date (last day of the month) - use UTC to avoid timezone issues
      const endDate = new Date(Date.UTC(year, monthIndex + 1, 0));
      
      // Format dates as YYYY-MM-DD using UTC methods to avoid timezone issues
      const formatDate = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      this.customStartDate = formatDate(startDate);
      this.customEndDate = formatDate(endDate);
      // Save filter state directly without calling onFilterChange to avoid recursion
      this.filterStateService.updateFilterState({
        selectedPeriod: this.selectedPeriod,
        selectedMonth: this.selectedMonth,
        selectedYear: this.selectedYear,
        customStartDate: this.customStartDate,
        customEndDate: this.customEndDate,
        selectedMonthOnly: this.selectedMonthOnly,
        selectedYearOnly: this.selectedYearOnly
      });

      this.refreshQuickSummaryCards();
      this.cdr.markForCheck();
    }
  }

  isCustomDateRangeValid(): boolean {
    if (!this.customStartDate || !this.customEndDate) {
      return false;
    }
    
    const startDate = new Date(this.customStartDate);
    const endDate = new Date(this.customEndDate);
    
    return startDate <= endDate;
  }



  clearCustomDateRange() {
    this.customStartDate = '';
    this.customEndDate = '';
    
    // Trigger change detection
    this.onFilterChange();
  }

  // Legacy method for backward compatibility
  openDatePicker() {
    // Set default date range (last 30 days)
    this.setDefaultDateRange('last30');
  }

  // Set default date ranges
  setDefaultDateRange(range: 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth') {
    const today = new Date();
    let startDate: Date;
    
    switch (range) {
      case 'last7':
        startDate = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
        break;
      case 'last30':
        startDate = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
        break;
      case 'last90':
        startDate = new Date(today.getTime() - (90 * 24 * 60 * 60 * 1000));
        break;
      case 'thisMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'lastMonth':
        startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endDate = new Date(today.getFullYear(), today.getMonth(), 0);
        this.customStartDate = startDate.toISOString().split('T')[0];
        this.customEndDate = endDate.toISOString().split('T')[0];
        this.onFilterChange();
        return;
    }
    
    this.customStartDate = startDate.toISOString().split('T')[0];
    this.customEndDate = today.toISOString().split('T')[0];
    // Apply the filter
    this.onFilterChange();
  }

  get categoryTotals(): { [key: string]: number } {
    const totals: { [key: string]: number } = {};
    const filteredExpenses = this.getFilteredExpenses();
    this.categories.forEach(category => {
      totals[category.id] = filteredExpenses
        .filter(expense => expense.categoryId === category.id)
        .reduce((sum, expense) => sum + expense.amount, 0);
    });
    return totals;
  }



  get monthlyTotal(): number {
    return this.currentMonthTotal;
  }

  // Get recent expenses sorted by date (most recent first) - using filtered expenses
  getRecentExpensesSorted(): Expense[] {
    const filteredExpenses = this.getFilteredExpenses();
    const sortedExpenses = [...filteredExpenses]
      .sort((a, b) => {
        // Ensure proper date parsing and handle potential timezone issues
        const dateA = new Date(a.date + 'T00:00:00');
        const dateB = new Date(b.date + 'T00:00:00');
        
        // First sort by date descending (latest first)
        const dateComparison = dateB.getTime() - dateA.getTime();
        
        // If dates are the same, sort by creation timestamp (newer expenses come first)
        if (dateComparison === 0) {
          // If both have createdAt, sort by timestamp
          if (a.createdAt && b.createdAt) {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          }
          // If only one has createdAt, prioritize the one with timestamp (newer)
          else if (a.createdAt && !b.createdAt) {
            return -1; // a comes first (has timestamp)
          }
          else if (!a.createdAt && b.createdAt) {
            return 1; // b comes first (has timestamp)
          }
          // If neither has createdAt, fall back to ID comparison
          else {
            return b.id.localeCompare(a.id);
          }
        }
        
        return dateComparison;
      })
      .slice(0, 5);
    
    // Debug logging to verify sorting
    if (sortedExpenses.length > 0) {
    }
    
    return sortedExpenses;
  }

  // Get filtered expenses sorted by amount in descending order
  getFilteredExpensesSorted(): Expense[] {
    return this.getFilteredExpenses()
      .sort((a, b) => b.amount - a.amount); // Sort by amount descending
  }

  // Budget Progress - Return null since no budget is set
  getBudgetProgress(): BudgetProgress | null {
    return null; // No budget set by user
  }

  // Daily Average
  getDailyAverage(): number | null {
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const daysPassed = new Date().getDate();
    return this.currentMonthTotal / daysPassed;
  }

  // Potential Savings - Return 0 since no budget is set
  getPotentialSavings(): number {
    return 0; // No budget set by user
  }

  // Savings Tip - Return null since no budget is set
  getSavingsTip(): string | null {
    return null; // No budget set by user
  }

  // Insights
  getTopSpendingCategory(): { name: string; amount: number } | null {
    const filteredExpenses = this.getFilteredExpenses();
    if (filteredExpenses.length === 0) return null;
    
    // Calculate category breakdown for filtered expenses only
    const breakdown: { [key: string]: number } = {};
    
    filteredExpenses.forEach(expense => {
      const categoryId = expense.categoryId;
      if (breakdown[categoryId]) {
        breakdown[categoryId] += expense.amount;
      } else {
        breakdown[categoryId] = expense.amount;
      }
    });
    
    const categoryBreakdown = Object.entries(breakdown).map(([categoryId, amount]) => {
      const category = this.categories.find(c => c.id === categoryId);
      return {
        categoryId,
        categoryName: category?.name || 'Unknown',
        amount
      };
    }).sort((a, b) => b.amount - a.amount);
    
    if (categoryBreakdown.length === 0) return null;
    
    return {
      name: categoryBreakdown[0].categoryName,
      amount: categoryBreakdown[0].amount
    };
  }

  getSpendingPattern(): string {
    const avgAmount = this.getFilteredTotal() / Math.max(this.getFilteredExpenses().length, 1);
    if (avgAmount > 1000) return 'High Value';
    if (avgAmount > 500) return 'Medium Value';
    return 'Low Value';
  }

  getPatternDescription(): string {
    const pattern = this.getSpendingPattern();
    switch (pattern) {
      case 'High Value': return 'Large individual expenses';
      case 'Medium Value': return 'Moderate spending pattern';
      case 'Low Value': return 'Small frequent expenses';
      default: return 'Balanced spending';
    }
  }

  getQuickWin(): Insight | null {
    const topCategory = this.getTopSpendingCategory();
    if (topCategory && topCategory.amount > this.monthlyTotal * 0.4) {
      return {
        title: `Reduce ${topCategory.name} spending`,
        description: this.getFilteredTotal() > 0 ? `This category represents ${((topCategory.amount / this.getFilteredTotal()) * 100).toFixed(1)}% of your expenses` : 'This category has no expenses'
      };
    }
    return null;
  }

  getAchievement(): Insight | null {
    if (this.currentMonthTotal < this.monthlyTotal * 0.5) {
      return {
        title: 'Budget Master!',
        description: 'You\'re under 50% of your monthly budget'
      };
    }
    return null;
  }

  // Monthly Trends Chart
  getMonthlyTrends(): MonthlyTrend[] {
    const months = [];
    const colors = ['#4f46e5', '#6366f1', '#7c3aed', '#0d9488', '#0891b2', '#64748b'];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      
      const monthExpenses = this.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === date.getMonth() && 
               expenseDate.getFullYear() === date.getFullYear();
      });
      
      const amount = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const maxAmount = Math.max(...this.getMonthlyAmounts());
      const percentage = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
      
      months.push({
        name: date.toLocaleDateString('en-US', { month: 'short' }),
        amount,
        percentage,
        color: colors[i]
      });
    }
    
    return months;
  }

  private getMonthlyAmounts(): number[] {
    const amounts = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      
      const monthExpenses = this.expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === date.getMonth() && 
               expenseDate.getFullYear() === date.getFullYear();
      });
      
      amounts.push(monthExpenses.reduce((sum, expense) => sum + expense.amount, 0));
    }
    return amounts;
  }

  // Actions
  toggleInsights(): void {
    this.showInsights = !this.showInsights;
    
    // Scroll to insights section if showing insights
    if (this.showInsights) {
      setTimeout(() => {
        const insightsSection = document.getElementById('insights-section');
        if (insightsSection) {
          // Calculate offset to account for any fixed headers
          const offset = 80; // Adjust this value based on your header height
          const elementPosition = insightsSection.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;
          
          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }
      }, 150); // Slightly longer delay to ensure the section is fully rendered
    }
  }

  // Enhanced Data Insights and Smart Features
  getSmartInsights(): Insight[] {
    const insights: Insight[] = [];
    
    // Spending Pattern Analysis
    const avgAmount = this.getFilteredTotal() / Math.max(this.getFilteredExpenses().length, 1);
    if (avgAmount > 1000) {
      insights.push({
        title: 'High-Value Spending Pattern',
        description: `Your average expense is ₹${avgAmount.toFixed(0)}, indicating large purchases. Consider breaking down big expenses.`
      });
    }
    
    // Category Concentration Warning
    const topCategory = this.getTopSpendingCategory();
    if (topCategory && this.getFilteredTotal() > 0 && (topCategory.amount / this.getFilteredTotal()) > 0.5) {
      insights.push({
        title: 'Category Concentration Alert',
        description: this.getFilteredTotal() > 0 ? `${topCategory.name} represents ${((topCategory.amount / this.getFilteredTotal()) * 100).toFixed(1)}% of your spending. Consider diversifying.` : 'No spending data available'
      });
    }
    
    // Weekly Spending Trend
    const weeklyAvg = this.weeklyTotal;
    if (weeklyAvg > this.currentMonthTotal / 4) {
      insights.push({
        title: 'High Weekly Spending',
        description: `This week's spending (₹${weeklyAvg.toFixed(0)}) is above average. Monitor your daily expenses.`
      });
    }
    
    // Savings Opportunity
    const potentialSavings = this.getPotentialSavings();
    if (potentialSavings > 0) {
      insights.push({
        title: 'Savings Opportunity',
        description: `You could save ₹${potentialSavings.toFixed(0)} by optimizing your spending patterns.`
      });
    }
    
    return insights;
  }

  // Quick Actions Data
  getQuickActions(): { title: string; action: string; icon: string; route?: string; method?: () => void }[] {
    return [
      {
        title: 'Add Expense',
        action: 'Quick Entry',
        icon: '➕',
        route: '/expenses'
      },
      {
        title: 'View Reports',
        action: 'Monthly Analysis',
        icon: '📊',
        route: '/reports'
      },
      {
        title: 'Expense Analysis',
        action: 'Category Breakdown',
        icon: '📈',
        route: '/analysis'
      },
      {
        title: 'Manage Categories',
        action: 'Organize',
        icon: '🏷️',
        route: '/categories'
      },
      {
        title: 'Export Data',
        action: 'Download',
        icon: '📥',
        method: () => this.exportData()
      }
    ];
  }

  // Enhanced Spending Analytics
  getSpendingAnalytics(): any {
    const expenses = this.getFilteredExpenses();
    const total = this.getFilteredTotal();
    
    return {
      totalExpenses: expenses.length,
      totalAmount: total,
      averagePerExpense: expenses.length > 0 ? total / expenses.length : 0,
      highestExpense: Math.max(...expenses.map(e => e.amount)),
      lowestExpense: Math.min(...expenses.map(e => e.amount)),
      mostExpensiveCategory: this.getMostExpensiveCategory(),
      leastExpensiveCategory: this.getLeastExpensiveCategory(),
      spendingByDay: this.getSpendingByDay(),
      spendingByWeek: this.getSpendingByWeek(),
      spendingByMonth: this.getSpendingByMonth(),
      topExpenses: this.getTopExpenses(5),
      recentTrend: this.getRecentSpendingTrend()
    };
  }

  // Get most expensive category
  getMostExpensiveCategory(): { name: string; amount: number; percentage: number } | null {
    const categoryTotals = this.categoryTotals;
    const total = this.getFilteredTotal();
    if (total === 0) return null;
    
    const maxCategory = Object.entries(categoryTotals)
      .reduce((max, [id, amount]) => amount > max.amount ? { id, amount } : max, { id: '', amount: 0 });
    
    const category = this.categories.find(c => c.id === maxCategory.id);
    return {
      name: category?.name || 'Unknown',
      amount: maxCategory.amount,
      percentage: (maxCategory.amount / total) * 100
    };
  }

  // Get least expensive category
  getLeastExpensiveCategory(): { name: string; amount: number; percentage: number } | null {
    const categoryTotals = this.categoryTotals;
    const total = this.getFilteredTotal();
    if (total === 0) return null;
    
    const minCategory = Object.entries(categoryTotals)
      .reduce((min, [id, amount]) => amount < min.amount ? { id, amount } : min, { id: '', amount: Infinity });
    
    const category = this.categories.find(c => c.id === minCategory.id);
    return {
      name: category?.name || 'Unknown',
      amount: minCategory.amount,
      percentage: (minCategory.amount / total) * 100
    };
  }

  // Get spending by day of week
  getSpendingByDay(): { day: string; amount: number; count: number }[] {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const spendingByDay: { [key: string]: { amount: number; count: number } } = {};
    
    days.forEach(day => {
      spendingByDay[day] = { amount: 0, count: 0 };
    });
    
    this.getFilteredExpenses().forEach(expense => {
      const day = new Date(expense.date).toLocaleDateString('en-US', { weekday: 'long' });
      spendingByDay[day].amount += expense.amount;
      spendingByDay[day].count += 1;
    });
    
    return days.map(day => ({
      day,
      amount: spendingByDay[day].amount,
      count: spendingByDay[day].count
    }));
  }

  // Get spending by week
  getSpendingByWeek(): { week: string; amount: number; count: number }[] {
    const weeks: { [key: string]: { amount: number; count: number } } = {};
    
    this.getFilteredExpenses().forEach(expense => {
      const date = new Date(expense.date);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      if (!weeks[weekKey]) {
        weeks[weekKey] = { amount: 0, count: 0 };
      }
      weeks[weekKey].amount += expense.amount;
      weeks[weekKey].count += 1;
    });
    
    return Object.entries(weeks)
      .map(([week, data]) => ({
        week: new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => new Date(a.week).getTime() - new Date(b.week).getTime());
  }

  // Get spending by month
  getSpendingByMonth(): { month: string; amount: number; count: number }[] {
    const months: { [key: string]: { amount: number; count: number } } = {};
    
    this.getFilteredExpenses().forEach(expense => {
      const date = new Date(expense.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!months[monthKey]) {
        months[monthKey] = { amount: 0, count: 0 };
      }
      months[monthKey].amount += expense.amount;
      months[monthKey].count += 1;
    });
    
    return Object.entries(months)
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
        amount: data.amount,
        count: data.count
      }))
      .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime());
  }

  // Get top expenses
  getTopExpenses(count: number): Expense[] {
    return [...this.getFilteredExpenses()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, count);
  }

  // Get recent spending trend
  getRecentSpendingTrend(): { trend: 'increasing' | 'decreasing' | 'stable'; percentage: number } {
    const recentExpenses = this.getRecentExpensesSorted().slice(0, 10);
    if (recentExpenses.length < 5) return { trend: 'stable', percentage: 0 };
    
    const midPoint = Math.floor(recentExpenses.length / 2);
    const firstHalf = recentExpenses.slice(0, midPoint);
    const secondHalf = recentExpenses.slice(midPoint);
    
    const firstHalfTotal = firstHalf.reduce((sum, e) => sum + e.amount, 0);
    const secondHalfTotal = secondHalf.reduce((sum, e) => sum + e.amount, 0);
    
    if (firstHalfTotal === 0) return { trend: 'stable', percentage: 0 };
    
    const percentage = ((secondHalfTotal - firstHalfTotal) / firstHalfTotal) * 100;
    
    if (percentage > 10) return { trend: 'increasing', percentage };
    if (percentage < -10) return { trend: 'decreasing', percentage };
    return { trend: 'stable', percentage };
  }

  exportData(): void {
    void this.backupRestoreService.exportAndDownload({
      includeTrades: true,
      includeUserSettings: true
    });
  }

  // Smart Recommendations
  getSmartRecommendations(): { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] {
    const recommendations: { title: string; description: string; priority: 'high' | 'medium' | 'low' }[] = [];
    

    
    // Category concentration
    const topCategory = this.getTopSpendingCategory();
    if (topCategory && this.getFilteredTotal() > 0 && (topCategory.amount / this.getFilteredTotal()) > 0.6) {
      recommendations.push({
        title: 'Category Diversification',
        description: `Consider reducing spending in ${topCategory.name} category.`,
        priority: 'medium'
      });
    }
    
    // Large expenses
    const largeExpenses = this.expenses.filter(e => e.amount > 1000);
    if (largeExpenses.length > 3) {
      recommendations.push({
        title: 'Large Expenses Review',
        description: 'You have several large expenses. Consider if all are necessary.',
        priority: 'medium'
      });
    }
    
    return recommendations;
  }

  // Enhanced filter with smart defaults
  getSmartFilters(): { label: string; value: string; description: string }[] {
    return [
      { label: 'All Time', value: 'all', description: 'Complete expense history' },
      { label: 'This Month', value: 'monthly', description: 'Current month expenses' },
      { label: 'This Year', value: 'yearly', description: 'Current year expenses' },
      { label: 'Last 30 Days', value: 'last30', description: 'Recent month activity' },
      { label: 'Last 7 Days', value: 'last7', description: 'This week\'s expenses' },
      { label: 'Specific Month/Year', value: 'monthOnly', description: 'Select specific month and year' },
      { label: 'Custom Range', value: 'custom', description: 'Select specific dates' }
    ];
  }

  // Quick summary cards data
  refreshQuickSummaryCards(): void {
    this.quickSummaryCards = this.buildQuickSummaryCards();
  }

  private buildQuickSummaryCards(): {
    title: string;
    value: string;
    amount?: number;
    change: string;
    trend: 'up' | 'down' | 'stable';
    icon: string;
  }[] {
    const topCategory = this.getTopSpendingCategory();
    const filteredTotal = this.getFilteredTotal();
    const filteredExpenses = this.getFilteredExpenses();
    const averagePerExpense = filteredTotal / Math.max(filteredExpenses.length, 1);
    
    return [
      {
        title: 'Total Spent',
        value: '',
        amount: filteredTotal,
        change: 'Current period',
        trend: 'stable',
        icon: '💰'
      },
      {
        title: 'Expense Count',
        value: filteredExpenses.length.toString(),
        change: `${filteredExpenses.length} this period`,
        trend: 'stable',
        icon: '📊'
      },
      {
        title: 'Average Per Expense',
        value: '',
        amount: averagePerExpense,
        change: 'Per transaction',
        trend: 'stable',
        icon: '📈'
      },
      {
        title: 'Top Category',
        value: topCategory?.name || 'No Data',
        change: topCategory && filteredTotal > 0 ? 
          `${((topCategory.amount / filteredTotal) * 100).toFixed(1)}%` : 
          'No expenses',
        trend: 'stable',
        icon: '🏷️'
      }
    ];
  }

  trackSummaryCard(index: number, card: { title: string }): string {
    return card.title;
  }

  // Get maximum spending amount for chart scaling
  getMaxSpendingAmount(): number {
    const spendingByDay = this.getSpendingByDay();
    if (spendingByDay.length === 0) return 0;
    return Math.max(...spendingByDay.map(d => d.amount));
  }

  // Get current month name for display
  getCurrentMonthName(): string {
    const now = new Date();
    return now.toLocaleDateString('en-US', { month: 'long' });
  }

  // Get current year for display
  getCurrentYear(): string {
    const now = new Date();
    return now.getFullYear().toString();
  }

  // Get selected month name for display
  getSelectedMonthName(): string {
    const monthIndex = parseInt(this.selectedMonth);
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    return months[monthIndex] || 'January';
  }

  // Get selected year for display
  getSelectedYear(): string {
    return this.selectedYear || new Date().getFullYear().toString();
  }

  // Available months for selection
  availableMonths: { value: string; label: string }[] = [
    { value: '0', label: 'January' },
    { value: '1', label: 'February' },
    { value: '2', label: 'March' },
    { value: '3', label: 'April' },
    { value: '4', label: 'May' },
    { value: '5', label: 'June' },
    { value: '6', label: 'July' },
    { value: '7', label: 'August' },
    { value: '8', label: 'September' },
    { value: '9', label: 'October' },
    { value: '10', label: 'November' },
    { value: '11', label: 'December' }
  ];

  // Available years for selection
  availableYears: string[] = [];

  // Get last week total
  getLastWeekTotal(): number {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    return this.expenses
      .filter(expense => new Date(expense.date) >= oneWeekAgo)
      .reduce((total, expense) => total + expense.amount, 0);
  }

} 