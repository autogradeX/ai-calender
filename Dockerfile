FROM node:22-slim

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_FILE=/data/events.json

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY public ./public
COPY knowledge ./knowledge

# /data is where tasks are saved. On Cloud Run, mount a Cloud Storage bucket
# here so they survive restarts (see deploy.sh).
RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 8080
CMD ["node", "server.js"]
