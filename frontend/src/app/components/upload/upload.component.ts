import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UploadService } from '../../services/upload.service';
import { AuthService } from '../../services/auth.service';
import { FileUpload, UploadQueue, UploadStats } from '../../models/upload.model';
import { User } from '../../models/auth.model';

@Component({
  selector: 'app-upload',
  templateUrl: './upload-simple.component.html',
  styleUrls: ['./upload-simple.component.scss']
})
export class UploadComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();

  // Upload queue and stats
  uploadQueue: UploadQueue = { files: [], activeUploads: 0, maxConcurrent: 3 };
  uploadStats: UploadStats | null = null;
  
  // User files
  userFiles: FileUpload[] = [];
  filesLoading = false;
  
  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalFiles = 0;
  totalPages = 0;
  
  // Search
  searchQuery = '';
  
  // UI state
  isDragOver = false;
  showUploadArea = true;
  
  // Current user
  currentUser: User | null = null;

  // File type validation
  readonly ALLOWED_TYPES = ['pdf', 'docx', 'txt'];
  readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  constructor(
    private uploadService: UploadService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('UploadComponent ngOnInit called');
    
    // Get current user
    this.currentUser = this.authService.getCurrentUser();
    console.log('Current user:', this.currentUser);
    console.log('showUploadArea:', this.showUploadArea);
    
    // Subscribe to upload queue changes
    this.uploadService.uploadQueue$
      .pipe(takeUntil(this.destroy$))
      .subscribe(queue => {
        console.log('Upload queue updated:', queue);
        this.uploadQueue = queue;
        this.cdr.detectChanges(); // Force UI update
      });

    // Subscribe to upload completion events to refresh file list
    this.uploadService.uploadComplete$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        console.log('Upload completed, refreshing file list...');
        this.loadUserFiles(this.currentPage);
        this.loadUploadStats();
      });

    // Load user files and stats
    this.loadUserFiles();
    this.loadUploadStats();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    console.log('onFileSelected called');
    const input = event.target as HTMLInputElement;
    console.log('Input element:', input);
    console.log('Files found:', input.files?.length || 0);
    
    if (input.files && input.files.length > 0) {
      console.log(`Processing ${input.files.length} files...`);
      
      // Convert FileList to Array to avoid issues
      const filesArray = Array.from(input.files);
      console.log('Files array:', filesArray.map(f => f.name));
      
      // Add files and trigger change detection
      this.addFilesToQueue(input.files);
      this.cdr.detectChanges();
      
      console.log('Files added, change detection triggered');
    } else {
      console.log('No files selected or files is null');
    }
    
    // Clear the input after a small delay to ensure processing is complete
    setTimeout(() => {
      input.value = '';
      console.log('Input cleared');
    }, 200);
  }

  /**
   * Handle drag over event
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  /**
   * Handle drag leave event
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  /**
   * Handle file drop
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    
    if (event.dataTransfer?.files) {
      this.addFilesToQueue(event.dataTransfer.files);
    }
  }

  /**
   * Handle upload area click (but not button clicks)
   */
  onUploadAreaClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.browse-button')) {
      this.triggerFileInput(event);
    }
  }

  /**
   * Trigger file input click
   */
  triggerFileInput(event?: Event): void {
    console.log('triggerFileInput called');
    event?.stopPropagation();

    if (this.fileInput?.nativeElement) {
      console.log('Clicking file input');
      this.fileInput.nativeElement.click();
    } else {
      console.error('File input element not found');
    }
  }

  /**
   * Add files to upload queue
   */
  private addFilesToQueue(files: FileList): void {
    console.log('addFilesToQueue called with files:', files);
    console.log('File count:', files.length);
    
    // Log file names for debugging
    for (let i = 0; i < files.length; i++) {
      console.log(`File ${i + 1}: ${files[i].name} (${files[i].size} bytes)`);
    }
    
    this.uploadService.addFilesToQueue(files).subscribe({
      next: (validFiles) => {
        console.log(`Added ${validFiles.length} files to queue`);
        console.log('Current queue state:', this.uploadQueue);
        this.cdr.detectChanges(); // Ensure UI updates
        if(validFiles.length > 0)
          alert(`Added ${validFiles.length} files to upload queue.`);
      },
      error: (error) => {
        console.error('Error adding files to queue:', error);
        alert('Error adding files to upload queue.');
      }
    });
  }

  /**
   * Cancel specific upload
   */
  cancelUpload(fileId: string): void {
    this.uploadService.cancelUpload(fileId);
  }

  /**
   * Cancel all uploads
   */
  cancelAllUploads(): void {
    this.uploadService.cancelAllUploads();
  }

  /**
   * Start all pending uploads
   */
  startAllUploads(): void {
    this.uploadService.startAllUploads();
    this.loadUserFiles(); // Refresh the files list
  }

  /**
   * Start specific upload by ID
   */
  startUpload(fileId: string): void {
    this.uploadService.startUploadById(fileId);
  }

  /**
   * Retry failed upload
   */
  retryUpload(fileId: string): void {
    this.uploadService.retryUpload(fileId);
  }

  /**
   * Clear completed uploads from queue
   */
  clearCompletedUploads(): void {
    this.uploadService.clearCompletedUploads();
    this.loadUserFiles(); // Refresh the files list
    this.loadUploadStats(); // Refresh stats
  }

  /**
   * Load user files with pagination
   */
  loadUserFiles(page: number = 1): void {
    this.filesLoading = true;
    this.currentPage = page;
    
    this.uploadService.getUserFiles(page, this.itemsPerPage, this.searchQuery)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.userFiles = response.files;
          this.totalFiles = response.pagination.total;
          this.totalPages = response.pagination.pages;
          this.filesLoading = false;
        },
        error: (error) => {
          console.error('Error loading user files:', error);
          this.filesLoading = false;
        }
      });
  }

  /**
   * Load upload statistics
   */
  loadUploadStats(): void {
    this.uploadService.getUploadStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.uploadStats = response.stats;
        },
        error: (error) => {
          console.error('Error loading upload stats:', error);
        }
      });
  }

  /**
   * Search files
   */
  onSearch(): void {
    this.loadUserFiles(1); // Reset to first page when searching
  }

  /**
   * Clear search
   */
  clearSearch(): void {
    this.searchQuery = '';
    this.loadUserFiles(1);
  }

  /**
   * Download file
   */
  downloadFile(file: FileUpload): void {
    if (file.id) {
      this.uploadService.downloadFile(file.id, file.originalName)
        .subscribe({
          next: () => {
            console.log(`Downloaded: ${file.originalName}`);
          },
          error: (error) => {
            console.error('Download error:', error);
          }
        });
    }
  }

  /**
   * Delete file
   */
  deleteFile(file: FileUpload): void {
    if (file.id && confirm(`Are you sure you want to delete "${file.originalName}"?`)) {
      this.uploadService.deleteFile(file.id)
        .subscribe({
          next: () => {
            console.log(`Deleted: ${file.originalName}`);
            this.loadUserFiles(this.currentPage);
            this.loadUploadStats();
          },
          error: (error) => {
            console.error('Delete error:', error);
          }
        });
    }
  }

  /**
   * Get file type icon
   */
  getFileIcon(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf':
        return 'picture_as_pdf';
      case 'docx':
      case 'doc':
        return 'description';
      case 'txt':
        return 'text_snippet';
      default:
        return 'insert_drive_file';
    }
  }

  /**
   * Get status icon
   */
  getStatusIcon(status: string): string {
    switch (status) {
      case 'pending':
        return 'schedule';
      case 'uploading':
        return 'cloud_upload';
      case 'success':
        return 'check_circle';
      case 'failed':
        return 'error';
      default:
        return 'help';
    }
  }

  /**
   * Get status color
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'pending':
        return 'accent';
      case 'uploading':
        return 'primary';
      case 'success':
        return 'success';
      case 'failed':
        return 'warn';
      default:
        return '';
    }
  }

  /**
   * Format file size
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get upload progress percentage
   */
  getUploadProgress(file: FileUpload): number {
    return file.progress || 0;
  }

  /**
   * Check if upload queue has files
   */
  hasQueuedFiles(): boolean {
    return this.uploadQueue.files.length > 0;
  }

  /**
   * Check if there are active uploads
   */
  hasActiveUploads(): boolean {
    return this.uploadQueue.activeUploads > 0;
  }

  /**
   * Get pending uploads count
   */
  getPendingUploadsCount(): number {
    return this.uploadQueue.files.filter(f => f.status === 'pending').length;
  }

  /**
   * Get completed uploads count
   */
  getCompletedUploadsCount(): number {
    return this.uploadQueue.files.filter(f => f.status === 'success' || f.status === 'failed').length;
  }

  /**
   * Check if file validation passed
   */
  private validateFile(file: File): { valid: boolean; error?: string } {
    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds ${this.formatFileSize(this.MAX_FILE_SIZE)} limit`
      };
    }

    // Check file type
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !this.ALLOWED_TYPES.includes(extension)) {
      return {
        valid: false,
        error: `File type '.${extension}' not allowed. Allowed types: ${this.ALLOWED_TYPES.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * Track by function for ngFor performance
   */
  trackByFileId(index: number, file: FileUpload): string {
    return file.id || file.originalName;
  }

  /**
   * Handle paginator page change
   */
  onPageChange(event: any): void {
    this.loadUserFiles(event.pageIndex + 1);
  }

  /**
   * Logout user
   */
  logout(): void {
    // Clear the upload queue before logging out
    this.uploadService.cancelAllUploads();
    this.authService.logout();
  }
}