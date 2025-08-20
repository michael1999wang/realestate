import { describe, expect, it, vi } from "vitest";
import { MultiChannelDispatcher } from "../src/core/dispatch";
import { Alert } from "../src/core/dto";

describe("Dispatch", () => {
  const sampleAlert: Alert = {
    id: "alert-1",
    userId: "user-123",
    savedSearchId: "search-1",
    listingId: "listing-1",
    resultId: "result-1",
    triggeredAt: new Date().toISOString(),
    payload: {
      snapshot: {
        id: "listing-1",
        city: "Toronto",
        province: "ON",
        propertyType: "Condo",
        beds: 2,
        baths: 2,
        price: 750000,
      },
      metrics: {
        dscr: 1.35,
        cashOnCashPct: 0.09,
        cashFlowAnnual: 2400,
      },
      matched: ["dscr>=1.2", "coc>=0.08"],
    },
    delivery: {
      channels: ["devbrowser", "email"],
      statusByChannel: {},
    },
  };

  it("should dispatch to devbrowser successfully", async () => {
    const mockDevBrowser = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new MultiChannelDispatcher(mockDevBrowser);

    await dispatcher.sendDevBrowser(sampleAlert);

    expect(mockDevBrowser).toHaveBeenCalledWith(sampleAlert);
    expect(sampleAlert.delivery.statusByChannel["devbrowser"]).toBe("sent");
  });

  it("should handle devbrowser dispatch failure", async () => {
    const mockDevBrowser = vi
      .fn()
      .mockRejectedValue(new Error("Connection failed"));
    const dispatcher = new MultiChannelDispatcher(mockDevBrowser);

    await dispatcher.sendDevBrowser(sampleAlert);

    expect(sampleAlert.delivery.statusByChannel["devbrowser"]).toBe("failed");
  });

  it("should use stub for email when no sender provided", async () => {
    const mockDevBrowser = vi.fn();
    const dispatcher = new MultiChannelDispatcher(mockDevBrowser);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await dispatcher.sendEmail(sampleAlert);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EMAIL STUB] Alert alert-1 for user user-123")
    );
    expect(sampleAlert.delivery.statusByChannel["email"]).toBe("sent");

    consoleSpy.mockRestore();
  });

  it("should use custom email sender when provided", async () => {
    const mockDevBrowser = vi.fn();
    const mockEmail = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new MultiChannelDispatcher(mockDevBrowser, mockEmail);

    await dispatcher.sendEmail(sampleAlert);

    expect(mockEmail).toHaveBeenCalledWith(sampleAlert);
    expect(sampleAlert.delivery.statusByChannel["email"]).toBe("sent");
  });

  it("should handle email dispatch failure", async () => {
    const mockDevBrowser = vi.fn();
    const mockEmail = vi.fn().mockRejectedValue(new Error("SMTP failed"));
    const dispatcher = new MultiChannelDispatcher(mockDevBrowser, mockEmail);

    await dispatcher.sendEmail(sampleAlert);

    expect(sampleAlert.delivery.statusByChannel["email"]).toBe("failed");
  });
});
