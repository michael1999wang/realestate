import { beforeEach, describe, expect, it, vi } from "vitest";
import { Listing, ListingChangedEvent } from "../src/core/dto";
import { runOnce } from "../src/core/poller";
import { BusPort, RepoPort, SourcePort } from "../src/core/ports";

describe("poller", () => {
  let mockSource: SourcePort;
  let mockRepo: RepoPort;
  let mockBus: BusPort;
  let publishedEvents: ListingChangedEvent[];

  const mockListing: Listing = {
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
    },
    propertyType: "CondoApt",
    beds: 2,
    baths: 2,
    listPrice: 750000,
  };

  beforeEach(() => {
    publishedEvents = [];

    mockSource = {
      fetchUpdatedSince: vi.fn(),
    };

    mockRepo = {
      getWatermark: vi.fn(),
      setWatermark: vi.fn(),
      upsert: vi.fn(),
      markInactive: vi.fn(),
    };

    mockBus = {
      publish: vi.fn().mockImplementation((evt: ListingChangedEvent) => {
        publishedEvents.push(evt);
        return Promise.resolve();
      }),
    };
  });

  describe("runOnce", () => {
    it("should use existing watermark when available", async () => {
      const existingWatermark = "2024-01-10T00:00:00Z";
      vi.mocked(mockRepo.getWatermark).mockResolvedValue(existingWatermark);
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [],
        maxUpdatedAt: existingWatermark,
      });

      await runOnce(mockSource, mockRepo, mockBus);

      expect(mockRepo.getWatermark).toHaveBeenCalledWith("TRREB");
      expect(mockSource.fetchUpdatedSince).toHaveBeenCalledWith(
        existingWatermark,
        undefined
      );
    });

    it("should use 24-hour default when no watermark exists", async () => {
      vi.mocked(mockRepo.getWatermark).mockResolvedValue(null);
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [],
        maxUpdatedAt: "2024-01-15T00:00:00Z",
      });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(mockRepo.getWatermark).toHaveBeenCalledWith("TRREB");

      // Should use a timestamp approximately 24 hours ago
      const [since] = vi.mocked(mockSource.fetchUpdatedSince).mock.calls[0];
      const sinceDate = new Date(since);
      const now = new Date();
      const hoursDiff =
        (now.getTime() - sinceDate.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeCloseTo(24, 1); // Within 1 hour of 24 hours ago
    });

    it("should process items and publish events for changes", async () => {
      const rawItem = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [rawItem],
        maxUpdatedAt: "2024-01-15T08:00:00Z",
      });
      vi.mocked(mockRepo.upsert).mockResolvedValue({
        changed: true,
        changeType: "create",
      });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.processed).toBe(1);
      expect(result.changed).toBe(1);
      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
      expect(mockBus.publish).toHaveBeenCalledTimes(1);
      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0].change).toBe("create");
    });

    it("should not publish events for no-op changes", async () => {
      const rawItem = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [rawItem],
        maxUpdatedAt: "2024-01-15T08:00:00Z",
      });
      vi.mocked(mockRepo.upsert).mockResolvedValue({
        changed: false,
        changeType: "noop",
      });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.processed).toBe(1);
      expect(result.changed).toBe(0);
      expect(mockBus.publish).not.toHaveBeenCalled();
      expect(publishedEvents).toHaveLength(0);
    });

    it("should handle pagination correctly", async () => {
      const rawItem1 = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };
      const rawItem2 = {
        MlsNumber: "C5654321",
        Status: "A",
        ListDate: "2024-01-15T09:00:00Z",
        Updated: "2024-01-15T09:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 850000,
      };

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );

      // First page
      vi.mocked(mockSource.fetchUpdatedSince)
        .mockResolvedValueOnce({
          items: [rawItem1],
          nextPage: "page2",
          maxUpdatedAt: "2024-01-15T08:00:00Z",
        })
        // Second page
        .mockResolvedValueOnce({
          items: [rawItem2],
          maxUpdatedAt: "2024-01-15T09:00:00Z",
        });

      vi.mocked(mockRepo.upsert).mockResolvedValue({
        changed: true,
        changeType: "create",
      });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.processed).toBe(2);
      expect(result.changed).toBe(2);
      expect(result.pages).toBe(2);
      expect(mockSource.fetchUpdatedSince).toHaveBeenCalledTimes(2);
      expect(mockSource.fetchUpdatedSince).toHaveBeenNthCalledWith(
        1,
        "2024-01-01T00:00:00Z",
        undefined
      );
      expect(mockSource.fetchUpdatedSince).toHaveBeenNthCalledWith(
        2,
        "2024-01-01T00:00:00Z",
        "page2"
      );
    });

    it("should update watermark only after successful processing", async () => {
      const rawItem = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };

      const initialWatermark = "2024-01-01T00:00:00Z";
      const newWatermark = "2024-01-15T08:00:00Z";

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(initialWatermark);
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [rawItem],
        maxUpdatedAt: newWatermark,
      });
      vi.mocked(mockRepo.upsert).mockResolvedValue({
        changed: true,
        changeType: "create",
      });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.maxSeen).toBe(newWatermark);
      expect(mockRepo.setWatermark).toHaveBeenCalledWith("TRREB", newWatermark);
    });

    it("should not update watermark if maxSeen is not greater than since", async () => {
      const watermark = "2024-01-15T08:00:00Z";

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(watermark);
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [],
        maxUpdatedAt: watermark, // Same as since
      });

      await runOnce(mockSource, mockRepo, mockBus);

      expect(mockRepo.setWatermark).not.toHaveBeenCalled();
    });

    it("should handle source errors gracefully", async () => {
      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );
      vi.mocked(mockSource.fetchUpdatedSince).mockRejectedValue(
        new Error("Source error")
      );

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.processed).toBe(0);
      expect(result.changed).toBe(0);
      expect(mockRepo.setWatermark).not.toHaveBeenCalled();
    });

    it("should continue processing other items if one fails", async () => {
      const rawItem1 = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };
      const rawItem2 = {
        MlsNumber: "C5654321",
        Status: "A",
        ListDate: "2024-01-15T09:00:00Z",
        Updated: "2024-01-15T09:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 850000,
      };

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [rawItem1, rawItem2],
        maxUpdatedAt: "2024-01-15T09:00:00Z",
      });

      // First item fails, second succeeds
      vi.mocked(mockRepo.upsert)
        .mockRejectedValueOnce(new Error("Upsert error"))
        .mockResolvedValueOnce({
          changed: true,
          changeType: "create",
        });

      const result = await runOnce(mockSource, mockRepo, mockBus);

      expect(result.processed).toBe(1); // Only successful item counted
      expect(result.changed).toBe(1);
      expect(publishedEvents).toHaveLength(1);
    });

    it("should publish correct event types", async () => {
      const rawItem = {
        MlsNumber: "C5123456",
        Status: "A",
        ListDate: "2024-01-15T08:00:00Z",
        Updated: "2024-01-15T08:00:00Z",
        Address: { City: "Toronto" },
        ListPrice: 750000,
      };

      vi.mocked(mockRepo.getWatermark).mockResolvedValue(
        "2024-01-01T00:00:00Z"
      );
      vi.mocked(mockSource.fetchUpdatedSince).mockResolvedValue({
        items: [rawItem],
        maxUpdatedAt: "2024-01-15T08:00:00Z",
      });

      // Test status change
      vi.mocked(mockRepo.upsert).mockResolvedValue({
        changed: true,
        changeType: "status_change",
        dirty: ["status", "price"],
      });

      await runOnce(mockSource, mockRepo, mockBus);

      expect(publishedEvents).toHaveLength(1);
      expect(publishedEvents[0]).toMatchObject({
        type: "listing_changed",
        change: "status_change",
        source: "TRREB",
        dirty: ["status", "price"],
      });
    });
  });
});
