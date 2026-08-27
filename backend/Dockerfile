FROM node:22-bookworm-slim AS build
WORKDIR /app

ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN find /app/scripts -type f -name "*.sh" -exec sed -i 's/\r$//' {} \; -exec chmod 755 {} \;
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV UPLOAD_DIR=/data/uploads

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/db ./db
COPY --from=build /app/lib ./lib
COPY --from=build /app/package.json ./package.json
COPY --from=build --chmod=755 /app/scripts/start-railway.sh ./scripts/start-railway.sh
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

RUN mkdir -p /data/uploads && chown -R node:node /app /data
USER node

EXPOSE 3000
CMD ["./scripts/start-railway.sh"]
