import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Writes the service worker (src/sw.js) into the build as /sw.js, with this
// build's code and styles listed for it to save (so the site opens offline)
// and a version that changes with every build (so browsers pick up a new
// deploy). Only for `vite build`; the dev server has no service worker.
function siteServiceWorker() {
  return {
    name: 'site-service-worker',
    apply: 'build',
    generateBundle(options, bundle) {
      const files = Object.keys(bundle).filter((name) => /\.(js|css)$/.test(name)).map((name) => `/${name}`);
      const source = readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(String(Date.now())))
        .replace("'__PRECACHE__'", JSON.stringify(['/index.html', ...files]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// The existing source keeps JSX inside plain `.js` files. esbuild only treats
// `.jsx`/`.tsx` as JSX by default, so we tell it to parse `.js` as JSX too —
// this avoids renaming ~20 component files.
export default defineConfig({
  plugins: [react(), siteServiceWorker()],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 3000,
    proxy: {
      // Forward /api/* to the dictionary-ejs backend on :4000.
      // The old Express proxy stripped the `/api` prefix and set x-forwarded-host,
      // so we replicate that here.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        cookieDomainRewrite: 'localhost',
        rewrite: (path) => path.replace(/^\/api/, ''),
        headers: {
          'x-forwarded-host': 'localhost:3000',
        },
      },
    },
  },
});
