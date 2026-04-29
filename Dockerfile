
# ----------- BASE -----------
FROM node:22-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# ----------- BUILD -----------
FROM base AS build

# Copy only dependency-related files first for better cache usage
COPY package.json pnpm-lock.yaml tsconfig.json prisma.config.ts ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile --ignore-scripts

# Now copy the rest of the source code
COPY . .

RUN pnpm prisma:generate
RUN pnpm build

# ----------- RUNTIME -----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Install netcat for DB readiness check
RUN apk add --no-cache netcat-openbsd

# Copy only production artifacts and dependencies
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

# Add entrypoint
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Create non-root user
RUN addgroup -S nodejs && adduser -S smartcanteen -G nodejs
USER smartcanteen

EXPOSE 8080

CMD ["sh", "./entrypoint.sh"]