import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  confirmPasswordReset,
  verifyPasswordResetCode
} from '@angular/fire/auth';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page">
      <div class="auth-card auth-card--wide">
        <div class="auth-header">
          <div class="auth-brand">
            <span class="auth-brand-icon">💰</span>
            <h1 class="auth-brand-title">Expense Tracker</h1>
          </div>
          <p class="auth-subtitle">Set New Password</p>
        </div>

        <div *ngIf="!resetSuccess && !invalidCode">
          <p class="auth-instruction">
            Enter your new password below. Make sure it's secure and easy to remember.
          </p>

          <form (ngSubmit)="resetPassword()" #resetForm="ngForm" class="auth-form">
            <div class="form-group">
              <label for="password" class="form-label">New Password</label>
              <input
                type="password"
                id="password"
                name="password"
                [(ngModel)]="password"
                required
                minlength="6"
                class="form-control"
                placeholder="Enter your new password (min 6 characters)">
            </div>

            <div class="form-group">
              <label for="confirmPassword" class="form-label">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                [(ngModel)]="confirmPassword"
                required
                class="form-control"
                placeholder="Confirm your new password">
            </div>

            <div class="auth-actions">
              <button
                type="submit"
                class="auth-btn-primary"
                [disabled]="!resetForm.form.valid || loading || !passwordsMatch()">
                <span *ngIf="loading">⏳</span>
                <span *ngIf="!loading">Reset Password</span>
              </button>
            </div>
          </form>
        </div>

        <div *ngIf="resetSuccess" class="auth-success">
          <div class="auth-success-icon">✅</div>
          <h3 class="auth-success-title">Password Reset Successful!</h3>
          <p class="auth-instruction">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <div class="auth-actions">
            <button class="auth-btn-primary" (click)="goToLogin()">Sign In Now</button>
          </div>
        </div>

        <div *ngIf="invalidCode" class="auth-invalid-state">
          <div class="auth-success-icon">❌</div>
          <h3 class="auth-success-title">Invalid Reset Link</h3>
          <p class="auth-instruction">
            This password reset link is invalid or has expired. Please request a new reset link.
          </p>
          <div class="auth-actions">
            <button class="auth-btn-secondary" (click)="goToForgotPassword()">Request New Link</button>
          </div>
        </div>

        <div *ngIf="error" class="auth-error">{{ error }}</div>
      </div>
    </div>
  `
})
export class ResetPasswordComponent implements OnInit {
  password: string = '';
  confirmPassword: string = '';
  loading: boolean = false;
  resetSuccess: boolean = false;
  invalidCode: boolean = false;
  error: string = '';
  oobCode: string = '';

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.oobCode = params['oobCode'];
      if (!this.oobCode) {
        this.invalidCode = true;
        this.error = 'No reset code provided. Please use the link from your email.';
      } else {
        this.verifyResetCode();
      }
    });
  }

  async verifyResetCode() {
    try {
      await verifyPasswordResetCode(this.authService.getAuthInstance(), this.oobCode);
    } catch (error: any) {
      this.invalidCode = true;
      this.error = this.getErrorMessage(error);
    }
  }

  async resetPassword() {
    if (!this.passwordsMatch()) {
      this.error = 'Passwords do not match. Please try again.';
      return;
    }

    if (this.password.length < 6) {
      this.error = 'Password must be at least 6 characters long.';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      await confirmPasswordReset(this.authService.getAuthInstance(), this.oobCode, this.password);
      this.resetSuccess = true;
    } catch (error: any) {
      this.error = this.getErrorMessage(error);
    } finally {
      this.loading = false;
    }
  }

  passwordsMatch(): boolean {
    return this.password === this.confirmPassword && this.password.length > 0;
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'auth/expired-action-code') {
      return 'The password reset link has expired. Please request a new one.';
    } else if (error.code === 'auth/invalid-action-code') {
      return 'The password reset link is invalid. Please request a new one.';
    } else if (error.code === 'auth/weak-password') {
      return 'Password is too weak. Please choose a stronger password.';
    } else if (error.code === 'auth/network-request-failed') {
      return 'Network error. Please check your internet connection and try again.';
    } else {
      return 'An error occurred while resetting your password. Please try again.';
    }
  }
}
