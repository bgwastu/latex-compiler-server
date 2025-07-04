FROM node:18-alpine

# Install system dependencies including curl for healthcheck
RUN apk add --no-cache \
    curl \
    fontconfig \
    ttf-dejavu

# Install minimal LaTeX packages (only what's needed for pdflatex and bibtex)
RUN apk add --no-cache \
    texlive \
    texlive-luatex \
    texlive-xetex \
    texmf-dist \
    texmf-dist-latexextra \
    texmf-dist-fontsrecommended \
    texmf-dist-mathscience \
    texmf-dist-pictures \
    texmf-dist-bibtexextra \
    && fc-cache -fv

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the TypeScript code
RUN pnpm build

# Create temp directory for LaTeX compilation with proper permissions
RUN mkdir -p temp && chmod 755 temp

# Expose port
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]