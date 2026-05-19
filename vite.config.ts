import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/proxy": {
        target: `http://${process.env.PROXY_HOST || "127.0.0.1"}:${process.env.PROXY_PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
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
  optimizeDeps: {
    include: ["@elastic/eui", "@emotion/react", "@emotion/css", "react", "react-dom", "moment"],
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 1700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@elastic/eui")) return "vendor-eui";
            if (id.includes("@emotion")) return "vendor-emotion";
            if (id.includes("/moment/")) return "vendor-moment";
            if (id.includes("@elastic/datemath")) return "vendor-datemath";
            if (id.includes("simple-icons")) return "vendor-simple-icons";
            if (/node_modules\/(react-dom|react\/|scheduler\/)/.test(id)) return "vendor-react";
            return "vendor";
          }
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
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{js,jsx,ts,tsx}"],
    globals: true,
  },
});
