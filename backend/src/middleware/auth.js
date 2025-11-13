import authService from '../services/authService.js';

/**
 * Middleware to verify JWT token and authenticate requests
 */
export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }
    
    const decoded = authService.verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Token is invalid or expired'
      });
    }
    
    // Add user info to request object
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      message: 'Internal server error during authentication'
    });
  }
};

/**
 * Middleware to check if user has required role
 * @param {string|Array<string>} roles - Required role(s)
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not authenticated'
        });
      }
      
      const userRole = req.user.role;
      const requiredRoles = Array.isArray(roles) ? roles : [roles];
      
      if (!requiredRoles.includes(userRole)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. Required role(s): ${requiredRoles.join(', ')}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Role authorization error:', error);
      return res.status(500).json({
        error: 'Authorization error',
        message: 'Internal server error during authorization'
      });
    }
  };
};

/**
 * Optional authentication middleware - doesn't fail if no token provided
 */
export const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    
    if (token) {
      const decoded = authService.verifyAccessToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next(); // Continue without authentication
  }
};