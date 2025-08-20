/**
 * Generic Service Template for Event-Driven Microservices
 *
 * This module provides a base service class that handles all common infrastructure
 * concerns while allowing services to focus purely on business logic.
 */

export * from "./base-service";
export { BusinessLogicBase } from "./business-logic";
export * from "./lifecycle";
export * from "./types";
export type {
  BusinessLogic,
  HealthCheck,
  Logger,
  BaseServiceConfig as ServiceConfig,
  ServiceDependencies,
  ServiceMetrics,
  ServiceState,
} from "./types";
