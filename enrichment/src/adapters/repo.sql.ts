import { Pool } from "pg";
import { Enrichment } from "../core/dto";
import { EnrichmentRepoPort } from "../core/ports";

export class SQLEnrichmentRepo implements EnrichmentRepoPort {
  constructor(private pool: Pool) {}

  async getByListingId(id: string): Promise<Enrichment | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        "SELECT * FROM enrichments WHERE listing_id = $1",
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.rowToEnrichment(result.rows[0]);
    } finally {
      client.release();
    }
  }

  async upsert(e: Enrichment): Promise<{ changed: boolean }> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Check if record exists
      const existingResult = await client.query(
        "SELECT * FROM enrichments WHERE listing_id = $1",
        [e.listingId]
      );

      let changed = true;

      if (existingResult.rows.length > 0) {
        const existing = this.rowToEnrichment(existingResult.rows[0]);

        // Compare without volatile fields
        const existingComparable = this.stripVolatile(existing);
        const newComparable = this.stripVolatile(e);

        changed =
          JSON.stringify(existingComparable) !== JSON.stringify(newComparable);
      }

      if (changed) {
        // Upsert the record
        await client.query(
          `
          INSERT INTO enrichments (
            listing_id, 
            listing_version, 
            enrichment_version,
            geo, 
            taxes, 
            fees, 
            rent_priors, 
            location_scores, 
            cost_rules,
            computed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (listing_id) DO UPDATE SET
            listing_version = EXCLUDED.listing_version,
            enrichment_version = EXCLUDED.enrichment_version,
            geo = EXCLUDED.geo,
            taxes = EXCLUDED.taxes,
            fees = EXCLUDED.fees,
            rent_priors = EXCLUDED.rent_priors,
            location_scores = EXCLUDED.location_scores,
            cost_rules = EXCLUDED.cost_rules,
            computed_at = EXCLUDED.computed_at,
            updated_row_at = now()
        `,
          [
            e.listingId,
            e.listingVersion,
            e.enrichmentVersion,
            JSON.stringify(e.geo),
            JSON.stringify(e.taxes),
            JSON.stringify(e.fees),
            JSON.stringify(e.rentPriors),
            JSON.stringify(e.locationScores),
            JSON.stringify(e.costRules),
            e.computedAt,
          ]
        );
      }

      await client.query("COMMIT");
      return { changed };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private rowToEnrichment(row: any): Enrichment {
    return {
      listingId: row.listing_id,
      listingVersion: row.listing_version,
      enrichmentVersion: row.enrichment_version,
      geo: row.geo,
      taxes: row.taxes,
      fees: row.fees,
      rentPriors: row.rent_priors,
      locationScores: row.location_scores,
      costRules: row.cost_rules,
      computedAt: row.computed_at.toISOString(),
    };
  }

  private stripVolatile(e: Enrichment): Omit<Enrichment, "computedAt"> {
    const { computedAt, ...rest } = e;
    return rest;
  }

  // Admin/test methods
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.pool.connect();
      try {
        await client.query("SELECT 1");
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  async getStats(): Promise<{
    totalEnrichments: number;
    byVersion: Record<string, number>;
  }> {
    const client = await this.pool.connect();
    try {
      const totalResult = await client.query(
        "SELECT COUNT(*) as count FROM enrichments"
      );
      const versionResult = await client.query(`
        SELECT enrichment_version, COUNT(*) as count 
        FROM enrichments 
        GROUP BY enrichment_version 
        ORDER BY enrichment_version
      `);

      const byVersion: Record<string, number> = {};
      for (const row of versionResult.rows) {
        byVersion[row.enrichment_version] = parseInt(row.count);
      }

      return {
        totalEnrichments: parseInt(totalResult.rows[0].count),
        byVersion,
      };
    } finally {
      client.release();
    }
  }
}
