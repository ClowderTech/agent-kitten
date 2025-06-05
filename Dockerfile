FROM node:current-slim

WORKDIR /app

# Create a non-root user and set permissions
RUN groupadd clowdertech && useradd -g clowdertech clowdertech \
    && mkdir -p /home/clowdertech/Downloads /app \
    && chown -R clowdertech:clowdertech /home/clowdertech \
    && chown -R clowdertech:clowdertech /app

# Copy only package files first (for caching)
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --only=production

# Copy application source code
COPY . .

# Adjust ownership for all app files
RUN chown -R clowdertech:clowdertech /app

# Switch to non-root user (for least privilege)
USER clowdertech

# Start the app
CMD ["npm", "run", "start"]