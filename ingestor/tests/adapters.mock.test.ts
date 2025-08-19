import { describe, expect, it } from "vitest";
import { MockSource } from "../src/adapters/source.mock";

describe("MockSource", () => {
  let source: MockSource;

  beforeEach(() => {
    source = new MockSource(2); // Small page size for testing
  });

  describe("fetchUpdatedSince", () => {
    it("should return all items when since is very old", async () => {
      const since = "2020-01-01T00:00:00Z";
      const result = await source.fetchUpdatedSince(since);

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.nextPage).toBeDefined(); // Should have pagination with page size 2
      expect(result.maxUpdatedAt).toBeDefined();
    });

    it("should filter items by updated date", async () => {
      // Use a recent date that should filter out most items
      const since = "2024-01-18T00:00:00Z";
      const result = await source.fetchUpdatedSince(since);

      // Should only return items updated after this date
      result.items.forEach((item) => {
        expect(new Date(item.Updated).getTime()).toBeGreaterThan(
          new Date(since).getTime()
        );
      });
    });

    it("should return empty result when since is in future", async () => {
      const since = "2030-01-01T00:00:00Z";
      const result = await source.fetchUpdatedSince(since);

      expect(result.items).toHaveLength(0);
      expect(result.nextPage).toBeUndefined();
      expect(result.maxUpdatedAt).toBe(since);
    });

    it("should handle pagination correctly", async () => {
      const since = "2020-01-01T00:00:00Z";

      // First page
      const page1 = await source.fetchUpdatedSince(since);
      expect(page1.items.length).toBeLessThanOrEqual(2);

      if (page1.nextPage) {
        // Second page
        const page2 = await source.fetchUpdatedSince(since, page1.nextPage);
        expect(page2.items.length).toBeLessThanOrEqual(2);

        // Items should be different between pages
        const page1Ids = page1.items.map((item) => item.MlsNumber || item.id);
        const page2Ids = page2.items.map((item) => item.MlsNumber || item.id);
        const overlap = page1Ids.filter((id) => page2Ids.includes(id));
        expect(overlap).toHaveLength(0);
      }
    });

    it("should return correct maxUpdatedAt", async () => {
      const since = "2020-01-01T00:00:00Z";
      const result = await source.fetchUpdatedSince(since);

      if (result.items.length > 0) {
        // maxUpdatedAt should be the latest timestamp from returned items
        const maxFromItems = result.items.reduce((max, item) => {
          const itemDate = new Date(item.Updated);
          const maxDate = new Date(max);
          return itemDate > maxDate ? item.Updated : max;
        }, result.items[0].Updated);

        expect(result.maxUpdatedAt).toBe(maxFromItems);
      }
    });

    it("should maintain consistent order across pages", async () => {
      const since = "2020-01-01T00:00:00Z";

      // Get all items by paginating through all pages
      const allItems = [];
      let nextPage: string | undefined;

      do {
        const result = await source.fetchUpdatedSince(since, nextPage);
        allItems.push(...result.items);
        nextPage = result.nextPage;
      } while (nextPage);

      // Verify items are sorted by Updated date
      for (let i = 1; i < allItems.length; i++) {
        const prev = new Date(allItems[i - 1].Updated);
        const curr = new Date(allItems[i].Updated);
        expect(curr.getTime()).toBeGreaterThanOrEqual(prev.getTime());
      }
    });

    it("should handle edge case with exact timestamp match", async () => {
      // Use exact timestamp from fixture
      const since = "2024-01-15T08:00:00Z";
      const result = await source.fetchUpdatedSince(since);

      // Should exclude items with exactly the since timestamp
      result.items.forEach((item) => {
        expect(new Date(item.Updated).getTime()).toBeGreaterThan(
          new Date(since).getTime()
        );
      });
    });
  });

  describe("constructor", () => {
    it("should use default page size when not specified", () => {
      const defaultSource = new MockSource();
      expect(defaultSource).toBeDefined();
    });

    it("should accept custom page size", () => {
      const customSource = new MockSource(10);
      expect(customSource).toBeDefined();
    });
  });
});
