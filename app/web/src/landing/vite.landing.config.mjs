// Build ONLY the landing (and the benchmark page it links to), using the shared vite.config.ts
// unchanged. Exists because the three-entry build fails whenever the chat app is mid-edit, and the
// landing must stay buildable on its own:
//   npx vite build --config src/landing/vite.landing.config.mjs --outDir dist-landing --emptyOutDir
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import base from '../../vite.config.ts';

const web = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

export default {
  ...base,
  root: web,
  build: {
    ...base.build,
    rollupOptions: {
      ...base.build?.rollupOptions,
      input: { main: resolve(web, 'index.html'), bench: resolve(web, 'bench.html') },
    },
  },
};
