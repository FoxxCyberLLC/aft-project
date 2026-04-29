###############################################################################
# AFT - all-in-one container
#
# Bundles:
#   - PostgreSQL 18  (data dir: /var/lib/postgresql/data)
#   - nginx          (front door, terminates TLS, proxies to Bun on 127.0.0.1:3001)
#   - Bun + AFT app  (loopback only, gated by X-AFT-Proxy-Secret)
#
# Process supervision: supervisord, with tini as PID 1.
#
# Volumes you'll typically mount:
#   - /var/lib/postgresql/data   -> persistent Postgres data
#   - /etc/aft/ssl               -> nginx TLS material (cert.pem, key.pem)
#                                   plus DOD CA bundle for client certs
#
# Required env vars on first boot:
#   POSTGRES_PASSWORD               (sets the aft DB user password)
#   AFT_PROXY_SHARED_SECRET         (long random; nginx <-> bun shared secret)
#   AFT_ADMIN_BOOTSTRAP_PASSWORD    (>=12 chars; seeds first admin user)
#   AFT_ADMIN_BOOTSTRAP_EMAIL       (defaults to admin@aft.gov)
#
# Build:
#   docker build -t aft:latest .
#
# Run:
#   docker run -d --name aft \
#     -p 80:80 -p 443:443 \
#     -v aft_pgdata:/var/lib/postgresql/data \
#     -v $(pwd)/ssl:/etc/aft/ssl:ro \
#     -e AFT_PROXY_SHARED_SECRET=$(openssl rand -hex 32) \
#     -e AFT_ADMIN_BOOTSTRAP_PASSWORD='change-me-please-1234' \
#     aft:latest
###############################################################################

###############################################################################
# Stage 1: install JS deps with the official Bun image
###############################################################################
FROM oven/bun:1.3 AS bun-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

###############################################################################
# Stage 2: runtime - postgres:18 + nginx + supervisord + bun + app
###############################################################################
FROM postgres:18

# Install nginx, supervisord, tini, ca-certs, curl. Then drop the apt lists.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        nginx \
        supervisor \
        tini \
        curl \
        ca-certificates \
        gosu \
    && rm -rf /var/lib/apt/lists/*

# Install Bun from the official tarball into /usr/local. We can't use the
# `oven/bun` image as a multi-stage source for the binary alone because the
# runtime architecture must match.
ARG BUN_VERSION=1.3.13
RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
        amd64) bunArch=linux-x64 ;; \
        arm64) bunArch=linux-aarch64 ;; \
        *) echo "Unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-${bunArch}.zip" -o /tmp/bun.zip; \
    apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*; \
    unzip -q /tmp/bun.zip -d /tmp/bun; \
    install -m 0755 "/tmp/bun/bun-${bunArch}/bun" /usr/local/bin/bun; \
    ln -s /usr/local/bin/bun /usr/local/bin/bunx; \
    rm -rf /tmp/bun.zip /tmp/bun; \
    bun --version

# Layout:
#   /app                   - the AFT application
#   /etc/supervisor/conf.d - supervisord configs
#   /etc/aft/ssl           - mounted at runtime (nginx TLS + DOD CA bundle)
WORKDIR /app

# Copy node_modules from the bun-deps stage so we don't need to re-run install
COPY --from=bun-deps /app/node_modules ./node_modules

# Application source. The .dockerignore strips data/, .git, node_modules, etc.
COPY . .

# nginx config and supervisord config
COPY docker/nginx.conf       /etc/nginx/nginx.conf
COPY docker/aft_proxy.conf   /etc/nginx/conf.d/aft_proxy.conf
COPY docker/aft_cac.conf     /etc/nginx/conf.d/aft_cac.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/aft.conf
COPY docker/entrypoint.sh    /usr/local/bin/aft-entrypoint.sh
RUN chmod +x /usr/local/bin/aft-entrypoint.sh

# Create runtime dirs and fix ownership for the postgres user (the postgres
# image already creates a `postgres` user; we reuse it). nginx and supervisord
# run as root.
RUN mkdir -p /etc/aft/ssl /var/log/aft /var/log/supervisor /var/lib/postgresql/data \
    && chown -R postgres:postgres /var/lib/postgresql/data \
    && chmod 700 /var/lib/postgresql/data

# Pre-flight: build the app to fail-fast on type errors at image build time.
RUN bun build index.ts --target=bun --outdir /tmp/aft-build > /dev/null \
    && rm -rf /tmp/aft-build

EXPOSE 80 443

# Healthcheck: nginx must answer on /healthz (handled by Bun's default route).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
    CMD curl -fsS http://127.0.0.1/healthz || exit 1

# tini is PID 1 so signals propagate cleanly to supervised children.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/aft-entrypoint.sh"]
