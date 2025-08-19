import { CMHCPort } from "../core/ports";

export class CMHCAPI implements CMHCPort {
  constructor(private mockMode: boolean = true) {}

  async getRentPriors(params: {
    city?: string;
    fsa?: string;
    beds?: number;
    propertyType?: string;
  }): Promise<{
    p25?: number;
    p50?: number;
    p75?: number;
    asOf?: string;
  }> {
    if (this.mockMode) {
      return this.getMockRentPriors(params);
    }

    // In real implementation, this would query CMHC data or local tables
    // For now, return mock data even in "live" mode
    return this.getMockRentPriors(params);
  }

  private getMockRentPriors(params: {
    city?: string;
    fsa?: string;
    beds?: number;
    propertyType?: string;
  }): {
    p25?: number;
    p50?: number;
    p75?: number;
    asOf?: string;
  } {
    const { city, fsa, propertyType } = params;

    // Mock rent data based on city/FSA
    let baseRent = 1800; // Default Toronto-ish rent

    if (city?.toLowerCase().includes("toronto")) {
      if (fsa?.startsWith("M5") || fsa?.startsWith("M6")) {
        // Downtown Toronto FSAs
        baseRent = 2200;
      } else if (fsa?.startsWith("M4") || fsa?.startsWith("M3")) {
        // Mid-town Toronto
        baseRent = 2000;
      } else {
        // Outer Toronto
        baseRent = 1800;
      }
    } else if (city?.toLowerCase().includes("vancouver")) {
      baseRent = 2400;
    } else if (city?.toLowerCase().includes("montreal")) {
      baseRent = 1400;
    } else if (city?.toLowerCase().includes("calgary")) {
      baseRent = 1600;
    } else {
      // Other cities
      baseRent = 1500;
    }

    // Adjust for property type
    if (propertyType?.toLowerCase().includes("condo")) {
      baseRent *= 1.1;
    } else if (propertyType?.toLowerCase().includes("house")) {
      baseRent *= 1.3;
    } else if (propertyType?.toLowerCase().includes("apartment")) {
      baseRent *= 0.9;
    }

    const p25 = Math.round(baseRent * 0.85);
    const p50 = Math.round(baseRent);
    const p75 = Math.round(baseRent * 1.25);

    return {
      p25,
      p50,
      p75,
      asOf: "2024-01-01",
    };
  }
}
