# Talvis on Cloud Run. Playwright's image brings Node and Chromium (for JavaScript pages).
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
COPY package.json package-lock.json ./
# tsx and vite are dev dependencies but needed to build and run.
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npx vite build

# Data lives in Postgres (DATABASE_URL); /app/data is the working copy, refilled on every start.
# Claude account 1 also keeps its login under /app/data/accounts, so it is backed up with the others.
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    PHD_DATA_DIR=/app/data \
    CLAUDE_CONFIG_DIR=/app/data/accounts/main
EXPOSE 8080
CMD ["node", "--import", "tsx", "server/start.ts"]
