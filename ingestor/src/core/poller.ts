import { ListingChangedEvent } from "./dto";
import { normalizeTreb } from "./normalize";
import { BusPort, RepoPort, SourcePort } from "./ports";
import { formatDuration } from "./utils";

export interface PollResult {
  processed: number;
  changed: number;
  since: string;
  maxSeen: string;
  durationMs: number;
  pages: number;
}

export async function runOnce(
  src: SourcePort,
  repo: RepoPort,
  bus: BusPort,
  sourceName = "TRREB"
): Promise<PollResult> {
  const startTime = Date.now();

  // Get watermark or default to 24 hours ago
  const since =
    (await repo.getWatermark(sourceName)) ??
    new Date(Date.now() - 24 * 3600e3).toISOString();

  let page: string | undefined;
  let maxSeen = since;
  let processed = 0;
  let changed = 0;
  let pages = 0;

  console.log(`[POLLER] Starting poll since: ${since}`);

  try {
    do {
      pages++;
      console.log(
        `[POLLER] Fetching page ${pages}${page ? ` (token: ${page})` : ""}`
      );

      const { items, nextPage, maxUpdatedAt } = await src.fetchUpdatedSince(
        since,
        page
      );

      console.log(
        `[POLLER] Retrieved ${items.length} items from page ${pages}`
      );

      for (const raw of items) {
        try {
          const norm = normalizeTreb(raw);
          const res = await repo.upsert(norm);
          processed++;

          if (res.changed && res.changeType !== "noop") {
            changed++;
            const evt: ListingChangedEvent = {
              type: "listing_changed",
              id: norm.id,
              updatedAt: norm.updatedAt,
              change:
                res.changeType === "status_change"
                  ? "status_change"
                  : res.changeType === "create"
                  ? "create"
                  : "update",
              source: sourceName as "TRREB" | "CREA" | "MOCK",
              dirty: res.dirty,
            };

            await bus.publish(evt);
            console.log(
              `[POLLER] Published event for listing ${norm.id}: ${res.changeType}`
            );
          } else {
            console.log(
              `[POLLER] No changes for listing ${norm.id} (${res.changeType})`
            );
          }
        } catch (error) {
          console.error(`[POLLER] Error processing item:`, error);
          // Continue processing other items
        }
      }

      // Update maxSeen with the latest timestamp from this batch
      if (maxUpdatedAt && maxUpdatedAt > maxSeen) {
        maxSeen = maxUpdatedAt;
      }

      page = nextPage;

      if (page) {
        console.log(`[POLLER] More pages available, continuing...`);
      }
    } while (page);

    // Only update watermark if we successfully processed all pages
    if (maxSeen > since) {
      await repo.setWatermark(sourceName, maxSeen);
      console.log(`[POLLER] Updated watermark to: ${maxSeen}`);
    }

    const durationMs = Date.now() - startTime;
    const result: PollResult = {
      processed,
      changed,
      since,
      maxSeen,
      durationMs,
      pages,
    };

    console.log(`[POLLER] Poll complete:`, {
      ...result,
      duration: formatDuration(durationMs),
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(
      `[POLLER] Poll failed after ${formatDuration(durationMs)}:`,
      error
    );

    // Don't update watermark on failure
    return {
      processed,
      changed,
      since,
      maxSeen: since, // Reset to original since on failure
      durationMs,
      pages,
    };
  }
}
