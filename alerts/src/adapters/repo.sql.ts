import { Pool } from "pg";
import { Alert, ListingSnapshot, SavedSearch } from "../core/dto";
import { AlertsRepo } from "../core/ports";

export class PostgresAlertsRepo implements AlertsRepo {
  constructor(private pool: Pool) {}

  async listActiveSavedSearches(): Promise<SavedSearch[]> {
    const result = await this.pool.query(
      "SELECT * FROM saved_searches WHERE is_active = true"
    );
    return result.rows.map(this.mapRowToSavedSearch);
  }

  async listCandidatesForListing(
    listing: ListingSnapshot
  ): Promise<SavedSearch[]> {
    // Use DB-side filtering for performance
    const result = await this.pool.query(
      `
      SELECT * FROM saved_searches 
      WHERE is_active = true
        AND (filter_json->>'city' IS NULL OR LOWER(filter_json->>'city') = LOWER($1))
        AND (filter_json->>'province' IS NULL OR filter_json->>'province' = $2)
        AND (filter_json->>'propertyType' IS NULL OR filter_json->>'propertyType' = $3)
        AND (filter_json->>'minBeds' IS NULL OR (filter_json->>'minBeds')::INTEGER <= $4)
        AND (filter_json->>'maxPrice' IS NULL OR (filter_json->>'maxPrice')::NUMERIC >= $5)
    `,
      [
        listing.city,
        listing.province,
        listing.propertyType,
        listing.beds,
        listing.price,
      ]
    );

    return result.rows.map(this.mapRowToSavedSearch);
  }

  async insertAlert(a: Alert): Promise<Alert> {
    await this.pool.query(
      `
      INSERT INTO alerts (id, user_id, saved_search_id, listing_id, result_id, triggered_at, payload_json, delivery_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        a.id,
        a.userId,
        a.savedSearchId,
        a.listingId,
        a.resultId,
        a.triggeredAt,
        JSON.stringify(a.payload),
        JSON.stringify(a.delivery),
      ]
    );
    return a;
  }

  private mapRowToSavedSearch(row: any): SavedSearch {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      filter: row.filter_json,
      assumptionsId: row.assumptions_id,
      thresholds: row.thresholds_json,
      notify: row.notify_json,
      isActive: row.is_active,
      createdAt: row.created_at,
    };
  }
}
