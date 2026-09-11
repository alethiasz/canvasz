# syntax=docker/dockerfile:1

# ---- build do front ----------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 é nativo: sem toolchain o npm ci falha quando não há prebuild.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- dependências de produção ------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- runtime -----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    CANVASZ_DATA=/app/data \
    PORT=8787
WORKDIR /app

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# O Node 24 executa TypeScript direto (type stripping), então o servidor vai
# como .ts mesmo — sem tsx nem passo de compilação no backend.
COPY server ./server
COPY scripts ./scripts
COPY package.json ./
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN mkdir -p /app/data /app/backups && chown -R node:node /app/data /app/backups

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "server/index.ts"]
