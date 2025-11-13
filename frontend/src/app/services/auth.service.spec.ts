import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('AuthService - Functional Tests', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const routerSpyObj = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: Router, useValue: routerSpyObj }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('Positive Workflows', () => {
    it('should login successfully and store tokens', (done) => {
      const mockCredentials = { identifier: 'testuser', password: 'password123' };
      const mockResponse = {
        message: 'Login successful',
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        user: { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' },
        expiresIn: '3600'
      };

      service.login(mockCredentials).subscribe(response => {
        expect(response.accessToken).toBe('test-access-token');
        expect(response.refreshToken).toBe('test-refresh-token');
        expect(localStorage.getItem('access_token')).toBe('test-access-token');
        expect(localStorage.getItem('refresh_token')).toBe('test-refresh-token');
        expect(service.getCurrentUser()?.username).toBe('testuser');
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(mockCredentials);
      req.flush(mockResponse);
    });

    it('should return true when user is authenticated with valid token', () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 1);
      const token = btoa(JSON.stringify({ exp: Math.floor(futureDate.getTime() / 1000) }));
      localStorage.setItem('access_token', token);

      expect(service.isAuthenticated()).toBe(true);
    });

    it('should get access token from storage', () => {
      localStorage.setItem('access_token', 'stored-token');
      expect(service.getAccessToken()).toBe('stored-token');
    });

    it('should get refresh token from storage', () => {
      localStorage.setItem('refresh_token', 'stored-refresh-token');
      expect(service.getRefreshToken()).toBe('stored-refresh-token');
    });

    it('should refresh token successfully', (done) => {
      localStorage.setItem('refresh_token', 'old-refresh-token');
      const mockResponse = {
        message: 'Token refreshed',
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' },
        expiresIn: '3600'
      };

      service.refreshToken().subscribe(response => {
        expect(response.accessToken).toBe('new-access-token');
        expect(localStorage.getItem('access_token')).toBe('new-access-token');
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });

    it('should logout and clear tokens', () => {
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('refresh_token', 'test-refresh');

      service.logout();

      expect(localStorage.getItem('access_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/login']);

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('Negative Workflows', () => {
    it('should handle login error with invalid credentials', (done) => {
      const mockCredentials = { identifier: 'wrong', password: 'wrong' };
      const mockError = { message: 'Invalid credentials' };

      service.login(mockCredentials).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(401);
          expect(error.error).toEqual(mockError);
          done();
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
      req.flush(mockError, { status: 401, statusText: 'Unauthorized' });
    });

    it('should return false when token is expired', () => {
      const pastDate = new Date();
      pastDate.setHours(pastDate.getHours() - 1);
      const expiredToken = btoa(JSON.stringify({ exp: Math.floor(pastDate.getTime() / 1000) }));
      localStorage.setItem('access_token', expiredToken);

      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return false when no token exists', () => {
      localStorage.clear();
      expect(service.isAuthenticated()).toBe(false);
    });

    it('should return null when tokens do not exist', () => {
      localStorage.clear();
      expect(service.getAccessToken()).toBeNull();
      expect(service.getRefreshToken()).toBeNull();
    });

    it('should handle refresh token failure and logout', (done) => {
      localStorage.setItem('refresh_token', 'invalid-refresh-token');
      const mockError = { message: 'Invalid refresh token' };

      service.refreshToken().subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(401);
          done();
        }
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/auth/refresh`);
      req.flush(mockError, { status: 401, statusText: 'Unauthorized' });
    });

    it('should logout when refresh token is missing', (done) => {
      localStorage.clear();

      service.refreshToken().subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.message).toContain('No refresh token');
          done();
        }
      });
    });
  });

  describe('Performance Tests', () => {
    it('should handle multiple concurrent login attempts', (done) => {
      const credentials = { identifier: 'user', password: 'pass' };
      const mockResponse = {
        message: 'Login successful',
        accessToken: 'token',
        refreshToken: 'refresh',
        user: { id: 1, username: 'user', email: 'user@test.com', role: 'user' },
        expiresIn: '3600'
      };

      let completedCount = 0;
      const totalRequests = 5;

      for (let i = 0; i < totalRequests; i++) {
        service.login(credentials).subscribe(() => {
          completedCount++;
          if (completedCount === totalRequests) {
            done();
          }
        });
      }

      const requests = httpMock.match(`${environment.apiUrl}/auth/login`);
      expect(requests.length).toBe(totalRequests);
      requests.forEach(req => req.flush(mockResponse));
    });
  });
});
