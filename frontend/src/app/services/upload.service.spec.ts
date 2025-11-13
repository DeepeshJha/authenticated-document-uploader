import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { UploadService } from './upload.service';
import { environment } from '../../environments/environment';

describe('UploadService - Functional & Performance Tests', () => {
  let service: UploadService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [UploadService]
    });

    service = TestBed.inject(UploadService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Positive Workflows - File Operations', () => {
    it('should add valid PDF file to queue', (done) => {
      const pdfFile = new File(['test content'], 'document.pdf', { type: 'application/pdf' });
      
      service.addFilesToQueue([pdfFile]).subscribe(files => {
        expect(files.length).toBe(1);
        expect(files[0].originalName).toBe('document.pdf');
        expect(files[0].status).toBe('pending');
        done();
      });
    });

    it('should add valid DOCX file to queue', (done) => {
      const docxFile = new File(['test content'], 'document.docx', { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      
      service.addFilesToQueue([docxFile]).subscribe(files => {
        expect(files.length).toBe(1);
        expect(files[0].originalName).toBe('document.docx');
        done();
      });
    });

    it('should add valid TXT file to queue', (done) => {
      const txtFile = new File(['test content'], 'document.txt', { type: 'text/plain' });
      
      service.addFilesToQueue([txtFile]).subscribe(files => {
        expect(files.length).toBe(1);
        expect(files[0].originalName).toBe('document.txt');
        done();
      });
    });

    it('should track upload queue updates', (done) => {
      const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
      let callCount = 0;
      
      service.uploadQueue$.subscribe(queue => {
        callCount++;
        if (callCount === 2) { // Initial + after adding file
          expect(queue.files.length).toBeGreaterThan(0);
          expect(queue.maxConcurrent).toBe(3);
          done();
        }
      });

      service.addFilesToQueue([file]).subscribe();
    });

    it('should fetch user files', (done) => {
      const mockResponse = {
        message: 'Files retrieved',
        files: [
          { id: '1', originalName: 'file1.pdf', uploadedAt: new Date().toISOString(), size: 1024 },
          { id: '2', originalName: 'file2.pdf', uploadedAt: new Date().toISOString(), size: 2048 }
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 2,
          pages: 1
        }
      };

      service.getUserFiles(1, 10).subscribe(response => {
        expect(response.files.length).toBe(2);
        expect(response.pagination.page).toBe(1);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/upload/files?page=1&limit=10`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should delete file successfully', (done) => {
      service.deleteFile('123').subscribe(response => {
        expect(response.message).toBe('File deleted successfully');
        done();
      });

      const req = httpMock.expectOne('http://localhost:3000/api/upload/files/123');
      expect(req.request.method).toBe('DELETE');
      req.flush({ message: 'File deleted successfully' });
    });

    it('should get upload statistics', (done) => {
      const mockResponse = {
        stats: {
          totalFiles: 10,
          totalSize: 1024000,
          filesByType: { pdf: 5, docx: 3, txt: 2 }
        }
      };

      service.getUploadStats().subscribe(response => {
        expect(response.stats.totalFiles).toBe(10);
        expect(response.stats.totalSize).toBe(1024000);
        done();
      });

      const req = httpMock.expectOne(`${environment.apiUrl}/upload/stats`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });

  describe('Negative Workflows - File Validation', () => {
    it('should reject files that are too large', (done) => {
      spyOn(window, 'alert');
      const largeFile = new File(
        [new ArrayBuffer(101 * 1024 * 1024)], // 101MB (exceeds 100MB limit)
        'toolarge.pdf',
        { type: 'application/pdf' }
      );
      
      service.addFilesToQueue([largeFile]).subscribe(files => {
        expect(files.length).toBe(0);
        expect(window.alert).toHaveBeenCalled();
        done();
      });
    });

    it('should reject invalid file types', (done) => {
      spyOn(window, 'alert');
      const invalidFile = new File(['content'], 'malicious.exe', { type: 'application/x-msdownload' });
      
      service.addFilesToQueue([invalidFile]).subscribe(files => {
        expect(files.length).toBe(0);
        expect(window.alert).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('Negative Workflows - API Errors', () => {
    it('should handle file fetch errors', (done) => {
      service.getUserFiles(1, 10).subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(500);
          done();
        }
      });

      const req = httpMock.expectOne('http://localhost:3000/api/upload/files?page=1&limit=10');
      req.flush({ message: 'Server error' }, { status: 500, statusText: 'Server Error' });
    });

    it('should handle delete file errors', (done) => {
      service.deleteFile('999').subscribe({
        next: () => fail('should have failed'),
        error: (error) => {
          expect(error.status).toBe(404);
          done();
        }
      });

      const req = httpMock.expectOne('http://localhost:3000/api/upload/files/999');
      req.flush({ message: 'File not found' }, { status: 404, statusText: 'Not Found' });
    });
  });

  describe('Performance Tests', () => {
    it('should enforce maximum concurrent uploads limit (3)', (done) => {
      service.uploadQueue$.subscribe(queue => {
        expect(queue.maxConcurrent).toBe(3);
        expect(queue.activeUploads).toBeLessThanOrEqual(3);
        done();
      });
    });

    it('should handle multiple files in queue', (done) => {
      const files = Array.from({ length: 10 }, (_, i) => 
        new File([`content${i}`], `file${i}.pdf`, { type: 'application/pdf' })
      );
      
      service.addFilesToQueue(files).subscribe(queuedFiles => {
        expect(queuedFiles.length).toBe(10);
        done();
      });
    });

    it('should process large batch of files efficiently', (done) => {
      const startTime = Date.now();
      const files = Array.from({ length: 50 }, (_, i) => 
        new File(['content'], `file${i}.pdf`, { type: 'application/pdf' })
      );
      
      service.addFilesToQueue(files).subscribe(queuedFiles => {
        const endTime = Date.now();
        expect(queuedFiles.length).toBe(50);
        expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
        done();
      });
    });

    it('should handle concurrent file operations', (done) => {
      let completedOperations = 0;
      const totalOperations = 3;

      // Simulate concurrent operations
      service.getUserFiles(1, 10).subscribe(() => {
        completedOperations++;
        if (completedOperations === totalOperations) done();
      });

      service.getUserFiles(2, 10).subscribe(() => {
        completedOperations++;
        if (completedOperations === totalOperations) done();
      });

      service.getUploadStats().subscribe(() => {
        completedOperations++;
        if (completedOperations === totalOperations) done();
      });

      // Flush all pending requests
      const requests = httpMock.match(() => true);
      requests.forEach(req => {
        if (req.request.url.includes('/stats')) {
          req.flush({ stats: { totalFiles: 0, totalSize: 0, filesByType: {} } });
        } else {
          req.flush({ files: [], totalPages: 1, currentPage: 1 });
        }
      });
    });
  });
});
