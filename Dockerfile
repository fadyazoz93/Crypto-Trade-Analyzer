FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy all source files
COPY . .

# Build Vite frontend and Express server bundle
RUN npm run build

# Expose server port
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Start production server & 24/7 background scanner daemon
CMD ["node", "dist/server.cjs"]
