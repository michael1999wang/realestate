import * as fs from "fs";
import * as path from "path";
import { SourcePort } from "../core/ports";

export class MockSource implements SourcePort {
  private fixtures: any[];
  private pageSize: number;

  constructor(pageSize = 25) {
    this.pageSize = pageSize;
    const fixturesPath = path.join(
      __dirname,
      "../../fixtures/treb_listings.json"
    );
    this.fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf-8"));
  }

  async fetchUpdatedSince(
    since: string,
    pageToken?: string
  ): Promise<{ items: any[]; nextPage?: string; maxUpdatedAt: string }> {
    // Filter items updated since the watermark
    const sinceDate = new Date(since);
    const filtered = this.fixtures.filter((item) => {
      const updatedDate = new Date(item.Updated);
      return updatedDate > sinceDate;
    });

    // Sort by Updated date for consistent pagination
    filtered.sort(
      (a, b) => new Date(a.Updated).getTime() - new Date(b.Updated).getTime()
    );

    // Handle pagination
    const startIndex = pageToken ? parseInt(pageToken, 10) : 0;
    const endIndex = Math.min(startIndex + this.pageSize, filtered.length);
    const items = filtered.slice(startIndex, endIndex);

    // Determine next page token
    const nextPage =
      endIndex < filtered.length ? endIndex.toString() : undefined;

    // Calculate maxUpdatedAt from all items being returned
    const maxUpdatedAt =
      items.length > 0
        ? items.reduce((max, item) => {
            const itemDate = new Date(item.Updated);
            const maxDate = new Date(max);
            return itemDate > maxDate ? item.Updated : max;
          }, items[0].Updated)
        : since;

    return {
      items,
      nextPage,
      maxUpdatedAt,
    };
  }
}
