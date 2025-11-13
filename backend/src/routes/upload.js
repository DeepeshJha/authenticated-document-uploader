import express from 'express';
import uploadController from '../controllers/uploadController.js';
import { authenticateToken } from '../middleware/auth.js';
import { uploadMultiple, handleMulterError } from '../middleware/uploadMiddleware.js';
import { validateFileUpload } from '../middleware/validation.js';

const router = express.Router();

/**
 * @route   POST /api/upload/files
 * @desc    Upload multiple files
 * @access  Private
 */
router.post('/files', 
  authenticateToken,
  uploadMultiple,
  handleMulterError,
  validateFileUpload,
  uploadController.uploadFiles
);

/**
 * @route   GET /api/upload/files
 * @desc    Get user's uploaded files with pagination and search
 * @access  Private
 */
router.get('/files',
  authenticateToken,
  uploadController.getUserFiles
);

/**
 * @route   GET /api/upload/files/:fileId
 * @desc    Get file information by ID
 * @access  Private
 */
router.get('/files/:fileId',
  authenticateToken,
  uploadController.getFileInfo
);

/**
 * @route   DELETE /api/upload/files/:fileId
 * @desc    Delete a specific file
 * @access  Private
 */
router.delete('/files/:fileId',
  authenticateToken,
  uploadController.deleteFile
);

/**
 * @route   DELETE /api/upload/files
 * @desc    Bulk delete multiple files
 * @access  Private
 */
router.delete('/files',
  authenticateToken,
  uploadController.bulkDeleteFiles
);

/**
 * @route   GET /api/upload/download/:fileId
 * @desc    Download a file
 * @access  Private
 */
router.get('/download/:fileId',
  authenticateToken,
  uploadController.downloadFile
);

/**
 * @route   GET /api/upload/stats
 * @desc    Get upload statistics for the user
 * @access  Private
 */
router.get('/stats',
  authenticateToken,
  uploadController.getUploadStats
);

export default router;