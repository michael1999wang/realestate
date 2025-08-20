import {
  Activity,
  AlertTriangle,
  Bell,
  Building2,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { Alert, Listing } from "../types";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  getStatusColor,
} from "../utils/format";

interface DashboardStats {
  totalListings: number;
  activeListings: number;
  avgPrice: number;
  totalAlerts: number;
  systemHealth: "healthy" | "degraded" | "down";
  processingRate: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalListings: 0,
    activeListings: 0,
    avgPrice: 0,
    totalAlerts: 0,
    systemHealth: "healthy",
    processingRate: 0,
  });
  const [recentListings, setRecentListings] = useState<Listing[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();

    // Subscribe to real-time updates
    apiService.subscribeToEvents("listings", handleNewListing);
    apiService.subscribeToEvents("alerts", handleNewAlert);

    return () => {
      apiService.unsubscribeFromEvents("listings", handleNewListing);
      apiService.unsubscribeFromEvents("alerts", handleNewAlert);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      const [listingsRes, alertsRes, systemRes] = await Promise.all([
        apiService.getListings(),
        apiService.getAlerts(),
        apiService.getSystemHealth(),
      ]);

      if (listingsRes.success && listingsRes.data) {
        const listings = listingsRes.data;
        const activeListings = listings.filter((l) => l.status === "Active");
        const avgPrice =
          listings.reduce((sum, l) => sum + l.listPrice, 0) / listings.length;

        setStats((prev) => ({
          ...prev,
          totalListings: listings.length,
          activeListings: activeListings.length,
          avgPrice,
        }));

        setRecentListings(listings.slice(0, 5));
      }

      if (alertsRes.success && alertsRes.data) {
        setStats((prev) => ({ ...prev, totalAlerts: alertsRes.data!.length }));
        setRecentAlerts(alertsRes.data.slice(0, 3));
      }

      if (systemRes.success && systemRes.data) {
        const health = systemRes.data;
        const allHealthy = health.services.every((s) => s.status === "healthy");
        const avgProcessing =
          health.services.reduce(
            (sum, s) => sum + (s.metrics?.eventsProcessed || 0),
            0
          ) / health.services.length;

        setStats((prev) => ({
          ...prev,
          systemHealth: allHealthy ? "healthy" : "degraded",
          processingRate: avgProcessing,
        }));
      }
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewListing = (event: any) => {
    if (event.type === "listing_changed" && event.data) {
      const newListing = event.data as Listing;
      setRecentListings((prev) => [newListing, ...prev.slice(0, 4)]);
      setStats((prev) => ({
        ...prev,
        totalListings: prev.totalListings + 1,
        activeListings:
          newListing.status === "Active"
            ? prev.activeListings + 1
            : prev.activeListings,
      }));
    }
  };

  const handleNewAlert = (event: any) => {
    if (event.type === "alert_fired" && event.data) {
      const newAlert = event.data as Alert;
      setRecentAlerts((prev) => [newAlert, ...prev.slice(0, 2)]);
      setStats((prev) => ({ ...prev, totalAlerts: prev.totalAlerts + 1 }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Listings",
      value: formatNumber(stats.totalListings),
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Active Listings",
      value: formatNumber(stats.activeListings),
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Avg. Price",
      value: formatMoney(stats.avgPrice),
      icon: DollarSign,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Total Alerts",
      value: formatNumber(stats.totalAlerts),
      icon: Bell,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Real Estate Investment Platform
            </h1>
            <p className="text-gray-600 mt-1">
              Real-time property analysis and investment insights
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${getStatusColor(
                stats.systemHealth
              )}`}
            ></div>
            <span className="text-sm text-gray-600 capitalize">
              System {stats.systemHealth}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white rounded-lg p-6 shadow-sm border border-gray-200"
            >
              <div className="flex items-center">
                <div className={`rounded-lg p-3 ${stat.bgColor}`}>
                  <Icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">
                    {stat.title}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {stat.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Listings */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Listings
            </h2>
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {recentListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {listing.address.street}
                  </p>
                  <p className="text-sm text-gray-600">
                    {listing.address.city}, {listing.address.province} •{" "}
                    {listing.beds}bd/{listing.baths}ba
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {formatMoney(listing.listPrice)}
                  </p>
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                      listing.status
                    )}`}
                  >
                    {listing.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Recent Alerts
            </h2>
            <Bell className="h-5 w-5 text-gray-400" />
          </div>
          <div className="space-y-4">
            {recentAlerts.length > 0 ? (
              recentAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <div>
                      <p className="font-medium text-gray-900">
                        Investment Match Found
                      </p>
                      <p className="text-sm text-gray-600">
                        Property {alert.listingId} • Score:{" "}
                        {Math.round((alert.score || 0) * 100)}/100
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500">
                      {new Date(alert.triggeredAt).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No recent alerts</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            System Overview
          </h2>
          <Activity className="h-5 w-5 text-gray-400" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-gray-900">
              {formatNumber(stats.processingRate)}
            </p>
            <p className="text-sm text-gray-600">Avg. Events Processed</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">
              {formatPercent(0.998)}
            </p>
            <p className="text-sm text-gray-600">System Uptime</p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">5</p>
            <p className="text-sm text-gray-600">Active Services</p>
          </div>
        </div>
      </div>
    </div>
  );
}
