/**
 * Enrichment Read Adapter
 *
 * Reads enriched data from Enrichment service's datastore.
 * No business logic - just data access and composition.
 */

import { Pool } from "pg";
import { serviceDatabases } from "../config/env";
import { Enrichment } from "../core/dto";
import { EnrichmentReadPort } from "../core/ports";

export class EnrichmentReadAdapter implements EnrichmentReadPort {
  private db: Pool;

  constructor(db?: Pool) {
    this.db = db || new Pool(serviceDatabases.enrichment);
  }

  async findByListingId(listingId: string): Promise<Enrichment | null> {
    const query = `
      SELECT 
        listing_id as "listingId",
        listing_version as "listingVersion",
        enrichment_version as "enrichmentVersion",
        geo_data as "geoData",
        tax_data as "taxData",
        fee_data as "feeData",
        rent_priors as "rentPriors",
        location_scores as "locationScores",
        cost_rules as "costRules",
        computed_at as "computedAt"
      FROM enrichments 
      WHERE listing_id = $1 
      ORDER BY listing_version DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [listingId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToEnrichment(result.rows[0]);
  }

  async findByListingIds(listingIds: string[]): Promise<Enrichment[]> {
    if (listingIds.length === 0) return [];

    // Get latest enrichment for each listing
    const query = `
      SELECT DISTINCT ON (listing_id)
        listing_id as "listingId",
        listing_version as "listingVersion",
        enrichment_version as "enrichmentVersion",
        geo_data as "geoData",
        tax_data as "taxData",
        fee_data as "feeData",
        rent_priors as "rentPriors",
        location_scores as "locationScores",
        cost_rules as "costRules",
        computed_at as "computedAt"
      FROM enrichments 
      WHERE listing_id = ANY($1)
      ORDER BY listing_id, listing_version DESC
    `;

    const result = await this.db.query(query, [listingIds]);
    return result.rows.map(this.mapRowToEnrichment);
  }

  /**
   * Find enrichments by location (for area analysis)
   */
  async findByLocation(
    city: string,
    province: string,
    limit = 50
  ): Promise<Enrichment[]> {
    const query = `
      SELECT DISTINCT ON (e.listing_id)
        e.listing_id as "listingId",
        e.listing_version as "listingVersion",
        e.enrichment_version as "enrichmentVersion",
        e.geo_data as "geoData",
        e.tax_data as "taxData",
        e.fee_data as "feeData",
        e.rent_priors as "rentPriors",
        e.location_scores as "locationScores",
        e.cost_rules as "costRules",
        e.computed_at as "computedAt"
      FROM enrichments e
      JOIN listings l ON e.listing_id = l.id
      WHERE LOWER(l.city) = LOWER($1) 
        AND LOWER(l.province) = LOWER($2)
        AND l.status != 'Deleted'
      ORDER BY e.listing_id, e.listing_version DESC
      LIMIT $3
    `;

    const result = await this.db.query(query, [city, province, limit]);
    return result.rows.map(this.mapRowToEnrichment);
  }

  /**
   * Get enrichment statistics for a city/area
   */
  async getAreaStatistics(
    city: string,
    province: string
  ): Promise<{
    totalProperties: number;
    avgWalkScore?: number;
    avgTransitScore?: number;
    avgTaxes?: number;
    avgCondoFees?: number;
  }> {
    const query = `
      SELECT 
        COUNT(*) as total_properties,
        AVG((location_scores->>'walk')::numeric) as avg_walk_score,
        AVG((location_scores->>'transit')::numeric) as avg_transit_score,
        AVG((tax_data->>'annualEstimate')::numeric) as avg_taxes,
        AVG((fee_data->>'condoFeeMonthly')::numeric) as avg_condo_fees
      FROM enrichments e
      JOIN listings l ON e.listing_id = l.id
      WHERE LOWER(l.city) = LOWER($1) 
        AND LOWER(l.province) = LOWER($2)
        AND l.status != 'Deleted'
        AND e.listing_id IN (
          SELECT DISTINCT listing_id 
          FROM enrichments e2 
          WHERE e2.listing_id = e.listing_id 
          ORDER BY listing_version DESC 
          LIMIT 1
        )
    `;

    const result = await this.db.query(query, [city, province]);
    const row = result.rows[0];

    return {
      totalProperties: parseInt(row.total_properties) || 0,
      avgWalkScore: row.avg_walk_score
        ? parseFloat(row.avg_walk_score)
        : undefined,
      avgTransitScore: row.avg_transit_score
        ? parseFloat(row.avg_transit_score)
        : undefined,
      avgTaxes: row.avg_taxes ? parseFloat(row.avg_taxes) : undefined,
      avgCondoFees: row.avg_condo_fees
        ? parseFloat(row.avg_condo_fees)
        : undefined,
    };
  }

  /**
   * Map database row to Enrichment DTO
   */
  private mapRowToEnrichment(row: any): Enrichment {
    return {
      listingId: row.listingId,
      listingVersion: row.listingVersion,
      enrichmentVersion: row.enrichmentVersion,
      geo: row.geoData || undefined,
      taxes: row.taxData || undefined,
      fees: row.feeData || undefined,
      rentPriors: row.rentPriors || undefined,
      locationScores: row.locationScores || undefined,
      costRules: row.costRules || undefined,
      computedAt: row.computedAt,
    };
  }
}
