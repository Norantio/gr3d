FROM node:22-alpine

WORKDIR /app
COPY package.json server.js ./
COPY dist/ ./dist/

ENV DATA_DIR=/data
RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 80
CMD ["node", "server.js"]