FROM node:22-alpine
WORKDIR /app
COPY server.mjs .
ENV NODE_ENV=production DATA_DIR=/data PORT=8787
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server.mjs"]
