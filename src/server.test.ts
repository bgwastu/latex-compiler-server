import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('LaTeX Compiler Server', () => {
  let app: any;

  beforeAll(async () => {
    const { default: server } = await import('./server.js');
    app = server;
  });

  afterAll(async () => {
    await fs.remove(path.join(__dirname, '../temp'));
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'OK',
        message: 'LaTeX Compiler Server is running'
      });
    });
  });

  describe('POST /convert-raw', () => {
    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app).post('/convert-raw');
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'No file uploaded' });
    });

    it('should compile simple LaTeX to PDF', async () => {
      const simpleLatex = `\\documentclass{article}
\\begin{document}
Hello World!
\\end{document}`;

      const response = await request(app)
        .post('/convert-raw')
        .attach('input', Buffer.from(simpleLatex), 'test.tex');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body).toBeInstanceOf(Buffer);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should return 500 for invalid LaTeX', async () => {
      const invalidLatex = `\\documentclass{article}
\\begin{document}
\\invalidcommand
\\end{document}`;

      const response = await request(app)
        .post('/convert-raw')
        .attach('input', Buffer.from(invalidLatex), 'test.tex');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('LaTeX compilation failed');
    });

    it('should reject non-LaTeX files', async () => {
      const response = await request(app)
        .post('/convert-raw')
        .attach('input', Buffer.from('Not LaTeX'), 'test.txt');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });
});