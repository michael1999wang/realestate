/**
 * Express Middleware for API Gateway
 *
 * Handles authentication, authorization, rate limiting, validation,
 * and other cross-cutting concerns.
 */

import { Logger } from "@realestate/shared-utils";
import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { apiCfg } from "../config/env";
import { APIResponse, User } from "../core/dto";
import {
  AuthenticationPort,
  AuthorizationPort,
  CachePort,
  RateLimitPort,
} from "../core/ports";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      rateLimitInfo?: {
        remaining: number;
        resetTime: number;
        identifier: string;
      };
    }
  }
}

export class APIGatewayMiddleware {
  constructor(
    private auth: AuthenticationPort,
    private authz: AuthorizationPort,
    private rateLimit: RateLimitPort,
    private cache: CachePort,
    private logger: Logger
  ) {}

  // ===== Authentication Middleware =====

  authenticateOptional() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!apiCfg.enableAuth) {
        // Development mode - skip auth
        req.user = await this.createDemoUser();
        return next();
      }

      try {
        const token = this.extractToken(req);
        if (token) {
          const user = await this.auth.authenticate(token);
          if (user) {
            req.user = user;
          }
        }

        next();
      } catch (error) {
        this.logger.warn("Optional authentication failed:", error);
        next();
      }
    };
  }

  authenticateRequired() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!apiCfg.enableAuth) {
        // Development mode - skip auth
        req.user = await this.createDemoUser();
        return next();
      }

      try {
        const token = this.extractToken(req);
        if (!token) {
          return this.unauthorized(res, "Authentication token required");
        }

        const user = await this.auth.authenticate(token);
        if (!user) {
          return this.unauthorized(res, "Invalid or expired token");
        }

        req.user = user;
        next();
      } catch (error) {
        this.logger.error("Authentication failed:", error);
        return this.unauthorized(res, "Authentication failed");
      }
    };
  }

  // ===== Authorization Middleware =====

  authorize(resource: string, action: string = "read") {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!req.user) {
        return this.unauthorized(res, "Authentication required");
      }

      try {
        const hasAccess = await this.authz.canAccessResource(
          req.user,
          resource,
          action
        );
        if (!hasAccess) {
          return this.forbidden(res, `Access denied to ${resource}:${action}`);
        }

        next();
      } catch (error) {
        this.logger.error("Authorization check failed:", error);
        return this.internalError(res, "Authorization check failed");
      }
    };
  }

  // ===== Rate Limiting Middleware =====

  rateLimitMiddleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!apiCfg.enableRateLimit) {
        return next();
      }

      try {
        // Use user ID if authenticated, otherwise IP address
        const identifier = req.user?.id || req.ip;

        // Get rate limit for user tier
        let limit: { requests: number; windowMs: number };
        if (req.user) {
          limit = await this.authz.getRateLimit(req.user);
        } else {
          // Default rate limit for unauthenticated requests
          limit = { requests: 100, windowMs: 3600000 }; // 100 per hour
        }

        const result = await this.rateLimit.isAllowed(
          identifier,
          limit.requests,
          limit.windowMs
        );

        // Set rate limit headers
        res.set({
          "X-RateLimit-Limit": limit.requests.toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": new Date(result.resetTime).toISOString(),
        });

        // Store rate limit info for logging
        req.rateLimitInfo = {
          remaining: result.remaining,
          resetTime: result.resetTime,
          identifier,
        };

        if (!result.allowed) {
          return this.rateLimited(res, "Rate limit exceeded");
        }

        next();
      } catch (error) {
        this.logger.error("Rate limiting check failed:", error);
        // Fail open - continue with request
        next();
      }
    };
  }

  // ===== Request Validation Middleware =====

  validateBody<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        req.body = schema.parse(req.body);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return this.badRequest(res, "Validation error", {
            errors: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          });
        }
        return this.badRequest(res, "Invalid request body");
      }
    };
  }

  validateQuery<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        req.query = schema.parse(req.query);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return this.badRequest(res, "Validation error", {
            errors: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          });
        }
        return this.badRequest(res, "Invalid query parameters");
      }
    };
  }

  validateParams<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        req.params = schema.parse(req.params);
        next();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return this.badRequest(res, "Validation error", {
            errors: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          });
        }
        return this.badRequest(res, "Invalid path parameters");
      }
    };
  }

  // ===== Logging Middleware =====

  requestLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const originalSend = res.send;

      res.send = function (data) {
        const duration = Date.now() - startTime;

        const logData = {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get("User-Agent"),
          ip: req.ip,
          userId: req.user?.id,
          rateLimitRemaining: req.rateLimitInfo?.remaining,
        };

        if (res.statusCode >= 400) {
          req.app.get("logger")?.warn("HTTP request failed", logData);
        } else {
          req.app.get("logger")?.info("HTTP request", logData);
        }

        return originalSend.call(this, data);
      };

      next();
    };
  }

  // ===== Error Handling Middleware =====

  errorHandler() {
    return (error: Error, req: Request, res: Response, next: NextFunction) => {
      this.logger.error("Unhandled error:", {
        error: error.message,
        stack: error.stack,
        method: req.method,
        url: req.url,
        userId: req.user?.id,
      });

      // Don't expose internal error details in production
      const message = apiCfg.isDevelopment
        ? error.message
        : "Internal server error";
      this.internalError(res, message);
    };
  }

  notFoundHandler() {
    return (req: Request, res: Response) => {
      this.notFound(res, `Route ${req.method} ${req.url} not found`);
    };
  }

  // ===== Helper Methods =====

  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    // Check API key header
    const apiKey = req.get("X-API-Key");
    if (apiKey) {
      return apiKey;
    }

    // Check query parameter (for development only)
    if (apiCfg.isDevelopment && req.query.token) {
      return req.query.token as string;
    }

    return null;
  }

  private async createDemoUser(): Promise<User> {
    return {
      id: "demo-user",
      email: "demo@realestate.com",
      subscriptionTier: "pro",
      apiQuota: {
        requests: 1000,
        remaining: 999,
        resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  // ===== Response Helpers =====

  private success<T>(res: Response, data: T): void {
    const response: APIResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
    res.json(response);
  }

  private badRequest(res: Response, message: string, details?: any): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };

    if (details && apiCfg.isDevelopment) {
      (response as any).details = details;
    }

    res.status(400).json(response);
  }

  private unauthorized(res: Response, message: string): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(401).json(response);
  }

  private forbidden(res: Response, message: string): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(403).json(response);
  }

  private notFound(res: Response, message: string): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(404).json(response);
  }

  private rateLimited(res: Response, message: string): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(429).json(response);
  }

  private internalError(res: Response, message: string): void {
    const response: APIResponse<never> = {
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
    };
    res.status(500).json(response);
  }
}

