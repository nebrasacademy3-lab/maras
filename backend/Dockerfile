FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG NEXT_PUBLIC_SITE_URL=https://meras-alelm.glossy-sun-8084.chatgpt.site
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/start-railway.sh ./scripts/start-railway.sh
COPY --from=build /app/wrangler.railway.jsonc ./wrangler.railway.jsonc

EXPOSE 3000
CMD ["bash", "scripts/start-railway.sh"]
