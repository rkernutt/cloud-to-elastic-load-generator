# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache friendly); copy scripts so postinstall (copy-icons) can run
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install nginx and supervisor
RUN apk add --no-cache nginx supervisor

# Nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy built SPA assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy proxy server (CommonJS .cjs — works regardless of package "type" in image)
COPY proxy.cjs /app/proxy.cjs

# Supervisor config to run nginx + node proxy together
RUN mkdir -p /var/log/supervisor
COPY supervisord.conf /etc/supervisord.conf

# Fix nginx dirs
RUN mkdir -p /var/lib/nginx/tmp /run/nginx && \
    chown -R nginx:nginx /var/lib/nginx /run/nginx /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost/health || exit 1

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
