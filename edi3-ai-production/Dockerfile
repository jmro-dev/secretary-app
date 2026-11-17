FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@12.21.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm exec tsc

# Servidor de ejecución
FROM node:22-slim

WORKDIR /app

COPY --from=builder /app /app

ENV PORT=8000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 8000

CMD ["node", "dist/index.js"]
