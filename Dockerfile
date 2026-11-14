# ==============================================================================
# Stage 1: Builder (Compile Backend NestJS + Frontend React SPA + Prisma Client)
# ==============================================================================
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install OpenSSL required by Prisma Engine
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NPM_CONFIG_PRODUCTION=false

# 1. Install Backend dependencies (including devDependencies for building)
COPY package*.json ./
COPY prisma ./prisma/
COPY scripts ./scripts/
RUN npm install --include=dev --no-audit --no-fund

# 2. Install Frontend dependencies
COPY frontend/package*.json ./frontend/
RUN npm --prefix frontend install --include=dev --no-audit --no-fund

# 3. Copy Backend + Frontend source (frontend imports src/shared/scale-core.ts)
COPY tsconfig*.json nest-cli.json ./
COPY assets ./assets/
COPY tools ./tools/
COPY src ./src/
COPY frontend ./frontend/

# 4. Generate Prisma Client, build Backend (dist/), build Frontend SPA (frontend/dist/), and prune devDependencies
RUN npx prisma generate \
    && npm run build \
    && npm --prefix frontend run build \
    && npm prune --omit=dev

# ==============================================================================
# Stage 2: Production Runner (Lightweight 512MB-Friendly Runtime)
# ==============================================================================
FROM node:20-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3002
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Install runtime dependencies: OpenSSL (Prisma) & curl (Healthcheck)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy production node_modules (with pre-generated Prisma client & CLI) and runtime files from builder
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/tools ./tools
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist
COPY --from=builder /app/assets ./assets
COPY --from=builder /app/src/shared/report-kit/assets ./dist/shared/report-kit/assets

EXPOSE 3002

# Start using unified cloud startup script (DB schema sync + Bootstrap + License + NestJS)
CMD ["node", "scripts/render-start.cjs"]
