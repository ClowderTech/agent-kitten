ARG NODE_VERSION=lts
FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
# RUN npm run build || true   # only if you have a build step

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# create non-root user (optional)
RUN groupadd -r app && useradd -r -g app app \
  && mkdir -p /home/app /app

# copy app + node_modules and set ownership
COPY --from=builder --chown=app:app /app /app

USER app
# EXPOSE 3000
CMD ["npm", "run", "start"]
