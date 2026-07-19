FROM node:20-alpine AS base
# Prisma's engine binaries need OpenSSL to be present to detect the right
# variant (linux-musl-openssl-3.0.x) - without this the schema/query engine
# fails to start with a non-JSON error at runtime, not just a warning.
RUN apk add --no-cache openssl
WORKDIR /app

FROM base AS deps
COPY package.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 3001
CMD ["node", "dist/src/main"]
