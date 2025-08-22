/**
 * API Gateway HTTP Routes
 *
 * Defines all HTTP endpoints exposed by the API Gateway.
 * Routes delegate to orchestration service for business logic.
 */

import { Logger } from "@realestate/shared-utils";
import { Request, Response, Router } from "express";
import { apiCfg } from "../config/env";
import {
  APIResponse,
  HealthCheckResponse,
  PropertySearchRequest,
  UnderwriteRequest,
} from "../core/dto";
import { OrchestrationService } from "../core/orchestration";
import { HealthCheckPort } from "../core/ports";
import { APIGatewayMiddleware, schemas } from "./middleware";

export class APIRoutes {
  private router: Router;

  constructor(
    private orchestration: OrchestrationService,
    private middleware: APIGatewayMiddleware,
    private healthCheck: HealthCheckPort,
    private logger: Logger
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  getRouter(): Router {
    return this.router;
  }

  private setupRoutes(): void {
    // ===== Public Routes =====

    // Health check
    this.router.get("/health", this.handleHealthCheck.bind(this));

    // Authentication
    this.router.post(
      "/auth/login",
      this.middleware.validateBody(schemas.login),
      this.handleLogin.bind(this)
    );

    // ===== Property Routes =====

    // Property search (public with optional auth for enhanced features)
    this.router.get(
      "/properties",
      this.middleware.authenticateOptional(),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateQuery(schemas.propertySearch),
      this.handlePropertySearch.bind(this)
    );

    // Property detail (public with optional auth for user-specific data)
    this.router.get(
      "/properties/:id",
      this.middleware.authenticateOptional(),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateParams(schemas.listingId),
      this.handlePropertyDetail.bind(this)
    );

    // Batch property details (authenticated - for dashboard widgets)
    this.router.post(
      "/properties/batch",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("listings", "read"),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateBody(
        z.object({
          listingIds: z.array(z.string().uuid()).min(1).max(50),
        })
      ),
      this.handleBatchPropertyDetails.bind(this)
    );

    // ===== Underwriting Routes =====

    // Trigger underwriting calculation
    this.router.post(
      "/underwrite",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("underwriting", "write"),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateBody(schemas.underwriteRequest),
      this.handleUnderwrite.bind(this)
    );

    // Get underwriting results
    this.router.get(
      "/properties/:id/underwriting",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("underwriting", "read"),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateParams(schemas.listingId),
      this.handleGetUnderwritingResults.bind(this)
    );

    // ===== Saved Searches Routes =====

    // Get user's saved searches
    this.router.get(
      "/searches",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("searches", "read"),
      this.middleware.rateLimitMiddleware(),
      this.handleGetSavedSearches.bind(this)
    );

    // Create saved search
    this.router.post(
      "/searches",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("searches", "write"),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateBody(schemas.savedSearchCreate),
      this.handleCreateSavedSearch.bind(this)
    );

    // Update saved search
    this.router.put(
      "/searches/:id",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("searches", "write"),
      this.middleware.rateLimitMiddleware(),
      this.middleware.validateBody(schemas.savedSearchCreate.partial()),
      this.handleUpdateSavedSearch.bind(this)
    );

    // Delete saved search
    this.router.delete(
      "/searches/:id",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("searches", "write"),
      this.middleware.rateLimitMiddleware(),
      this.handleDeleteSavedSearch.bind(this)
    );

    // ===== Alerts Routes =====

    // Get user's alerts
    this.router.get(
      "/alerts",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("alerts", "read"),
      this.middleware.rateLimitMiddleware(),
      this.handleGetAlerts.bind(this)
    );

    // Mark alert as read
    this.router.post(
      "/alerts/:id/read",
      this.middleware.authenticateRequired(),
      this.middleware.authorize("alerts", "write"),
      this.middleware.rateLimitMiddleware(),
      this.handleMarkAlertRead.bind(this)
    );

    // ===== User Routes =====

    // Get current user profile
    this.router.get(
      "/user/profile",
      this.middleware.authenticateRequired(),
      this.handleGetUserProfile.bind(this)
    );

    // ===== Admin/Monitoring Routes =====

    // System status (for monitoring)
    this.router.get(
      "/system/status",
      this.middleware.authenticateOptional(),
      this.handleSystemStatus.bind(this)
    );
  }

  // ===== Route Handlers =====

  private async handleHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const isHealthy = await this.healthCheck.checkDatabaseHealth();
      const response: HealthCheckResponse = {
        status: isHealthy ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: isHealthy ? "healthy" : "down",
            lastCheck: new Date().toISOString(),
          },
        },
        version: "1.0.0",
      };

      res.status(isHealthy ? 200 : 503).json(response);
    } catch (error) {
      this.logger.error("Health check failed:", error);
      res.status(503).json({
        status: "down",
        timestamp: new Date().toISOString(),
        error: "Health check failed",
        version: "1.0.0",
      });
    }
  }

  private async handleLogin(req: Request, res: Response): Promise<void> {
    try {
      // Implementation would depend on actual auth adapter
      this.sendSuccess(res, {
        message: "Login endpoint - implement with actual auth adapter",
        developmentMode: apiCfg.isDevelopment,
      });
    } catch (error) {
      this.handleError(res, error, "Login failed");
    }
  }

  private async handlePropertySearch(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const filters = req.query as PropertySearchRequest;
      const result = await this.orchestration.searchProperties(filters);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Property search failed");
    }
  }

  private async handlePropertyDetail(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const result = await this.orchestration.getPropertyDetail(id, userId);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Property detail failed");
    }
  }

  private async handleBatchPropertyDetails(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { listingIds } = req.body;
      const result = await this.orchestration.getPropertiesWithAnalysis(
        listingIds
      );
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Batch property details failed");
    }
  }

  private async handleUnderwrite(req: Request, res: Response): Promise<void> {
    try {
      const request = req.body as UnderwriteRequest;
      const result = await this.orchestration.triggerUnderwriting(request);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Underwriting calculation failed");
    }
  }

  private async handleGetUnderwritingResults(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const result = await this.orchestration.getUnderwritingResults(id);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Failed to get underwriting results");
    }
  }

  private async handleGetSavedSearches(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await this.orchestration.getUserSavedSearches(userId);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Failed to get saved searches");
    }
  }

  private async handleCreateSavedSearch(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const searchData = { ...req.body, userId: req.user!.id };
      const result = await this.orchestration.createSavedSearch(searchData);
      this.sendSuccess(res, result, 201);
    } catch (error) {
      this.handleError(res, error, "Failed to create saved search");
    }
  }

  private async handleUpdateSavedSearch(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;
      const result = await this.orchestration.updateSavedSearch(id, updates);

      if (!result) {
        return this.sendError(res, "Saved search not found", 404);
      }

      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Failed to update saved search");
    }
  }

  private async handleDeleteSavedSearch(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const success = await this.orchestration.deleteSavedSearch(id, userId);

      if (!success) {
        return this.sendError(res, "Saved search not found", 404);
      }

      this.sendSuccess(res, { success: true });
    } catch (error) {
      this.handleError(res, error, "Failed to delete saved search");
    }
  }

  private async handleGetAlerts(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const result = await this.orchestration.getUserAlerts(userId);
      this.sendSuccess(res, result);
    } catch (error) {
      this.handleError(res, error, "Failed to get alerts");
    }
  }

  private async handleMarkAlertRead(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      await this.orchestration.markAlertAsRead(id, userId);
      this.sendSuccess(res, { success: true });
    } catch (error) {
      this.handleError(res, error, "Failed to mark alert as read");
    }
  }

  private async handleGetUserProfile(
    req: Request,
    res: Response
  ): Promise<void> {
    try {
      const user = req.user!;
      // Remove sensitive information
      const { ...profile } = user;
      this.sendSuccess(res, profile);
    } catch (error) {
      this.handleError(res, error, "Failed to get user profile");
    }
  }

  private async handleSystemStatus(req: Request, res: Response): Promise<void> {
    try {
      // Check all upstream services
      const serviceChecks = await Promise.allSettled([
        this.healthCheck.checkServiceHealth("ingestor"),
        this.healthCheck.checkServiceHealth("enrichment"),
        this.healthCheck.checkServiceHealth("rent-estimator"),
        this.healthCheck.checkServiceHealth("underwriting"),
        this.healthCheck.checkServiceHealth("alerts"),
      ]);

      const serviceNames = [
        "ingestor",
        "enrichment",
        "rent-estimator",
        "underwriting",
        "alerts",
      ];
      const services: Record<string, any> = {};

      serviceChecks.forEach((result, index) => {
        const serviceName = serviceNames[index];
        if (result.status === "fulfilled" && result.value) {
          services[serviceName] = {
            status: result.value.healthy ? "healthy" : "down",
            responseTime: result.value.responseTime,
            lastCheck: new Date().toISOString(),
          };
        } else {
          services[serviceName] = {
            status: "down",
            lastCheck: new Date().toISOString(),
            error:
              result.status === "rejected"
                ? result.reason?.message
                : "Unknown error",
          };
        }
      });

      // Determine overall status
      const healthyServices = Object.values(services).filter(
        (s) => s.status === "healthy"
      ).length;
      const totalServices = Object.keys(services).length;

      let overallStatus: "healthy" | "degraded" | "down";
      if (healthyServices === totalServices) {
        overallStatus = "healthy";
      } else if (healthyServices > totalServices / 2) {
        overallStatus = "degraded";
      } else {
        overallStatus = "down";
      }

      const response: HealthCheckResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        services,
        version: "1.0.0",
      };

      this.sendSuccess(res, response);
    } catch (error) {
      this.handleError(res, error, "System status check failed");
    }
  }

  // ===== Helper Methods =====

  private sendSuccess<T>(
    res: Response,
    data: T,
    statusCode: number = 200
  ): void {
    const response: APIResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(response);
  }

  private sendError(
    res: Response,
    message: string,
    statusCode: number = 400
  ): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(response);
  }

  private handleError(res: Response, error: any, defaultMessage: string): void {
    this.logger.error(defaultMessage, error);

    // Extract meaningful error message
    let message = defaultMessage;
    let statusCode = 500;

    if (error.message) {
      message = error.message;

      // Map common error patterns to HTTP status codes
      if (error.message.includes("not found")) {
        statusCode = 404;
      } else if (
        error.message.includes("unauthorized") ||
        error.message.includes("authentication")
      ) {
        statusCode = 401;
      } else if (
        error.message.includes("forbidden") ||
        error.message.includes("access denied")
      ) {
        statusCode = 403;
      } else if (
        error.message.includes("validation") ||
        error.message.includes("invalid")
      ) {
        statusCode = 400;
      }
    }

    this.sendError(res, message, statusCode);
  }
}

// Re-export zod for validation schemas
import { z } from "zod";
