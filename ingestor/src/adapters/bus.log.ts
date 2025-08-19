import { ListingChangedEvent } from "../core/dto";
import { BusPort } from "../core/ports";

export class LogBus implements BusPort {
  async publish(evt: ListingChangedEvent): Promise<void> {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event: evt.type,
      listingId: evt.id,
      change: evt.change,
      source: evt.source,
      updatedAt: evt.updatedAt,
      ...(evt.dirty && { dirtyFields: evt.dirty }),
    };

    console.log(JSON.stringify(logEntry, null, 2));
  }
}
