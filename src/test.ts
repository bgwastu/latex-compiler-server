import request from 'supertest';
import fs from 'fs-extra';
import path from 'path';
import app from './server';

describe('LaTeX Compiler Server', () => {
  // Clean up any temporary files after tests
  afterAll(async () => {
    const tempDir = path.join(process.cwd(), 'temp');
    if (await fs.pathExists(tempDir)) {
      await fs.remove(tempDir);
    }
  });

  describe('GET /health', () => {
    it('should return health status with dependency checks', async () => {
      const response = await request(app).get('/health');
      
      // Status should be either 200 (healthy) or 503 (unhealthy)
      expect([200, 503]).toContain(response.status);
      
      // Check response structure
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('dependencies');
      expect(response.body).toHaveProperty('timestamp');
      
      // Check dependencies object structure
      expect(response.body.dependencies).toHaveProperty('pdflatex');
      expect(response.body.dependencies).toHaveProperty('bibtex');
      expect(typeof response.body.dependencies.pdflatex).toBe('boolean');
      expect(typeof response.body.dependencies.bibtex).toBe('boolean');
      
      // Check status logic
      if (response.body.dependencies.pdflatex) {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('OK');
        expect(response.body.message).toBe('LaTeX Compiler Server is running');
      } else {
        expect(response.status).toBe(503);
        expect(response.body.status).toBe('UNHEALTHY');
        expect(response.body.message).toBe('LaTeX compiler dependencies are missing');
      }
    });
  });

  describe('POST /convert', () => {
    it('should return 400 when no file is uploaded', async () => {
      const response = await request(app).post('/convert');
      
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'No file uploaded' });
    });

    it('should compile simple LaTeX and return R2 URLs', async () => {
      const simpleLatex = `\\documentclass{article}
\\begin{document}
Hello World! This is a test LaTeX document.
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(simpleLatex), 'test.tex');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urlPdf');
      expect(response.body).toHaveProperty('urlLatex');
      
      // Verify URL format
      expect(response.body.urlPdf).toMatch(/^https:\/\/.+\/.+\.pdf$/);
      expect(response.body.urlLatex).toMatch(/^https:\/\/.+\/.+\.tex$/);
      
      // Verify both URLs have the same UUID
      const pdfUuid = response.body.urlPdf.match(/([^\/]+)\.pdf$/)?.[1];
      const texUuid = response.body.urlLatex.match(/([^\/]+)\.tex$/)?.[1];
      expect(pdfUuid).toBe(texUuid);
    });

    it('should compile complex LaTeX with bibliography', async () => {
      const complexLatex = `\\documentclass{article}
\\usepackage{natbib}
\\begin{document}
\\title{Test Document}
\\author{Test Author}
\\maketitle

This is a test document with citations \\citep{test2024}.

\\bibliographystyle{plain}
\\bibliography{test}

\\begin{filecontents*}{test.bib}
@article{test2024,
  title={Test Article},
  author={Test Author},
  journal={Test Journal},
  year={2024}
}
\\end{filecontents*}

\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(complexLatex), 'complex.tex');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urlPdf');
      expect(response.body).toHaveProperty('urlLatex');
    });

    it('should return 400 for invalid LaTeX with detailed error message', async () => {
      const invalidLatex = `\\documentclass{article}
\\begin{document}
\\invalidcommand{This command does not exist}
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(invalidLatex), 'invalid.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
      expect(typeof response.body.message).toBe('string');
      expect(response.body.message.length).toBeGreaterThan(0);
    });

    it('should return 400 for empty LaTeX content', async () => {
      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(''), 'empty.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('LaTeX content is empty or too short');
    });

    it('should return 400 for LaTeX without documentclass', async () => {
      const invalidLatex = `\\begin{document}
Hello World!
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(invalidLatex), 'no-documentclass.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('Invalid LaTeX: Missing \\documentclass');
    });

    it('should return 400 for dangerous LaTeX commands', async () => {
      const dangerousLatex = `\\documentclass{article}
\\begin{document}
\\write18{rm -rf /}
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(dangerousLatex), 'dangerous.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Potentially dangerous LaTeX command detected');
    });

    it('should return 400 for severely unbalanced braces', async () => {
      const unbalancedLatex = `\\documentclass{article}
\\begin{document}
{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{{
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(unbalancedLatex), 'unbalanced.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('LaTeX content has significantly unbalanced braces');
    });

    it('should return 400 for extremely long lines', async () => {
      const longLine = 'a'.repeat(15000);
      const longLineLatex = `\\documentclass{article}
\\begin{document}
${longLine}
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(longLineLatex), 'longline.tex');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('LaTeX content contains extremely long lines');
    });

    // Note: SuperTest automatically sanitizes filenames, so path separators are stripped
    // before they reach our validation. The filename validation works correctly for
    // real-world scenarios but cannot be tested with SuperTest.
    it('should accept valid filenames', async () => {
      const simpleLatex = `\\documentclass{article}
\\begin{document}
Hello World!
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(simpleLatex), 'valid-document.tex');

      // This should succeed (or fail with R2 error, not filename validation error)
      expect(response.status).not.toBe(400);
      if (response.status === 400) {
        expect(response.body.error).not.toContain('filename');
      }
    });

    it('should handle file upload with different content types', async () => {
      const simpleLatex = `\\documentclass{article}
\\begin{document}
Different content type test.
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(simpleLatex), {
          filename: 'test-content.tex',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urlPdf');
      expect(response.body).toHaveProperty('urlLatex');
    });

    it('should handle LaTeX files with mathematical symbols', async () => {
      const mathLatex = `\\documentclass{article}
\\usepackage{amsmath}
\\begin{document}
Mathematical symbols: $\\alpha$, $\\beta$, $\\gamma$
\\[\\sum_{i=1}^{n} x_i = \\frac{a + b}{2}\\]
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(mathLatex), 'math.tex');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urlPdf');
      expect(response.body).toHaveProperty('urlLatex');
    });

    it('should accept tex files with text/plain mimetype', async () => {
      const latexContent = `\\documentclass{article}
\\begin{document}
This should work with text/plain mimetype.
\\end{document}`;

      const response = await request(app)
        .post('/convert')
        .attach('latex', Buffer.from(latexContent), {
          filename: 'test.txt',
          contentType: 'text/plain'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('urlPdf');
      expect(response.body).toHaveProperty('urlLatex');
    });

    it('should handle example LaTeX files', async () => {
      const exampleDir = path.join(process.cwd(), 'example');
      const exampleExists = await fs.pathExists(exampleDir);
      
      if (exampleExists) {
        const files = await fs.readdir(exampleDir);
        const texFiles = files.filter(file => file.endsWith('.tex'));
        
        expect(texFiles.length).toBeGreaterThan(0);
        
        for (const file of texFiles) {
          const examplePath = path.join(exampleDir, file);
          const exampleContent = await fs.readFile(examplePath, 'utf8');
          
          const response = await request(app)
            .post('/convert')
            .attach('latex', Buffer.from(exampleContent), file);

          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('urlPdf');
          expect(response.body).toHaveProperty('urlLatex');
          
          // Verify URL format
          expect(response.body.urlPdf).toMatch(/^https:\/\/.+\/.+\.pdf$/);
          expect(response.body.urlLatex).toMatch(/^https:\/\/.+\/.+\.tex$/);
        }
      } else {
        console.warn('Example directory not found, skipping test');
      }
    });
  });

  describe('Environment Configuration', () => {
    it('should have R2_PUBLIC_URL configured', () => {
      expect(process.env.R2_PUBLIC_URL).toBeDefined();
      expect(process.env.R2_PUBLIC_URL).toMatch(/^https:\/\/.+/);
    });

    it('should have all required R2 environment variables', () => {
      expect(process.env.R2_BUCKET).toBeDefined();
      expect(process.env.R2_URL).toBeDefined();
      expect(process.env.R2_ACCESS_KEY_ID).toBeDefined();
      expect(process.env.R2_SECRET_ACCESS_KEY).toBeDefined();
    });
  });
});