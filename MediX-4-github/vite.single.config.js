import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'dist-single', assetsInlineLimit: 0, cssCodeSplit: false, chunkSizeWarningLimit: 5000,
    rollupOptions: { output: { inlineDynamicImports: true, manualChunks: undefined } } },
});
