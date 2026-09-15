# ToolsHub Testing MCP Server
#
# Playwright's Chromium needs a pile of shared libraries that a slim Node image does not have.
# `playwright install --with-deps` installs exactly the set this Playwright version expects,
# which is more reliable than hand-listing apt packages.
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PORT=3000

WORKDIR /app

# Dependencies first so this layer is cached across code-only changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Server code + the bundled test fixtures (the tools upload these, so they must be in the image).
COPY . .

# Bake Chromium and its OS dependencies into the image — never download a browser at runtime.
RUN npx playwright install --with-deps chromium

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
