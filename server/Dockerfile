FROM node:20-alpine

RUN npm install -g pnpm@11.0.8

WORKDIR /app

COPY package.json pnpm-workspace.yaml ./

RUN pnpm install --no-frozen-lockfile

COPY . .

EXPOSE 5000

CMD ["node", "app.js"]
