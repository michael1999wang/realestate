import { Pool } from "pg";
import { RentEstimate } from "../core/dto";
import { RentRepoPort } from "../core/ports";

export class SqlRentRepo implements RentRepoPort {
  private pool: Pool;

  constructor(config: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  }) {
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  async getByListingId(id: string): Promise<RentEstimate | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          listing_id,
          listing_version,
          estimator_version,
          method,
          p25,
          p50,
          p75,
          stdev,
          features_used,
          computed_at
        FROM rent_estimates 
        WHERE listing_id = $1`,
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        listingId: row.listing_id,
        listingVersion: row.listing_version,
        estimatorVersion: row.estimator_version,
        method: row.method,
        p25: row.p25 ? parseFloat(row.p25) : undefined,
        p50: parseFloat(row.p50),
        p75: row.p75 ? parseFloat(row.p75) : undefined,
        stdev: row.stdev ? parseFloat(row.stdev) : undefined,
        featuresUsed: row.features_used,
        computedAt: row.computed_at.toISOString(),
      };
    } finally {
      client.release();
    }
  }

  async upsert(est: RentEstimate): Promise<{ changed: boolean }> {
    const client = await this.pool.connect();
    try {
      // First, check if record exists and if it's different
      const existing = await this.getByListingId(est.listingId);
      const changed = !existing || this.isChanged(existing, est);

      if (!changed) {
        return { changed: false };
      }

      // Upsert the record
      await client.query(
        `INSERT INTO rent_estimates (
          listing_id,
          listing_version,
          estimator_version,
          method,
          p25,
          p50,
          p75,
          stdev,
          features_used,
          computed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (listing_id) 
        DO UPDATE SET
          listing_version = EXCLUDED.listing_version,
          estimator_version = EXCLUDED.estimator_version,
          method = EXCLUDED.method,
          p25 = EXCLUDED.p25,
          p50 = EXCLUDED.p50,
          p75 = EXCLUDED.p75,
          stdev = EXCLUDED.stdev,
          features_used = EXCLUDED.features_used,
          computed_at = EXCLUDED.computed_at`,
        [
          est.listingId,
          est.listingVersion,
          est.estimatorVersion,
          est.method,
          est.p25,
          est.p50,
          est.p75,
          est.stdev,
          JSON.stringify(est.featuresUsed),
          est.computedAt,
        ]
      );

      return { changed: true };
    } finally {
      client.release();
    }
  }

  private isChanged(existing: RentEstimate, updated: RentEstimate): boolean {
    // Compare key fields to determine if estimate has materially changed
    return (
      existing.p50 !== updated.p50 ||
      existing.p25 !== updated.p25 ||
      existing.p75 !== updated.p75 ||
      existing.method !== updated.method ||
      existing.estimatorVersion !== updated.estimatorVersion ||
      JSON.stringify(existing.featuresUsed) !==
        JSON.stringify(updated.featuresUsed)
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("Database health check failed:", error);
      return false;
    }
  }
}
