import { WalkScorePort } from "../core/ports";

export class WalkScoreAPI implements WalkScorePort {
  constructor(private apiKey?: string, private mockMode: boolean = true) {}

  async getScores(
    lat: number,
    lng: number
  ): Promise<{ walk?: number; transit?: number; bike?: number }> {
    if (this.mockMode) {
      return this.getMockScores(lat, lng);
    }

    if (!this.apiKey) {
      throw new Error("WalkScore API key is required for live mode");
    }

    // In real implementation, this would make HTTP requests to WalkScore API
    // For now, return mock data even in "live" mode
    return this.getMockScores(lat, lng);
  }

  private getMockScores(
    lat: number,
    lng: number
  ): { walk?: number; transit?: number; bike?: number } {
    // Generate deterministic scores based on coordinates for consistent testing
    const latHash = Math.abs(Math.floor(lat * 1000) % 100);
    const lngHash = Math.abs(Math.floor(lng * 1000) % 100);

    // Toronto downtown area gets high scores
    const isDowntownToronto =
      lat >= 43.6 && lat <= 43.7 && lng >= -79.4 && lng <= -79.3;

    if (isDowntownToronto) {
      return {
        walk: 85 + (latHash % 15),
        transit: 90 + (lngHash % 10),
        bike: 75 + ((latHash + lngHash) % 20),
      };
    }

    // Suburban areas get moderate scores
    return {
      walk: 40 + (latHash % 30),
      transit: 20 + (lngHash % 40),
      bike: 30 + ((latHash + lngHash) % 35),
    };
  }
}
