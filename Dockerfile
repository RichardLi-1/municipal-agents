# Municipal Agents: one image with the API, the agents, the resident web app, the
# marketing site (landing/), the docs (docs-site/) and the embeddable widget (embed/).

# Stage 1: build the sites. The whole context is copied because a site may not exist
# yet in early deploys and may import ../shared. Vite runs without the type check (the
# web builder runs that) and a failed build doesn't block the API: the server falls back
# to the resident app for / and /docs, or shows a "not built yet" page.
FROM node:24-slim AS build
WORKDIR /src
COPY . .
RUN if [ -f web/package.json ]; then \
      (npm --prefix web ci --no-audit --no-fund && cd web && npx vite build) \
        || echo "WARNING: web build failed; deploying the API without the web app"; \
    else \
      echo "web/ not present yet: skipping the web build"; \
    fi \
 && for site in landing docs-site; do \
      if [ -f "$site/package.json" ]; then \
        (cd "$site" && (npm ci --no-audit --no-fund || npm install --no-audit --no-fund) && npm run build) \
          || echo "WARNING: $site build failed; / and /docs fall back to the resident app"; \
      else \
        echo "$site/ not present: skipping"; \
      fi; \
    done \
 && mkdir -p web/dist landing/dist docs-site/dist embed agents lenses data cities shared

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
COPY --from=build /src/landing/dist ./landing/dist
COPY --from=build /src/docs-site/dist ./docs-site/dist
COPY --from=build /src/embed ./embed
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
