FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create dist directory if it doesn't exist
RUN mkdir -p dist

# Build TypeScript
RUN npm run build

# Make the entry point executable
RUN chmod +x dist/index.js

# Verify the build output exists
RUN ls -la dist/

# Set the entry point
ENTRYPOINT ["node", "dist/index.js"] 