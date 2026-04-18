import { defineConfig } from "vite";

export default defineConfig({
  base: "/survival-civ-game/",
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Accept any Host header. Safe here because this is a dev server on a home LAN;
    // do not copy this config to a public-facing deployment.
    allowedHosts: true,
  },
});
