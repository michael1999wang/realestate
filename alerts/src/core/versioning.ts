export const VERSION = "1.0.0";

export function getServiceInfo() {
  return {
    service: "alerts",
    version: VERSION,
    timestamp: new Date().toISOString()
  };
}
