/// <reference types="node" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const COMPAT_WASM = resolve(
  __dirname,
  'node_modules/@wllama/wllama-compat/wasm/wllama.wasm'
);
const COMPAT_JS = resolve(
  __dirname,
  'node_modules/@wllama/wllama-compat/wasm/wllama.js'
);
const compatAvailable = existsSync(COMPAT_WASM) && existsSync(COMPAT_JS);

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Build-time existence checks for optional files the landing page links to. `import.meta.glob` also
// works, but it emits a hashed COPY of whatever it matches into assets/ — measured: a 200 KB dummy
// APK shipped twice in dist, and would ship twice again inside the Android shell's www. A define
// costs nothing at runtime.
const PUBLIC = resolve(__dirname, 'public');
const HAS_APK = existsSync(resolve(PUBLIC, 'slm-lab.apk'));
const HAS_NOTICES = existsSync(resolve(PUBLIC, 'THIRD_PARTY-NOTICES.txt'));

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), chat: resolve(__dirname, 'chat.html'), bench: resolve(__dirname, 'bench.html'), needle: resolve(__dirname, 'needle.html') } } },
  plugins: [
    react(),
    {
      name: 'wllama-compat',
      resolveId(id) {
        if (id === 'virtual:wllama-compat') return '\0virtual:wllama-compat';
      },
      load(id) {
        if (id !== '\0virtual:wllama-compat') return;
        if (compatAvailable) {
          return `
import wasm from '${COMPAT_WASM}?url';
import worker from '${COMPAT_JS}?raw';
export default { wasm, worker: { code: worker } };
`;
        } else {
          console.warn(
            '[wllama-compat] compat WASM not found — falling back to CDN. Run "npm install" inside the compat package to build locally.'
          );
          return `export default 'default';`;
        }
      },
    },
    {
      // Cross-origin isolation, which the multi-threaded wllama build needs for SharedArrayBuffer.
      // `configureServer` alone covers `vite dev` only: `vite preview` served NO headers, so a
      // preview build silently ran single-threaded (wllama's check is silent — utils.ts isMultithread).
      // `server.headers` / `preview.headers` below fix both; a static host needs its own `_headers`
      // file, and app/serve.py sets the same two headers for the built site.
      name: 'isolation',
      configureServer(server) {
        server.middlewares.use((_req, res, next) => {
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          next();
        });
      },
    },
  ],
  define: {
    __HAS_APK__: JSON.stringify(HAS_APK),
    __HAS_NOTICES__: JSON.stringify(HAS_NOTICES),
  },
  server: { headers: ISOLATION_HEADERS },
  preview: { headers: ISOLATION_HEADERS },
});
