FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

FROM base AS build

COPY package.json pnpm-lock.yaml tsconfig.json prisma.config.ts ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm prisma:generate
RUN pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

RUN addgroup -S nodejs && adduser -S smartcanteen -G nodejs
USER smartcanteen

EXPOSE 8080

CMD ["node", "dist/index.js"]
