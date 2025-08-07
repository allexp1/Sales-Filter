FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (include dev dependencies for development)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p data uploads processed logs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]