// Re-export everything from bus module
export * from "./bus";
export type {
  AlertsFiredEvent,
  DataEnrichedEvent,
  ListingChangedEvent,
  PropertyScoredEvent,
  UnderwriteCompletedEvent,
  UnderwriteRequestedEvent,
} from "./bus/types";

// Re-export all shared utilities
export * from "./adapters";
export * from "./cache";
export * from "./config";
export * from "./debounce";
export * from "./versioning";
export * from "./worker";

// Re-export service module with explicit naming to avoid conflicts
export { BaseService, BusinessLogicBase } from "./service";
export type {
  BusinessLogic,
  HealthCheck,
  Logger,
  ServiceConfig,
  ServiceDependencies,
  ServiceMetrics,
  ServiceState,
} from "./service";

// Version info
export const VERSION = "1.0.0";
