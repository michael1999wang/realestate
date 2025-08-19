import { GeocoderPort } from "../core/ports";

export class GeocoderAPI implements GeocoderPort {
  constructor(
    private provider: "mock" | "google" | "mapbox" = "mock",
    private apiKey?: string
  ) {}

  async geocode(
    street: string,
    city: string,
    province: string,
    postalCode?: string
  ): Promise<{
    lat?: number;
    lng?: number;
    fsa?: string;
    neighborhood?: string;
  }> {
    if (this.provider === "mock") {
      return this.getMockGeocode(street, city, province, postalCode);
    }

    if (!this.apiKey) {
      throw new Error(
        `${this.provider} API key is required for live geocoding`
      );
    }

    // In real implementation, this would make HTTP requests to Google/Mapbox
    // For now, return mock data even in "live" mode
    return this.getMockGeocode(street, city, province, postalCode);
  }

  private getMockGeocode(
    street: string,
    city: string,
    province: string,
    postalCode?: string
  ): {
    lat?: number;
    lng?: number;
    fsa?: string;
    neighborhood?: string;
  } {
    // Generate deterministic coordinates based on address for consistent testing
    const addressHash = this.hashString(street + city + province);

    let baseLat = 43.6532; // Toronto
    let baseLng = -79.3832;
    let neighborhood = "Unknown";

    // Mock coordinates for major cities
    if (city.toLowerCase().includes("toronto")) {
      baseLat = 43.6532;
      baseLng = -79.3832;
      neighborhood = this.getMockTorontoNeighborhood(street);
    } else if (city.toLowerCase().includes("vancouver")) {
      baseLat = 49.2827;
      baseLng = -123.1207;
      neighborhood = "Downtown Vancouver";
    } else if (city.toLowerCase().includes("montreal")) {
      baseLat = 45.5017;
      baseLng = -73.5673;
      neighborhood = "Ville-Marie";
    } else if (city.toLowerCase().includes("calgary")) {
      baseLat = 51.0447;
      baseLng = -114.0719;
      neighborhood = "Downtown Calgary";
    }

    // Add some variation based on street address
    const latOffset = ((addressHash % 1000) - 500) / 100000; // ±0.005 degrees
    const lngOffset = ((addressHash % 1500) - 750) / 100000; // ±0.0075 degrees

    const lat = baseLat + latOffset;
    const lng = baseLng + lngOffset;

    // Extract or generate FSA
    let fsa: string | undefined;
    if (postalCode && postalCode.length >= 3) {
      fsa = postalCode.substring(0, 3).toUpperCase();
    } else if (city.toLowerCase().includes("toronto")) {
      // Generate mock FSA for Toronto
      const fsaPrefixes = ["M5V", "M5G", "M4Y", "M6G", "M4W", "M5S", "M5T"];
      fsa = fsaPrefixes[addressHash % fsaPrefixes.length];
    }

    return {
      lat,
      lng,
      fsa,
      neighborhood,
    };
  }

  private getMockTorontoNeighborhood(street: string): string {
    const neighborhoods = [
      "Financial District",
      "Entertainment District",
      "King West",
      "Queen West",
      "Distillery District",
      "Corktown",
      "St. Lawrence",
      "Harbourfront",
      "Church-Yonge Corridor",
      "Garden District",
    ];

    const hash = this.hashString(street);
    return neighborhoods[hash % neighborhoods.length] || "Unknown";
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}
