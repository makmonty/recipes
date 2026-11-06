import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  outDir: './dist',
  base: process.env.BASE_PATH || '/',
});
