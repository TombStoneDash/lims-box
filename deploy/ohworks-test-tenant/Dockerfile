FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run typecheck \
    && npm run lint \
    && npm run test:synthetic \
    && npm run test:bot \
    && npm run test:notify \
    && npm run test:person-detail \
    && npm run test:personnel-pack \
    && npm run test:commercial-claims \
    && npm run test:unsubscribe \
    && npm run test:attribution \
    && npm run test:field-scout \
    && npm run test:host-redirects \
    && npm run test:ohworks \
    && npm run build \
    && npm run test:ohworks-runtime \
    && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3218
ENV OHWORKS_DATA_DIR=/var/lib/ohworks-test
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/ohworks-test \
    && chown node:node /var/lib/ohworks-test

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/next.config.js ./next.config.js
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/node_modules ./node_modules

USER node
EXPOSE 3218
CMD ["./node_modules/.bin/next", "start", "-p", "3218", "-H", "0.0.0.0"]
