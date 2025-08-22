/**
 * Simple Authentication Adapter
 *
 * Lightweight auth implementation for development mode.
 * Can be replaced with more sophisticated auth providers in production.
 */

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { authCfg, rateLimitCfg } from "../config/env";
import { User } from "../core/dto";
import { AuthenticationPort, AuthorizationPort } from "../core/ports";

export class SimpleAuthAdapter
  implements AuthenticationPort, AuthorizationPort
{
  constructor(private db: Pool) {}

  // ===== Authentication Methods =====

  async authenticate(token: string): Promise<User | null> {
    try {
      const decoded = jwt.verify(token, authCfg.jwtSecret) as any;

      if (!decoded.userId || !decoded.email) {
        return null;
      }

      // Load user from database
      const query = `
        SELECT 
          id,
          email,
          subscription_tier as "subscriptionTier",
          api_requests_today as "apiRequestsToday",
          api_quota_reset_at as "apiQuotaResetAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users 
        WHERE id = $1 AND active = true
      `;

      const result = await this.db.query(query, [decoded.userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      // Token invalid/expired
      return null;
    }
  }

  async login(
    email: string,
    password: string
  ): Promise<{ user: User; token: string } | null> {
    try {
      // Find user by email
      const query = `
        SELECT 
          id,
          email,
          password_hash as "passwordHash",
          subscription_tier as "subscriptionTier",
          api_requests_today as "apiRequestsToday",
          api_quota_reset_at as "apiQuotaResetAt",
          created_at as "createdAt",
          updated_at as "updatedAt"
        FROM users 
        WHERE LOWER(email) = LOWER($1) AND active = true
      `;

      const result = await this.db.query(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const userRow = result.rows[0];

      // Verify password
      const passwordValid = await bcrypt.compare(
        password,
        userRow.passwordHash
      );
      if (!passwordValid) {
        return null;
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          userId: userRow.id,
          email: userRow.email,
          subscriptionTier: userRow.subscriptionTier,
        },
        authCfg.jwtSecret,
        { expiresIn: authCfg.jwtExpiresIn }
      );

      const user = this.mapRowToUser(userRow);
      return { user, token };
    } catch (error) {
      console.error("Login error:", error);
      return null;
    }
  }

  async refreshToken(token: string): Promise<string | null> {
    try {
      const decoded = jwt.verify(token, authCfg.jwtSecret, {
        ignoreExpiration: true,
      }) as any;

      // Check if token is within refresh window (e.g., 7 days before expiry)
      const now = Math.floor(Date.now() / 1000);
      const refreshWindow = 7 * 24 * 60 * 60; // 7 days

      if (decoded.exp && now - decoded.exp > refreshWindow) {
        return null; // Token too old to refresh
      }

      // Generate new token
      const newToken = jwt.sign(
        {
          userId: decoded.userId,
          email: decoded.email,
          subscriptionTier: decoded.subscriptionTier,
        },
        authCfg.jwtSecret,
        { expiresIn: authCfg.jwtExpiresIn }
      );

      return newToken;
    } catch (error) {
      return null;
    }
  }

  async validateApiKey(apiKey: string): Promise<User | null> {
    try {
      const query = `
        SELECT 
          u.id,
          u.email,
          u.subscription_tier as "subscriptionTier",
          u.api_requests_today as "apiRequestsToday",
          u.api_quota_reset_at as "apiQuotaResetAt",
          u.created_at as "createdAt",
          u.updated_at as "updatedAt"
        FROM users u
        JOIN api_keys ak ON u.id = ak.user_id
        WHERE ak.key_hash = $1 AND ak.active = true AND u.active = true
      `;

      // Hash the API key for comparison
      const keyHash = await bcrypt.hash(apiKey, 10);
      const result = await this.db.query(query, [keyHash]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      console.error("API key validation error:", error);
      return null;
    }
  }

  // ===== Authorization Methods =====

  async canAccessResource(
    user: User,
    resource: string,
    action: string
  ): Promise<boolean> {
    // Simple role-based access control
    const { subscriptionTier } = user;

    // Define access rules
    const accessRules: Record<
      string,
      { resources: string[]; actions: string[] }
    > = {
      free: {
        resources: ["listings", "health"],
        actions: ["read"],
      },
      pro: {
        resources: [
          "listings",
          "enrichments",
          "underwriting",
          "searches",
          "alerts",
          "health",
        ],
        actions: ["read", "write"],
      },
      enterprise: {
        resources: ["*"], // All resources
        actions: ["*"], // All actions
      },
    };

    const tierRules = accessRules[subscriptionTier];
    if (!tierRules) return false;

    // Check resource access
    const hasResourceAccess =
      tierRules.resources.includes("*") ||
      tierRules.resources.includes(resource);

    // Check action access
    const hasActionAccess =
      tierRules.actions.includes("*") || tierRules.actions.includes(action);

    return hasResourceAccess && hasActionAccess;
  }

  async getRateLimit(
    user: User
  ): Promise<{ requests: number; windowMs: number }> {
    const { subscriptionTier } = user;

    const limits = {
      free: rateLimitCfg.free.requests,
      pro: rateLimitCfg.pro.requests,
      enterprise: rateLimitCfg.enterprise.requests,
    };

    return {
      requests: limits[subscriptionTier] || limits.free,
      windowMs: rateLimitCfg.windowMs,
    };
  }

  async checkQuota(user: User): Promise<boolean> {
    const now = new Date();
    const quotaResetAt = new Date(user.apiQuota.resetAt);

    // Reset quota if needed
    if (now > quotaResetAt) {
      await this.resetUserQuota(user.id);
      return true;
    }

    return user.apiQuota.remaining > 0;
  }

  // ===== User Management =====

  async createUser(
    email: string,
    password: string,
    subscriptionTier: "free" | "pro" | "enterprise" = "free"
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, authCfg.bcryptRounds);

    // Set initial quota
    const { requests } = await this.getRateLimit({ subscriptionTier } as User);
    const quotaResetAt = new Date();
    quotaResetAt.setHours(quotaResetAt.getHours() + 24); // Reset daily

    const query = `
      INSERT INTO users (
        email, 
        password_hash, 
        subscription_tier,
        api_requests_today,
        api_quota_reset_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING 
        id,
        email,
        subscription_tier as "subscriptionTier",
        api_requests_today as "apiRequestsToday",
        api_quota_reset_at as "apiQuotaResetAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const result = await this.db.query(query, [
      email.toLowerCase(),
      passwordHash,
      subscriptionTier,
      0,
      quotaResetAt.toISOString(),
    ]);

    return this.mapRowToUser(result.rows[0]);
  }

  async incrementUserRequests(userId: string): Promise<void> {
    const query = `
      UPDATE users 
      SET api_requests_today = api_requests_today + 1
      WHERE id = $1
    `;

    await this.db.query(query, [userId]);
  }

  private async resetUserQuota(userId: string): Promise<void> {
    const resetAt = new Date();
    resetAt.setHours(resetAt.getHours() + 24);

    const query = `
      UPDATE users 
      SET 
        api_requests_today = 0,
        api_quota_reset_at = $2
      WHERE id = $1
    `;

    await this.db.query(query, [userId, resetAt.toISOString()]);
  }

  // ===== Development Mode Helpers =====

  /**
   * Create a demo user for development mode
   */
  async createDemoUser(): Promise<User> {
    const demoEmail = "demo@realestate.com";
    const demoPassword = "demo123";

    try {
      // Check if demo user already exists
      const existing = await this.db.query(
        "SELECT id FROM users WHERE email = $1",
        [demoEmail]
      );

      if (existing.rows.length > 0) {
        // Return existing demo user
        const user = await this.authenticate(
          jwt.sign(
            {
              userId: existing.rows[0].id,
              email: demoEmail,
              subscriptionTier: "pro",
            },
            authCfg.jwtSecret,
            { expiresIn: "7d" }
          )
        );
        return user!;
      }

      // Create new demo user
      return await this.createUser(demoEmail, demoPassword, "pro");
    } catch (error) {
      console.error("Failed to create demo user:", error);
      throw error;
    }
  }

  /**
   * Map database row to User DTO
   */
  private mapRowToUser(row: any): User {
    const { requests } =
      rateLimitCfg[row.subscriptionTier as keyof typeof rateLimitCfg] ||
      rateLimitCfg.free;

    return {
      id: row.id,
      email: row.email,
      subscriptionTier: row.subscriptionTier,
      apiQuota: {
        requests: requests,
        remaining: Math.max(0, requests - (row.apiRequestsToday || 0)),
        resetAt: row.apiQuotaResetAt,
      },
    };
  }
}
