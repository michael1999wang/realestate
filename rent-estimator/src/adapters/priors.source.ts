import { PriorsPort } from '../core/ports';

export class MockPriorsSource implements PriorsPort {
  private mockData = new Map<string, { p25?: number; p50?: number; p75?: number; asOf?: string }>();

  constructor() {
    // Set up some mock data for common scenarios
    this.mockData.set('Toronto:2:Condo', { p25: 2800, p50: 3200, p75: 3600, asOf: '2024-01-01' });
    this.mockData.set('Toronto:1:Condo', { p25: 2200, p50: 2500, p75: 2800, asOf: '2024-01-01' });
    this.mockData.set('Toronto:3:Condo', { p25: 3500, p50: 4000, p75: 4500, asOf: '2024-01-01' });
    this.mockData.set('Vancouver:2:Condo', { p25: 3200, p50: 3600, p75: 4000, asOf: '2024-01-01' });
    this.mockData.set('Vancouver:1:Condo', { p25: 2500, p50: 2800, p75: 3100, asOf: '2024-01-01' });
    this.mockData.set('M5V:2:Condo', { p25: 3000, p50: 3400, p75: 3800, asOf: '2024-01-01' });
    this.mockData.set('M5V:1:Condo', { p25: 2400, p50: 2700, p75: 3000, asOf: '2024-01-01' });
  }

  async fetchPriors(params: { 
    city?: string; 
    fsa?: string; 
    beds?: number; 
    propertyType?: string 
  }): Promise<{ p25?: number; p50?: number; p75?: number; asOf?: string } | null> {
    // Try FSA first (more specific), then city
    const keys = [
      params.fsa ? `${params.fsa}:${params.beds}:${params.propertyType}` : null,
      params.city ? `${params.city}:${params.beds}:${params.propertyType}` : null
    ].filter(Boolean) as string[];

    for (const key of keys) {
      const result = this.mockData.get(key);
      if (result) {
        return result;
      }
    }

    // Fallback: generate reasonable estimates based on beds
    if (params.beds !== undefined) {
      const baseRent = 1800 + (params.beds * 600); // $1800 base + $600 per bedroom
      return {
        p25: Math.round(baseRent * 0.85),
        p50: baseRent,
        p75: Math.round(baseRent * 1.15),
        asOf: new Date().toISOString().split('T')[0]
      };
    }

    return null;
  }

  // Helper methods for testing
  addMockData(key: string, data: { p25?: number; p50?: number; p75?: number; asOf?: string }): void {
    this.mockData.set(key, data);
  }

  clear(): void {
    this.mockData.clear();
  }
}
