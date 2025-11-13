import authService from '../services/authService.js';

/**
 * Authentication controller handling login, logout, and token refresh
 */
class AuthController {
  /**
   * Login endpoint
   * POST /api/auth/login
   */
  async login(req, res) {
    try {
      const { identifier, password } = req.body;
      
      // Authenticate user
      const user = await authService.authenticateUser(identifier, password);
      if (!user) {
        return res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid username/email or password'
        });
      }
      
      // Generate tokens
      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);
      
      // Log successful login
      console.log(`User ${user.username} logged in successfully`);
      
      res.status(200).json({
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during login'
      });
    }
  }

  /**
   * Refresh token endpoint
   * POST /api/auth/refresh
   */
  async refresh(req, res) {
    try {
      const { refreshToken } = req.body;
      
      // Refresh access token
      const tokens = await authService.refreshAccessToken(refreshToken);
      if (!tokens) {
        return res.status(401).json({
          error: 'Token refresh failed',
          message: 'Invalid or expired refresh token'
        });
      }
      
      console.log(`Token refreshed for user ${tokens.user.username}`);
      
      res.status(200).json({
        message: 'Token refreshed successfully',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during token refresh'
      });
    }
  }

  /**
   * Logout endpoint
   * POST /api/auth/logout
   */
  async logout(req, res) {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        // Revoke refresh token
        const revoked = authService.revokeRefreshToken(refreshToken);
        if (revoked) {
          console.log('Refresh token revoked successfully');
        }
      }
      
      res.status(200).json({
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during logout'
      });
    }
  }

  /**
   * Get current user profile
   * GET /api/auth/profile
   */
  async getProfile(req, res) {
    try {
      // req.user is set by the authentication middleware
      const user = authService.getUserById(req.user.id);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found',
          message: 'User profile not found'
        });
      }
      
      res.status(200).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred while fetching profile'
      });
    }
  }

  /**
   * Verify token endpoint (for frontend to check token validity)
   * POST /api/auth/verify
   */
  async verifyToken(req, res) {
    try {
      // If we reach here, the token is valid (middleware passed)
      res.status(200).json({
        valid: true,
        user: {
          id: req.user.id,
          username: req.user.username,
          email: req.user.email,
          role: req.user.role
        }
      });
    } catch (error) {
      console.error('Token verification error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during token verification'
      });
    }
  }

  /**
   * User registration endpoint
   * POST /api/auth/signup
   */
  async signup(req, res) {
    try {
      const { username, email, password, confirmPassword } = req.body;
      
      // Validate input
      if (!username || !email || !password) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Username, email, and password are required'
        });
      }
      
      if (password !== confirmPassword) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Passwords do not match'
        });
      }
      
      // Register user
      const newUser = await authService.registerUser({ username, email, password });
      
      // Generate tokens for immediate login
      const accessToken = authService.generateAccessToken(newUser);
      const refreshToken = authService.generateRefreshToken(newUser);
      
      console.log(`New user registered: ${newUser.username}`);
      
      res.status(201).json({
        message: 'User registered successfully',
        accessToken,
        refreshToken,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        },
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
      });
    } catch (error) {
      console.error('Signup error:', error);
      
      // Handle specific validation errors
      if (error.message.includes('already exists') || 
          error.message.includes('required') ||
          error.message.includes('at least')) {
        return res.status(400).json({
          error: 'Validation failed',
          message: error.message
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred during registration'
      });
    }
  }

  /**
   * Check username availability endpoint
   * GET /api/auth/check-username/:username
   */
  async checkUsername(req, res) {
    try {
      const { username } = req.params;
      const isAvailable = authService.isUsernameAvailable(username);
      
      res.status(200).json({
        available: isAvailable,
        message: isAvailable ? 'Username is available' : 'Username is already taken'
      });
    } catch (error) {
      console.error('Check username error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred while checking username availability'
      });
    }
  }

  /**
   * Check email availability endpoint
   * GET /api/auth/check-email/:email
   */
  async checkEmail(req, res) {
    try {
      const { email } = req.params;
      const isAvailable = authService.isEmailAvailable(email);
      
      res.status(200).json({
        available: isAvailable,
        message: isAvailable ? 'Email is available' : 'Email is already registered'
      });
    } catch (error) {
      console.error('Check email error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred while checking email availability'
      });
    }
  }

  /**
   * Get all users (admin only, for testing purposes)
   * GET /api/auth/users
   */
  async getAllUsers(req, res) {
    try {
      const users = authService.getAllUsers();
      
      res.status(200).json({
        users: users.map(user => ({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }))
      });
    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'An error occurred while fetching users'
      });
    }
  }
}

export default new AuthController();