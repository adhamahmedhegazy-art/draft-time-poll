import { defineConfig } from "vite";

// In development, `npm run dev` forwards /api to the league server (`npm run server`).
export default defineConfig({
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
});
