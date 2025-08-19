import { Pool } from "pg";
import { Assumptions, BaseInputs, GridRow, Metrics } from "../core/dto";
import {
  AssumptionsReadPort,
  FactorsPort,
  SnapshotReadPort,
  UWRepoPort,
} from "../core/ports";

/**
 * PostgreSQL implementation of snapshot read port
 * Reads from joined views of listings, enrichment, and rent data
 */
export class SqlSnapshotRepo implements SnapshotReadPort {
  constructor(private pool: Pool) {}

  async loadBaseInputs(listingId: string): Promise<BaseInputs | null> {
    const client = await this.pool.connect();
    try {
      // This query would join across listings, enrichment, and rent estimate tables
      // Simplified version assuming a materialized view or joined query
      const query = `
        SELECT 
          listing_id,
          listing_version,
          price,
          closing_costs,
          noi_p25,
          noi_p50,
          noi_p75,
          city,
          province,
          property_type
        FROM listing_base 
        WHERE listing_id = $1
      `;

      const result = await client.query(query, [listingId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        listingId: row.listing_id,
        listingVersion: row.listing_version,
        price: parseFloat(row.price),
        closingCosts: parseFloat(row.closing_costs),
        noiP25: parseFloat(row.noi_p25),
        noiP50: parseFloat(row.noi_p50),
        noiP75: parseFloat(row.noi_p75),
        city: row.city,
        province: row.province,
        propertyType: row.property_type,
      };
    } finally {
      client.release();
    }
  }
}

/**
 * PostgreSQL implementation of assumptions read port
 */
export class SqlAssumptionsRepo implements AssumptionsReadPort {
  constructor(private pool: Pool) {}

  async getAssumptionsById(id: string): Promise<Assumptions | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT 
          down_pct,
          rate_bps,
          amort_months,
          rent_scenario,
          mgmt_pct,
          reserves_monthly,
          exit_cap_pct,
          growth_rent_pct,
          growth_expense_pct,
          hold_years
        FROM user_assumptions 
        WHERE id = $1
      `;

      const result = await client.query(query, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        downPct: parseFloat(row.down_pct),
        rateBps: parseInt(row.rate_bps),
        amortMonths: parseInt(row.amort_months),
        rentScenario: row.rent_scenario,
        mgmtPct: row.mgmt_pct ? parseFloat(row.mgmt_pct) : undefined,
        reservesMonthly: row.reserves_monthly
          ? parseFloat(row.reserves_monthly)
          : undefined,
        exitCapPct: row.exit_cap_pct ? parseFloat(row.exit_cap_pct) : undefined,
        growthRentPct: row.growth_rent_pct
          ? parseFloat(row.growth_rent_pct)
          : undefined,
        growthExpensePct: row.growth_expense_pct
          ? parseFloat(row.growth_expense_pct)
          : undefined,
        holdYears: row.hold_years ? parseInt(row.hold_years) : undefined,
      };
    } finally {
      client.release();
    }
  }

  async getDefaultAssumptions(): Promise<Assumptions> {
    // Return hardcoded defaults or fetch from config table
    return {
      downPct: 0.2,
      rateBps: 500, // 5%
      amortMonths: 360,
      rentScenario: "P50",
    };
  }
}

/**
 * PostgreSQL implementation of underwriting repository
 */
export class SqlUWRepo implements UWRepoPort {
  constructor(private pool: Pool) {}

  async upsertGrid(rows: GridRow[]): Promise<void> {
    if (rows.length === 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Use INSERT ... ON CONFLICT for upsert
      const query = `
        INSERT INTO underwrite_grid (
          listing_id,
          listing_version,
          rent_scenario,
          down_pct_bin,
          rate_bps_bin,
          amort_months,
          metrics_json
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (listing_id, listing_version, rent_scenario, down_pct_bin, rate_bps_bin, amort_months)
        DO UPDATE SET metrics_json = EXCLUDED.metrics_json
      `;

      for (const row of rows) {
        await client.query(query, [
          row.listingId,
          row.listingVersion,
          row.rentScenario,
          row.downPctBin,
          row.rateBpsBin,
          row.amortMonths,
          JSON.stringify(row.metrics),
        ]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async getGridRow(
    listingId: string,
    listingVersion: number,
    rentScenario: string,
    downPctBin: number,
    rateBpsBin: number,
    amortMonths: number
  ): Promise<GridRow | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT metrics_json
        FROM underwrite_grid
        WHERE listing_id = $1 
          AND listing_version = $2
          AND rent_scenario = $3
          AND down_pct_bin = $4
          AND rate_bps_bin = $5
          AND amort_months = $6
      `;

      const result = await client.query(query, [
        listingId,
        listingVersion,
        rentScenario,
        downPctBin,
        rateBpsBin,
        amortMonths,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      const metrics = JSON.parse(result.rows[0].metrics_json) as Metrics;

      return {
        listingId,
        listingVersion,
        rentScenario: rentScenario as "P25" | "P50" | "P75",
        downPctBin,
        rateBpsBin,
        amortMonths,
        metrics,
      };
    } finally {
      client.release();
    }
  }

  async saveExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string,
    metrics: Metrics
  ): Promise<{ id: string; created: boolean }> {
    const client = await this.pool.connect();
    try {
      // Try to insert, return existing if conflict
      const query = `
        INSERT INTO underwrite_exact (
          listing_id,
          listing_version,
          assumptions_hash,
          metrics_json
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (listing_id, listing_version, assumptions_hash)
        DO NOTHING
        RETURNING id
      `;

      const result = await client.query(query, [
        listingId,
        listingVersion,
        assumptionsHash,
        JSON.stringify(metrics),
      ]);

      if (result.rows.length > 0) {
        return { id: result.rows[0].id.toString(), created: true };
      }

      // Row already exists, fetch the existing ID
      const selectQuery = `
        SELECT id FROM underwrite_exact
        WHERE listing_id = $1 
          AND listing_version = $2 
          AND assumptions_hash = $3
      `;

      const selectResult = await client.query(selectQuery, [
        listingId,
        listingVersion,
        assumptionsHash,
      ]);

      return { id: selectResult.rows[0].id.toString(), created: false };
    } finally {
      client.release();
    }
  }

