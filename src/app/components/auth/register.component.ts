import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DefaultCategoriesService } from '../../core/services/default-categories.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-brand">
            <span class="auth-brand-icon">💰</span>
            <h1 class="auth-brand-title">Expense Tracker</h1>
          </div>
          <p class="auth-subtitle">Create your account to start tracking expenses</p>
        </div>

        <form (ngSubmit)="register()" #registerForm="ngForm" class="auth-form">
          <div class="form-group">
            <label for="displayName" class="form-label">Full Name</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              [(ngModel)]="displayName"
              required
              class="form-control"
              placeholder="Enter your full name">
          </div>

          <div class="form-group">
            <label for="email" class="form-label">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              [(ngModel)]="email"
              required
              class="form-control"
              placeholder="Enter your email">
          </div>

          <div class="form-group">
            <label for="password" class="form-label">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              [(ngModel)]="password"
              required
              minlength="6"
              class="form-control"
              placeholder="Enter your password (min 6 characters)">
          </div>

          <div class="form-group">
            <label for="confirmPassword" class="form-label">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              [(ngModel)]="confirmPassword"
              required
              class="form-control"
              placeholder="Confirm your password">
          </div>

          <div class="auth-actions">
            <button
              type="submit"
              class="auth-btn-primary"
              [disabled]="!registerForm.form.valid || loading || !passwordsMatch()">
              <span *ngIf="loading">⏳</span>
              <span *ngIf="!loading">Create Account</span>
            </button>
          </div>
        </form>

        <div class="auth-footer">
          <p>Already have an account? <a (click)="goToLogin()" class="auth-link">Sign in</a></p>
        </div>

        <div *ngIf="error" class="auth-error">{{ error }}</div>
      </div>
    </div>
  `
})
export class RegisterComponent {
  displayName: string = '';
  email: string = '';
  password: string = '';
  confirmPassword: string = '';
  loading: boolean = false;
  error: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private defaultCategoriesService: DefaultCategoriesService
  ) {}

  async register() {
    if (!this.displayName || !this.email || !this.password || !this.confirmPassword) {
      this.error = 'Please fill in all fields';
      return;
    }

    if (!this.passwordsMatch()) {
      this.error = 'Passwords do not match';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'Password must be at least 6 characters long';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await this.authService.register(this.email, this.password, this.displayName);
      await this.defaultCategoriesService.createDefaultCategories();
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.error = this.getErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  passwordsMatch(): boolean {
    return this.password === this.confirmPassword;
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Please sign in instead or use a different email.';
    } else if (error.code === 'auth/invalid-email') {
      return 'Invalid email address. Please enter a valid email format.';
    } else if (error.code === 'auth/weak-password') {
      return 'Password is too weak. Please choose a stronger password with at least 6 characters.';
    } else if (error.code === 'auth/operation-not-allowed') {
      return 'Email/password accounts are not enabled. Please contact support.';
    } else if (error.code === 'auth/network-request-failed') {
      return 'Network error. Please check your internet connection and try again.';
    } else {
      return 'An error occurred during registration. Please try again.';
    }
  }
}
