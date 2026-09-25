# The hosted SLM lab (Railway, see railway.json): Second Look is the site's landing page at /, and the web app's pages
# (chat, bench, needle self-test) live under /lab/. Both are served by app/serve.py with the COOP/COEP headers
# multi-threaded WASM needs. Models are not in the image: the web app downloads its GGUF models from huggingface.co in
# the browser, and the Second Look models are fetched at build time by its build.sh, as the GitHub Pages workflow does.

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
COPY --from=second-look /src/app/second-look/dist ./site
COPY --from=web /src/app/web/dist ./site/lab
# the old landing page is gone for good: nothing may answer at /lab/ or /lab/index.html
RUN rm -f site/lab/index.html
# retires the worker browsers registered when Second Look lived at /second-look/
COPY app/second-look/retired-sw.js ./site/second-look/sw.js
# serve.py reads $PORT, which Railway sets. The retired URLs answer 301 (a file on disk is always served first).
CMD ["python3", "serve.py", "--public", "--dir", "/srv/site", \
     "--redirect", "/second-look/*=/", "--redirect", "/second-look=/", \
     "--redirect", "/lab/=/", "--redirect", "/lab=/", "--redirect", "/lab/index.html=/", \
     "--redirect", "/chat.html=/lab/chat.html", "--redirect", "/bench.html=/lab/bench.html", "--redirect", "/needle.html=/lab/needle.html"]
