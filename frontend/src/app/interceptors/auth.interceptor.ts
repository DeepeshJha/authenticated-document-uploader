import { Injectable } from '@angular/core';
import { 
  HttpInterceptor, 
  HttpRequest, 
  HttpHandler, 
  HttpEvent,
  HttpErrorResponse 
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  constructor(private authService: AuthService) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Add auth token to request if available
    const authToken = this.authService.getAccessToken();
    
    if (authToken) {
      request = this.addTokenToRequest(request, authToken);
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Handle 401 errors by attempting token refresh
        if (error.status === 401 && authToken) {
          return this.handle401Error(request, next);
        }
        
        return throwError(() => error);
      })
    );
  }

  /**
   * Add authentication token to request headers
   */
  private addTokenToRequest(request: HttpRequest<any>, token: string): HttpRequest<any> {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  /**
   * Handle 401 unauthorized errors by attempting to refresh token
   */
  private handle401Error(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = this.authService.getRefreshToken();
      
      if (refreshToken) {
        return this.authService.refreshToken().pipe(
          switchMap((response: any) => {
            this.isRefreshing = false;
            this.refreshTokenSubject.next(response.accessToken);
            
            // Retry the original request with new token
            return next.handle(this.addTokenToRequest(request, response.accessToken));
          }),
          catchError((refreshError: any) => {
            this.isRefreshing = false;
            
            // Log the specific error
            if (refreshError.status === 401 || refreshError.status === 403) {
              console.error('Invalid or expired refresh token - logging out');
            } else {
              console.error('Token refresh failed:', refreshError);
            }
            
            // AuthService.refreshToken() already calls logout(), but ensure it happens
            this.authService.logout();
            return throwError(() => refreshError);
          })
        );
      } else {
        this.isRefreshing = false;
        console.warn('No refresh token available - logging out');
        this.authService.logout();
        return throwError(() => new Error('No refresh token available'));
      }
    } else {
      // If refresh is in progress, wait for it to complete
      return this.refreshTokenSubject.pipe(
        filter(token => token != null),
        take(1),
        switchMap(token => next.handle(this.addTokenToRequest(request, token)))
      );
    }
  }
}