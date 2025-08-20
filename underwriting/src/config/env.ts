/**
 * Environment configuration for underwriting service
 */

export interface GridConfig {
  downPaymentOptions: number[];
  interestRateOptions: number[];
  amortizationYearOptions: number[];
  downMin: number;
  downMax: number;
  downStep: number;
  rateMin: number;
  rateMax: number;
  rateStep: number;
  amorts: number[];
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export const gridCfg: GridConfig = {
  downPaymentOptions: [0.05, 0.1, 0.15, 0.2, 0.25],
  interestRateOptions: [0.025, 0.03, 0.035, 0.04, 0.045, 0.05],
  amortizationYearOptions: [25, 30],
  downMin: 0.05,
  downMax: 0.25,
  downStep: 0.05,
  rateMin: 0.025,
  rateMax: 0.05,
  rateStep: 0.005,
  amorts: [25 * 12, 30 * 12], // Convert years to months
};

export const dbCfg: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5436", 10),
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "password",
  database: process.env.DB_NAME || "underwriting_dev",
};