  async getExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string
  ): Promise<{ id: string; metrics: Metrics } | null> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT id, metrics_json
        FROM underwrite_exact
        WHERE listing_id = $1 
          AND listing_version = $2 
          AND assumptions_hash = $3
      `;

      const result = await client.query(query, [
        listingId,
        listingVersion,
        assumptionsHash,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id.toString(),
        metrics: JSON.parse(row.metrics_json) as Metrics,
      };
    } finally {
      client.release();
    }
  }

  async bumpVersionOnListing(
    listingId: string,
    listingVersion: number
  ): Promise<void> {
    // Optional: Clean up old versions or update tracking table
    console.log(`Version bumped for ${listingId} to ${listingVersion}`);
  }
}

/**
 * PostgreSQL implementation of factors port with database caching
 */
export class SqlFactorsRepo implements FactorsPort {
  constructor(private pool: Pool) {}

  async getAF(rateBps: number, amortMonths: number): Promise<number> {
    const client = await this.pool.connect();
    try {
      // Try to get from cache first
      const selectQuery = `
        SELECT af FROM mortgage_factors
        WHERE rate_bps = $1 AND amort_months = $2
      `;

      const result = await client.query(selectQuery, [rateBps, amortMonths]);

      if (result.rows.length > 0) {
        return parseFloat(result.rows[0].af);
      }

      // Compute and cache
      const af = this.computeAF(rateBps, amortMonths);

      const insertQuery = `
        INSERT INTO mortgage_factors (rate_bps, amort_months, af)
        VALUES ($1, $2, $3)
        ON CONFLICT (rate_bps, amort_months) DO NOTHING
      `;

      await client.query(insertQuery, [rateBps, amortMonths, af]);

      return af;
    } finally {
      client.release();
    }
  }

  private computeAF(rateBps: number, amortMonths: number): number {
    if (rateBps === 0) {
      return 1 / amortMonths;
    }

    const monthlyRate = rateBps / 10000 / 12;
    const factor = Math.pow(1 + monthlyRate, amortMonths);

    return (monthlyRate * factor) / (factor - 1);
  }
}
