# Initial fail-closed Render adapter. It does not expose the REA MCP catalog.
FROM node:24.22.1-bookworm-slim
RUN npm install --global rea-agents@6.7.0 && npm cache clean --force
WORKDIR /app
COPY --chown=node:node gateway.mjs ./gateway.mjs
USER node
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "gateway.mjs"]
