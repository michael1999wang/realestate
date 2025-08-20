import { MockReadAdapter } from "@realestate/alerts/src/adapters/read.mock";
import { MemoryAlertsRepo } from "@realestate/alerts/src/adapters/repo.memory";
import { MultiChannelDispatcher } from "@realestate/alerts/src/core/dispatch";
import {
  Alert,
  ListingSnapshot,
  SavedSearch,
  UWMetrics,
  UnderwriteCompletedEvt,
} from "@realestate/alerts/src/core/dto";
import { matchSearches } from "@realestate/alerts/src/core/match";
import {
  AlertsBusinessLogic,
  AlertsDependencies,
} from "@realestate/alerts/src/service-config";
import { MemoryBus } from "@realestate/shared-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Alerts Integration Tests", () => {
  let repo: MemoryAlertsRepo;
  let readAdapter: MockReadAdapter;
  let dispatcher: MultiChannelDispatcher;
  let capturedAlerts: Alert[];

  beforeEach(() => {
    capturedAlerts = [];

    // Setup sample saved searches
    const savedSearches: SavedSearch[] = [
      {
        id: "search-toronto-condo",
        userId: "user-123",
        name: "Toronto Condos Under 800k",
        filter: {
          city: "Toronto",
          province: "ON",
          propertyType: "Condo",
          maxPrice: 800000,
        },
        thresholds: {
          minDSCR: 1.2,
          minCoC: 0.08,
          requireNonNegativeCF: true,
        },
        notify: { channel: ["devbrowser", "email"] },
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "search-vancouver-house",
        userId: "user-456",
        name: "Vancouver Houses",
        filter: {
          city: "Vancouver",
          province: "BC",
          propertyType: "House",
          minBeds: 3,
        },
        thresholds: {
          minScore: 8.0,
        },
        notify: { channel: ["devbrowser"] },
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: "search-inactive",
        userId: "user-789",
        name: "Inactive Search",
        filter: {
          city: "Toronto",
          propertyType: "Condo",
        },
        thresholds: { minDSCR: 1.0 },
        notify: { channel: ["devbrowser"] },
        isActive: false,
        createdAt: new Date().toISOString(),
      },
    ];

    repo = new MemoryAlertsRepo(savedSearches);

    // Setup sample listings and metrics
    const listings: ListingSnapshot[] = [
      {
        id: "listing-toronto-condo",
        city: "Toronto",
        province: "ON",
        propertyType: "Condo",
        beds: 2,
        baths: 2,
        price: 750000,
      },
      {
        id: "listing-vancouver-house",
        city: "Vancouver",
        province: "BC",
        propertyType: "House",
        beds: 4,
        baths: 3,
        price: 1200000,
      },
    ];

    const metricsData = [
      {
        resultId: "result-toronto",
        metrics: {
          dscr: 1.35,
          cashOnCashPct: 0.09,
          cashFlowAnnual: 2400,
          capRatePct: 0.045,
          irrPct: 0.12,
        } as UWMetrics,
      },
      {
        resultId: "result-vancouver",
        metrics: {
          dscr: 1.1,
          cashOnCashPct: 0.05,
          cashFlowAnnual: -500,
          capRatePct: 0.03,
          irrPct: 0.08,
        } as UWMetrics,
      },
    ];

    readAdapter = new MockReadAdapter(listings, metricsData);

    // Setup dispatcher that captures alerts
    const mockDevBrowser = async (alert: Alert) => {
      capturedAlerts.push(alert);
    };

    dispatcher = new MultiChannelDispatcher(mockDevBrowser);
  });

  afterEach(() => {
    repo.clear();
    readAdapter.clear();
    capturedAlerts = [];
  });

  describe("End-to-End Alert Flow", () => {
    it("should trigger alerts for matching underwrite_completed events", async () => {
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      const event: UnderwriteCompletedEvt = {
        id: "listing-toronto-condo",
        resultId: "result-toronto",
        score: 8.5,
        source: "exact",
        type: "underwrite_completed",
        ts: new Date().toISOString(),
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Should trigger one alert for the Toronto condo search
      expect(capturedAlerts).toHaveLength(1);

      const alert = capturedAlerts[0];
      expect(alert.userId).toBe("user-123");
      expect(alert.savedSearchId).toBe("search-toronto-condo");
      expect(alert.listingId).toBe("listing-toronto-condo");
      expect(alert.resultId).toBe("result-toronto");
      expect(alert.payload.snapshot.city).toBe("Toronto");
      expect(alert.payload.metrics?.dscr).toBe(1.35);
      expect(alert.payload.score).toBe(8.5);
      expect(alert.payload.matched).toContain("dscr>=1.2");
      expect(alert.payload.matched).toContain("coc>=0.08");
      expect(alert.payload.matched).toContain("cf>=0");
      expect(alert.delivery.channels).toEqual(["devbrowser", "email"]);
    });

    it("should not trigger alerts for non-matching properties", async () => {
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      // Event for Vancouver house with poor metrics
      const event: UnderwriteCompletedEvt = {
        id: "listing-vancouver-house",
        resultId: "result-vancouver",
        score: 7.5, // Below minScore threshold
        source: "grid",
        type: "underwrite_completed",
        ts: new Date().toISOString(),
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Should not trigger any alerts (score too low, metrics poor)
      expect(capturedAlerts).toHaveLength(0);
    });

    it("should trigger alerts for score-only matching", async () => {
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      // Event for Vancouver house with good score
      const event: UnderwriteCompletedEvt = {
        id: "listing-vancouver-house",
        resultId: "result-vancouver",
        score: 8.2, // Above minScore threshold
        source: "grid",
        type: "underwrite_completed",
        ts: new Date().toISOString(),
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Should trigger one alert for the Vancouver house search
      expect(capturedAlerts).toHaveLength(1);

      const alert = capturedAlerts[0];
      expect(alert.userId).toBe("user-456");
      expect(alert.savedSearchId).toBe("search-vancouver-house");
      expect(alert.payload.matched).toContain("score>=8");
    });

    it("should not trigger alerts for inactive searches", async () => {
      // Add an inactive search that would otherwise match
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      const event: UnderwriteCompletedEvt = {
        id: "listing-toronto-condo",
        resultId: "result-toronto",
        source: "exact",
        type: "underwrite_completed",
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Should only trigger for active searches
      expect(capturedAlerts).toHaveLength(1);
      expect(capturedAlerts[0].savedSearchId).toBe("search-toronto-condo");
    });

    it("should handle missing listings gracefully", async () => {
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      const event: UnderwriteCompletedEvt = {
        id: "non-existent-listing",
        resultId: "result-1",
        source: "exact",
        type: "underwrite_completed",
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Should not trigger any alerts for missing listings
      expect(capturedAlerts).toHaveLength(0);
    });
  });

  describe("Rule Matching Integration", () => {
    it("should correctly apply complex filter combinations", () => {
      const listing: ListingSnapshot = {
        id: "test-listing",
        city: "Toronto",
        province: "ON",
        propertyType: "Condo",
        beds: 1,
        baths: 1,
        price: 900000, // Over budget
      };

      const searches = [
        {
          id: "search-1",
          userId: "user-1",
          name: "Test",
          filter: { city: "Toronto", propertyType: "Condo", maxPrice: 800000 },
          thresholds: { minDSCR: 1.0 },
          notify: {
            channel: ["devbrowser"] as (
              | "devbrowser"
              | "email"
              | "sms"
              | "slack"
              | "webhook"
            )[],
          },
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];

      const metrics: UWMetrics = {
        dscr: 1.5,
        cashOnCashPct: 0.08,
        cashFlowAnnual: 1000,
      };

      const winners = matchSearches(listing, searches, metrics);

      // Should not match due to price filter
      expect(winners).toHaveLength(0);
    });

    it("should correctly apply threshold combinations", () => {
      const listing: ListingSnapshot = {
        id: "test-listing",
        city: "Calgary",
        province: "AB",
        propertyType: "House",
        beds: 3,
        baths: 2,
        price: 450000,
      };

      const searches = [
        {
          id: "search-1",
          userId: "user-1",
          name: "Calgary Investment",
          filter: { city: "Calgary", maxPrice: 500000 },
          thresholds: {
            minDSCR: 1.25,
            minCoC: 0.1,
            requireNonNegativeCF: true,
          },
          notify: {
            channel: ["devbrowser"] as (
              | "devbrowser"
              | "email"
              | "sms"
              | "slack"
              | "webhook"
            )[],
          },
          isActive: true,
          createdAt: new Date().toISOString(),
        },
      ];

      const goodMetrics: UWMetrics = {
        dscr: 1.4,
        cashOnCashPct: 0.12,
        cashFlowAnnual: 3600,
      };

      const badMetrics: UWMetrics = {
        dscr: 1.4,
        cashOnCashPct: 0.12,
        cashFlowAnnual: -1200, // Negative cash flow
      };

      const winnersGood = matchSearches(listing, searches, goodMetrics);
      const winnersBad = matchSearches(listing, searches, badMetrics);

      expect(winnersGood).toHaveLength(1);
      expect(winnersGood[0].matched).toContain("dscr>=1.25");
      expect(winnersGood[0].matched).toContain("coc>=0.1");
      expect(winnersGood[0].matched).toContain("cf>=0");

      expect(winnersBad).toHaveLength(0);
    });
  });

  describe("Data Persistence", () => {
    it("should persist alerts to repository", async () => {
      const deps: AlertsDependencies = {
        bus: new MemoryBus("alerts-test"),
        repositories: { alerts: repo },
        clients: { read: readAdapter, dispatcher },
        logger: { info: console.log, warn: console.warn, error: console.error },
      };
      const businessLogic = new AlertsBusinessLogic(deps);

      const event: UnderwriteCompletedEvt = {
        id: "listing-toronto-condo",
        resultId: "result-toronto",
        source: "exact",
        type: "underwrite_completed",
      };

      await businessLogic.handleUnderwriteCompleted(event);

      // Check that alert was persisted
      const persistedAlerts = repo.getAlerts();
      expect(persistedAlerts).toHaveLength(1);
      expect(persistedAlerts[0].listingId).toBe("listing-toronto-condo");
    });
  });
});
