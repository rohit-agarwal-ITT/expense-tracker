import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
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
          <p class="auth-subtitle">Reset your password</p>
        </div>

        <div *ngIf="!emailSent">
          <p class="auth-instruction">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <form (ngSubmit)="sendResetEmail()" #resetForm="ngForm" class="auth-form">
            <div class="form-group">
              <label for="email" class="form-label">Email Address</label>
              <input
                type="email"
                id="email"
                name="email"
                [(ngModel)]="email"
                required
                class="form-control"
                placeholder="Enter your email address">
            </div>

            <div class="auth-actions">
              <button
                type="submit"
                class="auth-btn-primary"
                [disabled]="!resetForm.form.valid || loading">
                <span *ngIf="loading">⏳</span>
                <span *ngIf="!loading">Send Reset Link</span>
              </button>
            </div>
          </form>
        </div>

        <div *ngIf="emailSent" class="auth-success">
          <div class="auth-success-icon">✅</div>
          <h3 class="auth-success-title">Check Your Email</h3>
          <p class="auth-instruction">
            We've sent a password reset link to <strong>{{ email }}</strong>.
            Click the link in the email to reset your password. The link will expire in 1 hour.
          </p>

          <div class="auth-tips">
            <h4>Not receiving the email?</h4>
            <ul>
              <li>Check your spam/junk folder</li>
              <li>Verify the email address is correct</li>
              <li>Wait a few minutes for delivery</li>
            </ul>
          </div>

          <div class="auth-actions">
            <button class="auth-btn-secondary" (click)="resendEmail()" [disabled]="resendLoading">
              <span *ngIf="resendLoading">⏳</span>
              <span *ngIf="!resendLoading">Resend Email</span>
            </button>
          </div>
        </div>

        <div class="auth-nav">
          <a (click)="goToLogin()" class="auth-link">← Back to Sign In</a>
        </div>

        <div *ngIf="error" class="auth-error">{{ error }}</div>
        <div *ngIf="success" class="auth-success-note">{{ success }}</div>
      </div>
    </div>
  `
})
export class ForgotPasswordComponent {
  email: string = '';
  loading: boolean = false;
  resendLoading: boolean = false;
  emailSent: boolean = false;
  error: string = '';
  success: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async sendResetEmail() {
    if (!this.email) {
      this.error = 'Please enter your email address';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.error = 'Please enter a valid email address';
      return;
    }

    this.loading = true;
    this.error = '';
    this.success = '';

    try {
      await this.authService.sendPasswordResetEmail(this.email);
      this.emailSent = true;
      this.success = `Reset link sent to ${this.email}. Please check your email (including spam folder).`;
    } catch (error: any) {
      if (error.message?.includes('No account found')) {
        this.error = `${error.message} If you're sure this is the correct email, try creating a new account.`;
      } else if (error.message?.includes('network')) {
        this.error = `${error.message} Please check your internet connection.`;
      } else if (error.message?.includes('too many requests')) {
        this.error = `${error.message} Please wait 5-10 minutes before trying again.`;
      } else {
        this.error = error.message || 'An error occurred while sending the reset email. Please try again.';
      }
    } finally {
      this.loading = false;
    }
  }

  async resendEmail() {
    this.resendLoading = true;
    this.error = '';
    this.success = '';

    try {
      await this.authService.sendPasswordResetEmail(this.email);
      this.success = 'Reset link sent again successfully!';
    } catch (error: any) {
      this.error = this.getErrorMessage(error);
    } finally {
      this.resendLoading = false;
    }
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  private getErrorMessage(error: any): string {
    if (error.code === 'auth/user-not-found') {
      return 'No account found with this email address. Please check your email or create a new account.';
    } else if (error.code === 'auth/invalid-email') {
      return 'Invalid email address. Please enter a valid email format.';
    } else if (error.code === 'auth/too-many-requests') {
      return 'Too many requests. Please wait a few minutes and try again.';
    } else if (error.code === 'auth/network-request-failed') {
      return 'Network error. Please check your internet connection and try again.';
    } else {
      return 'An error occurred while sending the reset email. Please try again.';
    }
  }
}
