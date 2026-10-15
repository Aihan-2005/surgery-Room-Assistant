FROM node:22-bookworm-slim AS dependencies
ARG NPM_REGISTRY=https://registry.npmjs.org/
WORKDIR /app
COPY front/airway-assistant/package.json front/airway-assistant/package-lock.json ./
# npm redirects the lockfile's registry.npmjs.org URLs to this registry while
# retaining the locked versions and integrity checks.
RUN npm ci --registry="$NPM_REGISTRY" --fetch-timeout=120000 --fetch-retries=2 \
    --no-audit --no-fund

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY front/airway-assistant/ .
# Next.js may fetch a compiler fallback during the build; use the same mirror.
RUN npm_config_registry="$NPM_REGISTRY" npm run build

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
