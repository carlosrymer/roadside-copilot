import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH is set to "/roadside-copilot/" by the GitHub Pages build; "/" locally.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
});
