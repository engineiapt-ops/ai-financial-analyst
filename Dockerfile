FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY tsconfig.json ./
COPY tsconfig.server.json ./
COPY tsconfig.tests.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY server.ts ./
COPY api ./api
COPY src ./src
COPY db ./db
RUN npm run build

FROM node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/api ./api
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/index.html ./index.html
COPY --from=build /app/tsconfig.server.json ./tsconfig.server.json
COPY --from=build /app/db ./db
COPY --from=build /app/vite.config.ts ./vite.config.ts
COPY package*.json ./
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
