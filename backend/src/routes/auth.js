import express from 'express';
import authController from '../controllers/authController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { validateLogin, validateRefreshToken, validateSignup } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return JWT tokens
 * @access  Public
 */
router.post('/login', validateLogin, authController.login);

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user and return JWT tokens
 * @access  Public
 */
router.post('/signup', validateSignup, authController.signup);

/**
 * @route   GET /api/auth/check-username/:username
 * @desc    Check if username is available
 * @access  Public
 */
router.get('/check-username/:username', authController.checkUsername);

/**
 * @route   GET /api/auth/check-email/:email
 * @desc    Check if email is available
 * @access  Public
 */
router.get('/check-email/:email', authController.checkEmail);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public
 */
router.post('/refresh', validateRefreshToken, authController.refresh);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and revoke refresh token
 * @access  Public
 */
router.post('/logout', authController.logout);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, authController.getProfile);

/**
 * @route   POST /api/auth/verify
 * @desc    Verify if access token is valid
 * @access  Private
 */
router.post('/verify', authenticateToken, authController.verifyToken);

/**
 * @route   GET /api/auth/users
 * @desc    Get all users (admin only)
 * @access  Private (Admin)
 */
router.get('/users', authenticateToken, requireRole('admin'), authController.getAllUsers);

export default router;