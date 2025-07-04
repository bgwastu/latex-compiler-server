# LaTeX Compiler Server

A TypeScript/Express.js server that compiles LaTeX files to PDF via a REST API.

## Features

- **POST /convert-raw**: Upload a .tex file and receive a compiled PDF
- **GET /health**: Health check endpoint
- **Full Bibliography Support**: Automatic handling of citations and references
- **Multiple Compilation Passes**: Proper LaTeX workflow (pdflatex → bibtex → pdflatex → pdflatex)
- TypeScript with ESM modules
- Docker support with full LaTeX installation
- Comprehensive test suite
- Example LaTeX files included

## API Usage

### Convert LaTeX to PDF

```bash
curl -X POST \
  http://localhost:3000/convert-raw \
  -F "input=@example.tex" \
  -o output.pdf
```

The server accepts a `.tex` file via form-data and returns a PDF as raw response.

## Development

### Prerequisites

- Node.js 18+
- pnpm
- LaTeX distribution (for local testing)

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run tests
pnpm test

# Test example LaTeX files
pnpm test:examples
```

## Docker

### Build and run with Docker

```bash
# Build the image
docker build -t latex-compiler-server .

# Run the container
docker run -p 3000:3000 latex-compiler-server
```

### Using Docker Compose

```bash
docker-compose up --build
```

## Testing

The project includes comprehensive tests:

- Unit tests for the Express server
- Integration tests for LaTeX compilation
- Automated testing of all example LaTeX files

Example LaTeX files are located in the `example/` directory and include:
- Academic papers with tables, figures, and citations
- Complex LaTeX documents with multiple packages
- TikZ graphics and PGF plots

## API Endpoints

### POST /convert-raw

Converts a LaTeX file to PDF.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form field `input` with .tex file

**Response:**
- Success (200): PDF file as binary data
- Error (400): No file uploaded
- Error (500): LaTeX compilation failed

**Example:**
```bash
curl -X POST \
  -F "input=@document.tex" \
  http://localhost:3000/convert-raw \
  -o output.pdf
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "OK",
  "message": "LaTeX Compiler Server is running"
}
```

## Architecture

- **TypeScript**: Type-safe development
- **Express.js**: Web framework
- **Multer**: File upload handling
- **fs-extra**: Enhanced file system operations
- **uuid**: Unique temporary file naming
- **pdflatex + bibtex**: Complete LaTeX compilation pipeline with bibliography support

## Security

- File validation to ensure only .tex files are processed
- Temporary file cleanup after processing
- No persistent file storage
- Limited file size (configurable via multer)

## License

MIT