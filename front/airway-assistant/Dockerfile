FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY front/airway-assistant/package.json front/airway-assistant/package-lock.json ./
RUN npm ci

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY front/airway-assistant/ .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --gid 10001 airway && useradd --uid 10001 --gid airway --no-create-home airway
WORKDIR /app
COPY --from=builder --chown=airway:airway /app/.next/standalone ./
COPY --from=builder --chown=airway:airway /app/.next/static ./.next/static
COPY --from=builder --chown=airway:airway /app/public ./public
USER airway
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/backend-health',{signal:AbortSignal.timeout(8000)}).then(async r=>{const h=await r.json();if(!r.ok||!h.configured||!h.reachable||!h.databaseReady)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
