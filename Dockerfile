# Use the latest Node.js LTS image
FROM denoland/deno:debian

# Set the working directory inside the Docker container
WORKDIR /app

# Update package lists and install necessary packages
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils

# Copy package.json and package-lock.json (if it exists) to Docker image
COPY package*.json ./

# Install Node.js dependencies
RUN deno install --allow-scripts=npm:puppeteer

# Copy all other files from the current directory to /app in the container
COPY . .

EXPOSE 5000

# Command to run the application
CMD ["deno", "run", "--allow-all", "src/index.ts"]