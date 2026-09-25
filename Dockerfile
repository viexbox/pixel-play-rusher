FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY server ./server
COPY scripts/admin-password.js ./scripts/admin-password.js
COPY public ./public
ENV NODE_ENV=production PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
# Los datos (ranking, baneos, reportes…) van en /data. Móntale un volumen persistente desde tu plataforma o con «docker run -v datos:/data».
# (No se declara VOLUME aquí: Railway rechaza esa instrucción y hace fallar la compilación.)
EXPOSE 3000
USER node
CMD ["node", "server.js"]
