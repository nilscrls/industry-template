# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.12.1 turbo@2.5.4

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune @repo/web --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# No defaults: both must be passed explicitly (compose forwards them from .env).
# env validation runs during the build and fails fast when either is missing.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ARG API_URL
ENV API_URL=$API_URL
RUN pnpm turbo run build --filter=@repo/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
