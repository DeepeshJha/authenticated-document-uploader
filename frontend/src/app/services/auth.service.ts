import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, throwError, timer } from 'rxjs';
import { map, tap, catchError, switchMap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { 
  User, 
  LoginRequest, 
  LoginResponse, 
  RefreshTokenRequest, 
  AuthTokens 
} from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly TOKEN_KEY = 'access_token';
  private readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private readonly USER_KEY = 'user_data';
  
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  
  private refreshTokenTimer?: any;

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    // Check for existing authentication on service initialization
    this.initializeAuth();
  }

  /**
   * Initialize authentication state from local storage
   */
  private initializeAuth(): void {
    const token = this.getAccessToken();
    const userData = localStorage.getItem(this.USER_KEY);
    
    if (token && userData) {
      try {
        const user = JSON.parse(userData);
        this.currentUserSubject.next(user);
        this.isAuthenticatedSubject.next(true);
        this.scheduleTokenRefresh();
      } catch (error) {
        console.error('Failed to parse user data from localStorage:', error);
        this.logout();
      }
    }
  }

  /**
   * Login user with credentials
   */
  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, credentials)
      .pipe(
        tap(response => {
          this.handleAuthSuccess(response);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Logout user and clear tokens
   */
  logout(): void {
    const refreshToken = this.getRefreshToken();
    
    // Clear local storage
    this.clearTokens();
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    
    // Cancel token refresh timer
    if (this.refreshTokenTimer) {
      clearTimeout(this.refreshTokenTimer);
    }
    
    // Call logout endpoint to revoke refresh token
    if (refreshToken) {
      this.http.post(`${environment.apiUrl}/auth/logout`, { refreshToken })
        .subscribe({
          next: () => console.log('Logout successful'),
          error: (error) => console.error('Logout error:', error)
        });
    }
    
    // Navigate to login page
    this.router.navigate(['/login']);
  }

  /**
   * Refresh access token using refresh token
   */
  refreshToken(): Observable<LoginResponse> {
    const refreshToken = this.getRefreshToken();
    
    if (!refreshToken) {
      console.warn('No refresh token available, redirecting to login');
      this.logout();
      return throwError(() => new Error('No refresh token available'));
    }
    
    const refreshRequest: RefreshTokenRequest = { refreshToken };
    
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/refresh`, refreshRequest)
      .pipe(
        tap(response => {
          this.handleAuthSuccess(response);
        }),
        catchError(error => {
          console.error('Token refresh failed:', error);
          
          // Handle specific error cases
          if (error.status === 401 || error.status === 403) {
            console.warn('Invalid or expired refresh token, redirecting to login');
          } else if (error.error?.message) {
            console.error('Refresh error:', error.error.message);
          }
          
          // Clear tokens and redirect to login for any refresh failure
          this.logout();
          return throwError(() => error);
        })
      );
  }

  /**
   * Get current user information
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    const token = this.getAccessToken();
    return !!token && !this.isTokenExpired(token);
  }

  /**
   * Get access token from storage
   */
  getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Get refresh token from storage
   */
  getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * Verify token with server
   */
  verifyToken(): Observable<any> {
    return this.http.post(`${environment.apiUrl}/auth/verify`, {});
  }

  /**
   * Get user profile from server
   */
  getUserProfile(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${environment.apiUrl}/auth/profile`);
  }

  /**
   * Handle successful authentication
   */
  private handleAuthSuccess(response: LoginResponse): void {
    // Store tokens
    localStorage.setItem(this.TOKEN_KEY, response.accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, response.refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(response.user));
    
    // Update subjects
    this.currentUserSubject.next(response.user);
    this.isAuthenticatedSubject.next(true);
    
    // Schedule token refresh
    this.scheduleTokenRefresh();
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(): void {
    const token = this.getAccessToken();
    if (!token) return;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000; // Convert to milliseconds
      const currentTime = Date.now();
      const timeUntilExpiry = expiryTime - currentTime;
      
      // Refresh token 2 minutes before it expires, or immediately if expired
      const refreshTime = Math.max(0, timeUntilExpiry - (2 * 60 * 1000));
      
      if (this.refreshTokenTimer) {
        clearTimeout(this.refreshTokenTimer);
      }
      
      this.refreshTokenTimer = setTimeout(() => {
        this.refreshToken().subscribe({
          next: () => console.log('Token refreshed automatically'),
          error: (error) => console.error('Automatic token refresh failed:', error)
        });
      }, refreshTime);
      
    } catch (error) {
      console.error('Failed to parse token for refresh scheduling:', error);
      this.logout();
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(token: string): boolean {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiryTime = payload.exp * 1000;
      return Date.now() >= expiryTime;
    } catch (error) {
      console.error('Failed to parse token:', error);
      return true;
    }
  }

  /**
   * Clear all tokens from storage
   */
  private clearTokens(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Register new user
   */
  signup(signupData: any): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/signup`, signupData)
      .pipe(
        tap(response => {
          this.handleAuthSuccess(response);
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Check username availability
   */
  checkUsernameAvailability(username: string): Observable<{available: boolean; message: string}> {
    return this.http.get<{available: boolean; message: string}>(`${environment.apiUrl}/auth/check-username/${username}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Check email availability
   */
  checkEmailAvailability(email: string): Observable<{available: boolean; message: string}> {
    return this.http.get<{available: boolean; message: string}>(`${environment.apiUrl}/auth/check-email/${email}`)
      .pipe(
        catchError(this.handleError)
      );
  }

  /**
   * Handle HTTP errors
   */
  private handleError = (error: any): Observable<never> => {
    console.error('Auth service error:', error);
    
    if (error.status === 401) {
      // Unauthorized - token might be expired
      this.logout();
    }
    
    return throwError(() => error);
  };
}