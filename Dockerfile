FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node","server.js"]
# Coolify: New Resource -> Application -> this repo. It detects the Dockerfile, builds,
# exposes 3000, issues SSL. Set env PUBLIC_BASE to your final URL so MCP dashboard links work.
