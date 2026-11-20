import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-email-test',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="auth-page">
      <div class="auth-card auth-card--wide" style="max-width: 800px;">
        <div class="auth-header">
          <h1 class="auth-brand-title">Email Test & Debug</h1>
          <p class="auth-subtitle">Developer utility for testing password reset emails</p>
        </div>
        
        <div class="debug-info">
          <h3>Firebase Configuration</h3>
          <p><strong>Project ID:</strong> expense-tracker-4d264</p>
          <p><strong>Auth Domain:</strong> expense-tracker-4d264.firebaseapp.com</p>
          <p><strong>Current User:</strong> {{ getCurrentUserInfo() }}</p>
        </div>

        <div class="test-form auth-form">
          <h3>Test Password Reset</h3>
          <div class="form-group">
            <label class="form-label">Email Address</label>
            <input
              type="email"
              [(ngModel)]="testEmail"
              placeholder="Enter email to test"
              class="form-control">
          </div>

          <div class="auth-actions">
            <button
              (click)="testPasswordReset()"
              [disabled]="testing"
              class="auth-btn-primary">
              {{ testing ? 'Testing...' : 'Test Password Reset' }}
            </button>
          </div>
        </div>

        <div class="results" *ngIf="testResults.length > 0">
          <h3>Test Results</h3>
          <div class="result-item" *ngFor="let result of testResults">
            <div class="result-time">{{ result.time }}</div>
            <div class="result-status" [class]="result.success ? 'success' : 'error'">
              {{ result.success ? '✅ Success' : '❌ Error' }}
            </div>
            <div class="result-message">{{ result.message }}</div>
          </div>
        </div>

        <div class="auth-tips">
          <h3>Common Issues & Solutions</h3>
          <ul>
            <li><strong>No account found:</strong> Email doesn't exist in Firebase Auth</li>
            <li><strong>Network error:</strong> Check internet connection</li>
            <li><strong>Too many requests:</strong> Wait 5-10 minutes before retrying</li>
            <li><strong>Operation not allowed:</strong> Password reset disabled in Firebase</li>
          </ul>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .debug-info {
      background: var(--bg-secondary);
      padding: var(--space-4);
      border-radius: var(--radius-md);
      margin-bottom: var(--space-6);
    }

    .debug-info h3 {
      margin-top: 0;
      color: var(--text-primary);
    }

    .debug-info p {
      margin: var(--space-2) 0;
      font-family: monospace;
      font-size: var(--text-sm);
    }

    .results {
      margin-top: var(--space-6);
    }

    .result-item {
      background: var(--bg-secondary);
      padding: var(--space-4);
      border-radius: var(--radius-sm);
      margin-bottom: var(--space-2);
      border-left: 4px solid var(--primary);
    }

    .result-time {
      font-size: var(--text-xs);
      color: var(--text-secondary);
      margin-bottom: var(--space-2);
    }

    .result-status {
      font-weight: var(--font-weight-semibold);
      margin-bottom: var(--space-2);
    }

    .result-status.success { color: var(--accent-dark); }
    .result-status.error { color: var(--highlight-dark); }

    .result-message {
      font-family: monospace;
      font-size: var(--text-sm);
      white-space: pre-wrap;
    }
  `]
})
export class EmailTestComponent {
  testEmail: string = '';
  testing: boolean = false;
  testResults: Array<{
    time: string;
    success: boolean;
    message: string;
  }> = [];

  constructor(private authService: AuthService) {}

  getCurrentUserInfo(): string {
    const user = this.authService.getCurrentUser();
    return user ? `${user.email} (${user.uid})` : 'No user logged in';
  }

  async testPasswordReset() {
    if (!this.testEmail) {
      this.addResult(false, 'Please enter an email address');
      return;
    }

    this.testing = true;
    
    try {
      await this.authService.sendPasswordResetEmail(this.testEmail);
      this.addResult(true, `Password reset email sent successfully to ${this.testEmail}`);
    } catch (error: any) {
      console.error('Test failed:', error);
      this.addResult(false, `Error: ${error.message}`);
    } finally {
      this.testing = false;
    }
  }

  private addResult(success: boolean, message: string) {
    this.testResults.unshift({
      time: new Date().toLocaleTimeString(),
      success,
      message
    });
  }
}
