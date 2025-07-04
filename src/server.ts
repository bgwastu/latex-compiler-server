import express, { Request, Response, Express } from 'express';
import multer from 'multer';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execAsync = promisify(exec);

async function compileLatexWithBibliography(workingDir: string, texFileName: string): Promise<void> {
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
        throw error;
      }
    }
  }
}

const app: Express = express();
const PORT = process.env.PORT || 3000;

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    const tempDir = path.join(__dirname, '../temp');
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

app.post('/convert-raw', upload.single('input'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const texFilePath = req.file.path;
  const workingDir = path.dirname(texFilePath);
  const texFileName = path.basename(texFilePath, '.tex');
  const pdfFilePath = path.join(workingDir, `${texFileName}.pdf`);

  try {
    await compileLatexWithBibliography(workingDir, texFileName);

    if (await fs.pathExists(pdfFilePath)) {
      const pdfBuffer = await fs.readFile(pdfFilePath);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="output.pdf"');
      res.send(pdfBuffer);
    } else {
      res.status(500).json({ error: 'PDF generation failed' });
    }
  } catch (error) {
    console.error('LaTeX compilation error:', error);
    res.status(500).json({ 
      error: 'LaTeX compilation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
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

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'OK', message: 'LaTeX Compiler Server is running' });
});

app.listen(PORT, () => {
  console.log(`LaTeX Compiler Server is running on port ${PORT}`);
});

export default app;