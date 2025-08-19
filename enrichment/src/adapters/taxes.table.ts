import { TaxesPort } from "../core/ports";

interface TaxRate {
  city: string;
  province: string;
  rate: number; // Annual tax rate as percentage of assessed value
  method: "exact" | "rate_table";
  notes?: string;
}

export class TaxesTable implements TaxesPort {
  private taxRates: TaxRate[] = [
    // Ontario
    {
      city: "Toronto",
      province: "ON",
      rate: 0.0063,
      method: "rate_table",
      notes: "2024 combined rate",
    },
    { city: "Mississauga", province: "ON", rate: 0.0084, method: "rate_table" },
    { city: "Brampton", province: "ON", rate: 0.0089, method: "rate_table" },
    { city: "Hamilton", province: "ON", rate: 0.0128, method: "rate_table" },
    { city: "London", province: "ON", rate: 0.0145, method: "rate_table" },
    { city: "Markham", province: "ON", rate: 0.0075, method: "rate_table" },
    { city: "Vaughan", province: "ON", rate: 0.0079, method: "rate_table" },
    { city: "Kitchener", province: "ON", rate: 0.0142, method: "rate_table" },
    { city: "Windsor", province: "ON", rate: 0.0165, method: "rate_table" },
    {
      city: "Richmond Hill",
      province: "ON",
      rate: 0.0073,
      method: "rate_table",
    },

    // British Columbia
    {
      city: "Vancouver",
      province: "BC",
      rate: 0.0025,
      method: "rate_table",
      notes: "Municipal only, excludes provincial",
    },
    { city: "Surrey", province: "BC", rate: 0.0035, method: "rate_table" },
    { city: "Burnaby", province: "BC", rate: 0.0028, method: "rate_table" },
    { city: "Richmond", province: "BC", rate: 0.0032, method: "rate_table" },
    { city: "Coquitlam", province: "BC", rate: 0.0038, method: "rate_table" },

    // Alberta
    { city: "Calgary", province: "AB", rate: 0.0058, method: "rate_table" },
    { city: "Edmonton", province: "AB", rate: 0.0095, method: "rate_table" },

    // Quebec
    { city: "Montreal", province: "QC", rate: 0.0072, method: "rate_table" },
    { city: "Quebec City", province: "QC", rate: 0.0089, method: "rate_table" },
    { city: "Laval", province: "QC", rate: 0.0078, method: "rate_table" },

    // Default rates by province
    {
      city: "*",
      province: "ON",
      rate: 0.011,
      method: "rate_table",
      notes: "Ontario average",
    },
    {
      city: "*",
      province: "BC",
      rate: 0.003,
      method: "rate_table",
      notes: "BC average municipal",
    },
    {
      city: "*",
      province: "AB",
      rate: 0.007,
      method: "rate_table",
      notes: "Alberta average",
    },
    {
      city: "*",
      province: "QC",
      rate: 0.008,
      method: "rate_table",
      notes: "Quebec average",
    },
    {
      city: "*",
      province: "MB",
      rate: 0.012,
      method: "rate_table",
      notes: "Manitoba average",
    },
    {
      city: "*",
      province: "SK",
      rate: 0.011,
      method: "rate_table",
      notes: "Saskatchewan average",
    },
    {
      city: "*",
      province: "NS",
      rate: 0.009,
      method: "rate_table",
      notes: "Nova Scotia average",
    },
    {
      city: "*",
      province: "NB",
      rate: 0.0085,
      method: "rate_table",
      notes: "New Brunswick average",
    },
    {
      city: "*",
      province: "NL",
      rate: 0.0075,
      method: "rate_table",
      notes: "Newfoundland average",
    },
    {
      city: "*",
      province: "PE",
      rate: 0.008,
      method: "rate_table",
      notes: "PEI average",
    },
  ];

  async estimateAnnualTax(params: {
    city: string;
    province: string;
    assessedValue: number;
  }): Promise<{
    annual: number;
    method: "exact" | "rate_table" | "unknown";
  }> {
    const { city, province, assessedValue } = params;

    // First try exact city match
    let taxRate = this.taxRates.find(
      (rate) =>
        rate.city.toLowerCase() === city.toLowerCase() &&
        rate.province === province
    );

    // Fall back to province default
    if (!taxRate) {
      taxRate = this.taxRates.find(
        (rate) => rate.city === "*" && rate.province === province
      );
    }

    if (!taxRate) {
      // Unknown province/territory, use a conservative estimate
      return {
        annual: Math.round(assessedValue * 0.01), // 1% fallback
        method: "unknown",
      };
    }

    const annual = Math.round(assessedValue * taxRate.rate);

    return {
      annual,
      method: taxRate.method,
    };
  }

  // Test helper to get tax rate info
  getTaxRate(city: string, province: string): TaxRate | undefined {
    return (
      this.taxRates.find(
        (rate) =>
          rate.city.toLowerCase() === city.toLowerCase() &&
          rate.province === province
      ) ||
      this.taxRates.find(
        (rate) => rate.city === "*" && rate.province === province
      )
    );
  }

  // Test helper to add custom tax rates
  addTaxRate(taxRate: TaxRate): void {
    this.taxRates.push(taxRate);
  }
}
