import { CompsPort } from "../core/ports";

interface MockComp {
  id: string;
  rent: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  lat?: number;
  lng?: number;
  city?: string;
  fsa?: string;
  propertyType?: string;
  daysOld?: number;
  distanceKm?: number;
}

export class MockCompsSource implements CompsPort {
  private mockComps: MockComp[] = [];

  constructor() {
    // Set up some mock rental comps
    this.mockComps = [
      {
        id: "comp-1",
        rent: 3100,
        beds: 2,
        baths: 2,
        sqft: 900,
        lat: 43.6426,
        lng: -79.3871,
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
        daysOld: 15,
      },
      {
        id: "comp-2",
        rent: 3300,
        beds: 2,
        baths: 2,
        sqft: 1000,
        lat: 43.643,
        lng: -79.3875,
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
        daysOld: 25,
      },
      {
        id: "comp-3",
        rent: 2950,
        beds: 2,
        baths: 1,
        sqft: 850,
        lat: 43.642,
        lng: -79.3865,
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
        daysOld: 45,
      },
      {
        id: "comp-4",
        rent: 3400,
        beds: 2,
        baths: 2,
        sqft: 1100,
        lat: 43.6435,
        lng: -79.388,
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
        daysOld: 60,
      },
      {
        id: "comp-5",
        rent: 3200,
        beds: 2,
        baths: 2,
        sqft: 950,
        lat: 43.6425,
        lng: -79.387,
        city: "Toronto",
        fsa: "M5V",
        propertyType: "Condo",
        daysOld: 30,
      },
    ];
  }

  async searchComps(params: {
    lat?: number;
    lng?: number;
    city?: string;
    fsa?: string;
    beds?: number;
    baths?: number;
    sqft?: number;
    propertyType?: string;
    radiusKm?: number;
    daysBack?: number;
  }): Promise<
    Array<{
      id: string;
      rent: number;
      beds?: number;
      baths?: number;
      sqft?: number;
      distanceKm?: number;
      daysOld?: number;
    }>
  > {
    let filtered = [...this.mockComps];

    // Filter by days back
    if (params.daysBack) {
      filtered = filtered.filter(
        (comp) => (comp.daysOld ?? 0) <= params.daysBack!
      );
    }

    // Filter by city or FSA
    if (params.fsa) {
      filtered = filtered.filter((comp) => comp.fsa === params.fsa);
    } else if (params.city) {
      filtered = filtered.filter((comp) => comp.city === params.city);
    }

    // Filter by property type
    if (params.propertyType) {
      filtered = filtered.filter(
        (comp) => comp.propertyType === params.propertyType
      );
    }

    // Filter by beds (±1)
    if (params.beds !== undefined) {
      filtered = filtered.filter(
        (comp) =>
          comp.beds === undefined || Math.abs(comp.beds - params.beds!) <= 1
      );
    }

    // Filter by baths (±1)
    if (params.baths !== undefined) {
      filtered = filtered.filter(
        (comp) =>
          comp.baths === undefined || Math.abs(comp.baths - params.baths!) <= 1
      );
    }

    // Filter by sqft (±20%)
    if (params.sqft !== undefined) {
      const tolerance = params.sqft * 0.2;
      filtered = filtered.filter(
        (comp) =>
          comp.sqft === undefined ||
          Math.abs(comp.sqft - params.sqft!) <= tolerance
      );
    }

    // Calculate distance and filter by radius
    if (
      params.lat !== undefined &&
      params.lng !== undefined &&
      params.radiusKm
    ) {
      filtered = filtered
        .map((comp) => ({
          ...comp,
          distanceKm:
            comp.lat && comp.lng
              ? this.calculateDistance(
                  params.lat!,
                  params.lng!,
                  comp.lat,
                  comp.lng
                )
              : undefined,
        }))
        .filter(
          (comp) =>
            comp.distanceKm === undefined || comp.distanceKm <= params.radiusKm!
        );
    }

    // Return results with required fields
    return filtered.map((comp) => ({
      id: comp.id,
      rent: comp.rent,
      beds: comp.beds,
      baths: comp.baths,
      sqft: comp.sqft,
      distanceKm: comp.distanceKm,
      daysOld: comp.daysOld,
    }));
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  // Helper methods for testing
  addMockComp(comp: MockComp): void {
    this.mockComps.push(comp);
  }

  clear(): void {
    this.mockComps = [];
  }

  getAll(): MockComp[] {
    return [...this.mockComps];
  }
}
