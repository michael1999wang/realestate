/**
 * Environment configuration for enrichment service
 */

export interface AppConfig {
  debounceTimeoutSec: number;
  mode: "development" | "production";
}

export const appCfg: AppConfig = {
  debounceTimeoutSec: parseInt(process.env.DEBOUNCE_TIMEOUT_SEC || "30", 10),
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
};
