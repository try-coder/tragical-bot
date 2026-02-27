FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package.json ./
COPY .npmrc ./

# Install dependencies using npm install (not ci)
RUN npm install

# Copy source code
COPY . .

# Create auth directory
RUN mkdir -p /app/auth

# Start the bot
CMD ["node", "index.js"]
