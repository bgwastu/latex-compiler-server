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
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/plain' || file.originalname.endsWith('.tex')) {
      cb(null, true);
    } else {
      cb(new Error('Only .tex files are allowed!'));
    }
  }
});

app.use(express.json());

app.post('/convert', upload.single('input'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const texFilePath = req.file.path;
  const workingDir = path.dirname(texFilePath);
  const texFileName = path.basename(texFilePath, '.tex');
  const pdfFilePath = path.join(workingDir, `${texFileName}.pdf`);
  const fileUuid = texFileName; // The filename already contains UUID

  try {
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