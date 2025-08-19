import { Pool } from "pg";
import { BaseInputs } from "../core/dto";
import { SnapshotReadPort } from "../core/ports";

/**
 * Read-only adapter for loading base inputs from joined snapshot data
 * This adapter performs complex joins across listings, enrichment, and rent estimate tables
 */
export class SnapshotsReadAdapter implements SnapshotReadPort {
  constructor(private pool: Pool) {}

  async loadBaseInputs(listingId: string): Promise<BaseInputs | null> {
    const client = await this.pool.connect();
    try {
      // Complex query joining listings, enrichment, and rent estimate data
      // This is a simplified version - actual implementation would depend on your schema
      const query = `
        WITH latest_enrichment AS (
          SELECT DISTINCT ON (listing_id) 
            listing_id,
            closing_costs,
            property_taxes,
            maintenance_fees,
            insurance_estimate
          FROM enrichments 
          WHERE listing_id = $1
          ORDER BY listing_id, created_at DESC
        ),
        latest_rent AS (
          SELECT DISTINCT ON (listing_id)
            listing_id,
            rent_p25,
            rent_p50,
            rent_p75,
            expenses_p25,
            expenses_p50,
            expenses_p75
          FROM rent_estimates
          WHERE listing_id = $1
          ORDER BY listing_id, created_at DESC
        )
        SELECT 
          l.listing_id,
          l.listing_version,
          l.price,
          l.city,
          l.province,
          l.property_type,
          COALESCE(e.closing_costs, l.price * 0.015) as closing_costs,
          -- Calculate NOI from rent minus expenses
          COALESCE(r.rent_p25 * 12 - r.expenses_p25 * 12, 0) as noi_p25,
          COALESCE(r.rent_p50 * 12 - r.expenses_p50 * 12, 0) as noi_p50,
          COALESCE(r.rent_p75 * 12 - r.expenses_p75 * 12, 0) as noi_p75
        FROM listings l
        LEFT JOIN latest_enrichment e ON l.listing_id = e.listing_id
        LEFT JOIN latest_rent r ON l.listing_id = r.listing_id
        WHERE l.listing_id = $1
          AND l.status = 'active'
      `;

      const result = await client.query(query, [listingId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Validate that we have meaningful data
      if (!row.price || row.price <= 0) {
        console.warn(`Invalid price for listing ${listingId}: ${row.price}`);
        return null;
      }

      return {
        listingId: row.listing_id,
        listingVersion: row.listing_version || 1,
        price: parseFloat(row.price),
        closingCosts: parseFloat(row.closing_costs),
        noiP25: parseFloat(row.noi_p25) || 0,
        noiP50: parseFloat(row.noi_p50) || 0,
        noiP75: parseFloat(row.noi_p75) || 0,
        city: row.city || "",
        province: row.province || "",
        propertyType: row.property_type || "Unknown",
      };
    } finally {
      client.release();
    }
  }

  /**
   * Load base inputs for multiple listings efficiently
   * @param listingIds Array of listing IDs
   * @returns Map of listing ID to base inputs
   */
  async loadMultipleBaseInputs(
    listingIds: string[]
  ): Promise<Map<string, BaseInputs>> {
    if (listingIds.length === 0) {
      return new Map();
    }

    const client = await this.pool.connect();
    try {
      // Use ANY() for efficient IN clause with array
      const query = `
        WITH latest_enrichment AS (
          SELECT DISTINCT ON (listing_id) 
            listing_id,
            closing_costs,
            property_taxes,
            maintenance_fees,
            insurance_estimate
          FROM enrichments 
          WHERE listing_id = ANY($1)
          ORDER BY listing_id, created_at DESC
        ),
        latest_rent AS (
          SELECT DISTINCT ON (listing_id)
            listing_id,
            rent_p25,
            rent_p50,
            rent_p75,
            expenses_p25,
            expenses_p50,
            expenses_p75
          FROM rent_estimates
          WHERE listing_id = ANY($1)
          ORDER BY listing_id, created_at DESC
        )
        SELECT 
          l.listing_id,
          l.listing_version,
          l.price,
          l.city,
          l.province,
          l.property_type,
          COALESCE(e.closing_costs, l.price * 0.015) as closing_costs,
          COALESCE(r.rent_p25 * 12 - r.expenses_p25 * 12, 0) as noi_p25,
          COALESCE(r.rent_p50 * 12 - r.expenses_p50 * 12, 0) as noi_p50,
          COALESCE(r.rent_p75 * 12 - r.expenses_p75 * 12, 0) as noi_p75
        FROM listings l
        LEFT JOIN latest_enrichment e ON l.listing_id = e.listing_id
        LEFT JOIN latest_rent r ON l.listing_id = r.listing_id
        WHERE l.listing_id = ANY($1)
          AND l.status = 'active'
      `;

      const result = await client.query(query, [listingIds]);

      const baseInputsMap = new Map<string, BaseInputs>();

      for (const row of result.rows) {
        if (!row.price || row.price <= 0) {
          console.warn(
            `Invalid price for listing ${row.listing_id}: ${row.price}`
          );
          continue;
        }

        baseInputsMap.set(row.listing_id, {
          listingId: row.listing_id,
          listingVersion: row.listing_version || 1,
          price: parseFloat(row.price),
          closingCosts: parseFloat(row.closing_costs),
          noiP25: parseFloat(row.noi_p25) || 0,
          noiP50: parseFloat(row.noi_p50) || 0,
          noiP75: parseFloat(row.noi_p75) || 0,
          city: row.city || "",
          province: row.province || "",
          propertyType: row.property_type || "Unknown",
        });
      }

      return baseInputsMap;
    } finally {
      client.release();
    }
  }

  /**
   * Check if base inputs exist and are current
   * @param listingId Listing ID to check
   * @param minVersion Minimum version required
   * @returns True if current data exists
   */
  async hasCurrentData(
    listingId: string,
    minVersion: number = 1
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const query = `
        SELECT listing_version
        FROM listings
        WHERE listing_id = $1 
          AND status = 'active'
          AND listing_version >= $2
      `;

      const result = await client.query(query, [listingId, minVersion]);
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }
}
