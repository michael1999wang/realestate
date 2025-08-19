import { SQS } from "aws-sdk";
import { BusPort } from "../core/ports";

export class SQSBus implements BusPort {
  private sqs: SQS;
  private queueUrls: Map<string, string> = new Map();

  constructor(config?: {
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string; // For LocalStack
  }) {
    this.sqs = new SQS({
      region: config?.region ?? "us-east-1",
      accessKeyId: config?.accessKeyId,
      secretAccessKey: config?.secretAccessKey,
      endpoint: config?.endpoint, // For LocalStack testing
    });
  }

  async subscribe(
    topic: "listing_changed",
    handler: (e: any) => Promise<void>
  ): Promise<void> {
    const queueName = `${topic}-queue`;

    try {
      // Get or create queue URL
      let queueUrl = this.queueUrls.get(topic);

      if (!queueUrl) {
        try {
          const result = await this.sqs
            .getQueueUrl({ QueueName: queueName })
            .promise();
          queueUrl = result.QueueUrl!;
        } catch (error) {
          // Queue doesn't exist, create it
          const createResult = await this.sqs
            .createQueue({
              QueueName: queueName,
              Attributes: {
                VisibilityTimeoutSeconds: "60",
                MessageRetentionPeriod: "1209600", // 14 days
                ReceiveMessageWaitTimeSeconds: "20", // Long polling
              },
            })
            .promise();
          queueUrl = createResult.QueueUrl!;
        }

        this.queueUrls.set(topic, queueUrl);
      }

      console.log(
        `[SQSBus] Subscribed to topic: ${topic}, queue: ${queueName}`
      );

      // Start polling for messages
      this.startPolling(queueUrl, handler);
    } catch (error) {
      console.error(`[SQSBus] Failed to subscribe to topic ${topic}:`, error);
      throw error;
    }
  }

  async publish(evt: {
    type: "underwrite_requested";
    id: string;
    assumptionsId?: string;
  }): Promise<void> {
    const topic = evt.type;
    const queueName = `${topic}-queue`;

    try {
      // Get or create queue URL
      let queueUrl = this.queueUrls.get(topic);

      if (!queueUrl) {
        try {
          const result = await this.sqs
            .getQueueUrl({ QueueName: queueName })
            .promise();
          queueUrl = result.QueueUrl!;
        } catch (error) {
          // Queue doesn't exist, create it
          const createResult = await this.sqs
            .createQueue({
              QueueName: queueName,
              Attributes: {
                VisibilityTimeoutSeconds: "60",
                MessageRetentionPeriod: "1209600",
              },
            })
            .promise();
          queueUrl = createResult.QueueUrl!;
        }

        this.queueUrls.set(topic, queueUrl);
      }

      await this.sqs
        .sendMessage({
          QueueUrl: queueUrl,
          MessageBody: JSON.stringify(evt),
          MessageAttributes: {
            eventType: {
              DataType: "String",
              StringValue: evt.type,
            },
            listingId: {
              DataType: "String",
              StringValue: evt.id,
            },
          },
        })
        .promise();

      console.log(`[SQSBus] Published event to ${topic}:`, JSON.stringify(evt));
    } catch (error) {
      console.error(`[SQSBus] Failed to publish event to ${topic}:`, error);
      throw error;
    }
  }

  private async startPolling(
    queueUrl: string,
    handler: (e: any) => Promise<void>
  ): Promise<void> {
    console.log(`[SQSBus] Starting to poll queue: ${queueUrl}`);

    const poll = async () => {
      try {
        const result = await this.sqs
          .receiveMessage({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20, // Long polling
            MessageAttributeNames: ["All"],
          })
          .promise();

        if (result.Messages && result.Messages.length > 0) {
          for (const message of result.Messages) {
            try {
              const event = JSON.parse(message.Body!);
              await handler(event);

              // Delete message after successful processing
              await this.sqs
                .deleteMessage({
                  QueueUrl: queueUrl,
                  ReceiptHandle: message.ReceiptHandle!,
                })
                .promise();

              console.log(
                `[SQSBus] Successfully processed message: ${message.MessageId}`
              );
            } catch (handlerError) {
              console.error(
                `[SQSBus] Handler error for message ${message.MessageId}:`,
                handlerError
              );
              // Message will be retried after visibility timeout
            }
          }
        }
      } catch (error) {
        console.error("[SQSBus] Polling error:", error);
        // Wait a bit before retrying
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Continue polling
      setImmediate(poll);
    };

    // Start polling
    poll();
  }

  // Admin methods
  async getQueueStats(topic: string): Promise<{
    approximateNumberOfMessages: number;
    approximateNumberOfMessagesNotVisible: number;
  }> {
    const queueUrl = this.queueUrls.get(topic);
    if (!queueUrl) {
      throw new Error(`No queue found for topic: ${topic}`);
    }

    const result = await this.sqs
      .getQueueAttributes({
        QueueUrl: queueUrl,
        AttributeNames: [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
        ],
      })
      .promise();

    return {
      approximateNumberOfMessages: parseInt(
        result.Attributes!.ApproximateNumberOfMessages || "0"
      ),
      approximateNumberOfMessagesNotVisible: parseInt(
        result.Attributes!.ApproximateNumberOfMessagesNotVisible || "0"
      ),
    };
  }

  async purgeQueue(topic: string): Promise<void> {
    const queueUrl = this.queueUrls.get(topic);
    if (!queueUrl) {
      throw new Error(`No queue found for topic: ${topic}`);
    }

    await this.sqs.purgeQueue({ QueueUrl: queueUrl }).promise();
    console.log(`[SQSBus] Purged queue for topic: ${topic}`);
  }
}
