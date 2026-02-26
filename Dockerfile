FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create auth directory
RUN mkdir -p /app/auth

# Start the bot
CMD ["node", "index.js"]
