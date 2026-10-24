# Fail-closed Render adapter. OAuth scaffolding does not enable remote REA tools.
FROM node:24.22.1-bookworm-slim
WORKDIR /app
COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && \
    npm install --global rea-agents@6.7.0 --no-audit --no-fund && \
    npm cache clean --force
COPY --chown=node:node *.mjs ./
USER node
ENV NODE_ENV=production
EXPOSE 10000
CMD ["node", "gateway.mjs"]
