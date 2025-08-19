import { beforeEach, describe, expect, it } from "vitest";
import { MemoryRepo } from "../src/adapters/repo.memory";
import { Listing } from "../src/core/dto";

describe("MemoryRepo", () => {
  let repo: MemoryRepo;
  let mockListing: Listing;

  beforeEach(() => {
    repo = new MemoryRepo();
    mockListing = {
      id: "test-123",
      mlsNumber: "C5123456",
      sourceBoard: "TRREB",
      status: "Active",
      listedAt: "2024-01-15T08:00:00Z",
      updatedAt: "2024-01-15T08:00:00Z",
      address: {
        street: "123 Main Street",
        city: "Toronto",
        province: "ON",
        postalCode: "M5V 3A8",
        lat: 43.6426,
        lng: -79.3871,
      },
      propertyType: "CondoApt",
      beds: 2,
      baths: 2,
      sqft: 850,
      yearBuilt: 2018,
      listPrice: 750000,
      taxesAnnual: 4200,
      condoFeeMonthly: 650,
      media: { photos: ["photo1.jpg", "photo2.jpg"] },
      brokerage: { name: "Test Realty", phone: "416-555-0123" },
    };
  });

  describe("watermark management", () => {
    it("should return null for non-existent watermark", async () => {
      const watermark = await repo.getWatermark("TRREB");
      expect(watermark).toBeNull();
    });

    it("should set and get watermark", async () => {
      const timestamp = "2024-01-15T10:00:00Z";
      await repo.setWatermark("TRREB", timestamp);

      const watermark = await repo.getWatermark("TRREB");
      expect(watermark).toBe(timestamp);
    });

    it("should handle multiple sources independently", async () => {
      await repo.setWatermark("TRREB", "2024-01-15T10:00:00Z");
      await repo.setWatermark("CREA", "2024-01-15T11:00:00Z");

      expect(await repo.getWatermark("TRREB")).toBe("2024-01-15T10:00:00Z");
      expect(await repo.getWatermark("CREA")).toBe("2024-01-15T11:00:00Z");
    });
  });

  describe("upsert", () => {
    it("should create new listing on first upsert", async () => {
      const result = await repo.upsert(mockListing);

      expect(result.changed).toBe(true);
      expect(result.changeType).toBe("create");
      expect(result.dirty).toBeUndefined();
    });

    it("should return noop for identical listing", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Second upsert with same data
      const result = await repo.upsert(mockListing);

      expect(result.changed).toBe(false);
      expect(result.changeType).toBe("noop");
      expect(result.dirty).toBeUndefined();
    });

    it("should detect price changes", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update price
      const updatedListing = {
        ...mockListing,
        listPrice: 800000,
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.changeType).toBe("update");
      expect(result.dirty).toContain("price");
    });

    it("should detect status changes as status_change", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update status
      const updatedListing = {
        ...mockListing,
        status: "Sold" as const,
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.changeType).toBe("status_change");
      expect(result.dirty).toContain("status");
    });

    it("should detect multiple field changes", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update multiple fields
      const updatedListing = {
        ...mockListing,
        listPrice: 800000,
        taxesAnnual: 5000,
        condoFeeMonthly: 700,
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.changeType).toBe("update");
      expect(result.dirty).toContain("price");
      expect(result.dirty).toContain("tax");
      expect(result.dirty).toContain("fees");
    });

    it("should detect media changes", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update media
      const updatedListing = {
        ...mockListing,
        media: { photos: ["photo1.jpg", "photo2.jpg", "photo3.jpg"] },
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.dirty).toContain("media");
    });

    it("should detect address changes", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update address
      const updatedListing = {
        ...mockListing,
        address: {
          ...mockListing.address,
          street: "456 Oak Avenue",
        },
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.dirty).toContain("address");
    });

    it("should prioritize status_change over update", async () => {
      // First upsert
      await repo.upsert(mockListing);

      // Update both status and price
      const updatedListing = {
        ...mockListing,
        status: "Sold" as const,
        listPrice: 800000,
        updatedAt: "2024-01-15T09:00:00Z",
      };

      const result = await repo.upsert(updatedListing);

      expect(result.changed).toBe(true);
      expect(result.changeType).toBe("status_change");
      expect(result.dirty).toContain("status");
      expect(result.dirty).toContain("price");
    });
  });

  describe("markInactive", () => {
    it("should mark existing listing as expired", async () => {
      // Create listing
      await repo.upsert(mockListing);

      // Mark inactive
      await repo.markInactive(mockListing.id);

      const listing = repo.getListing(mockListing.id);
      expect(listing?.status).toBe("Expired");
      expect(new Date(listing!.updatedAt).getTime()).toBeGreaterThan(
        new Date(mockListing.updatedAt).getTime()
      );
    });

    it("should handle non-existent listing gracefully", async () => {
      // Should not throw
      await repo.markInactive("non-existent-id");
    });
  });

  describe("helper methods", () => {
    it("should return all listings", async () => {
      await repo.upsert(mockListing);
      await repo.upsert({ ...mockListing, id: "test-456" });

      const listings = repo.getAllListings();
      expect(listings).toHaveLength(2);
    });

    it("should return specific listing by id", async () => {
      await repo.upsert(mockListing);

      const listing = repo.getListing(mockListing.id);
      expect(listing?.id).toBe(mockListing.id);
    });

    it("should return undefined for non-existent listing", () => {
      const listing = repo.getListing("non-existent");
      expect(listing).toBeUndefined();
    });

    it("should clear all data", async () => {
      await repo.upsert(mockListing);
      await repo.setWatermark("TRREB", "2024-01-15T10:00:00Z");

      repo.clear();

      expect(repo.size()).toBe(0);
      expect(await repo.getWatermark("TRREB")).toBeNull();
    });

    it("should return correct size", async () => {
      expect(repo.size()).toBe(0);

      await repo.upsert(mockListing);
      expect(repo.size()).toBe(1);

      await repo.upsert({ ...mockListing, id: "test-456" });
      expect(repo.size()).toBe(2);
    });
  });
});
