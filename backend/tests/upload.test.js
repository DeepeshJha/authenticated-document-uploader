import request from 'supertest';
import app from '../src/server.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Upload API', () => {
  let accessToken;

  beforeAll(async () => {
    // Login to get access token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        identifier: 'admin',
        password: 'secret'
      });
    
    accessToken = loginResponse.body.accessToken;
  });

  describe('POST /api/upload/files', () => {
    it('should upload valid files', async () => {
      // Create a test file
      const testContent = 'This is a test file content';
      const testFilePath = path.join(__dirname, 'test.txt');
      fs.writeFileSync(testFilePath, testContent);

      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('files', testFilePath)
        .expect(200);

      expect(response.body.results.successCount).toBe(1);
      expect(response.body.results.successful).toHaveLength(1);
      expect(response.body.results.successful[0]).toHaveProperty('id');
      expect(response.body.results.successful[0].originalName).toBe('test.txt');

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should reject upload without authentication', async () => {
      const testContent = 'This is a test file content';
      const testFilePath = path.join(__dirname, 'test.txt');
      fs.writeFileSync(testFilePath, testContent);

      await request(app)
        .post('/api/upload/files')
        .attach('files', testFilePath)
        .expect(401);

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should reject invalid file types', async () => {
      // Create a test file with invalid extension
      const testContent = 'This is a test file content';
      const testFilePath = path.join(__dirname, 'test.exe');
      fs.writeFileSync(testFilePath, testContent);

      const response = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('files', testFilePath)
        .expect(400);

      expect(response.body).toHaveProperty('error');

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should reject upload without files', async () => {
      await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('GET /api/upload/files', () => {
    let uploadedFileId;

    beforeAll(async () => {
      // Upload a test file first
      const testContent = 'This is a test file for retrieval';
      const testFilePath = path.join(__dirname, 'retrieve-test.txt');
      fs.writeFileSync(testFilePath, testContent);

      const uploadResponse = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('files', testFilePath);

      uploadedFileId = uploadResponse.body.results.successful[0].id;
      fs.unlinkSync(testFilePath);
    });

    it('should get user files', async () => {
      const response = await request(app)
        .get('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.files)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/upload/files?page=1&limit=5')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    it('should support search', async () => {
      const response = await request(app)
        .get('/api/upload/files?search=retrieve-test')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('files');
    });
  });

  describe('GET /api/upload/stats', () => {
    it('should get upload statistics', async () => {
      const response = await request(app)
        .get('/api/upload/stats')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('totalFiles');
      expect(response.body.stats).toHaveProperty('totalSize');
      expect(response.body.stats).toHaveProperty('fileTypes');
    });
  });

  describe('File operations', () => {
    let fileId;

    beforeEach(async () => {
      // Upload a test file
      const testContent = 'Test file for operations';
      const testFilePath = path.join(__dirname, 'operations-test.txt');
      fs.writeFileSync(testFilePath, testContent);

      const uploadResponse = await request(app)
        .post('/api/upload/files')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('files', testFilePath);

      fileId = uploadResponse.body.results.successful[0].id;
      fs.unlinkSync(testFilePath);
    });

    it('should get file info', async () => {
      const response = await request(app)
        .get(`/api/upload/files/${fileId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('file');
      expect(response.body.file.id).toBe(fileId);
      expect(response.body.file).toHaveProperty('originalName');
      expect(response.body.file).toHaveProperty('size');
    });

    it('should download file', async () => {
      const response = await request(app)
        .get(`/api/upload/download/${fileId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should delete file', async () => {
      await request(app)
        .delete(`/api/upload/files/${fileId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify file is deleted
      await request(app)
        .get(`/api/upload/files/${fileId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});