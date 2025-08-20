import cors from "cors";
import express from "express";
import {
  generateNewListing,
  getListingWithAnalysis,
  mockData,
} from "../src/data/mockData";
import { APIResponse } from "../src/types";

const app = express();
const port = 8081;

app.use(cors());
app.use(express.json());

// Simulate API delays
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Base API response wrapper
function createResponse<T>(data: T): APIResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function createErrorResponse(error: string): APIResponse<never> {
  return {
    success: false,
    error,
    timestamp: new Date().toISOString(),
  };
}

// Listings endpoints
app.get("/api/listings", async (req, res) => {
  await delay(300);
  res.json(createResponse(mockData.listings));
});

app.get("/api/listings/:id", async (req, res) => {
  await delay(200);
  const listing = mockData.listings.find((l) => l.id === req.params.id);
  res.json(createResponse(listing || null));
});

app.get("/api/listings/:id/analysis", async (req, res) => {
  await delay(400);
  const analysis = getListingWithAnalysis(req.params.id);
  res.json(createResponse(analysis));
});

// Enrichments endpoints
app.get("/api/enrichments", async (req, res) => {
  await delay(250);
  res.json(createResponse(mockData.enrichments));
});

app.get("/api/enrichments/:listingId", async (req, res) => {
  await delay(150);
  const enrichment = mockData.enrichments.find(
    (e) => e.listingId === req.params.listingId
  );
  res.json(createResponse(enrichment || null));
});

// Rent estimates endpoints
app.get("/api/rent-estimates", async (req, res) => {
  await delay(200);
  res.json(createResponse(mockData.rentEstimates));
});

app.get("/api/rent-estimates/:listingId", async (req, res) => {
  await delay(150);
  const estimate = mockData.rentEstimates.find(
    (r) => r.listingId === req.params.listingId
  );
  res.json(createResponse(estimate || null));
});

// Underwriting endpoints
app.get("/api/underwriting", async (req, res) => {
  await delay(300);
  const listingId = req.query.listingId as string;
  const results = listingId
    ? mockData.underwritingResults.filter((u) => u.listingId === listingId)
    : mockData.underwritingResults;
  res.json(createResponse(results));
});

app.post("/api/underwriting/:listingId", async (req, res) => {
  await delay(500);
  res.json(createResponse({ jobId: `job-${Date.now()}` }));
});

// Saved searches endpoints
app.get("/api/searches", async (req, res) => {
  await delay(200);
  res.json(createResponse(mockData.savedSearches));
});

app.post("/api/searches", async (req, res) => {
  await delay(300);
  const newSearch = {
    ...req.body,
    id: `search-${Date.now()}`,
  };
  mockData.savedSearches.push(newSearch);
  res.json(createResponse(newSearch));
});

app.put("/api/searches/:id", async (req, res) => {
  await delay(250);
  const index = mockData.savedSearches.findIndex((s) => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json(createErrorResponse("Search not found"));
  }

  mockData.savedSearches[index] = {
    ...mockData.savedSearches[index],
    ...req.body,
  };
  res.json(createResponse(mockData.savedSearches[index]));
});

app.delete("/api/searches/:id", async (req, res) => {
  await delay(200);
  const index = mockData.savedSearches.findIndex((s) => s.id === req.params.id);
  if (index === -1) {
    return res.status(404).json(createErrorResponse("Search not found"));
  }

  mockData.savedSearches.splice(index, 1);
  res.json(createResponse(true));
});

// Alerts endpoints
app.get("/api/alerts", async (req, res) => {
  await delay(200);
  res.json(createResponse(mockData.alerts));
});

app.post("/api/alerts/:id/dismiss", async (req, res) => {
  await delay(150);
  res.json(createResponse(true));
});

// System health endpoint
app.get("/api/system/health", async (req, res) => {
  await delay(400);
  res.json(createResponse(mockData.systemHealth));
});

// Server-sent events endpoint for real-time updates
app.get("/sse/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Cache-Control",
  });

  // Send a ping immediately
  res.write(
    'data: {"type":"ping","timestamp":"' + new Date().toISOString() + '"}\n\n'
  );

  // Send periodic updates
  const interval = setInterval(() => {
    // Simulate new listings
    if (Math.random() < 0.3) {
      const newListing = generateNewListing();
      res.write(
        `data: ${JSON.stringify({
          type: "listing_changed",
          data: newListing,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    }

    // Simulate alerts
    if (Math.random() < 0.2) {
      const alert = {
        id: `alert-${Date.now()}`,
        userId: "user-demo",
        listingId:
          mockData.listings[
            Math.floor(Math.random() * mockData.listings.length)
          ].id,
        searchId: mockData.savedSearches[0]?.id || "search-1",
        resultId: `result-${Date.now()}`,
        score: Math.random() * 0.3 + 0.7,
        triggeredAt: new Date().toISOString(),
        channels: ["devbrowser"],
        delivered: true,
      };

      res.write(
        `data: ${JSON.stringify({
          type: "alert_fired",
          data: alert,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    }

    // Simulate system health updates
    if (Math.random() < 0.1) {
      mockData.systemHealth.services.forEach((service) => {
        if (service.metrics) {
          service.metrics.eventsProcessed =
            (service.metrics.eventsProcessed || 0) +
            Math.floor(Math.random() * 10);
          service.lastCheck = new Date().toISOString();
        }
      });

      res.write(
        `data: ${JSON.stringify({
          type: "system_health_updated",
          data: mockData.systemHealth,
          timestamp: new Date().toISOString(),
        })}\n\n`
      );
    }
  }, 5000);

  // Clean up on client disconnect
  req.on("close", () => {
    clearInterval(interval);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`🚀 Demo API server running on http://localhost:${port}`);
  console.log(`📊 Health check: http://localhost:${port}/health`);
  console.log(`🔄 SSE events: http://localhost:${port}/sse/events`);
});
