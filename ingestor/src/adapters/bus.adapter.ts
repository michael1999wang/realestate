import { BaseEvent, BusPort as SharedBusPort } from "@realestate/shared-utils";
import { ListingChangedEvent } from "../core/dto";
import { BusPort as LocalBusPort } from "../core/ports";

/**
 * Adapter that bridges the shared bus interface with the Ingestor's bus interface
 */
export class BusAdapter implements LocalBusPort {
  constructor(private sharedBus: SharedBusPort) {}

  async publish(evt: ListingChangedEvent): Promise<void> {
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
