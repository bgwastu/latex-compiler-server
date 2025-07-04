# LaTeX Compiler Server

A TypeScript/Express.js server that compiles LaTeX files to PDF via a REST API.

## Features

- **POST /convert**: Upload a .tex file and get R2 URLs for both LaTeX and PDF files
- **GET /health**: Health check endpoint
- **Cloudflare R2 Storage**: Automatic upload to R2 with public URLs
- **Full Bibliography Support**: Automatic handling of citations and references
- **Multiple Compilation Passes**: Proper LaTeX workflow (pdflatex → bibtex → pdflatex → pdflatex)
- **Detailed Error Messages**: Returns compilation errors with full details
- TypeScript with ESM modules
- Docker support with full LaTeX installation
- Comprehensive test suite
- Example LaTeX files included

## API Usage

### Convert LaTeX to PDF

```bash
curl -X POST \
  http://localhost:3000/convert \
  -F "input=@example.tex"
```

**Response:**
```json
{
  "urlPdf": "https://<public_site>/uuid.pdf",
  "urlLatex": "https://<public_site>/uuid.tex"
}
```

**Error Response (400):**
```json
{
  "message": "LaTeX compilation error details..."
}
```

The server accepts a `.tex` file via form-data and returns URLs to the uploaded files on Cloudflare R2.

## Development

### Prerequisites

- Node.js 18+
- pnpm
- LaTeX distribution (for local testing)
- Cloudflare R2 credentials

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment file and configure
cp .env.example .env
# Edit .env with your R2 credentials

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

### Environment Variables

Create a `.env` file with:

```bash
R2_BUCKET=your_bucket_name
R2_URL=https://your_account_id.r2.cloudflarestorage.com/
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key
PORT=3000
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

### POST /convert

Converts a LaTeX file to PDF and uploads both files to R2.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: Form field `input` with .tex file

**Response:**
- Success (200): JSON with R2 URLs
- Error (400): Compilation failed with details

**Success Response:**
```json
{
  "urlPdf": "https://<public_site>/uuid.pdf",
  "urlLatex": "https://<public_site>/uuid.tex"
}
```

**Error Response:**
```json
{
  "message": "Detailed compilation error message"
}
```

**Example:**
```bash
curl -X POST \
  -F "input=@document.tex" \
  http://localhost:3000/convert
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