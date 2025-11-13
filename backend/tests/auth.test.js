import request from 'supertest';
import app from '../src/server.js';
import authService from '../src/services/authService.js';

describe('Authentication API', () => {
  let accessToken;
  let refreshToken;

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'admin',
          password: 'secret'
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('admin');

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'admin',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'admin'
          // missing password
        })
        .expect(400);
    });
  });

  describe('GET /api/auth/profile', () => {
    it('should get user profile with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.username).toBe('admin');
    });

    it('should reject request without token', async () => {
      await request(app)
        .get('/api/auth/profile')
        .expect(401);
    });

    it('should reject request with invalid token', async () => {
      await request(app)
        .get('/api/auth/profile')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should refresh token with valid refresh token', async () => {
      const response = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: refreshToken
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body.accessToken).not.toBe(accessToken);
    });

    it('should reject invalid refresh token', async () => {
      await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken: 'invalid.refresh.token'
        })
        .expect(401);
    });
  });

  describe('POST /api/auth/verify', () => {
    it('should verify valid token', async () => {
      const response = await request(app)
        .post('/api/auth/verify')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body).toHaveProperty('user');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout successfully', async () => {
      await request(app)
        .post('/api/auth/logout')
        .send({
          refreshToken: refreshToken
        })
        .expect(200);
    });
  });
});

describe('AuthService', () => {
  describe('authenticateUser', () => {
    it('should authenticate valid user', async () => {
      const user = await authService.authenticateUser('admin', 'secret');
      expect(user).toBeTruthy();
      expect(user.username).toBe('admin');
      expect(user.password).toBeUndefined(); // password should be excluded
    });

    it('should reject invalid password', async () => {
      const user = await authService.authenticateUser('admin', 'wrongpassword');
      expect(user).toBeNull();
    });

    it('should reject non-existent user', async () => {
      const user = await authService.authenticateUser('nonexistent', 'password');
      expect(user).toBeNull();
    });
  });

  describe('token generation and verification', () => {
    it('should generate and verify access token', () => {
      const user = { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' };
      const token = authService.generateAccessToken(user);
      
      expect(token).toBeTruthy();
      
      const decoded = authService.verifyAccessToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded.username).toBe('testuser');
    });

    it('should generate and verify refresh token', () => {
      const user = { id: 1, username: 'testuser', email: 'test@example.com', role: 'user' };
      const token = authService.generateRefreshToken(user);
      
      expect(token).toBeTruthy();
      
      const decoded = authService.verifyRefreshToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded.username).toBe('testuser');
      expect(decoded.type).toBe('refresh');
    });

    it('should reject invalid tokens', () => {
      const decoded = authService.verifyAccessToken('invalid.token.here');
      expect(decoded).toBeNull();
    });
  });
});