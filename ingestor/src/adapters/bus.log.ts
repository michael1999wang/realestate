import { ListingChangedEvent } from "../core/dto";
import { BusPort } from "../core/ports";

/**
 * Simple logging bus adapter for development
 * Logs events instead of publishing to actual message bus
 */
export class LogBus implements BusPort {
  constructor(private serviceName: string) {}

  async publish(event: ListingChangedEvent): Promise<void> {
    console.log(`[${this.serviceName.toUpperCase()}] Publishing event:`, {
      type: event.type,
      id: event.id,
      change: event.change,
      dirty: event.dirty,
      updatedAt: event.updatedAt,
    });
  }
}