// ===== Validation Schemas =====

export const schemas = {
  propertySearch: z
    .object({
      city: z.string().optional(),
      province: z.string().optional(),
      propertyType: z.enum(["Condo", "House", "Townhouse"]).optional(),
      minBeds: z.coerce.number().int().min(0).max(10).optional(),
      maxBeds: z.coerce.number().int().min(0).max(10).optional(),
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
      status: z.enum(["Active", "Sold", "Suspended", "Expired"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    })
    .refine(
      (data) => {
        if (data.minPrice && data.maxPrice && data.minPrice > data.maxPrice) {
          return false;
        }
        if (data.minBeds && data.maxBeds && data.minBeds > data.maxBeds) {
          return false;
        }
        return true;
      },
      {
        message: "Min values cannot be greater than max values",
      }
    ),

  listingId: z.object({
    id: z.string().uuid(),
  }),

  underwriteRequest: z.object({
    listingId: z.string().uuid(),
    assumptions: z
      .object({
        downPct: z.number().min(0.05).max(1),
        rateBps: z.number().int().min(100).max(2000),
        amortMonths: z.number().int().min(60).max(360),
        rentScenario: z.enum(["P25", "P50", "P75"]),
      })
      .optional(),
  }),

  savedSearchCreate: z.object({
    name: z.string().min(1).max(100),
    filter: z.object({
      city: z.string().optional(),
      province: z.string().optional(),
      propertyType: z.enum(["Condo", "House", "Townhouse"]).optional(),
      minBeds: z.number().int().min(0).max(10).optional(),
      maxPrice: z.number().min(0).optional(),
    }),
    thresholds: z.object({
      minDSCR: z.number().min(0).optional(),
      minCoC: z.number().min(0).optional(),
      minCapRate: z.number().min(0).optional(),
      requireNonNegativeCF: z.boolean().optional(),
    }),
    notify: z.object({
      channel: z.array(z.enum(["devbrowser", "email", "sms", "slack"])).min(1),
    }),
    isActive: z.boolean().optional().default(true),
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string().min(6).max(100),
  }),
};
