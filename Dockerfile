FROM oven/bun:latest

WORKDIR /app

COPY . /app

RUN bun install

RUN bunx playwright install

CMD ["bun", "run", "src/index.ts"]