import { annuityFactor } from "../core/finance";
import { FactorsPort } from "../core/ports";

/**
 * In-memory implementation of factors port with caching
 */
export class MemoryFactorsRepo implements FactorsPort {
  private cache = new Map<string, number>();

  async getAF(rateBps: number, amortMonths: number): Promise<number> {
    const key = `${rateBps}-${amortMonths}`;

    // Check cache first
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Compute and cache
    const af = annuityFactor(rateBps, amortMonths);
    this.cache.set(key, af);

    return af;
  }

  // Test helper methods
  getCacheSize(): number {
    return this.cache.size;
  }

  precomputeFactors(rateBpsArray: number[], amortMonthsArray: number[]): void {
    for (const rateBps of rateBpsArray) {
      for (const amortMonths of amortMonthsArray) {
        const key = `${rateBps}-${amortMonths}`;
        if (!this.cache.has(key)) {
          const af = annuityFactor(rateBps, amortMonths);
          this.cache.set(key, af);
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
