import { ListingChangedEvent } from "../core/dto";
import { BusPort } from "../core/ports";

/**
 * Placeholder for AWS SQS event bus implementation
 * This would publish events to an SQS queue for downstream processing
 */
export class SQSBus implements BusPort {
  constructor(
    private config: {
      queueUrl: string;
      region: string;
      accessKeyId?: string;
      secretAccessKey?: string;
    }
  ) {}

  async publish(evt: ListingChangedEvent): Promise<void> {
    // TODO: Implement SQS message publishing
    // 1. Initialize AWS SQS client
    // 2. Send message to configured queue
    // 3. Handle errors and retries
    // 4. Add message attributes for filtering

    // Example message structure:
    // {
    //   MessageBody: JSON.stringify(evt),
    //   MessageAttributes: {
    //     eventType: { DataType: 'String', StringValue: evt.type },
    //     source: { DataType: 'String', StringValue: evt.source },
    //     changeType: { DataType: 'String', StringValue: evt.change }
    //   }
    // }

    throw new Error(
      "SQSBus not yet implemented. Use LOG adapter for development."
    );
  }
}
