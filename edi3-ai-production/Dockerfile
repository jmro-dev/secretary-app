FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.19.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Servidor de ejecución
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.19.0 --activate

COPY --from=builder /app /app

ENV PORT=8000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8000

CMD ["pnpm", "exec", "tsx", "src/index.ts"]
