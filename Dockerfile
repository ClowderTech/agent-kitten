# syntax=docker/dockerfile:1

# syntax=docker/dockerfile:1

# Comments are provided throughout this file to help you get started.
# If you need more help, visit the Dockerfile reference guide at
# https://docs.docker.com/go/dockerfile-reference/

# Want to help us make this template better? Share your feedback here: https://forms.gle/ybq9Krt8jtBL3iCk7

ARG NODE_VERSION=lts

FROM node:${NODE_VERSION}-slim

# Use production node environment by default.
ENV NODE_ENV production

WORKDIR /app

RUN groupadd clowdertech && useradd -g clowdertech clowdertech \
    && mkdir -p /home/clowdertech/Downloads /app \
    && chown -R clowdertech:clowdertech /home/clowdertech \
    && chown -R clowdertech:clowdertech /app

# Download dependencies as a separate step to take advantage of Docker's caching.
# Leverage a cache mount to /root/.npm to speed up subsequent builds.
# Leverage a bind mounts to package.json and package-lock.json to avoid having to copy them into
# into this layer.
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Copy the rest of the source files into the image.
COPY . .

RUN chown -R clowdertech:clowdertech /app

# Run the application as a non-root user.
USER clowdertech

# Expose the port that the application listens on.
EXPOSE 3000

# Run the application.
CMD ["npm", "run", "start"]
