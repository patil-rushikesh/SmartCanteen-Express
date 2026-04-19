FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

# Copy monorepo files from root context
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy frontend package and source
COPY . .

# Install dependencies using the monorepo workspace
RUN pnpm install --frozen-lockfile --ignore-scripts

WORKDIR /app

EXPOSE 5173

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
