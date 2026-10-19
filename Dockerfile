FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24-alpine
LABEL org.opencontainers.image.title="Futboleros" \
      org.opencontainers.image.description="Tu equipo, su calendario y su temporada" \
      org.opencontainers.image.source="https://github.com/kadyto/futboleros" \
      org.opencontainers.image.version="0.1.0"
ENV NODE_ENV=production PORT=8000 DATA_DIR=/data TZ=Europe/Madrid
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node server ./server
COPY --chown=node:node package.json ./
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
