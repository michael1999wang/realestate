import { BaseEvent, BusPort as SharedBusPort } from "@realestate/shared-utils";
import { BusPort as LocalBusPort } from "../core/ports";

/**
 * Adapter that bridges the shared bus interface with the Alerts' bus interface
 */
export class BusAdapter implements LocalBusPort {
  constructor(private sharedBus: SharedBusPort) {}

  async subscribe(
    topic: "underwrite_completed" | "property_scored",
    handler: (evt: any) => Promise<void>
  ): Promise<void> {
    // Type-safe wrapper that handles the conversion
    return this.sharedBus.subscribe(topic, async (event: BaseEvent) => {
      await handler(event);
    });
  }

  async close(): Promise<void> {
    if (this.sharedBus.close) {
      return this.sharedBus.close();
    }
  }
}
