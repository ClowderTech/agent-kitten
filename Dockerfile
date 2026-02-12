# syntax=docker/dockerfile:1

ARG RUST_VERSION=1.93.1
ARG APP_NAME=agent-kitten
ARG UID=10001

################################################################################
# Build stage: compile the Rust application on Debian slim

FROM rust:${RUST_VERSION}-trixie AS build
ARG APP_NAME

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    clang \
    lld \
    git \
    ca-certificates \
    cmake \
    make \
    autoconf \
    automake \
    libtool \
    m4 \
    build-essential \
    libopus-dev \
    libssl-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy manifest and source via bind mounts / cache mounts for fast rebuilds.
# (Use docker build --mount for optimal caching.)
# Compile in release mode, then copy the resulting binary to /bin/server.
COPY . .

RUN --mount=type=cache,target=/app/target/ \
    --mount=type=cache,target=/usr/local/cargo/git/db \
    --mount=type=cache,target=/usr/local/cargo/registry/ \
    cargo build --locked --release && cp target/release/${APP_NAME} /bin/server

################################################################################
# Runtime stage: minimal Debian slim environment

FROM debian:trixie-slim AS final
ARG UID

# Install only what's needed to run the binary
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create system user using useradd/usergroup
RUN groupadd -r appuser -g "${UID}" \
    && useradd -l -r -u "${UID}" -g appuser \
    -d /nonexistent -s /usr/sbin/nologin appuser

# Switch to unprivileged user
USER appuser

# Copy the compiled binary from the build stage
COPY --from=build /bin/server /bin/server

# Expose application port
EXPOSE 3000

# Start the server
CMD ["/bin/server"]
