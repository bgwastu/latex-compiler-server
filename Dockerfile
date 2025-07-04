FROM node:18-alpine

# Install LaTeX and required packages
RUN apk add --no-cache \
    texlive-full \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-fonts-extra \
    texlive-science \
    texlive-pictures \
    texlive-luatex \
    texlive-xetex \
    texmf-dist \
    fontconfig \
    ttf-dejavu \
    && fc-cache -fv

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the TypeScript code
RUN pnpm build

# Create temp directory for LaTeX compilation
RUN mkdir -p temp

# Expose port
EXPOSE 3000

# Start the server
CMD ["pnpm", "start"]