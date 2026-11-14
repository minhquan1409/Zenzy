# Zenzy API — image chạy trên AWS (App Runner / ECS Fargate / EC2).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# Trong container phải lắng nghe mọi giao diện thì cổng mới ánh xạ ra ngoài được (xem src/common/config.ts).
ENV NODE_ENV=production PORT=8080 LISTEN_ALL_INTERFACES=true
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY seed ./seed
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3   CMD node dist/healthcheck.js
CMD ["node", "dist/main.js"]
