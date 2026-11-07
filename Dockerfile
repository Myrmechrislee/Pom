FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S pom && adduser -S pom -G pom
COPY --from=builder --chown=pom:pom /app/.next/standalone ./
COPY --from=builder --chown=pom:pom /app/.next/static ./.next/static
COPY --from=builder --chown=pom:pom /app/public ./public
USER pom
EXPOSE 3000
CMD ["node", "server.js"]
