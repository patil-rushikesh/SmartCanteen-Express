FROM node:22-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080 PM2_HOME=/tmp/pm2
ENV PATH="/app/node_modules/.bin:$PATH"
WORKDIR /app
RUN apk add --no-cache ca-certificates && mkdir -p /app/certs && \
    wget -q https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -O /app/certs/rds.pem && \
    awk '/-----BEGIN CERTIFICATE-----/ {n++; file="/usr/local/share/ca-certificates/rds-" n ".crt"} file {print > file} /-----END CERTIFICATE-----/ {close(file); file=""}' /app/certs/rds.pem && \
    update-ca-certificates && \
    addgroup -S nodejs && adduser -S smartcanteen -G nodejs
ENV NODE_EXTRA_CA_CERTS=/app/certs/rds.pem
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
# Prisma CLI is retained for the separate migration task.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY scripts/container.mjs ./scripts/container.mjs
COPY ecosystem.config.cjs ./
USER smartcanteen
EXPOSE 8080
ENTRYPOINT ["node", "scripts/container.mjs"]
CMD ["serve"]
