/**
 * Listings Read Adapter
 *
 * Reads data from Ingestor service's datastore.
 * No business logic - just data access and composition.
 */

import { Pool } from "pg";
import { Listing, PropertySearchRequest } from "../core/dto";
import { ListingReadPort } from "../core/ports";

export class ListingsReadAdapter implements ListingReadPort {
  constructor(private db: Pool) {}

  async findById(id: string): Promise<Listing | null> {
    const query = `
      SELECT 
        id,
        mls_number as "mlsNumber",
        source_board as "sourceBoard",
        status,
        listed_at as "listedAt",
        updated_at as "updatedAt",
        street,
        city,
        province,
        postal_code as "postalCode",
        country,
        property_type as "propertyType",
        beds,
        baths,
        sqft,
        list_price as "listPrice",
        taxes_annual as "taxesAnnual",
        condo_fee_monthly as "condoFeeMonthly",
        photos,
        brokerage_name as "brokerageName",
        brokerage_phone as "brokeragePhone"
      FROM listings 
      WHERE id = $1 AND status != 'Deleted'
    `;

    const result = await this.db.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToListing(result.rows[0]);
  }

  async findByIds(ids: string[]): Promise<Listing[]> {
    if (ids.length === 0) return [];

    const query = `
      SELECT 
        id,
        mls_number as "mlsNumber",
        source_board as "sourceBoard",
        status,
        listed_at as "listedAt",
        updated_at as "updatedAt",
        street,
        city,
        province,
        postal_code as "postalCode",
        country,
        property_type as "propertyType",
        beds,
        baths,
        sqft,
        list_price as "listPrice",
        taxes_annual as "taxesAnnual",
        condo_fee_monthly as "condoFeeMonthly",
        photos,
        brokerage_name as "brokerageName",
        brokerage_phone as "brokeragePhone"
      FROM listings 
      WHERE id = ANY($1) AND status != 'Deleted'
      ORDER BY updated_at DESC
    `;

    const result = await this.db.query(query, [ids]);
    return result.rows.map(this.mapRowToListing);
  }

  async search(
    filters: PropertySearchRequest
  ): Promise<{ listings: Listing[]; total: number }> {
    const conditions: string[] = ["status != 'Deleted'"];
    const params: any[] = [];
    let paramIndex = 1;

    // Build WHERE clause
    if (filters.city) {
      conditions.push(`LOWER(city) = LOWER($${paramIndex})`);
      params.push(filters.city);
      paramIndex++;
    }

    if (filters.province) {
      conditions.push(`LOWER(province) = LOWER($${paramIndex})`);
      params.push(filters.province);
      paramIndex++;
    }

    if (filters.propertyType) {
      conditions.push(`property_type = $${paramIndex}`);
      params.push(filters.propertyType);
      paramIndex++;
    }

    if (filters.minBeds !== undefined) {
      conditions.push(`beds >= $${paramIndex}`);
      params.push(filters.minBeds);
      paramIndex++;
    }

    if (filters.maxBeds !== undefined) {
      conditions.push(`beds <= $${paramIndex}`);
      params.push(filters.maxBeds);
      paramIndex++;
    }

    if (filters.minPrice !== undefined) {
      conditions.push(`list_price >= $${paramIndex}`);
      params.push(filters.minPrice);
      paramIndex++;
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(`list_price <= $${paramIndex}`);
      params.push(filters.maxPrice);
      paramIndex++;
    }

    if (filters.status) {
      conditions.push(`status = $${paramIndex}`);
      params.push(filters.status);
      paramIndex++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total
      FROM listings
      ${whereClause}
    `;

    const countResult = await this.db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Data query with pagination
    const limit = Math.min(filters.limit || 50, 100); // Cap at 100
    const offset = filters.offset || 0;

    const dataQuery = `
      SELECT 
        id,
        mls_number as "mlsNumber",
        source_board as "sourceBoard",
        status,
        listed_at as "listedAt",
        updated_at as "updatedAt",
        street,
        city,
        province,
        postal_code as "postalCode",
        country,
        property_type as "propertyType",
        beds,
        baths,
        sqft,
        list_price as "listPrice",
        taxes_annual as "taxesAnnual",
        condo_fee_monthly as "condoFeeMonthly",
        photos,
        brokerage_name as "brokerageName",
        brokerage_phone as "brokeragePhone"
      FROM listings
      ${whereClause}
      ORDER BY updated_at DESC, id
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const dataResult = await this.db.query(dataQuery, [
      ...params,
      limit,
      offset,
    ]);
    const listings = dataResult.rows.map(this.mapRowToListing);

    return { listings, total };
  }

  /**
   * Get recently updated listings (for caching invalidation)
   */
  async findRecentlyUpdated(since: Date): Promise<string[]> {
    const query = `
      SELECT id
      FROM listings
      WHERE updated_at > $1 AND status != 'Deleted'
      ORDER BY updated_at DESC
    `;

    const result = await this.db.query(query, [since.toISOString()]);
    return result.rows.map((row) => row.id);
  }

  /**
   * Map database row to Listing DTO
   */
  private mapRowToListing(row: any): Listing {
    return {
      id: row.id,
      mlsNumber: row.mlsNumber,
      sourceBoard: row.sourceBoard,
      status: row.status,
      listedAt: row.listedAt,
      updatedAt: row.updatedAt,
      address: {
        street: row.street,
        city: row.city,
        province: row.province,
        postalCode: row.postalCode,
        country: row.country,
      },
      propertyType: row.propertyType,
      beds: row.beds,
      baths: row.baths,
      sqft: row.sqft,
      listPrice: row.listPrice,
      taxesAnnual: row.taxesAnnual,
      condoFeeMonthly: row.condoFeeMonthly,
      media: row.photos ? { photos: row.photos } : undefined,
      brokerage: row.brokerageName
        ? {
            name: row.brokerageName,
            phone: row.brokeragePhone,
          }
        : undefined,
    };
  }
}
