import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PrivShare deploys to https://phonepvr.github.io/privatesplit/.
// Override at build time via VITE_BASE_PATH if you point a custom domain at the repo.
const basePath = process.env.VITE_BASE_PATH ?? '/privatesplit/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: false,
    host: true,
  },
  preview: {
    port: 4173,
    strictPort: false,
    host: true,
  },
});
