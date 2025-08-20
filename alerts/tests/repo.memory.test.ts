import { beforeEach, describe, expect, it } from "vitest";
import { MemoryAlertsRepo } from "../src/adapters/repo.memory";
import { Alert, ListingSnapshot, SavedSearch } from "../src/core/dto";

describe("MemoryAlertsRepo", () => {
  let repo: MemoryAlertsRepo;

  const sampleSearch: SavedSearch = {
    id: "search-1",
    userId: "user-123",
    name: "Test Search",
    filter: {
      city: "Toronto",
      province: "ON",
      propertyType: "Condo",
      maxPrice: 800000,
    },
    thresholds: { minDSCR: 1.2 },
    notify: { channel: ["devbrowser"] },
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  const inactiveSearch: SavedSearch = {
    ...sampleSearch,
    id: "search-2",
    isActive: false,
  };

  const sampleListing: ListingSnapshot = {
    id: "listing-1",
    city: "Toronto",
    province: "ON",
    propertyType: "Condo",
    beds: 2,
    baths: 2,
    price: 750000,
  };

  beforeEach(() => {
    repo = new MemoryAlertsRepo([sampleSearch, inactiveSearch]);
  });

  describe("listActiveSavedSearches", () => {
    it("should return only active searches", async () => {
      const searches = await repo.listActiveSavedSearches();

      expect(searches).toHaveLength(1);
      expect(searches[0].id).toBe("search-1");
      expect(searches[0].isActive).toBe(true);
    });
  });

  describe("listCandidatesForListing", () => {
    it("should return matching active searches", async () => {
      const candidates = await repo.listCandidatesForListing(sampleListing);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].id).toBe("search-1");
    });

    it("should filter by city", async () => {
      const vancouverListing = { ...sampleListing, city: "Vancouver" };
      const candidates = await repo.listCandidatesForListing(vancouverListing);

      expect(candidates).toHaveLength(0);
    });

    it("should filter by price", async () => {
      const expensiveListing = { ...sampleListing, price: 900000 };
      const candidates = await repo.listCandidatesForListing(expensiveListing);

      expect(candidates).toHaveLength(0);
    });
  });

  describe("insertAlert", () => {
    it("should store and return alert", async () => {
      const alert: Alert = {
        id: "alert-1",
        userId: "user-123",
        savedSearchId: "search-1",
        listingId: "listing-1",
        triggeredAt: new Date().toISOString(),
        payload: {
          snapshot: sampleListing,
          matched: ["test"],
        },
        delivery: {
          channels: ["devbrowser"],
          statusByChannel: {},
        },
      };

      const result = await repo.insertAlert(alert);

      expect(result).toEqual(alert);
      expect(repo.getAlerts()).toHaveLength(1);
      expect(repo.getAlerts()[0]).toEqual(alert);
    });
  });

  describe("helper methods", () => {
    it("should add saved search", () => {
      const newSearch: SavedSearch = {
        ...sampleSearch,
        id: "search-3",
        name: "New Search",
      };

      repo.addSavedSearch(newSearch);

      expect(repo.listActiveSavedSearches()).resolves.toHaveLength(2);
    });

    it("should clear data", () => {
      repo.clear();

      expect(repo.listActiveSavedSearches()).resolves.toHaveLength(0);
      expect(repo.getAlerts()).toHaveLength(0);
    });
  });
});
