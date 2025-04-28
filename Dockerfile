FROM node:18-slim

# Install build tools for native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install dependencies first for cache efficiency
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Ensure Swiss Ephemeris data is included
COPY ephe ./ephe

EXPOSE 8080

CMD ["npm", "start"]