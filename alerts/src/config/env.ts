export const cfg = {
  mode: process.env.MODE ?? "dev",
  port: Number(process.env.PORT ?? 8082),
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  db: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5437),
    user: process.env.DB_USER ?? "alerts",
    password: process.env.DB_PASSWORD ?? "alerts",
    name: process.env.DB_NAME ?? "alerts_dev"
  }
};
