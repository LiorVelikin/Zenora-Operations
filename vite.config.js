import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build:preview` → one self-contained HTML file for the Claude preview.
// The live version (Step 3) builds normally for Vercel.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'preview' ? [viteSingleFile()] : [])],
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist', chunkSizeWarningLimit: 4000 },
}));
