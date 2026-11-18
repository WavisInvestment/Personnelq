# Website image. Build from the repository root:  docker build -f apps/web/Dockerfile .
FROM node:20-bookworm-slim

# The API address is baked into the browser code at build time, so it is a build argument.
# Use the public URL of the API including its version, e.g. https://example.com/api/v1
ARG NEXT_PUBLIC_API_URL
# Where the site lives (used for share links and previews) and the address shown on the Privacy and Terms pages.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_CONTACT_EMAIL=${NEXT_PUBLIC_CONTACT_EMAIL} \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages ./packages
RUN npm ci --include=dev --workspace=@personnelq/web --include-workspace-root=false

COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

ENV NODE_ENV=production
RUN chown -R node:node /app
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
