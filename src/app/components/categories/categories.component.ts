import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoryService } from '../../core/services/category.service';
import { ExpenseService } from '../../core/services/expense.service';
import { FirebaseService } from '../../core/services/firebase.service';
import { DialogService } from '../../core/services/dialog.service';
import { LoadingComponent } from '../../shared/components/loading/loading.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { IndianCurrencyComponent } from '../../shared/components/indian-currency/indian-currency.component';
import { deferHeavyWork } from '../../core/utils/defer-heavy-work.util';
import { Category } from '../../core/models/category.model';
import { Expense } from '../../core/models/expense.model';
import { Subscription, combineLatest } from 'rxjs';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingComponent, PageHeaderComponent, IndianCurrencyComponent],
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoriesComponent implements OnInit, OnDestroy {
  categories: Category[] = [];
  expenses: Expense[] = [];
  newCategory: Category = {
    id: '',
    name: '',
    color: '#ff6b9d',
    icon: '📌'
  };

  // Enhanced filtering and search
  searchTerm: string = '';
  filterByUsage: 'all' | 'used' | 'unused' = 'used';
  sortBy: 'name' | 'usage' | 'amount' = 'usage';
  sortOrder: 'asc' | 'desc' = 'desc';
  showAdvancedOptions: boolean = false;

  // Validation properties
  isDuplicateCategory: boolean = false;
  isEditMode: boolean = false;
  editingCategoryId: string = '';

  // Analytics
  totalCategories: number = 0;
  usedCategories: number = 0;
  unusedCategories: number = 0;
  mostUsedCategory: Category | null = null;
  leastUsedCategory: Category | null = null;

  // Loading states
  isLoading = false;
  isUpdatingIcons: boolean = false;

  /** Cached expense count and total amount per category id */
  categoryStats: Record<string, { count: number; amount: number }> = {};

  private subscription: Subscription = new Subscription();

  constructor(
    private categoryService: CategoryService,
    private expenseService: ExpenseService,
    private firebaseService: FirebaseService,
    private dialogService: DialogService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.isLoading = !this.firebaseService.hasCoreDataCached;

    // Subscribe to Firebase observables for real-time updates using combineLatest for efficiency
    this.subscription.add(
      combineLatest([
        this.firebaseService.categories$,
        this.firebaseService.expenses$
      ]).subscribe(([categories, expenses]) => {
        this.categories = categories;
        this.expenses = expenses;
        this.cdr.markForCheck();
        deferHeavyWork(() => {
          this.calculateAnalytics();
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

    // Firebase observables will automatically load data when user is authenticated
    // No need for manual loadData() call as it creates redundant API requests
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  async loadData() {
    try {
      this.isLoading = true;
      this.cdr.markForCheck(); // Trigger change detection for OnPush
      this.categories = await this.categoryService.getAll();
      this.expenses = await this.expenseService.getAll();
      this.calculateAnalytics();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck(); // Trigger change detection for OnPush
    }
  }

  calculateAnalytics() {
    this.refreshCategoryStats();
    this.totalCategories = this.categories.length;
    
    // Calculate usage statistics
    const categoryUsage = this.getCategoryUsageStats();
    this.usedCategories = Object.keys(categoryUsage).length;
    this.unusedCategories = this.totalCategories - this.usedCategories;
    
    // Find most and least used categories
    if (Object.keys(categoryUsage).length > 0) {
      const sortedUsage = Object.entries(categoryUsage).sort((a, b) => b[1] - a[1]);
      this.mostUsedCategory = this.categories.find(cat => cat.id === sortedUsage[0][0]) || null;
      this.leastUsedCategory = this.categories.find(cat => cat.id === sortedUsage[sortedUsage.length - 1][0]) || null;
    }
  }

  private refreshCategoryStats(): void {
    const stats: Record<string, { count: number; amount: number }> = {};

    for (const expense of this.expenses) {
      if (!expense.categoryId) {
        continue;
      }
      if (!stats[expense.categoryId]) {
        stats[expense.categoryId] = { count: 0, amount: 0 };
      }
      stats[expense.categoryId].count += 1;
      stats[expense.categoryId].amount += expense.amount;
    }

    this.categoryStats = stats;
  }

  getCategoryUsageStats(): { [key: string]: number } {
    const usage: { [key: string]: number } = {};
    for (const [id, stat] of Object.entries(this.categoryStats)) {
      usage[id] = stat.count;
    }
    return usage;
  }

  getCategoryTotalAmount(categoryId: string): number {
    return this.categoryStats[categoryId]?.amount ?? 0;
  }

  async initializeDefaultCategories() {
    try {
      await this.categoryService.forceInitializeDefaultCategories();
      await this.loadData();
      await this.dialogService.success('Default categories initialized successfully!');
    } catch (error) {
      console.error('Error initializing default categories:', error);
      await this.dialogService.error('Error initializing default categories. Please try again.');
    }
  }

  async addCategory() {
    if (!(await this.validateCategory())) {
      return;
    }

    try {
      const categoryData: Omit<Category, 'id'> = {
        name: this.newCategory.name.trim(),
        color: this.newCategory.color,
        icon: this.newCategory.icon
      };

      const id = await this.categoryService.add(categoryData);
      
      this.resetForm();
      await this.dialogService.success('Category added successfully!');
    } catch (error) {
      console.error('Error adding category:', error);
      await this.dialogService.error('Error adding category. Please try again.');
    }
  }

  async updateCategory(category: Category) {
    try {
      const result = await this.dialogService.form([
        {
          name: 'name',
          label: 'Category Name',
          type: 'text',
          value: category.name,
          placeholder: 'Enter category name...',
          required: true
        },
        {
          name: 'color',
          label: 'Category Color',
          type: 'color',
          value: category.color || '#ff6b9d',
          required: true
        },
        {
          name: 'icon',
          label: 'Category Icon',
          type: 'text',
          value: category.icon || '📌',
          placeholder: 'Enter emoji icon...',
          required: true
        }
      ], 'Edit Category', 'Update your category details:');

      if (!result) {
        return;
      }

      const updatedCategory: Category = {
        ...category,
        name: result['name'].trim(),
        color: result['color'],
        icon: result['icon'].trim()
      };

      await this.categoryService.update(updatedCategory);
      await this.loadData();
      await this.dialogService.success('Category updated successfully!');
    } catch (error) {
      console.error('Error updating category:', error);
      await this.dialogService.error('Error updating category. Please try again.');
    }
  }

  async deleteCategory(category: Category) {
    const confirmed = await this.dialogService.confirm(
      `Are you sure you want to delete "${category.name}"?\n\nThis will also remove all expenses in this category.`,
      'Delete Category'
    );
    if (!confirmed) return;

    try {
      await this.categoryService.delete(category.id);
      await this.dialogService.success('Category deleted successfully!');
    } catch (error) {
      console.error('Error deleting category:', error);
      await this.dialogService.error('Error deleting category. Please try again.');
    }
  }

  confirmDelete(category: Category) {
    this.deleteCategory(category);
  }

  async validateCategory(): Promise<boolean> {
    if (!this.newCategory.name?.trim()) {
      await this.dialogService.warning('Please enter a category name.');
      return false;
    }

    // Check for duplicates
    const isDuplicate = this.categories.some(cat => 
      cat.name.toLowerCase().trim() === this.newCategory.name.toLowerCase().trim() &&
      cat.id !== this.editingCategoryId
    );

    if (isDuplicate) {
      this.isDuplicateCategory = true;
      await this.dialogService.warning('Category name already exists!');
      return false;
    }

    this.isDuplicateCategory = false;
    return true;
  }

  clearValidationErrors() {
    this.isDuplicateCategory = false;
  }

  resetForm() {
    this.newCategory = {
      id: '',
      name: '',
      color: '#ff6b9d',
      icon: '📌'
    };
    this.isEditMode = false;
    this.editingCategoryId = '';
    this.clearValidationErrors();
  }

  getFilteredCategories(): Category[] {
    let filtered = [...this.categories];
    
    // Search filter
    if (this.searchTerm) {
      filtered = filtered.filter(category => 
        category.name.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
        (category.icon || '').includes(this.searchTerm)
      );
    }
    
    // Usage filter
    if (this.filterByUsage !== 'all') {
      const usageStats = this.getCategoryUsageStats();
      if (this.filterByUsage === 'used') {
        filtered = filtered.filter(category => usageStats[category.id] > 0);
      } else if (this.filterByUsage === 'unused') {
        filtered = filtered.filter(category => !usageStats[category.id] || usageStats[category.id] === 0);
      }
    }
    
    // Sort
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (this.sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'usage':
          const usageStats = this.getCategoryUsageStats();
          aValue = usageStats[a.id] || 0;
          bValue = usageStats[b.id] || 0;
          break;
        case 'amount':
          aValue = this.categoryStats[a.id]?.amount ?? 0;
          bValue = this.categoryStats[b.id]?.amount ?? 0;
          break;
        default:
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
      }
      
      if (this.sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    return filtered;
  }

  getCategoryUsage(categoryId: string): number {
    return this.categoryStats[categoryId]?.count ?? 0;
  }

  clearSearch() {
    this.searchTerm = '';
  }

  generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  getColorPresets(): string[] {
    return [
      '#ff6b9d', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57',
      '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#ff9f43',
      '#ff6348', '#2ed573', '#1e90ff', '#ffa502', '#ff3838'
    ];
  }

  getIconPresets(): string[] {
    return [
      '📌', '🍔', '🚗', '🏠', '💊', '🎬', '🛒', '✈️', '🎓', '💻',
      '📱', '🎮', '🏋️', '🎨', '📚', '🎵', '🎪', '🏥', '💇', '💄'
    ];
  }

  selectColor(color: string) {
    this.newCategory.color = color;
  }

  selectIcon(icon: string) {
    this.newCategory.icon = icon;
  }

  setRandomColor() {
    const colors = this.getColorPresets();
    this.newCategory.color = colors[Math.floor(Math.random() * colors.length)];
  }

  setRandomIcon() {
    const icons = this.getIconPresets();
    this.newCategory.icon = icons[Math.floor(Math.random() * icons.length)];
  }

  getCategoryCount(): number {
    return this.categories.length;
  }

  getTotalCategories(): number {
    return this.categories.length;
  }

  getMostUsedCategory(): Category | null {
    return this.mostUsedCategory;
  }

  getLeastUsedCategory(): Category | null {
    return this.leastUsedCategory;
  }

  async cleanupDuplicates() {
    const confirmed = await this.dialogService.confirm('This will remove duplicate categories. Continue?', 'Cleanup Duplicates');
    if (!confirmed) return;

    try {
      const uniqueCategories = this.categories.filter((category, index, self) => 
        index === self.findIndex(c => c.name.toLowerCase() === category.name.toLowerCase())
      );

      // Delete all categories and re-add unique ones
      for (const category of this.categories) {
        await this.categoryService.delete(category.id);
      }

      for (const category of uniqueCategories) {
        await this.categoryService.add({
          name: category.name,
          color: category.color || '#ff6b9d',
          icon: category.icon || '📌'
        });
      }

      await this.dialogService.success('Duplicate categories cleaned up successfully!');
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      await this.dialogService.error('Error cleaning up duplicates. Please try again.');
    }
  }

  hasOutdatedIcons(): boolean {
    // Define the new icon mappings (same as in service)
    const iconMappings: { [key: string]: string } = {
      'Food & Dining': '🍕',
      'Transportation': '🚙',
      'Shopping': '🛒',
      'Entertainment': '🎭',
      'Bills & Utilities': '⚡',
      'Healthcare': '🏥',
      'Education': '🎓',
      'Rent/Mortgage': '🏘️',
      'Insurance': '🛡️',
      'Savings': '💎',
      'Travel': '✈️',
      'Fitness & Sports': '🏃',
      'Personal Care': '💄',
      'Gifts & Donations': '🎁',
      'Technology': '💻',
      'Pet Care': '🐕',
      'Movie': '🎬',
      'Loan': '💳',
      'SIP': '📈',
      'Street food': '🌮',
      'Snooker': '🎱',
      'Tax': '📊',
      'Trips': '🧳',
      'EMI': '🏦',
      'Fuel': '⛽',
      'Office canteen': '🍽️'
    };

    // Check if any category has an outdated icon
    return this.categories.some(category => {
      const newIcon = iconMappings[category.name];
      return newIcon && category.icon !== newIcon;
    });
  }

  async updateCategoryIcons() {
    const confirmed = await this.dialogService.confirm(
      'This will update your existing category icons with new enhanced designs. Continue?',
      'Update Category Icons'
    );
    if (!confirmed) return;

    try {
      this.isUpdatingIcons = true;
      const updatedCount = await this.categoryService.updateCategoryIcons();
      // Service handles reload, just refresh local data
      await this.loadData();
      await this.dialogService.success(`Updated ${updatedCount} category icons with new enhanced icons!`);
    } catch (error) {
      console.error('Error updating category icons:', error);
      await this.dialogService.error('Error updating category icons. Please try again.');
    } finally {
      this.isUpdatingIcons = false;
    }
  }

  getAnalyticsInsights(): any[] {
    const insights = [];
    
    if (this.mostUsedCategory) {
      insights.push({
        type: 'most-used',
        title: 'Most Used Category',
        value: this.mostUsedCategory.name,
        icon: this.mostUsedCategory.icon,
        color: this.mostUsedCategory.color
      });
    }
    
    if (this.leastUsedCategory) {
      insights.push({
        type: 'least-used',
        title: 'Least Used Category',
        value: this.leastUsedCategory.name,
        icon: this.leastUsedCategory.icon,
        color: this.leastUsedCategory.color
      });
    }
    
    insights.push({
      type: 'stats',
      title: 'Category Statistics',
      value: `${this.usedCategories} used, ${this.unusedCategories} unused`,
      icon: '📊'
    });
    
    return insights;
  }

  // Show category expenses using dialog service
  async showCategoryExpenses(category: Category, event?: Event) {
    // Prevent event propagation if called from card click
    if (event) {
      event.stopPropagation();
    }
    
    const expenseCount = this.getCategoryUsage(category.id);
    const categoryExpenses = this.getExpensesForCategory(category.id);
    
    // Prepare expenses data for the dialog
    const expensesData = categoryExpenses.map(expense => ({
      id: expense.id,
      description: expense.description || 'No description',
      amount: expense.amount,
      date: expense.date,
      categoryId: expense.categoryId
    }));

    // Calculate total expense amount
    const totalAmount = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Create title with expense count
    const titleWithCount = `${category.name} (${expenseCount} ${expenseCount === 1 ? 'expense' : 'expenses'})`;

    // Show the expense list in the dialog (will show empty state if no expenses)
    await this.dialogService.showExpenseList(
      expensesData,
      titleWithCount,
      category.icon,
      category.color,
      expenseCount === 0 ? 'This category has no expenses yet.' : undefined,
      totalAmount
    );
  }

  // Get expenses for a specific category
  getExpensesForCategory(categoryId: string): Expense[] {
    return this.expenses.filter(expense => expense.categoryId === categoryId);
  }
} 