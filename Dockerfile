FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json tsconfig.server.json vite.config.ts index.html server.ts ./
COPY api ./api
COPY src ./src

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
