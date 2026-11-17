# Hex Tycoon – Node server v kontejneru (alternativa ke Cloudflare).
# Sestavení:  docker build -t hextycoon .
# Spuštění:   docker run -d --name hextycoon -p 3000:3000 -v hextycoon-data:/data hextycoon
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY server ./server
COPY public ./public
ENV PORT=3000 DATA_DIR=/data NODE_ENV=production
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "server/server.js"]
