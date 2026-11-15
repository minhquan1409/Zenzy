# Zenzy API container (spec 4.8: the API runs as a container).
FROM node:24-alpine AS build
WORKDIR /app
# The in-memory MongoDB used by the tests is not needed in the image.
ENV MONGOMS_DISABLE_POSTINSTALL=1
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src src
COPY scripts scripts
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
# Trong container phải lắng nghe mọi giao diện thì Caddy/ánh xạ cổng mới tới được (xem src/core/address.ts).
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY admin admin
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/src/main.js"]
