import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The existing source keeps JSX inside plain `.js` files. esbuild only treats
// `.jsx`/`.tsx` as JSX by default, so we tell it to parse `.js` as JSX too —
// this avoids renaming ~20 component files.
export default defineConfig({
  plugins: [react()],
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
