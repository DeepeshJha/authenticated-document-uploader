import uploadService from '../services/uploadService.js';
import fs from 'fs/promises';

/**
 * Upload controller handling file uploads and management
 */
class UploadController {
  /**
   * Upload files endpoint
   * POST /api/upload/files
   */
  async uploadFiles(req, res) {
    try {
      console.log('Upload files request received:', {
        user: req.user?.id,
        files: req.files?.length || 0,
        body: req.body,
        headers: req.headers['content-type']
      });

      // Files are available through multer middleware as req.files
      if (!req.files || req.files.length === 0) {
        console.log('No files found in request. req.files:', req.files);
        return res.status(400).json({
          error: 'No files provided',
          message: 'Please select at least one file to upload'
        });
      }
      
      const userId = req.user.id;
      
      // Process multiple uploads
      const results = await uploadService.processMultipleUploads(req.files, userId);
      
      // Log upload activity
      console.log(`User ${req.user.username} uploaded ${results.successful.length}/${results.total} files`);
      
      // Determine response status
      const status = results.failed.length === 0 ? 200 : 
                    results.successful.length === 0 ? 400 : 207; // 207 = Multi-Status
      
      res.status(status).json({
        message: `Upload completed: ${results.successful.length}/${results.total} files successful`,
        results: {
          successful: results.successful,
          failed: results.failed,
          total: results.total,
          successCount: results.successful.length,
          failureCount: results.failed.length
        }
      });
    } catch (error) {
      console.error('Upload files error:', error);
      res.status(500).json({
        error: 'Upload failed',
        message: 'An error occurred during file upload'
      });
    }
  }

  /**
   * Get user's uploaded files
   * GET /api/upload/files
   */
  async getUserFiles(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, search = '' } = req.query;
      
      const result = uploadService.getUserFiles(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        search: search.trim()
      });
      
      res.status(200).json({
        message: 'Files retrieved successfully',
        ...result
      });
    } catch (error) {
      console.error('Get user files error:', error);
      res.status(500).json({
        error: 'Failed to retrieve files',
        message: 'An error occurred while fetching your files'
      });
    }
  }

  /**
   * Download file endpoint
   * GET /api/upload/download/:fileId
   */
  async downloadFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;
      
      const file = uploadService.getFileById(fileId, userId);
      if (!file) {
        return res.status(404).json({
          error: 'File not found',
          message: 'The requested file was not found or you do not have permission to access it'
        });
      }
      
      // Check if physical file exists
      try {
        await fs.access(file.path);
      } catch (error) {
        return res.status(404).json({
          error: 'File not found',
          message: 'The physical file no longer exists on the server'
        });
      }
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${file.originalName}"`);
      res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
      res.setHeader('Content-Length', file.size);
      
      // Stream the file
      const fileBuffer = await fs.readFile(file.path);
      res.send(fileBuffer);
      
      console.log(`User ${req.user.username} downloaded file: ${file.originalName}`);
    } catch (error) {
      console.error('Download file error:', error);
      res.status(500).json({
        error: 'Download failed',
        message: 'An error occurred while downloading the file'
      });
    }
  }

  /**
   * Delete file endpoint
   * DELETE /api/upload/files/:fileId
   */
  async deleteFile(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;
      
      const success = await uploadService.deleteFile(fileId, userId);
      if (!success) {
        return res.status(404).json({
          error: 'File not found',
          message: 'The requested file was not found or you do not have permission to delete it'
        });
      }
      
      console.log(`User ${req.user.username} deleted file: ${fileId}`);
      
      res.status(200).json({
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({
        error: 'Delete failed',
        message: 'An error occurred while deleting the file'
      });
    }
  }

  /**
   * Get file information endpoint
   * GET /api/upload/files/:fileId
   */
  async getFileInfo(req, res) {
    try {
      const { fileId } = req.params;
      const userId = req.user.id;
      
      const file = uploadService.getFileById(fileId, userId);
      if (!file) {
        return res.status(404).json({
          error: 'File not found',
          message: 'The requested file was not found or you do not have permission to access it'
        });
      }
      
      res.status(200).json({
        file: {
          id: file.id,
          originalName: file.originalName,
          filename: file.filename,
          size: file.size,
          sizeMB: (file.size / (1024 * 1024)).toFixed(2),
          mimetype: file.mimetype,
          uploadedAt: file.uploadedAt,
          downloadUrl: `/api/upload/download/${file.id}`
        }
      });
    } catch (error) {
      console.error('Get file info error:', error);
      res.status(500).json({
        error: 'Failed to retrieve file information',
        message: 'An error occurred while fetching file details'
      });
    }
  }

  /**
   * Get upload statistics endpoint
   * GET /api/upload/stats
   */
  async getUploadStats(req, res) {
    try {
      const userId = req.user.id;
      const stats = uploadService.getUserUploadStats(userId);
      
      res.status(200).json({
        message: 'Upload statistics retrieved successfully',
        stats
      });
    } catch (error) {
      console.error('Get upload stats error:', error);
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        message: 'An error occurred while fetching upload statistics'
      });
    }
  }

  /**
   * Bulk delete files endpoint
   * DELETE /api/upload/files
   */
  async bulkDeleteFiles(req, res) {
    try {
      const { fileIds } = req.body;
      const userId = req.user.id;
      
      if (!Array.isArray(fileIds) || fileIds.length === 0) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Please provide an array of file IDs to delete'
        });
      }
      
      const results = {
        successful: [],
        failed: [],
        total: fileIds.length
      };
      
      for (const fileId of fileIds) {
        const success = await uploadService.deleteFile(fileId, userId);
        if (success) {
          results.successful.push(fileId);
        } else {
          results.failed.push(fileId);
        }
      }
      
      console.log(`User ${req.user.username} bulk deleted ${results.successful.length}/${results.total} files`);
      
      const status = results.failed.length === 0 ? 200 : 
                    results.successful.length === 0 ? 400 : 207; // 207 = Multi-Status
      
      res.status(status).json({
        message: `Bulk delete completed: ${results.successful.length}/${results.total} files deleted`,
        results
      });
    } catch (error) {
      console.error('Bulk delete files error:', error);
      res.status(500).json({
        error: 'Bulk delete failed',
        message: 'An error occurred during bulk file deletion'
      });
    }
  }
}

export default new UploadController();