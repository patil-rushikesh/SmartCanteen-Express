# ----------- BUILDER -----------
FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml tsconfig.json prisma.config.ts pnpm-workspace.yaml ./
COPY prisma ./prisma
COPY frontend/package.json ./frontend/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ----------- RUNTIME -----------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
COPY prisma ./prisma

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

RUN addgroup -S nodejs && adduser -S smartcanteen -G nodejs
USER smartcanteen

EXPOSE 8080

CMD ["sh", "./entrypoint.sh"]
