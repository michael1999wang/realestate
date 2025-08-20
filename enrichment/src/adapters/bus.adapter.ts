import { BaseEvent, BusPort as SharedBusPort } from "@realestate/shared-utils";
import { BusPort as LocalBusPort } from "../core/ports";

/**
 * Adapter that bridges the shared bus interface with the service-specific bus interface
 */
export class BusAdapter implements LocalBusPort {
  constructor(private sharedBus: SharedBusPort) {}

  async subscribe(
    topic: "listing_changed",
    handler: (e: any) => Promise<void>
  ): Promise<void> {
    // Type-safe wrapper that handles the conversion
    return this.sharedBus.subscribe(topic, async (event: BaseEvent) => {
      await handler(event);
    });
  }

  async publish(evt: {
    type: "underwrite_requested";
    id: string;
    assumptionsId?: string;
  }): Promise<void> {
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
