# Discord Timer Bot – Image mit Node.js und FFmpeg
FROM node:22-alpine AS base

# FFmpeg für Voice-Wiedergabe
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Abhängigkeiten
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev --no-audit --no-fund

# Anwendung
COPY src ./src

# Datenverzeichnis (wird zur Laufzeit gemountet oder über DATA_PATH genutzt)
ENV NODE_ENV=production
ENV DATA_PATH=/app/data

# Optional: Datenordner anlegen (wenn kein Volume gemountet wird)
RUN mkdir -p /app/data /app/data/sounds

USER node
EXPOSE 3000

CMD ["node", "src/index.js"]
