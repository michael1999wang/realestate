import { Alert } from "./dto";
import { Dispatcher } from "./ports";

export class MultiChannelDispatcher implements Dispatcher {
  constructor(
    private devBrowserSender: (a: Alert) => Promise<void>,
    private emailSender?: (a: Alert) => Promise<void>,
    private smsSender?: (a: Alert) => Promise<void>,
    private slackSender?: (a: Alert) => Promise<void>,
    private webhookSender?: (a: Alert) => Promise<void>
  ) {}

  async sendDevBrowser(a: Alert): Promise<void> {
    try {
      await this.devBrowserSender(a);
      a.delivery.statusByChannel["devbrowser"] = "sent";
    } catch (error) {
      console.error("DevBrowser dispatch failed:", error);
      a.delivery.statusByChannel["devbrowser"] = "failed";
    }
  }

  async sendEmail(a: Alert): Promise<void> {
    try {
      if (this.emailSender) {
        await this.emailSender(a);
        a.delivery.statusByChannel["email"] = "sent";
      } else {
        console.log(`[EMAIL STUB] Alert ${a.id} for user ${a.userId}: ${a.payload.snapshot.city}, ${a.payload.snapshot.province}`);
        a.delivery.statusByChannel["email"] = "sent";
      }
    } catch (error) {
      console.error("Email dispatch failed:", error);
      a.delivery.statusByChannel["email"] = "failed";
    }
  }

  async sendSMS(a: Alert): Promise<void> {
    try {
      if (this.smsSender) {
        await this.smsSender(a);
        a.delivery.statusByChannel["sms"] = "sent";
      } else {
        console.log(`[SMS STUB] Alert ${a.id} for user ${a.userId}: ${a.payload.snapshot.city}, ${a.payload.snapshot.province}`);
        a.delivery.statusByChannel["sms"] = "sent";
      }
    } catch (error) {
      console.error("SMS dispatch failed:", error);
      a.delivery.statusByChannel["sms"] = "failed";
    }
  }

  async sendSlack(a: Alert): Promise<void> {
    try {
      if (this.slackSender) {
        await this.slackSender(a);
        a.delivery.statusByChannel["slack"] = "sent";
      } else {
        console.log(`[SLACK STUB] Alert ${a.id} for user ${a.userId}: ${a.payload.snapshot.city}, ${a.payload.snapshot.province}`);
        a.delivery.statusByChannel["slack"] = "sent";
      }
    } catch (error) {
      console.error("Slack dispatch failed:", error);
      a.delivery.statusByChannel["slack"] = "failed";
    }
  }

  async sendWebhook(a: Alert): Promise<void> {
    try {
      if (this.webhookSender) {
        await this.webhookSender(a);
        a.delivery.statusByChannel["webhook"] = "sent";
      } else {
        console.log(`[WEBHOOK STUB] Alert ${a.id} for user ${a.userId}: ${a.payload.snapshot.city}, ${a.payload.snapshot.province}`);
        a.delivery.statusByChannel["webhook"] = "sent";
      }
    } catch (error) {
      console.error("Webhook dispatch failed:", error);
      a.delivery.statusByChannel["webhook"] = "failed";
    }
  }
}
