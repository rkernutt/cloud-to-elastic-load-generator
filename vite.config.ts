import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    // Forward /proxy/* to the local bulk proxy (run `node proxy.cjs` on port 3001).
    proxy: {
      "/proxy": {
        target: `http://${process.env.PROXY_HOST || "127.0.0.1"}:${process.env.PROXY_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  // `npm run preview` serves dist/ without dev middleware unless proxy is set here too.
  preview: {
    port: 4173,
    host: true,
    proxy: {
      "/proxy": {
        target: `http://${process.env.PROXY_HOST || "127.0.0.1"}:${process.env.PROXY_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
          if (id.includes("/azure/generators/traces/")) return "gen-azure-traces";
          if (id.includes("/azure/generators/metrics/")) return "gen-azure-metrics";
          if (id.includes("/azure/")) return "gen-azure-logs";
          if (id.includes("/gcp/generators/traces/")) return "gen-gcp-traces";
          if (id.includes("/gcp/generators/metrics/")) return "gen-gcp-metrics";
          if (id.includes("/gcp/")) return "gen-gcp-logs";
          if (id.includes("/aws/generators/traces/")) return "gen-traces";
          if (id.includes("/aws/generators/metrics/")) return "gen-metrics";
          if (id.includes("/aws/generators/")) return "gen-logs";
        },
      },
    },
  },
});
