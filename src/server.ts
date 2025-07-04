import express, { Request, Response, Express } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);

// Initialize R2 client
const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_URL,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function uploadToR2(filePath: string, key: string, contentType: string): Promise<string> {
  const fileContent = await fs.readFile(filePath);
  
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: key,
    Body: fileContent,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}

// Validation function for LaTeX content
function validateLatexContent(content: string): { valid: boolean; error?: string } {
  // Check if content is empty or too short
  if (!content || content.trim().length < 10) {
    return { valid: false, error: 'LaTeX content is empty or too short' };
  }

  // Check for basic LaTeX structure
  if (!content.includes('\\documentclass')) {
    return { valid: false, error: 'Invalid LaTeX: Missing \\documentclass' };
  }
  
  if (!content.includes('\\begin{document}')) {
    return { valid: false, error: 'Invalid LaTeX: Missing \\begin{document}' };
  }

  // Security check: prevent dangerous commands
  const dangerousCommands = [
    '\\write18',
    '\\immediate\\write18',
    '\\input{/etc/',
    '\\include{/etc/',
    '\\InputIfFileExists{/etc/',
    '\\openin',
    '\\openout',
    '\\special{',
    '\\catcode',
    '\\def\\@@input',
    '\\@@input'
  ];

  for (const cmd of dangerousCommands) {
    if (content.includes(cmd)) {
      return { valid: false, error: `Potentially dangerous LaTeX command detected: ${cmd}` };
    }
  }

  // Check for balanced braces (basic check)
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  if (Math.abs(openBraces - closeBraces) > 10) { // Allow some imbalance for complex documents
    return { valid: false, error: 'LaTeX content has significantly unbalanced braces' };
  }

  // Check for extremely long lines (potential attack)
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.length > 10000) {
      return { valid: false, error: 'LaTeX content contains extremely long lines' };
    }
  }

  return { valid: true };
}

async function compileLatexWithBibliography(workingDir: string, texFileName: string): Promise<{ success: boolean; error?: string }> {
  const commands = [
    // First pass: generate .aux file
    `cd "${workingDir}" && pdflatex -interaction=nonstopmode "${texFileName}.tex"`,
    // Process bibliography if .bib files exist or \bibliography is used
    `cd "${workingDir}" && bibtex "${texFileName}" || true`,
    // Second pass: incorporate bibliography
    `cd "${workingDir}" && pdflatex -interaction=nonstopmode "${texFileName}.tex"`,
    // Third pass: resolve cross-references
    `cd "${workingDir}" && pdflatex -interaction=nonstopmode "${texFileName}.tex"`
  ];

  for (const command of commands) {
    try {
      await execAsync(command);
    } catch (error) {
      // bibtex might fail if no bibliography is present, which is okay
      if (!command.includes('bibtex')) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown compilation error'
        };
      }
    }
  }
  
  return { success: true };
}

const app: Express = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const tempDir = path.join(process.cwd(), 'temp');
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },
  filename: function (_req, _file, cb) {
    const uniqueId = uuidv4();
    cb(null, `${uniqueId}.tex`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
    files: 1 // Only allow single file upload
  },
  fileFilter: (_req, file, cb) => {
    // Check file extension
    if (!file.originalname.endsWith('.tex') && file.mimetype !== 'text/plain') {
      return cb(new Error('Only .tex files or text/plain files are allowed!'));
    }
    
    // Check filename for security
    if (file.originalname.includes('..') || file.originalname.includes('/') || file.originalname.includes('\\')) {
      return cb(new Error('Invalid filename. Filename cannot contain path separators.'));
    }
    
    cb(null, true);
  }
});

app.use(express.json());

app.post('/convert', async (req: Request, res: Response) => {
  try {
    // Handle file upload with promise wrapper
    await new Promise<void>((resolve, reject) => {
      upload.single('latex')(req, res, (err) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return reject(new Error('File size too large. Maximum size is 5MB.'));
            }
            if (err.code === 'LIMIT_FILE_COUNT') {
              return reject(new Error('Too many files. Only one file is allowed.'));
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
              return reject(new Error('Unexpected file field. Use "latex" field name.'));
            }
            return reject(new Error(err.message));
          }
          
          return reject(new Error(err.message || 'Unknown file upload error'));
        }
        
        resolve();
      });
    });
  } catch (uploadError) {
    return res.status(400).json({ error: uploadError instanceof Error ? uploadError.message : 'Upload failed' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const texFilePath = req.file.path;
  const workingDir = path.dirname(texFilePath);
  const texFileName = path.basename(texFilePath, '.tex');
  const pdfFilePath = path.join(workingDir, `${texFileName}.pdf`);
  const fileUuid = texFileName; // The filename already contains UUID
  try {
    // Read and validate LaTeX content
    const latexContent = await fs.readFile(texFilePath, 'utf8');
    const validation = validateLatexContent(latexContent);
    
    if (!validation.valid) {
      await fs.remove(texFilePath); // Clean up uploaded file
      return res.status(400).json({ error: validation.error });
    }

    const compilationResult = await compileLatexWithBibliography(workingDir, texFileName);
    
    if (!compilationResult.success) {
      return res.status(400).json({ 
        message: compilationResult.error || 'LaTeX compilation failed'
      });
    }

    if (!(await fs.pathExists(pdfFilePath))) {
      return res.status(400).json({ 
        message: 'PDF generation failed - output file not found'
      });
    }

    // Upload both files to R2
    const [urlLatex, urlPdf] = await Promise.all([
      uploadToR2(texFilePath, `${fileUuid}.tex`, 'text/plain'),
      uploadToR2(pdfFilePath, `${fileUuid}.pdf`, 'application/pdf')
    ]);

    res.json({
      urlPdf,
      urlLatex
    });

  } catch (error) {
    console.error('LaTeX compilation error:', error);
    res.status(400).json({ 
      message: error instanceof Error ? error.message : 'Unknown compilation error'
    });
  } finally {
    try {
      await fs.remove(texFilePath);
      if (await fs.pathExists(pdfFilePath)) {
        await fs.remove(pdfFilePath);
      }
      const auxFiles = await fs.readdir(workingDir);
      for (const file of auxFiles) {
        if (file.startsWith(texFileName) && 
            (file.endsWith('.aux') || file.endsWith('.log') || 
             file.endsWith('.bbl') || file.endsWith('.blg') || 
             file.endsWith('.out') || file.endsWith('.toc') || 
             file.endsWith('.fls') || file.endsWith('.fdb_latexmk'))) {
          await fs.remove(path.join(workingDir, file));
        }
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
  }
});

app.get('/health', async (_req: Request, res: Response) => {
  const healthStatus = {
    status: 'OK',
    message: 'LaTeX Compiler Server is running',
    dependencies: {
      pdflatex: false,
      bibtex: false
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Check if pdflatex is available
    await execAsync('pdflatex --version');
    healthStatus.dependencies.pdflatex = true;
  } catch (error) {
    healthStatus.dependencies.pdflatex = false;
  }

  try {
    // Check if bibtex is available
    await execAsync('bibtex --version');
    healthStatus.dependencies.bibtex = true;
  } catch (error) {
    healthStatus.dependencies.bibtex = false;
  }

  // If critical dependencies are missing, return unhealthy status
  if (!healthStatus.dependencies.pdflatex) {
    healthStatus.status = 'UNHEALTHY';
    healthStatus.message = 'LaTeX compiler dependencies are missing';
    return res.status(503).json(healthStatus);
  }

  res.json(healthStatus);
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`LaTeX Compiler Server is running on port ${PORT}`);
  });
}

export default app;