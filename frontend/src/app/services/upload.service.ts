import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpProgressEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, throwError, from, concat } from 'rxjs';
import { map, catchError, tap, switchMap, mergeMap, concatMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  FileUpload,
  UploadResponse,
  FilesResponse,
  UploadStats,
  UploadQueue,
  ApiError
} from '../models/upload.model';

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private readonly MAX_CONCURRENT_UPLOADS = 3;
  private readonly ALLOWED_FILE_TYPES = ['pdf', 'docx', 'txt'];
  private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 10MB

  private uploadQueueSubject = new BehaviorSubject<UploadQueue>({
    files: [],
    activeUploads: 0,
    maxConcurrent: this.MAX_CONCURRENT_UPLOADS
  });
  
  public uploadQueue$ = this.uploadQueueSubject.asObservable();
  
  private uploadsSubject = new Subject<FileUpload>();
  public uploads$ = this.uploadsSubject.asObservable();
  
  private uploadCompleteSubject = new Subject<void>();
  public uploadComplete$ = this.uploadCompleteSubject.asObservable();

  constructor(private http: HttpClient) {}

  /**
   * Add files to upload queue
   */
  addFilesToQueue(files: FileList | File[]): Observable<FileUpload[]> {
    const fileArray = Array.from(files);
    const validFiles: FileUpload[] = [];
    const errors: string[] = [];

    fileArray.forEach((file, index) => {
      const validation = this.validateFile(file);
      
      if (validation.isValid) {
        const fileUpload: FileUpload = {
          id: this.generateId(),
          originalName: file.name,
          size: file.size,
          sizeMB: (file.size / (1024 * 1024)).toFixed(2),
          mimetype: file.type,
          status: 'pending',
          progress: 0,
          file: file
        };
        validFiles.push(fileUpload);
      } else {
        errors.push(`${file.name}: ${validation.error}`);
      }
    });

    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
      alert(errors.join('\n'));
    }

    // Add valid files to queue
    const currentQueue = this.uploadQueueSubject.value;
    const updatedQueue: UploadQueue = {
      ...currentQueue,
      files: [...currentQueue.files, ...validFiles]
    };
    
    this.uploadQueueSubject.next(updatedQueue);
    
    // Files are now queued but not automatically started
    console.log(`Added ${validFiles.length} files to queue. Use startUpload() to begin uploading.`);
    
    return from([validFiles]);
  }

  /**
   * Manually start all pending uploads
   */
  public startAllUploads(): void {
    console.log('Starting all pending uploads...');
    this.processUploadQueue();
  }

  /**
   * Start upload for specific file by ID
   */
  public startUploadById(fileId: string): void {
    const queue = this.uploadQueueSubject.value;
    const fileUpload = queue.files.find(f => f.id === fileId && f.status === 'pending');
    
    if (fileUpload) {
      this.startSingleUpload(fileUpload);
    }
  }

  /**
   * Process upload queue with concurrent limit
   */
  private processUploadQueue(): void {
    const queue = this.uploadQueueSubject.value;
    const pendingFiles = queue.files.filter(f => f.status === 'pending');
    const canStartMore = queue.maxConcurrent - queue.activeUploads;
    
    if (canStartMore > 0 && pendingFiles.length > 0) {
      const filesToStart = pendingFiles.slice(0, canStartMore);
      
      filesToStart.forEach(fileUpload => {
        this.startSingleUpload(fileUpload);
      });
    }
  }

  /**
   * Start upload for a single file
   */
  private startSingleUpload(fileUpload: FileUpload): void {
    if (!fileUpload.file) {
      this.updateFileStatus(fileUpload.id!, 'failed', 'File object is missing');
      return;
    }

    // Update status to uploading
    this.updateFileStatus(fileUpload.id!, 'uploading');
    
    // Increment active uploads counter
    this.incrementActiveUploads();

    // Create form data
    const formData = new FormData();
    formData.append('files', fileUpload.file);

    // Create HTTP request with progress tracking
    const req = new HttpRequest('POST', `${environment.apiUrl}/upload/files`, formData, {
      reportProgress: true
    });

    this.http.request(req).pipe(
      map(event => {
        switch (event.type) {
          case HttpEventType.UploadProgress:
            if (event.total) {
              const progress = Math.round(100 * event.loaded / event.total);
              this.updateFileProgress(fileUpload.id!, progress);
            }
            break;
          case HttpEventType.Response:
            return event;
        }
        return null;
      }),
      catchError(error => this.handleUploadError(fileUpload.id!, error))
    ).subscribe({
      next: (event) => {
        if (event instanceof HttpResponse) {
          const response = event.body as UploadResponse;
          if (response.results.successCount > 0) {
            this.updateFileStatus(fileUpload.id!, 'success');
            // Emit upload complete event so components can refresh their file lists
            this.uploadCompleteSubject.next();
          } else {
            this.updateFileStatus(fileUpload.id!, 'failed', response.results.failed[0]?.error || 'Upload failed');
          }
          this.decrementActiveUploads();
          this.processUploadQueue(); // Process next files in queue
        }
      },
      error: (error) => {
        this.updateFileStatus(fileUpload.id!, 'failed', this.getErrorMessage(error));
        this.decrementActiveUploads();
        this.processUploadQueue();
      }
    });
  }

  /**
   * Cancel a specific upload
   */
  cancelUpload(fileId: string): void {
    this.removeFromQueue(fileId);
  }

  /**
   * Cancel all uploads
   */
  cancelAllUploads(): void {
    const queue = this.uploadQueueSubject.value;
    queue.files.forEach(file => {
      if (file.status === 'pending' || file.status === 'uploading') {
        this.updateFileStatus(file.id!, 'failed', 'Cancelled by user');
      }
    });
    
    this.uploadQueueSubject.next({
      files: [],
      activeUploads: 0,
      maxConcurrent: this.MAX_CONCURRENT_UPLOADS
    });
  }

  /**
   * Retry failed upload
   */
  retryUpload(fileId: string): void {
    const queue = this.uploadQueueSubject.value;
    const file = queue.files.find(f => f.id === fileId);
    
    if (file && file.status === 'failed') {
      file.status = 'pending';
      file.progress = 0;
      file.error = undefined;
      this.processUploadQueue();
    }
  }

  /**
   * Get user's uploaded files
   */
  getUserFiles(page: number = 1, limit: number = 10, search: string = ''): Observable<FilesResponse> {
    const params: any = { page: page.toString(), limit: limit.toString() };
    if (search) {
      params.search = search;
    }

    return this.http.get<FilesResponse>(`${environment.apiUrl}/upload/files`, { params })
      .pipe(catchError(this.handleError));
  }

  /**
   * Get upload statistics
   */
  getUploadStats(): Observable<{ stats: UploadStats }> {
    return this.http.get<{ stats: UploadStats }>(`${environment.apiUrl}/upload/stats`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Download file
   */
  downloadFile(fileId: string, filename: string): Observable<Blob> {
    return this.http.get(`${environment.apiUrl}/upload/download/${fileId}`, {
      responseType: 'blob'
    }).pipe(
      tap(blob => {
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete file
   */
  deleteFile(fileId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/upload/files/${fileId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Bulk delete files
   */
  bulkDeleteFiles(fileIds: string[]): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/upload/files`, { body: { fileIds } })
      .pipe(catchError(this.handleError));
  }

  /**
   * Validate file before upload
   */
  private validateFile(file: File): { isValid: boolean; error?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        isValid: false,
        error: `File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 10MB limit`
      };
    }

    // Check file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !this.ALLOWED_FILE_TYPES.includes(fileExtension)) {
      return {
        isValid: false,
        error: `File type '.${fileExtension}' is not allowed. Allowed types: ${this.ALLOWED_FILE_TYPES.join(', ')}`
      };
    }

    // Check filename length
    if (file.name.length > 255) {
      return {
        isValid: false,
        error: 'Filename is too long (maximum 255 characters)'
      };
    }

    return { isValid: true };
  }

  /**
   * Update file status in queue
   */
  private updateFileStatus(fileId: string, status: FileUpload['status'], error?: string): void {
    const queue = this.uploadQueueSubject.value;
    const fileIndex = queue.files.findIndex(f => f.id === fileId);
    
    if (fileIndex !== -1) {
      queue.files[fileIndex] = {
        ...queue.files[fileIndex],
        status,
        error: error || queue.files[fileIndex].error
      };
      
      this.uploadQueueSubject.next({ ...queue });
      this.uploadsSubject.next(queue.files[fileIndex]);
    }
  }

  /**
   * Update file progress
   */
  private updateFileProgress(fileId: string, progress: number): void {
    const queue = this.uploadQueueSubject.value;
    const fileIndex = queue.files.findIndex(f => f.id === fileId);
    
    if (fileIndex !== -1) {
      queue.files[fileIndex] = {
        ...queue.files[fileIndex],
        progress
      };
      
      this.uploadQueueSubject.next({ ...queue });
      this.uploadsSubject.next(queue.files[fileIndex]);
    }
  }

  /**
   * Remove file from queue
   */
  private removeFromQueue(fileId: string): void {
    const queue = this.uploadQueueSubject.value;
    const updatedFiles = queue.files.filter(f => f.id !== fileId);
    
    this.uploadQueueSubject.next({
      ...queue,
      files: updatedFiles
    });
  }

  /**
   * Increment active uploads counter
   */
  private incrementActiveUploads(): void {
    const queue = this.uploadQueueSubject.value;
    this.uploadQueueSubject.next({
      ...queue,
      activeUploads: queue.activeUploads + 1
    });
  }

  /**
   * Decrement active uploads counter
   */
  private decrementActiveUploads(): void {
    const queue = this.uploadQueueSubject.value;
    this.uploadQueueSubject.next({
      ...queue,
      activeUploads: Math.max(0, queue.activeUploads - 1)
    });
  }

  /**
   * Handle upload errors
   */
  private handleUploadError = (fileId: string, error: any): Observable<never> => {
    console.error('Upload error:', error);
    this.updateFileStatus(fileId, 'failed', this.getErrorMessage(error));
    this.decrementActiveUploads();
    this.processUploadQueue();
    return throwError(() => error);
  };

  /**
   * Handle HTTP errors
   */
  private handleError = (error: any): Observable<never> => {
    console.error('Upload service error:', error);
    return throwError(() => error);
  };

  /**
   * Extract error message from error object
   */
  private getErrorMessage(error: any): string {
    if (error.error?.message) {
      return error.error.message;
    }
    if (error.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unknown error occurred';
  }

  /**
   * Generate unique ID for files
   */
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Clear completed uploads from queue
   */
  clearCompletedUploads(): void {
    const queue = this.uploadQueueSubject.value;
    const activeFiles = queue.files.filter(f => 
      f.status === 'pending' || f.status === 'uploading'
    );
    
    this.uploadQueueSubject.next({
      ...queue,
      files: activeFiles
    });
  }

  /**
   * Get current upload queue
   */
  getCurrentQueue(): UploadQueue {
    return this.uploadQueueSubject.value;
  }
}