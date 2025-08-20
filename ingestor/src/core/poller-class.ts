import { BusPort, RepoPort, SourcePort } from "./ports";
import { runOnce, PollResult } from "./poller";

/**
 * Class-based wrapper around the poller function
 */
export class PollingPoller {
  private isRunning = false;

  constructor(
    private source: SourcePort,
    private repo: RepoPort,
    private bus: BusPort,
    private options: {
      intervalMs: number;
      batchSize: number;
      retryAttempts: number;
      retryDelayMs: number;
      onProgress?: (processed: number, total: number) => void;
      onListingChanged?: (listing: unknown, change: "create" | "update" | "status_change") => Promise<void>;
    }
  ) {}

  async poll(): Promise<PollResult> {
    return runOnce(this.source, this.repo, this.bus);
  }

  stop(): void {
    this.isRunning = false;
  }

  isActive(): boolean {
    return this.isRunning;
  }
}
