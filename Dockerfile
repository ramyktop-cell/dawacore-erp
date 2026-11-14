# ==============================================================================
# Stage 1: Builder (Compile TypeScript, Generate Prisma Client, Verify Assets)
# ==============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL required by Prisma Engine
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Skip Chromium download during build to speed up npm ci
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package manifests and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy full backend source and static assets
COPY tsconfig*.json nest-cli.json ./
COPY assets ./assets/
COPY src ./src/

# Ensure Arabic font assets exist, generate Prisma Client, and build NestJS
RUN npm run fonts:download || true
RUN npx prisma generate
RUN npm run build

# ==============================================================================
# Stage 2: Production Runner (Lightweight & Hardened Runtime)
# ==============================================================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3002
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install runtime dependencies: OpenSSL (Prisma), Chromium & Arabic fonts (PDF Reports), curl (Healthcheck)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    chromium \
    fonts-hosny-amiri \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install production-only dependencies + prisma CLI for migrations
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/

RUN npm ci --omit=dev && npm install --no-save prisma@^5.22.0 ts-node typescript && npx prisma generate && npm cache clean --force

# Copy compiled output and verified assets from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/src/shared/report-kit/assets ./dist/shared/report-kit/assets

# Prepare entrypoint script permissions
RUN chmod +x /app/scripts/docker-entrypoint.sh

EXPOSE 3002

# Healthcheck verifying API availability
HEALTHCHECK --interval=30s --timeout=10s --start-period=25s --retries=3 \
  CMD curl -f http://localhost:3002/api || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
