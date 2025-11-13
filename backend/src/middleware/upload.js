import multer from 'multer';

/**
 * Multer configuration for file uploads
 * Using memory storage to keep files in memory for processing
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate file types
 */
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES?.split(',') || ['pdf', 'docx', 'txt'];
  const allowedMimeTypes = {
    pdf: ['application/pdf'],
    docx: [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ],
    txt: ['text/plain']
  };
  
  // Get file extension
  const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
  
  // Check if file extension is allowed
  if (!fileExtension || !allowedTypes.includes(fileExtension)) {
    const error = new Error(`File type '.${fileExtension}' is not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }
  
  // Check MIME type
  const allowedMimes = allowedMimeTypes[fileExtension] || [];
  if (allowedMimes.length > 0 && !allowedMimes.includes(file.mimetype)) {
    const error = new Error(`Invalid MIME type for .${fileExtension} file. Expected: ${allowedMimes.join(', ')}, got: ${file.mimetype}`);
    error.code = 'INVALID_MIME_TYPE';
    return cb(error, false);
  }
  
  cb(null, true);
};

/**
 * Multer upload configuration
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
    files: 10, // Maximum 10 files per upload
    fields: 10, // Maximum 10 non-file fields
    parts: 20 // Maximum 20 parts total
  }
});

/**
 * Middleware for single file upload
 */
export const uploadSingle = upload.single('file');

/**
 * Middleware for multiple file upload
 */
export const uploadMultiple = upload.array('files', 10);

/**
 * Middleware for handling multer errors
 */
export const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          error: 'File too large',
          message: `File size must be less than ${(parseInt(process.env.MAX_FILE_SIZE) || 10485760) / (1024 * 1024)}MB`,
          code: err.code
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          error: 'Too many files',
          message: 'Maximum 10 files allowed per upload',
          code: err.code
        });
      
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          error: 'Too many fields',
          message: 'Too many form fields in request',
          code: err.code
        });
      
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          error: 'Too many parts',
          message: 'Too many parts in multipart request',
          code: err.code
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          error: 'Unexpected file',
          message: 'Unexpected file field in request',
          code: err.code
        });
      
      default:
        return res.status(400).json({
          error: 'Upload error',
          message: err.message,
          code: err.code
        });
    }
  }
  
  // Handle custom file filter errors
  if (err.code === 'INVALID_FILE_TYPE' || err.code === 'INVALID_MIME_TYPE') {
    return res.status(400).json({
      error: 'Invalid file',
      message: err.message,
      code: err.code
    });
  }
  
  // Pass other errors to the global error handler
  next(err);
};

export default upload;