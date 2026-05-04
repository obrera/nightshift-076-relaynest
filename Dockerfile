FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
RUN npm install
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
COPY packages ./packages
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist/client ./dist/client
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
