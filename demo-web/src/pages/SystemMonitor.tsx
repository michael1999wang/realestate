import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  MessageSquare,
  RefreshCw,
  Server,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiService } from "../services/api";
import { ServiceStatus, SystemHealth } from "../types";
import {
  formatNumber,
  formatPercent,
  formatRelativeTime,
  getStatusColor,
} from "../utils/format";

export function SystemMonitor() {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>("");
  const [metricsHistory, setMetricsHistory] = useState<
    Array<{
      timestamp: string;
      eventsProcessed: number;
      errors: number;
    }>
  >([]);

  useEffect(() => {
    loadSystemHealth();

    // Subscribe to real-time updates
    apiService.subscribeToEvents("system", handleSystemUpdate);

    // Set up periodic refresh
    const interval = setInterval(loadSystemHealth, 30000);

    return () => {
      apiService.unsubscribeFromEvents("system", handleSystemUpdate);
      clearInterval(interval);
    };
  }, []);

  const loadSystemHealth = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getSystemHealth();
      if (response.success && response.data) {
        setSystemHealth(response.data);
        setLastUpdate(new Date().toISOString());

        // Update metrics history
        const totalEventsProcessed = response.data.services.reduce(
          (sum, service) => sum + (service.metrics?.eventsProcessed || 0),
          0
        );
        const totalErrors = response.data.services.reduce(
          (sum, service) => sum + (service.metrics?.errors || 0),
          0
        );

        setMetricsHistory((prev) => {
          const newHistory = [
            ...prev,
            {
              timestamp: new Date().toLocaleTimeString(),
              eventsProcessed: totalEventsProcessed,
              errors: totalErrors,
            },
          ];
          return newHistory.slice(-20); // Keep last 20 data points
        });
      }
    } catch (error) {
      console.error("Failed to load system health:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSystemUpdate = (event: any) => {
    if (event.type === "system_health_updated" && event.data) {
      setSystemHealth(event.data);
      setLastUpdate(new Date().toISOString());
    }
  };

  const getOverallStatus = (): "healthy" | "degraded" | "down" => {
    if (!systemHealth) return "down";

    const downServices = systemHealth.services.filter(
      (s) => s.status === "down"
    ).length;
    const degradedServices = systemHealth.services.filter(
      (s) => s.status === "degraded"
    ).length;

    if (downServices > 0) return "down";
    if (degradedServices > 0) return "degraded";
    return "healthy";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "down":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Activity className="h-5 w-5 text-gray-400" />;
    }
  };

  const overallStatus = getOverallStatus();

  if (isLoading && !systemHealth) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Activity className="h-8 w-8 mr-3 text-primary-600" />
              System Monitor
            </h1>
            <p className="text-gray-600 mt-1">
              Real-time monitoring of microservices and infrastructure
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-500">
              Last updated:{" "}
              {lastUpdate ? formatRelativeTime(lastUpdate) : "Never"}
            </div>
            <button
              onClick={loadSystemHealth}
              className="btn btn-secondary flex items-center space-x-2"
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Overall Status */}
      <div
        className={`rounded-lg p-6 border-2 ${
          overallStatus === "healthy"
            ? "bg-green-50 border-green-200"
            : overallStatus === "degraded"
            ? "bg-yellow-50 border-yellow-200"
            : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {getStatusIcon(overallStatus)}
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                System Status:{" "}
                <span className="capitalize">{overallStatus}</span>
              </h2>
              <p className="text-gray-600">
                {overallStatus === "healthy"
                  ? "All systems operational"
                  : overallStatus === "degraded"
                  ? "Some services experiencing issues"
                  : "Critical system issues detected"}
              </p>
            </div>
          </div>

          {systemHealth && (
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                {
                  systemHealth.services.filter((s) => s.status === "healthy")
                    .length
                }
                /{systemHealth.services.length}
              </div>
              <div className="text-sm text-gray-600">Services Online</div>
            </div>
          )}
        </div>
      </div>

      {/* Infrastructure Status */}
      {systemHealth && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Event Bus */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold text-gray-900">Event Bus</h3>
              </div>
              {getStatusIcon(systemHealth.eventBus.status)}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Status</span>
                <span
                  className={`font-medium capitalize ${getStatusColor(
                    systemHealth.eventBus.status
                  )}`}
                >
                  {systemHealth.eventBus.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Queue Depth</span>
                <span className="font-medium">
                  {systemHealth.eventBus.queueDepth}
                </span>
              </div>
            </div>
          </div>

          {/* Database */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Database className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold text-gray-900">Database</h3>
              </div>
              {getStatusIcon(systemHealth.database.status)}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Status</span>
                <span
                  className={`font-medium capitalize ${getStatusColor(
                    systemHealth.database.status
                  )}`}
                >
                  {systemHealth.database.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Connection Pool</span>
                <span className="font-medium">
                  {systemHealth.database.connectionPool}%
                </span>
              </div>
            </div>
          </div>

          {/* System Overview */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Server className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold text-gray-900">System Overview</h3>
              </div>
              {getStatusIcon(overallStatus)}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Uptime</span>
                <span className="font-medium">{formatPercent(0.999)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Events</span>
                <span className="font-medium">
                  {formatNumber(
                    systemHealth.services.reduce(
                      (sum, s) => sum + (s.metrics?.eventsProcessed || 0),
                      0
                    )
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Services Status */}
      {systemHealth && (
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Microservices Status
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {systemHealth.services.map((service) => (
              <ServiceCard key={service.name} service={service} />
            ))}
          </div>
        </div>
      )}

      {/* Metrics Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Events Processed Over Time */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            Events Processed
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={metricsHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="eventsProcessed"
                stroke="#3b82f6"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Service Performance */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Zap className="h-5 w-5 mr-2" />
            Service Performance
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={systemHealth?.services || []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="metrics.eventsProcessed" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Error Summary */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Error Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {systemHealth?.services.reduce(
                (sum, s) => sum + (s.metrics?.errors || 0),
                0
              ) || 0}
            </div>
            <div className="text-sm text-gray-600">Total Errors</div>
          </div>
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {systemHealth?.services.filter((s) => s.status === "degraded")
                .length || 0}
            </div>
            <div className="text-sm text-gray-600">Degraded Services</div>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {systemHealth?.services.filter((s) => s.status === "down")
                .length || 0}
            </div>
            <div className="text-sm text-gray-600">Down Services</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {formatPercent(
                systemHealth
                  ? systemHealth.services.filter((s) => s.status === "healthy")
                      .length / systemHealth.services.length
                  : 0
              )}
            </div>
            <div className="text-sm text-gray-600">Availability</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceStatus }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900">{service.name}</h3>
        <div className="flex items-center space-x-2">
          {service.status === "healthy" ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : service.status === "degraded" ? (
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          ) : (
            <XCircle className="h-4 w-4 text-red-600" />
          )}
          <span
            className={`text-sm font-medium capitalize ${getStatusColor(
              service.status
            )}`}
          >
            {service.status}
          </span>
        </div>
      </div>

      {service.metrics && (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Events Processed</span>
            <span className="font-medium">
              {formatNumber(service.metrics.eventsProcessed || 0)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Errors</span>
            <span
              className={`font-medium ${
                service.metrics.errors ? "text-red-600" : "text-green-600"
              }`}
            >
              {service.metrics.errors || 0}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Uptime</span>
            <span className="font-medium">
              {formatPercent((service.metrics.uptime || 0) / 100)}
            </span>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
        Last check: {formatRelativeTime(service.lastCheck)}
      </div>
    </div>
  );
}
