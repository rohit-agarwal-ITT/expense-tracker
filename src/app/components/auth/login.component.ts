import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
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
          <p class="auth-subtitle">Sign in to manage your expenses</p>
        </div>

        <form (ngSubmit)="signIn()" #loginForm="ngForm" class="auth-form">
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
            <div class="auth-password-wrap">
              <input
                [type]="showPassword ? 'text' : 'password'"
                id="password"
                name="password"
                [(ngModel)]="password"
                required
                class="form-control"
                placeholder="Enter your password">
              <button
                type="button"
                class="auth-password-toggle"
                (click)="togglePasswordVisibility()"
                [attr.aria-label]="showPassword ? 'Hide password' : 'Show password'">
                {{ showPassword ? '🙈' : '👁️' }}
              </button>
            </div>
            <div class="auth-link-row">
              <a (click)="goToForgotPassword()" class="auth-link">Forgot Password?</a>
            </div>
          </div>

          <div class="auth-actions">
            <button
              type="submit"
              class="auth-btn-primary"
              [disabled]="!loginForm.form.valid || loading">
              <span *ngIf="loading">⏳</span>
              <span *ngIf="!loading">Sign In</span>
            </button>
          </div>
        </form>

        <div class="auth-footer">
          <p>Don't have an account? <a (click)="goToRegister()" class="auth-link">Sign up</a></p>
        </div>

        <div *ngIf="error" class="auth-error">{{ error }}</div>
      </div>
    </div>
  `
})
export class LoginComponent {
  email: string = '';
  password: string = '';
  loading: boolean = false;
  error: string = '';
  showPassword: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async signIn() {
    if (!this.email || !this.password) {
      this.error = 'Please enter both email and password';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await this.authService.signIn(this.email, this.password);
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.error = this.getErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }

  goToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'auth/user-not-found') {
      return 'No account found with this email address. Please check your email or create a new account.';
    } else if (error.code === 'auth/wrong-password') {
      return 'Incorrect password. Please check your password and try again.';
    } else if (error.code === 'auth/invalid-email') {
      return 'Invalid email address. Please enter a valid email format.';
    } else if (error.code === 'auth/too-many-requests') {
      return 'Too many failed attempts. Please wait a few minutes and try again.';
    } else if (error.code === 'auth/network-request-failed') {
      return 'Network error. Please check your internet connection and try again.';
    } else {
      return 'An error occurred during sign-in. Please try again.';
    }
  }
}
