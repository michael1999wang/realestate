/**
 * Base class for service business logic implementations.
 *
 * Services should extend this class to gain a consistent constructor
 * and shared helpers (like publish and access to logger/dependencies).
 */
export class BusinessLogicBase<TDeps = any, TEventMap = any> {
  private _deps: TDeps;

  constructor(deps: TDeps) {
    this._deps = deps;
  }

  protected get deps(): TDeps {
    return this._deps;
  }

  /**
   * Helper to publish an event via the injected bus.
   * This is a convenience wrapper; services can still use deps.bus directly.
   */
  protected async publish(topic: any, event: any): Promise<void> {
    // @ts-expect-error: deps is intentionally untyped to support all services
    const bus = this.deps?.bus;
    if (!bus || typeof bus.publish !== "function") {
      throw new Error("Bus not available in business logic dependencies");
    }

    try {
      await bus.publish(topic as any, event);
    } catch (error) {
      // @ts-expect-error: logger is optional and untyped
      const logger = this.deps?.logger;
      if (logger && typeof logger.error === "function") {
        logger.error("Failed to publish event:", error);
      }
      throw error;
    }
  }

  /**
   * Access the injected logger if available.
   */
  protected get logger(): any | undefined {
    // @ts-expect-error: logger is optional and untyped
    return this.deps?.logger;
  }
}
