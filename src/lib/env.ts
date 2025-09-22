// src/lib/env.ts
export const ENV = {
  NODE_ENV: process.env.NODE_ENV,
  SITE_ROUTES_ENABLED: String(process.env.SITE_ROUTES_ENABLED || "").toLowerCase() === "true",
  // add more flags here as needed
};
