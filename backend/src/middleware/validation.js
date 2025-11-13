import { body, validationResult } from 'express-validator';

/**
 * Express validator middleware to handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'Please check your input data',
      details: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

/**
 * Validation rules for login
 */
export const validateLogin = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Username or email is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username or email must be between 3 and 50 characters'),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  
  handleValidationErrors
];

/**
 * Validation rules for refresh token
 */
export const validateRefreshToken = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
    .isJWT()
    .withMessage('Invalid refresh token format'),
  
  handleValidationErrors
];

/**
 * Validation rules for user signup
 */
export const validateSignup = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and hyphens'),
  
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  
  body('confirmPassword')
    .notEmpty()
    .withMessage('Password confirmation is required')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  
  handleValidationErrors
];

/**
 * File validation middleware
 */
export const validateFileUpload = (req, res, next) => {
  try {
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No files provided',
        message: 'Please select at least one file to upload'
      });
    }
    
    const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'docx', 'txt'];
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
    
    const errors = [];
    
    req.files.forEach((file, index) => {
      // Check file size
      if (file.size > maxFileSize) {
        errors.push({
          file: file.originalname,
          error: 'File too large',
          message: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the ${(maxFileSize / (1024 * 1024))}MB limit`
        });
      }
      
      // Check file type
      const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
      if (!fileExtension || !allowedTypes.includes(fileExtension)) {
        errors.push({
          file: file.originalname,
          error: 'Invalid file type',
          message: `File type '.${fileExtension}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
      
      // Check filename
      if (file.originalname.length > 255) {
        errors.push({
          file: file.originalname,
          error: 'Filename too long',
          message: 'Filename must be less than 255 characters'
        });
      }
      
      // Check for potentially dangerous filenames
      const dangerousPatterns = [/\.\./g, /[<>:"|?*]/g, /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i];
      if (dangerousPatterns.some(pattern => pattern.test(file.originalname))) {
        errors.push({
          file: file.originalname,
          error: 'Invalid filename',
          message: 'Filename contains invalid characters or reserved names'
        });
      }
    });
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'File validation failed',
        message: 'One or more files failed validation',
        details: errors
      });
    }
    
    next();
  } catch (error) {
    console.error('File validation error:', error);
    return res.status(500).json({
      error: 'Validation error',
      message: 'Internal server error during file validation'
    });
  }
};

/**
 * Sanitize filename to prevent security issues
 */
export const sanitizeFilename = (filename) => {
  // Remove path traversal attempts and dangerous characters
  return filename
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, 'file')
    .substring(0, 255);
};