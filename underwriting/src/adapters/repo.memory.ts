import { Assumptions, BaseInputs, GridRow, Metrics } from "../core/dto";
import {
  AssumptionsReadPort,
  SnapshotReadPort,
  UWRepoPort,
} from "../core/ports";

/**
 * In-memory implementation of snapshot read port for testing
 */
export class MemorySnapshotRepo implements SnapshotReadPort {
  private baseInputs = new Map<string, BaseInputs>();

  async loadBaseInputs(listingId: string): Promise<BaseInputs | null> {
    return this.baseInputs.get(listingId) || null;
  }

  // Test helper methods
  setBaseInputs(listingId: string, inputs: BaseInputs): void {
    this.baseInputs.set(listingId, inputs);
  }

  clear(): void {
    this.baseInputs.clear();
  }
}

/**
 * In-memory implementation of assumptions read port for testing
 */
export class MemoryAssumptionsRepo implements AssumptionsReadPort {
  private assumptions = new Map<string, Assumptions>();
  private defaultAssumptions: Assumptions = {
    downPct: 0.2,
    rateBps: 500, // 5%
    amortMonths: 360,
    rentScenario: "P50",
  };

  async getAssumptionsById(id: string): Promise<Assumptions | null> {
    return this.assumptions.get(id) || null;
  }

  async getDefaultAssumptions(): Promise<Assumptions> {
    return { ...this.defaultAssumptions };
  }

  // Test helper methods
  setAssumptions(id: string, assumptions: Assumptions): void {
    this.assumptions.set(id, assumptions);
  }

  setDefaultAssumptions(assumptions: Assumptions): void {
    this.defaultAssumptions = { ...assumptions };
  }

  clear(): void {
    this.assumptions.clear();
  }
}

/**
 * In-memory implementation of underwriting repository for testing
 */
export class MemoryUWRepo implements UWRepoPort {
  private gridRows = new Map<string, GridRow>();
  private exactRows = new Map<string, { id: string; metrics: Metrics }>();
  private nextExactId = 1;

  async upsertGrid(rows: GridRow[]): Promise<void> {
    for (const row of rows) {
      const key = this.buildGridKey(
        row.listingId,
        row.listingVersion,
        row.rentScenario,
        row.downPctBin,
        row.rateBpsBin,
        row.amortMonths
      );
      this.gridRows.set(key, row);
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
    const key = this.buildGridKey(
      listingId,
      listingVersion,
      rentScenario,
      downPctBin,
      rateBpsBin,
      amortMonths
    );
    return this.gridRows.get(key) || null;
  }

  async saveExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string,
    metrics: Metrics
  ): Promise<{ id: string; created: boolean }> {
    const key = this.buildExactKey(listingId, listingVersion, assumptionsHash);
    const existing = this.exactRows.get(key);

    if (existing) {
      return { id: existing.id, created: false };
    }

    const id = (this.nextExactId++).toString();
    this.exactRows.set(key, { id, metrics });
    return { id, created: true };
  }

  async getExact(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string
  ): Promise<{ id: string; metrics: Metrics } | null> {
    const key = this.buildExactKey(listingId, listingVersion, assumptionsHash);
    return this.exactRows.get(key) || null;
  }

  async bumpVersionOnListing(
    listingId: string,
    listingVersion: number
  ): Promise<void> {
    // In memory implementation doesn't need to do anything special
    // The version is part of the cache key, so old versions are naturally isolated
    console.log(`Version bumped for ${listingId} to ${listingVersion}`);
  }

  // Helper methods
  private buildGridKey(
    listingId: string,
    listingVersion: number,
    rentScenario: string,
    downPctBin: number,
    rateBpsBin: number,
    amortMonths: number
  ): string {
    return `grid_${listingId}_v${listingVersion}_${rentScenario}_${downPctBin}_${rateBpsBin}_${amortMonths}`;
  }

  private buildExactKey(
    listingId: string,
    listingVersion: number,
    assumptionsHash: string
  ): string {
    return `exact_${listingId}_v${listingVersion}_${assumptionsHash}`;
  }

  // Test helper methods
  getGridRowCount(): number {
    return this.gridRows.size;
  }

  getExactRowCount(): number {
    return this.exactRows.size;
  }

  getAllGridRows(): GridRow[] {
    return Array.from(this.gridRows.values());
  }

  getAllExactRows(): Array<{ id: string; metrics: Metrics }> {
    return Array.from(this.exactRows.values());
  }

  clear(): void {
    this.gridRows.clear();
    this.exactRows.clear();
    this.nextExactId = 1;
  }
}
