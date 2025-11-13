export interface FileUpload {
  id?: string;
  originalName: string;
  filename?: string;
  size: number;
  sizeMB?: string;
  mimetype?: string;
  uploadedAt?: string;
  downloadUrl?: string;
  status?: 'pending' | 'uploading' | 'success' | 'failed';
  progress?: number;
  error?: string;
  file?: File; // For frontend use
}

export interface UploadResult {
  successful: FileUpload[];
  failed: Array<{
    originalName: string;
    error: string;
    size: number;
  }>;
  total: number;
  successCount: number;
  failureCount: number;
}

export interface UploadResponse {
  message: string;
  results: UploadResult;
}

export interface FilesResponse {
  message: string;
  files: FileUpload[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface UploadStats {
  totalFiles: number;
  totalSize: number;
  totalSizeMB: string;
  fileTypes: { [key: string]: number };
  latestUpload: string | null;
}

export interface UploadQueue {
  files: FileUpload[];
  activeUploads: number;
  maxConcurrent: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: any;
}