import { Injectable } from '@angular/core';
import { 
  CanActivate, 
  CanActivateChild,
  ActivatedRouteSnapshot, 
  RouterStateSnapshot, 
  Router 
} from '@angular/router';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate, CanActivateChild {
  
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.checkAuth(state.url);
  }

  canActivateChild(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> | Promise<boolean> | boolean {
    return this.checkAuth(state.url);
  }

  private checkAuth(redirectUrl?: string): Observable<boolean> {
    // First check if token exists and is not expired
    if (this.authService.isAuthenticated()) {
      return of(true);
    }

    // If no token or expired, try to refresh
    const refreshToken = this.authService.getRefreshToken();
    if (refreshToken) {
      return this.authService.refreshToken().pipe(
        map(() => true),
        catchError(() => {
          this.redirectToLogin(redirectUrl);
          return of(false);
        })
      );
    }

    // No valid authentication, redirect to login
    this.redirectToLogin(redirectUrl);
    return of(false);
  }

  private redirectToLogin(redirectUrl?: string): void {
    const navigationExtras: any = {};
    
    if (redirectUrl) {
      navigationExtras.queryParams = { returnUrl: redirectUrl };
    }
    
    this.router.navigate(['/login'], navigationExtras);
  }
}