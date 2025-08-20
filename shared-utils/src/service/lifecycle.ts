import { EventEmitter } from "events";
import { ServiceState } from "./types";

/**
 * Service lifecycle manager
 * Handles state transitions and graceful shutdown
 */
export class ServiceLifecycle extends EventEmitter {
  private state: ServiceState = ServiceState.INITIALIZING;
  private startTime: Date = new Date();
  private shutdownHandlers: Array<() => Promise<void>> = [];
  private shutdownTimeoutMs: number;
  private isShuttingDown = false;

  constructor(shutdownTimeoutMs: number = 30000) {
    super();
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.setupProcessHandlers();
  }

  /**
   * Get current service state
   */
  getState(): ServiceState {
    return this.state;
  }

  /**
   * Get service uptime in seconds
   */
  getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }

  /**
   * Check if service is healthy
   */
  isHealthy(): boolean {
    return this.state === ServiceState.RUNNING;
  }

  /**
   * Transition to a new state
   */
  setState(newState: ServiceState): void {
    const oldState = this.state;
    this.state = newState;

    this.emit("state:changed", { from: oldState, to: newState });

    console.log(`[ServiceLifecycle] State changed: ${oldState} → ${newState}`);
  }

  /**
   * Add a shutdown handler
   */
  addShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Start graceful shutdown process
   */
  async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      console.log("[ServiceLifecycle] Already shutting down, ignoring signal");
      return;
    }

    this.isShuttingDown = true;
    const shutdownStart = Date.now();

    console.log(
      `[ServiceLifecycle] Received ${signal}, starting graceful shutdown...`
    );
    this.setState(ServiceState.STOPPING);
    this.emit("shutdown:requested", { signal });

    try {
      // Run all shutdown handlers with timeout
      await Promise.race([
        this.runShutdownHandlers(),
        this.createShutdownTimeout(),
      ]);

      const durationMs = Date.now() - shutdownStart;
      console.log(
        `[ServiceLifecycle] Graceful shutdown completed in ${durationMs}ms`
      );

      this.setState(ServiceState.STOPPED);
      this.emit("shutdown:complete", { durationMs });
    } catch (error) {
      console.error("[ServiceLifecycle] Error during shutdown:", error);
      this.setState(ServiceState.ERROR);
      this.emit("error", { error: error as Error, context: "shutdown" });
    }
  }

  /**
   * Handle service errors
   */
  handleError(error: Error, context?: string): void {
    console.error(
      `[ServiceLifecycle] Service error in ${context || "unknown"}:`,
      error
    );
    this.setState(ServiceState.ERROR);
    this.emit("error", { error, context });
  }

  /**
   * Setup process signal handlers
   */
  private setupProcessHandlers(): void {
    const signals = ["SIGTERM", "SIGINT", "SIGUSR2"];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        await this.shutdown(signal);
        process.exit(0);
      });
    });

    process.on("uncaughtException", (error) => {
      console.error("[ServiceLifecycle] Uncaught Exception:", error);
      this.handleError(error, "uncaughtException");
      process.exit(1);
    });

    process.on("unhandledRejection", (reason, promise) => {
      const error = new Error(`Unhandled Rejection: ${reason}`);
      console.error(
        "[ServiceLifecycle] Unhandled Rejection at:",
        promise,
        "reason:",
        reason
      );
      this.handleError(error, "unhandledRejection");
      process.exit(1);
    });
  }

  /**
   * Run all shutdown handlers in parallel
   */
  private async runShutdownHandlers(): Promise<void> {
    if (this.shutdownHandlers.length === 0) {
      return;
    }

    console.log(
      `[ServiceLifecycle] Running ${this.shutdownHandlers.length} shutdown handlers...`
    );

    const results = await Promise.allSettled(
      this.shutdownHandlers.map((handler) => handler())
    );

    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === "rejected");

    if (failures.length > 0) {
      console.error(
        `[ServiceLifecycle] ${failures.length} shutdown handlers failed:`
      );
      failures.forEach(({ result, index }) => {
        console.error(
          `  Handler ${index}:`,
          (result as PromiseRejectedResult).reason
        );
      });
      throw new Error(`${failures.length} shutdown handlers failed`);
    }

    console.log(
      "[ServiceLifecycle] All shutdown handlers completed successfully"
    );
  }

  /**
   * Create timeout promise for shutdown
   */
  private createShutdownTimeout(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${this.shutdownTimeoutMs}ms`));
      }, this.shutdownTimeoutMs);
    });
  }

  /**
   * Wait for shutdown to complete
   */
  async waitForShutdown(): Promise<void> {
    return new Promise((resolve) => {
      if (
        this.state === ServiceState.STOPPED ||
        this.state === ServiceState.ERROR
      ) {
        resolve();
        return;
      }

      this.once("shutdown:complete", () => resolve());
      this.once("error", () => resolve());
    });
  }
}
