import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { sanitizeFilename } from '../middleware/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * File upload service for handling document uploads
 */
class UploadService {
  constructor() {
    this.uploadDir = path.join(__dirname, '../../uploads');
    this.maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10485760; // 10MB
    this.allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'docx', 'txt'];
    this.maxConcurrentUploads = parseInt(process.env.MAX_CONCURRENT_UPLOADS) || 3;
    
    // In-memory storage for upload tracking (in production, use Redis or database)
    this.uploads = new Map();
    this.userUploads = new Map(); // Map of userId -> Set of uploadIds
    
    this.ensureUploadDirectory();
  }

  /**
   * Ensure upload directory exists
   */
  async ensureUploadDirectory() {
    try {
      await fs.access(this.uploadDir);
    } catch (error) {
      await fs.mkdir(this.uploadDir, { recursive: true });
      console.log(`Created upload directory: ${this.uploadDir}`);
    }
  }

  /**
   * Generate unique filename to prevent conflicts
   * @param {string} originalName - Original filename
   * @returns {string} Unique filename
   */
  generateUniqueFilename(originalName) {
    const sanitized = sanitizeFilename(originalName);
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(sanitized);
    const name = path.basename(sanitized, ext);
    
    return `${name}_${timestamp}_${random}${ext}`;
  }

  /**
   * Save uploaded file to disk
   * @param {Object} file - Multer file object
   * @param {number} userId - User ID
   * @returns {Promise<Object>} File info
   */
  async saveFile(file, userId) {
    try {
      const uniqueFilename = this.generateUniqueFilename(file.originalname);
      const filePath = path.join(this.uploadDir, uniqueFilename);
      
      // Save file to disk
      await fs.writeFile(filePath, file.buffer);
      
      // Get file stats
      const stats = await fs.stat(filePath);
      
      const fileInfo = {
        id: crypto.randomUUID(),
        originalName: file.originalname,
        filename: uniqueFilename,
        path: filePath,
        size: stats.size,
        mimetype: file.mimetype,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId,
        status: 'completed'
      };
      
      // Store file info
      this.uploads.set(fileInfo.id, fileInfo);
      console.log('Stored file info:', fileInfo.id, 'Total uploads:', this.uploads.size);
      
      // Add to user uploads
      if (!this.userUploads.has(userId)) {
        this.userUploads.set(userId, new Set());
        console.log('Created new user uploads set for userId:', userId);
      }
      this.userUploads.get(userId).add(fileInfo.id);
      console.log('Added file to user uploads. User', userId, 'now has', this.userUploads.get(userId).size, 'files');
      
      return fileInfo;
    } catch (error) {
      console.error('File save error:', error);
      throw new Error('Failed to save file');
    }
  }

  /**
   * Process multiple file uploads
   * @param {Array} files - Array of multer file objects
   * @param {number} userId - User ID
   * @returns {Promise<Object>} Upload results
   */
  async processMultipleUploads(files, userId) {
    const results = {
      successful: [],
      failed: [],
      total: files.length
    };
    
    // Process files in batches to respect concurrent upload limits
    const batches = [];
    for (let i = 0; i < files.length; i += this.maxConcurrentUploads) {
      batches.push(files.slice(i, i + this.maxConcurrentUploads));
    }
    
    for (const batch of batches) {
      const batchPromises = batch.map(async (file) => {
        try {
          const fileInfo = await this.saveFile(file, userId);
          results.successful.push({
            id: fileInfo.id,
            originalName: fileInfo.originalName,
            filename: fileInfo.filename,
            size: fileInfo.size,
            uploadedAt: fileInfo.uploadedAt
          });
        } catch (error) {
          results.failed.push({
            originalName: file.originalname,
            error: error.message,
            size: file.size
          });
        }
      });
      
      await Promise.allSettled(batchPromises);
    }
    
    return results;
  }

  /**
   * Get user's uploaded files
   * @param {number} userId - User ID
   * @param {Object} options - Query options (page, limit, search)
   * @returns {Object} Paginated file list
   */
  getUserFiles(userId, options = {}) {
    const { page = 1, limit = 10, search = '' } = options;
    
    console.log('getUserFiles called for userId:', userId);
    console.log('Total uploads in system:', this.uploads.size);
    console.log('User uploads map:', this.userUploads);
    
    const userUploadIds = this.userUploads.get(userId) || new Set();
    console.log('User upload IDs:', Array.from(userUploadIds));
    
    let userFiles = Array.from(userUploadIds)
      .map(id => {
        const file = this.uploads.get(id);
        console.log(`File ${id}:`, file);
        return file;
      })
      .filter(file => file && file.status === 'completed');
    console.log('User files after filtering:', userFiles.length);
    // Search filter
    if (search) {
      userFiles = userFiles.filter(file => 
        file.originalName.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Sort by upload date (newest first)
    userFiles.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    
    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedFiles = userFiles.slice(startIndex, endIndex);
    
    return {
      files: paginatedFiles.map(file => ({
        id: file.id,
        originalName: file.originalName,
        filename: file.filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: file.uploadedAt,
        downloadUrl: `/api/upload/download/${file.id}`
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: userFiles.length,
        pages: Math.ceil(userFiles.length / limit)
      }
    };
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {number} userId - User ID (for ownership check)
   * @returns {Object|null} File info or null
   */
  getFileById(fileId, userId) {
    const file = this.uploads.get(fileId);
    
    if (!file || file.uploadedBy !== userId) {
      return null;
    }
    
    return file;
  }

  /**
   * Delete file
   * @param {string} fileId - File ID
   * @param {number} userId - User ID (for ownership check)
   * @returns {Promise<boolean>} Success status
   */
  async deleteFile(fileId, userId) {
    try {
      const file = this.getFileById(fileId, userId);
      if (!file) {
        return false;
      }
      
      // Delete physical file
      try {
        await fs.unlink(file.path);
      } catch (error) {
        console.warn('Failed to delete physical file:', error.message);
      }
      
      // Remove from storage
      this.uploads.delete(fileId);
      
      // Remove from user uploads
      const userUploadIds = this.userUploads.get(userId);
      if (userUploadIds) {
        userUploadIds.delete(fileId);
      }
      
      return true;
    } catch (error) {
      console.error('Delete file error:', error);
      return false;
    }
  }

  /**
   * Get upload statistics for user
   * @param {number} userId - User ID
   * @returns {Object} Upload statistics
   */
  getUserUploadStats(userId) {
    const userUploadIds = this.userUploads.get(userId) || new Set();
    const userFiles = Array.from(userUploadIds)
      .map(id => this.uploads.get(id))
      .filter(file => file && file.status === 'completed');
    
    const totalSize = userFiles.reduce((sum, file) => sum + file.size, 0);
    const typeStats = {};
    
    userFiles.forEach(file => {
      const ext = path.extname(file.originalName).toLowerCase().substring(1);
      typeStats[ext] = (typeStats[ext] || 0) + 1;
    });
    
    return {
      totalFiles: userFiles.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      fileTypes: typeStats,
      latestUpload: userFiles.length > 0 
        ? Math.max(...userFiles.map(f => new Date(f.uploadedAt)))
        : null
    };
  }

  /**
   * Clean up old files (for maintenance)
   * @param {number} daysOld - Files older than this many days
   * @returns {Promise<number>} Number of files deleted
   */
  async cleanupOldFiles(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    let deletedCount = 0;
    
    for (const [fileId, file] of this.uploads.entries()) {
      if (new Date(file.uploadedAt) < cutoffDate) {
        try {
          await fs.unlink(file.path);
          this.uploads.delete(fileId);
          
          // Remove from user uploads
          const userUploadIds = this.userUploads.get(file.uploadedBy);
          if (userUploadIds) {
            userUploadIds.delete(fileId);
          }
          
          deletedCount++;
        } catch (error) {
          console.warn(`Failed to delete old file ${fileId}:`, error.message);
        }
      }
    }
    
    return deletedCount;
  }
}

export default new UploadService();