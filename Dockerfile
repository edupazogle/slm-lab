# The hosted SLM lab (Railway, see railway.json): the web app (landing, chat, bench, needle self-test) at /, the Second
# Look page at /second-look/, both served by app/serve.py with the COOP/COEP headers multi-threaded WASM needs.
# Models are not in the image: the web app downloads its GGUF models from huggingface.co in the browser, and the Second
# Look models are fetched at build time by its build.sh, as the GitHub Pages workflow does.

FROM node:22-slim AS web
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /src/app/web
COPY app/web/package.json app/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/web/ ./
RUN npm run build

FROM python:3.12-slim AS second-look
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /src/app/second-look
COPY app/second-look/ ./
RUN bash build.sh && python3 build_pages.py

FROM python:3.12-slim
WORKDIR /srv
COPY app/serve.py ./
COPY --from=web /src/app/web/dist ./site
COPY --from=second-look /src/app/second-look/dist ./site/second-look
# serve.py reads $PORT, which Railway sets
CMD ["python3", "serve.py", "--public", "--dir", "/srv/site"]
