import fs from 'fs-extra';
import path from 'path';
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

async function testLatexFile(filePath: string): Promise<boolean> {
  const tempDir = path.join(__dirname, '../temp-test');
  await fs.ensureDir(tempDir);
  
  const fileName = path.basename(filePath, '.tex');
  const tempTexFile = path.join(tempDir, `${fileName}.tex`);
  const tempPdfFile = path.join(tempDir, `${fileName}.pdf`);
  
  try {
    await fs.copy(filePath, tempTexFile);
    
    await compileLatexWithBibliography(tempDir, fileName);
    
    const pdfExists = await fs.pathExists(tempPdfFile);
    
    await fs.remove(tempDir);
    
    return pdfExists;
  } catch (error) {
    console.error(`Error compiling ${filePath}:`, error);
    await fs.remove(tempDir);
    return false;
  }
}

async function testAllExamples(): Promise<void> {
  const exampleDir = path.join(__dirname, '../example');
  const texFiles = await fs.readdir(exampleDir);
  
  const results: { file: string; success: boolean }[] = [];
  
  for (const file of texFiles) {
    if (file.endsWith('.tex')) {
      const filePath = path.join(exampleDir, file);
      const success = await testLatexFile(filePath);
      results.push({ file, success });
      console.log(`${file}: ${success ? 'PASS' : 'FAIL'}`);
    }
  }
  
  const allPassed = results.every(result => result.success);
  console.log(`\nAll tests passed: ${allPassed}`);
  
  if (!allPassed) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testAllExamples().catch(console.error);
}

export { testLatexFile, testAllExamples };