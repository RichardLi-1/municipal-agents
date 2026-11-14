# Municipal Agents: one image with the API, the agents and the built web app.

# Stage 1: build the web app. The whole context is copied because web/ may not exist
# yet in early deploys and may import ../shared; a missing web/ leaves an empty dist.
FROM node:24-slim AS build
WORKDIR /src
COPY . .
RUN if [ -f web/package.json ]; then \
      npm --prefix web ci --no-audit --no-fund && npm --prefix web run build; \
    else \
      echo "web/ not present yet: skipping the web build"; \
    fi \
 && mkdir -p web/dist agents lenses data cities shared

# Stage 2: the runtime. poppler-utils gives pdftotext for staff uploads.
FROM node:24-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /src/shared ./shared
COPY --from=build /src/server ./server
COPY --from=build /src/agents ./agents
COPY --from=build /src/lenses ./lenses
COPY --from=build /src/cities ./cities
COPY --from=build /src/data ./data
COPY --from=build /src/web/dist ./web/dist
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
