# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.12.1 turbo@2.5.4

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @repo/api --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=@repo/api
# Self-contained production bundle (workspace deps included with their dist).
# pnpm 10 requires --legacy for deploy from a plain workspace.
RUN pnpm --filter=@repo/api deploy --prod --legacy /prod/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /prod/api .
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
