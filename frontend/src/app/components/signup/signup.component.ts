import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss']
})
export class SignupComponent implements OnInit {
  signupForm: FormGroup;
  isLoading = false;
  error: string | null = null;
  hidePassword = true;
  hideConfirmPassword = true;
  
  // Availability checks
  usernameAvailable = true;
  emailAvailable = true;
  checkingUsername = false;
  checkingEmail = false;

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.signupForm = this.formBuilder.group({
      username: ['', [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(/^[a-zA-Z0-9_-]+$/)
      ]],
      email: ['', [
        Validators.required,
        Validators.email
      ]],
      password: ['', [
        Validators.required,
        Validators.minLength(6),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', [
        Validators.required
      ]],
      acceptTerms: [false, [
        Validators.requiredTrue
      ]]
    }, { 
      validators: this.passwordMatchValidator 
    });
  }

  ngOnInit(): void {
    // Check username availability on input change
    this.signupForm.get('username')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(username => {
        if (username && username.length >= 3 && this.signupForm.get('username')?.valid) {
          this.checkingUsername = true;
          return this.authService.checkUsernameAvailability(username);
        }
        return of(null);
      })
    ).subscribe(result => {
      this.checkingUsername = false;
      if (result !== null) {
        this.usernameAvailable = result.available;
      }
    });

    // Check email availability on input change
    this.signupForm.get('email')?.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      switchMap(email => {
        if (email && this.signupForm.get('email')?.valid) {
          this.checkingEmail = true;
          return this.authService.checkEmailAvailability(email);
        }
        return of(null);
      })
    ).subscribe(result => {
      this.checkingEmail = false;
      if (result !== null) {
        this.emailAvailable = result.available;
      }
    });
  }

  /**
   * Custom validator for password strength
   */
  passwordStrengthValidator(control: AbstractControl): { [key: string]: any } | null {
    const value = control.value;
    if (!value) {
      return null;
    }

    const hasLowercase = /[a-z]/.test(value);
    const hasUppercase = /[A-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    
    if (!hasLowercase || !hasUppercase || !hasNumber) {
      return { 
        passwordStrength: {
          message: 'Password must contain at least one lowercase letter, one uppercase letter, and one number'
        }
      };
    }

    return null;
  }

  /**
   * Custom validator to check if passwords match
   */
  passwordMatchValidator(form: AbstractControl): { [key: string]: any } | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');
    
    if (!password || !confirmPassword) {
      return null;
    }

    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  /**
   * Handle form submission
   */
  onSubmit(): void {
    if (this.signupForm.valid && this.usernameAvailable && this.emailAvailable) {
      this.isLoading = true;
      this.error = null;

      const formData = this.signupForm.value;
      
      this.authService.signup(formData).subscribe({
        next: (response) => {
          console.log('Signup successful:', response);
          // Navigate to upload page after successful signup
          this.router.navigate(['/upload']);
        },
        error: (error) => {
          console.error('Signup failed:', error);
          this.error = error.error?.message || 'Signup failed. Please try again.';
          this.isLoading = false;
        }
      });
    } else {
      this.markFormGroupTouched();
    }
  }

  /**
   * Navigate to login page
   */
  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  /**
   * Get form control for easy access in template
   */
  getControl(name: string): AbstractControl | null {
    return this.signupForm.get(name);
  }

  /**
   * Check if field has error
   */
  hasError(fieldName: string, errorType?: string): boolean {
    const field = this.getControl(fieldName);
    if (!field) return false;
    
    if (errorType) {
      return field.hasError(errorType) && (field.dirty || field.touched);
    }
    
    return field.invalid && (field.dirty || field.touched);
  }

  /**
   * Get error message for field
   */
  getErrorMessage(fieldName: string): string {
    const field = this.getControl(fieldName);
    if (!field || !field.errors) return '';

    const errors = field.errors;
    
    if (errors['required']) return `${this.getFieldLabel(fieldName)} is required`;
    if (errors['email']) return 'Please enter a valid email address';
    if (errors['minlength']) return `${this.getFieldLabel(fieldName)} must be at least ${errors['minlength'].requiredLength} characters`;
    if (errors['maxlength']) return `${this.getFieldLabel(fieldName)} must not exceed ${errors['maxlength'].requiredLength} characters`;
    if (errors['pattern']) return `${this.getFieldLabel(fieldName)} can only contain letters, numbers, underscores, and hyphens`;
    if (errors['passwordStrength']) return errors['passwordStrength'].message;
    
    return 'Invalid input';
  }

  /**
   * Get field label for error messages
   */
  private getFieldLabel(fieldName: string): string {
    const labels: { [key: string]: string } = {
      username: 'Username',
      email: 'Email',
      password: 'Password',
      confirmPassword: 'Confirm Password'
    };
    
    return labels[fieldName] || fieldName;
  }

  /**
   * Mark all form fields as touched to show validation errors
   */
  private markFormGroupTouched(): void {
    Object.keys(this.signupForm.controls).forEach(key => {
      const control = this.signupForm.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Get password strength indicator
   */
  getPasswordStrength(): { level: number; text: string; color: string } {
    const password = this.getControl('password')?.value || '';
    
    if (password.length === 0) {
      return { level: 0, text: '', color: '' };
    }
    
    let strength = 0;
    if (password.length >= 6) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    if (strength <= 2) {
      return { level: 33, text: 'Weak', color: 'warn' };
    } else if (strength <= 3) {
      return { level: 66, text: 'Medium', color: 'accent' };
    } else {
      return { level: 100, text: 'Strong', color: 'primary' };
    }
  }
}