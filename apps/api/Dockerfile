# API image. Build from the repository root:  docker build -f apps/api/Dockerfile .
FROM node:20-bookworm-slim

# Chromium renders the PDF reports; the fonts keep names and accents from turning into boxes.
# openssl is needed by Prisma.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-noto-core openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=3001

WORKDIR /app

# Dependencies first, so code changes don't reinstall everything.
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
# Dev dependencies stay: the Prisma CLI (migrations) and ts-node (seed, admin script) run inside this image.
RUN npm ci --include=dev --workspace=@personnelq/api --include-workspace-root=false

COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build

# Run as an unprivileged user.
RUN chown -R node:node /app
USER node

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply migrations, make sure the assessment catalogue and roles exist (idempotent), then start.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main"]
