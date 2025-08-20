import { CacheDebouncer } from "@realestate/shared-utils/debounce";
import { ListingChangedEvent } from "./dto";
import { enrichOne } from "./enrich";
import {
  BusPort,
  CachePort,
  CMHCPort,
  EnrichmentRepoPort,
  GeocoderPort,
  ListingReadPort,
  TaxesPort,
  WalkScorePort,
} from "./ports";

export interface SchedulerDependencies {
  listingRepo: ListingReadPort;
  enrRepo: EnrichmentRepoPort;
  bus: BusPort;
  cache: CachePort;
  walk: WalkScorePort;
  cmhc: CMHCPort;
  taxes: TaxesPort;
  geo: GeocoderPort;
}

export interface SchedulerMetrics {
  eventsReceived: number;
  eventsProcessed: number;
  eventsDebounced: number;
  enrichmentsChanged: number;
  enrichmentsUnchanged: number;
  underwriteRequestsPublished: number;
  errors: number;
  lastProcessedAt?: string;
  lastErrorAt?: string;
  lastError?: string;
}

export class EnrichmentScheduler {
  private metrics: SchedulerMetrics = {
    eventsReceived: 0,
    eventsProcessed: 0,
    eventsDebounced: 0,
    enrichmentsChanged: 0,
    enrichmentsUnchanged: 0,
    underwriteRequestsPublished: 0,
    errors: 0,
  };

  private debouncer: CacheDebouncer;
  private isRunning = false;

  constructor(
    private deps: SchedulerDependencies,
    private config: {
      debounceTimeoutSec?: number;
      publishUnderwriteEvents?: boolean;
      logLevel?: "debug" | "info" | "warn" | "error";
    } = {}
  ) {
    this.debouncer = new CacheDebouncer(
      deps.cache,
      config.debounceTimeoutSec ?? 30
    );
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Scheduler is already running");
    }

    this.log("info", "Starting enrichment scheduler...");

    try {
      await this.deps.bus.subscribe(
        "listing_changed",
        this.handleListingChanged.bind(this)
      );
      this.isRunning = true;
      this.log("info", "Enrichment scheduler started successfully");
    } catch (error) {
      this.log("error", "Failed to start scheduler:", error);
      throw error;
    }
  }

  stop(): void {
    if (this.isRunning) {
      this.isRunning = false;
      this.log("info", "Enrichment scheduler stopped");
    }
  }

  private async handleListingChanged(
    event: ListingChangedEvent
  ): Promise<void> {
    const startTime = Date.now();
    this.metrics.eventsReceived++;

    this.log("debug", `Received listing_changed event:`, {
      id: event.id,
      change: event.change,
      dirty: event.dirty,
      source: event.source,
    });

    try {
      // Check debounce logic
      const debounceResult = await this.debouncer.shouldProcess(
        event.id,
        event.dirty
      );

      if (!debounceResult.shouldProcess) {
        this.metrics.eventsDebounced++;
        this.log(
          "debug",
          `Event debounced for listing ${event.id}: ${debounceResult.reason}`,
          {
            entry: debounceResult.entry,
          }
        );
        return;
      }

      this.log(
        "info",
        `Processing enrichment for listing ${event.id}: ${debounceResult.reason}`,
        {
          dirty: event.dirty,
          debounceEntry: debounceResult.entry,
        }
      );

      // Perform enrichment
      const enrichResult = await enrichOne(event.id, {
        listingRepo: this.deps.listingRepo,
        enrRepo: this.deps.enrRepo,
        walk: this.deps.walk,
        cmhc: this.deps.cmhc,
        taxes: this.deps.taxes,
        geo: this.deps.geo,
        cache: this.deps.cache,
      });

      this.metrics.eventsProcessed++;

      if (enrichResult.changed) {
        this.metrics.enrichmentsChanged++;
        this.log("info", `Enrichment updated for listing ${event.id}`, {
          durationMs: Date.now() - startTime,
          enrichmentVersion: enrichResult.enrichment?.enrichmentVersion,
        });

        // Optionally publish underwrite_requested event
        if (
          this.config.publishUnderwriteEvents &&
          this.shouldTriggerUnderwrite(event.dirty)
        ) {
          await this.deps.bus.publish({
            type: "underwrite_requested",
            id: event.id,
          });
          this.metrics.underwriteRequestsPublished++;
          this.log(
            "info",
            `Published underwrite_requested for listing ${event.id}`
          );
        }
      } else {
        this.metrics.enrichmentsUnchanged++;
        this.log("debug", `Enrichment unchanged for listing ${event.id}`, {
          durationMs: Date.now() - startTime,
        });
      }

      this.metrics.lastProcessedAt = new Date().toISOString();
    } catch (error) {
      this.metrics.errors++;
      this.metrics.lastErrorAt = new Date().toISOString();
      this.metrics.lastError =
        error instanceof Error ? error.message : String(error);

      this.log(
        "error",
        `Failed to process enrichment for listing ${event.id}:`,
        error,
        {
          durationMs: Date.now() - startTime,
          event,
        }
      );

      // Don't rethrow - we don't want to crash the scheduler
      // The message bus should handle retries
    }
  }

  private shouldTriggerUnderwrite(dirty?: string[]): boolean {
    if (!dirty || dirty.length === 0) return false;

    // Trigger underwriting when financially relevant fields change
    const financialFields = ["price", "fees", "tax", "address"];
    return dirty.some((field) => financialFields.includes(field));
  }

  private log(
    level: "debug" | "info" | "warn" | "error",
    message: string,
    error?: any,
    context?: any
  ): void {
    const logLevel = this.config.logLevel ?? "info";
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };

    if (levels[level] < levels[logLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      service: "enrichment-scheduler",
      ...(context && { context }),
      ...(error && { error: error instanceof Error ? error.message : error }),
    };

    if (level === "error") {
      console.error(JSON.stringify(logEntry));
    } else {
      console.log(JSON.stringify(logEntry));
    }
  }

  // Monitoring and admin methods
  getMetrics(): SchedulerMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      eventsReceived: 0,
      eventsProcessed: 0,
      eventsDebounced: 0,
      enrichmentsChanged: 0,
      enrichmentsUnchanged: 0,
      underwriteRequestsPublished: 0,
      errors: 0,
    };
  }

  isHealthy(): boolean {
    return this.isRunning && this.metrics.errors === 0;
  }

  async getDebounceStatus(): Promise<any[]> {
    return await this.debouncer.getAllPendingDebounces();
  }

  async forceProcessListing(listingId: string): Promise<void> {
    this.log("info", `Force processing listing ${listingId}`);

    // Clear any debounce
    await this.debouncer.clearDebounce(listingId);

    // Create a synthetic event
    const event: ListingChangedEvent = {
      type: "listing_changed",
      id: listingId,
      updatedAt: new Date().toISOString(),
      change: "update",
      source: "MOCK",
      dirty: ["price"], // Force immediate processing
    };

    await this.handleListingChanged(event);
  }
}
