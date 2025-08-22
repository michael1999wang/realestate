/**
 * Underwriting Service Client
 *
 * Synchronous client for calling Underwriting service APIs.
 * Handles both read access to stored results and on-demand computation.
 */

import { Pool } from "pg";
import { serviceCfg } from "../config/env";
import {
  UnderwriteRequest,
  UnderwriteResponse,
  UnderwritingResult,
} from "../core/dto";
import { UnderwritingReadPort, UnderwritingServicePort } from "../core/ports";

export class UnderwritingServiceClient
  implements UnderwritingServicePort, UnderwritingReadPort
{
  constructor(
    private db: Pool,
    private httpClient: HttpClient = new DefaultHttpClient()
  ) {}

  // ===== Service Client Methods (Synchronous API calls) =====

  async computeExact(request: UnderwriteRequest): Promise<UnderwriteResponse> {
    const { listingId, assumptions } = request;

    if (!assumptions) {
      throw new Error("Assumptions required for exact computation");
    }

    try {
      const response = await this.httpClient.post(
        `${serviceCfg.underwriting.baseUrl}/underwrite`,
        { listingId, assumptions },
        { timeout: serviceCfg.underwriting.timeout }
      );

      if (!response.success) {
        throw new Error(`Underwriting computation failed: ${response.error}`);
      }

      return response.data;
    } catch (error) {
      console.error(
        `Underwriting service call failed for ${listingId}:`,
        error
      );
      throw error;
    }
  }

  async computeGrid(
    listingId: string,
    rentScenario: "P25" | "P50" | "P75"
  ): Promise<UnderwritingResult[]> {
    // Grid computation is typically done asynchronously via events
    // This method triggers computation and waits for results
    try {
      // First check if we have cached grid results
      const existingResults = await this.findByListingId(listingId);
      const scenarioResults = existingResults.filter(
        (r) => r.rentScenario === rentScenario
      );

      if (scenarioResults.length > 0) {
        return scenarioResults;
      }

      // If no cached results, we could trigger async computation here
      // For now, return empty array and let the caller handle the async flow
      console.warn(
        `No grid results found for ${listingId} scenario ${rentScenario}`
      );
      return [];
    } catch (error) {
      console.error(`Grid computation failed for ${listingId}:`, error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.httpClient.get(
        `${serviceCfg.underwriting.baseUrl}/health`,
        { timeout: 5000 }
      );
      return response.status === "healthy";
    } catch (error) {
      console.error("Underwriting service health check failed:", error);
      return false;
    }
  }

  // ===== Read Port Methods (Database access to stored results) =====

  async findByListingId(listingId: string): Promise<UnderwritingResult[]> {
    const query = `
      SELECT 
        listing_id as "listingId",
        listing_version as "listingVersion",
        result_id as "resultId",
        source,
        rent_scenario as "rentScenario",
        down_pct as "downPct",
        rate_bps as "rateBps",
        amort_months as "amortMonths",
        noi,
        cap_rate as "capRate",
        cash_flow as "cashFlow",
        coc,
        dscr,
        breakeven,
        price,
        down_payment as "downPayment",
        loan_amount as "loanAmount",
        monthly_ds as "monthlyDS",
        score,
        computed_at as "computedAt"
      FROM underwrite_results 
      WHERE listing_id = $1 
      ORDER BY computed_at DESC
    `;

    const result = await this.db.query(query, [listingId]);
    return result.rows.map(this.mapRowToUnderwritingResult);
  }

  async findByListingIds(
    listingIds: string[]
  ): Promise<Map<string, UnderwritingResult[]>> {
    if (listingIds.length === 0) return new Map();

    const query = `
      SELECT 
        listing_id as "listingId",
        listing_version as "listingVersion",
        result_id as "resultId",
        source,
        rent_scenario as "rentScenario",
        down_pct as "downPct",
        rate_bps as "rateBps",
        amort_months as "amortMonths",
        noi,
        cap_rate as "capRate",
        cash_flow as "cashFlow",
        coc,
        dscr,
        breakeven,
        price,
        down_payment as "downPayment",
        loan_amount as "loanAmount",
        monthly_ds as "monthlyDS",
        score,
        computed_at as "computedAt"
      FROM underwrite_results 
      WHERE listing_id = ANY($1)
      ORDER BY listing_id, computed_at DESC
    `;

    const result = await this.db.query(query, [listingIds]);
    const resultsMap = new Map<string, UnderwritingResult[]>();

    result.rows.forEach((row) => {
      const listingId = row.listingId;
      if (!resultsMap.has(listingId)) {
        resultsMap.set(listingId, []);
      }
      resultsMap.get(listingId)!.push(this.mapRowToUnderwritingResult(row));
    });

    return resultsMap;
  }

  async getGridResult(
    listingId: string,
    rentScenario: "P25" | "P50" | "P75",
    downPct: number,
    rateBps: number,
    amortMonths: number
  ): Promise<UnderwritingResult | null> {
    const query = `
      SELECT 
        listing_id as "listingId",
        listing_version as "listingVersion",
        result_id as "resultId",
        source,
        rent_scenario as "rentScenario",
        down_pct as "downPct",
        rate_bps as "rateBps",
        amort_months as "amortMonths",
        noi,
        cap_rate as "capRate",
        cash_flow as "cashFlow",
        coc,
        dscr,
        breakeven,
        price,
        down_payment as "downPayment",
        loan_amount as "loanAmount",
        monthly_ds as "monthlyDS",
        score,
        computed_at as "computedAt"
      FROM underwrite_results 
      WHERE listing_id = $1 
        AND rent_scenario = $2
        AND down_pct = $3
        AND rate_bps = $4
        AND amort_months = $5
        AND source = 'grid'
      ORDER BY computed_at DESC
      LIMIT 1
    `;

    const result = await this.db.query(query, [
      listingId,
      rentScenario,
      downPct,
      rateBps,
      amortMonths,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToUnderwritingResult(result.rows[0]);
  }

  /**
   * Get best performing scenarios for a listing
   */
  async getBestScenarios(
    listingId: string,
    limit = 5
  ): Promise<UnderwritingResult[]> {
    const query = `
      SELECT DISTINCT ON (rent_scenario, down_pct, rate_bps)
        listing_id as "listingId",
        listing_version as "listingVersion",
        result_id as "resultId",
        source,
        rent_scenario as "rentScenario",
        down_pct as "downPct",
        rate_bps as "rateBps",
        amort_months as "amortMonths",
        noi,
        cap_rate as "capRate",
        cash_flow as "cashFlow",
        coc,
        dscr,
        breakeven,
        price,
        down_payment as "downPayment",
        loan_amount as "loanAmount",
        monthly_ds as "monthlyDS",
        score,
        computed_at as "computedAt"
      FROM underwrite_results 
      WHERE listing_id = $1 
        AND score IS NOT NULL
      ORDER BY rent_scenario, down_pct, rate_bps, score DESC, computed_at DESC
      LIMIT $2
    `;

    const result = await this.db.query(query, [listingId, limit]);
    return result.rows
      .map(this.mapRowToUnderwritingResult)
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Map database row to UnderwritingResult DTO
   */
  private mapRowToUnderwritingResult(row: any): UnderwritingResult {
    return {
      listingId: row.listingId,
      listingVersion: row.listingVersion,
      resultId: row.resultId,
      source: row.source,
      rentScenario: row.rentScenario,
      downPct: row.downPct,
      rateBps: row.rateBps,
      amortMonths: row.amortMonths,
      metrics: {
        noi: row.noi,
        capRate: row.capRate,
        cashFlow: row.cashFlow,
        coc: row.coc,
        dscr: row.dscr,
        breakeven: row.breakeven,
        price: row.price,
        downPayment: row.downPayment,
        loanAmount: row.loanAmount,
        monthlyDS: row.monthlyDS,
      },
      score: row.score,
      computedAt: row.computedAt,
    };
  }
}

// ===== HTTP Client Interface and Implementation =====

interface HttpClient {
  get(url: string, options?: { timeout?: number }): Promise<any>;
  post(url: string, data: any, options?: { timeout?: number }): Promise<any>;
}

class DefaultHttpClient implements HttpClient {
  async get(url: string, options: { timeout?: number } = {}): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || 5000
    );

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async post(
    url: string,
    data: any,
    options: { timeout?: number } = {}
  ): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      options.timeout || 5000
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
