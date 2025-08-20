import { BaseEvent, BusPort as SharedBusPort } from "@realestate/shared-utils";
import {
  ListingChangedEvt,
  UnderwriteCompletedEvt,
  UnderwriteRequestedEvt,
} from "../core/dto";
import { BusPort as LocalBusPort } from "../core/ports";

/**
 * Adapter that bridges the shared bus interface with the Underwriting's bus interface
 */
export class BusAdapter implements LocalBusPort {
  constructor(private sharedBus: SharedBusPort) {}

  async subscribe(
    topic: "underwrite_requested" | "listing_changed",
    handler: (evt: UnderwriteRequestedEvt | ListingChangedEvt) => Promise<void>
  ): Promise<void> {
    // Type-safe wrapper that handles the conversion
    return this.sharedBus.subscribe(topic, async (event: BaseEvent) => {
      // The event should match the expected type based on the topic
      await handler(event as UnderwriteRequestedEvt | ListingChangedEvt);
    });
  }

  async publish(evt: UnderwriteCompletedEvt): Promise<void> {
    // Convert to shared bus event format by adding required fields
    const sharedEvent: BaseEvent = {
      ...evt,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };

    return this.sharedBus.publish(sharedEvent);
  }

  async close(): Promise<void> {
    if (this.sharedBus.close) {
      return this.sharedBus.close();
    }
  }
}
