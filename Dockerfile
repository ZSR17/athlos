# Athlos: one image serving the API and the built web app (arm64 or amd64):
#   docker build -t athlos:latest .

# 1. Build the client (web app).
FROM node:22-bookworm-slim AS client
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --ignore-scripts
COPY tsconfig.base.json ./
COPY shared/ shared/
COPY client/ client/
RUN npm run build -w client

# 2. Server production dependencies (native modules: better-sqlite3, sharp).
FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server -w shared

# 3. Runtime: Node + ffmpeg (video and GIF conversion).
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY shared/ shared/
COPY server/package.json server/
COPY server/src server/src
COPY server/drizzle server/drizzle
COPY --from=client /app/client/dist client/dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    STATIC_DIR=/app/client/dist
# uid 1000, usually the first user of the host: the bind-mounted data/ stays readable from it.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/main.ts"]
