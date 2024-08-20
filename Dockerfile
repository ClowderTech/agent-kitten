FROM oven/bun:latest

WORKDIR /app

COPY . /app

RUN bun install

RUN bunx playwright install chromium

RUN bunx playwright install-deps chromium

CMD ["bun", "run", "src/index.ts"]