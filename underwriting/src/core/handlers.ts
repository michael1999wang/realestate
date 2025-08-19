import {
  ListingChangedEvt,
  UnderwriteCompletedEvt,
  UnderwriteRequestedEvt,
} from "./dto";
import { computeExactFromId } from "./exact";
import { computeGrid } from "./grid";
import {
  AssumptionsReadPort,
  BusPort,
  FactorsPort,
  SnapshotReadPort,
  UWRepoPort,
} from "./ports";

export class UnderwritingHandlers {
  constructor(
    private snapshotRepo: SnapshotReadPort,
    private assumptionsRepo: AssumptionsReadPort,
    private uwRepo: UWRepoPort,
    private factorsRepo: FactorsPort,
    private busPort: BusPort
  ) {}

  /**
   * Handle underwrite_requested event
   * Computes either grid (default) or exact (with assumptionsId)
   */
  async handleUnderwriteRequested(evt: UnderwriteRequestedEvt): Promise<void> {
    try {
      console.log(`Processing underwrite request for listing ${evt.id}`);

      // Load base inputs to ensure listing exists
      const baseInputs = await this.snapshotRepo.loadBaseInputs(evt.id);
      if (!baseInputs) {
        console.warn(`Base inputs not found for listing ${evt.id}, skipping`);
        return;
      }

      let resultId: string;
      let source: "grid" | "exact";

      if (evt.assumptionsId) {
        // Exact computation with specific assumptions
        console.log(
          `Computing exact underwrite for ${evt.id} with assumptions ${evt.assumptionsId}`
        );

        const result = await computeExactFromId(
          evt.id,
          evt.assumptionsId,
          this.snapshotRepo,
          this.assumptionsRepo,
          this.uwRepo,
          this.factorsRepo
        );

        resultId = result.id;
        source = "exact";

        console.log(
          `Exact computation ${result.fromCache ? "cached" : "fresh"} for ${
            evt.id
          }: ${resultId}`
        );
      } else {
        // Grid computation with default assumptions
        console.log(`Computing grid underwrite for ${evt.id}`);

        const gridResult = await computeGrid(
          evt.id,
          this.snapshotRepo,
          this.uwRepo,
          this.factorsRepo
        );

        // Use a deterministic result ID for grid computations
        resultId = `grid_${evt.id}_v${baseInputs.listingVersion}`;
        source = "grid";

        console.log(
          `Grid computation completed for ${evt.id}: ${gridResult.rowsUpserted} rows`
        );
      }

      // Publish completion event
      const completedEvt: UnderwriteCompletedEvt = {
        type: "underwrite_completed",
        id: evt.id,
        resultId,
        source,
      };

      await this.busPort.publish(completedEvt);
      console.log(`Published underwrite_completed for ${evt.id}`);
    } catch (error) {
      console.error(
        `Failed to handle underwrite request for ${evt.id}:`,
        error
      );
      // In production, you might want to publish a failure event or retry
    }
  }

  /**
   * Handle listing_changed event
   * Recomputes grid if financial data changed
   */
  async handleListingChanged(evt: ListingChangedEvt): Promise<void> {
    try {
      console.log(`Processing listing change for ${evt.id}: ${evt.change}`);

      // Check if this change requires underwriting recomputation
      if (!this.requiresRecomputation(evt)) {
        console.log(
          `Listing change for ${evt.id} does not require recomputation`
        );
        return;
      }

      console.log(`Listing change for ${evt.id} requires recomputation`);

      // Load base inputs to get current version
      const baseInputs = await this.snapshotRepo.loadBaseInputs(evt.id);
      if (!baseInputs) {
        console.warn(
          `Base inputs not found for listing ${evt.id}, skipping recomputation`
        );
        return;
      }

      // Recompute grid with new data
      console.log(
        `Recomputing grid for ${evt.id} version ${baseInputs.listingVersion}`
      );

      const gridResult = await computeGrid(
        evt.id,
        this.snapshotRepo,
        this.uwRepo,
        this.factorsRepo
      );

      console.log(
        `Grid recomputation completed for ${evt.id}: ${gridResult.rowsUpserted} rows`
      );

      // Publish completion event (optional - alerts can decide if they care about recomputations)
      const completedEvt: UnderwriteCompletedEvt = {
        type: "underwrite_completed",
        id: evt.id,
        resultId: `grid_${evt.id}_v${baseInputs.listingVersion}`,
        source: "grid",
      };

      await this.busPort.publish(completedEvt);
      console.log(`Published underwrite_completed for recomputed ${evt.id}`);
    } catch (error) {
      console.error(`Failed to handle listing change for ${evt.id}:`, error);
      // Continue processing other events
    }
  }

  /**
   * Determine if a listing change requires underwriting recomputation
   * @param evt Listing changed event
   * @returns True if recomputation is needed
   */
  private requiresRecomputation(evt: ListingChangedEvt): boolean {
    // If no dirty fields specified, assume recomputation needed for safety
    if (!evt.dirty || evt.dirty.length === 0) {
      return true;
    }

    // Financial fields that affect underwriting
    const financialFields = ["price", "fees", "tax"];

    // Check if any financial fields changed
    const hasFinancialChanges = evt.dirty.some((field) =>
      financialFields.includes(field)
    );

    // Also recompute if rent data might have changed upstream
    // (this would be indicated by a "rent" dirty field if exposed)
    const hasRentChanges = evt.dirty.includes("rent" as any);

    return hasFinancialChanges || hasRentChanges;
  }

  /**
   * Subscribe to all relevant events
   */
  async subscribeToEvents(): Promise<void> {
    await this.busPort.subscribe("underwrite_requested", (evt) =>
      this.handleUnderwriteRequested(evt as UnderwriteRequestedEvt)
    );

    await this.busPort.subscribe("listing_changed", (evt) =>
      this.handleListingChanged(evt as ListingChangedEvt)
    );

    console.log(
      "Subscribed to underwrite_requested and listing_changed events"
    );
  }
}

/**
 * Create and configure handlers
 */
export function createHandlers(
  snapshotRepo: SnapshotReadPort,
  assumptionsRepo: AssumptionsReadPort,
  uwRepo: UWRepoPort,
  factorsRepo: FactorsPort,
  busPort: BusPort
): UnderwritingHandlers {
  return new UnderwritingHandlers(
    snapshotRepo,
    assumptionsRepo,
    uwRepo,
    factorsRepo,
    busPort
  );
}
