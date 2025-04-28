FROM node:18-slim

WORKDIR /usr/src/app

# Install dependencies first for cache efficiency
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

EXPOSE 8080

CMD ["npm", "start"]