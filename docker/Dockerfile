# Multi-stage build for Tricky Words.
#
# better-sqlite3 is a native module, so it must be compiled for the
# target architecture inside this image rather than copied in from the
# host — that's why the deps stage carries a C/C++ toolchain.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && npm ci \
 && rm -rf /var/lib/apt/lists/*

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    TRICKYWORDS_MODE=family \
    TRICKYWORDS_DB=/app/data/trickywords.db \
    TRICKYWORDS_DATA_DIR=/app/data

RUN useradd -m -u 1001 trickywords \
 && mkdir -p /app/data \
 && chown -R trickywords /app

# next.config.ts sets `output: 'standalone'`, so the standalone bundle
# already contains its own minimal node_modules -- no separate deps
# copy is needed in this stage.
COPY --from=build --chown=trickywords /app/.next/standalone ./
COPY --from=build --chown=trickywords /app/.next/static ./.next/static
COPY --from=build --chown=trickywords /app/public ./public

# The entrypoint and the allowlist it imports, at the same relative
# paths they have in the repo, so the one import specifier works both
# here and in a local test run. `public-surface.mts` is TypeScript that
# Node strips types from natively -- no build step, no dependency, and
# the container shares the exact file the unit tests exercise.
COPY --from=build --chown=trickywords /app/docker/entrypoint.mjs ./docker/entrypoint.mjs
COPY --from=build --chown=trickywords /app/src/lib/public-surface.mts ./src/lib/public-surface.mts
COPY --from=build --chown=trickywords /app/src/lib/forwarded-proto.mts ./src/lib/forwarded-proto.mts

USER trickywords

# 3000 is the family surface and is always served. 3001 is the guest
# surface and is bound only when TRICKYWORDS_PUBLIC is set to a truthy
# value; unset, nothing listens on it at all.
EXPOSE 3000 3001

VOLUME ["/app/data"]

# Probes the family listener, which is on in every configuration.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# The app itself is started by the entrypoint, on loopback only.
CMD ["node", "docker/entrypoint.mjs"]
