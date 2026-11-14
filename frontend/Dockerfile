# ==============================================================================
# Stage 1: Build React + Vite Frontend Application
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install dependencies with clean lockfile
RUN npm ci

# Copy frontend source code and build production bundle
COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Serve with Hardened Nginx Alpine
# ==============================================================================
FROM nginx:1.27-alpine AS runner

# Remove default nginx configuration and replace with DawaCore SPA + Proxy config
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled Vite assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
