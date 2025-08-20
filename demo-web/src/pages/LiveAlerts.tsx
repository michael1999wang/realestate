import {
  Bell,
  BellOff,
  CheckCircle,
  Clock,
  ExternalLink,
  Filter,
  Star,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { Alert, Listing, SavedSearch } from "../types";
import {
  formatMoney,
  formatRelativeTime,
  formatScore,
  getScoreColor,
} from "../utils/format";

export function LiveAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [isListening, setIsListening] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "dismissed">("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadInitialData();

    if (isListening) {
      startListening();
    }

    return () => {
      stopListening();
    };
  }, [isListening]);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [alertsRes, searchesRes, listingsRes] = await Promise.all([
        apiService.getAlerts(),
        apiService.getSavedSearches(),
        apiService.getListings(),
      ]);

      if (alertsRes.success && alertsRes.data) {
        setAlerts(
          alertsRes.data.sort(
            (a, b) =>
              new Date(b.triggeredAt).getTime() -
              new Date(a.triggeredAt).getTime()
          )
        );
      }

      if (searchesRes.success && searchesRes.data) {
        setSearches(searchesRes.data);
      }

      if (listingsRes.success && listingsRes.data) {
        setListings(listingsRes.data);
      }
    } catch (error) {
      console.error("Failed to load initial data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startListening = () => {
    apiService.subscribeToEvents("alerts", handleNewAlert);
  };

  const stopListening = () => {
    apiService.unsubscribeFromEvents("alerts", handleNewAlert);
  };

  const handleNewAlert = (event: any) => {
    if (event.type === "alert_fired" && event.data) {
      const newAlert = event.data as Alert;
      setLiveAlerts((prev) => [newAlert, ...prev]);
      setAlerts((prev) => [newAlert, ...prev]);

      // Show browser notification if permissions granted
      if (Notification.permission === "granted") {
        new Notification("Investment Alert!", {
          body: `New property match found with score ${formatScore(
            newAlert.score
          )}`,
          icon: "/favicon.ico",
        });
      }
    }
  };

  const toggleListening = () => {
    setIsListening(!isListening);
  };

  const requestNotificationPermission = () => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  };

  const dismissAlert = async (alertId: string) => {
    try {
      await apiService.dismissAlert(alertId);
      setLiveAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (error) {
      console.error("Failed to dismiss alert:", error);
    }
  };

  const getSearchName = (searchId: string) => {
    const search = searches.find((s) => s.id === searchId);
    return search?.name || "Unknown Search";
  };

  const getListingDetails = (listingId: string) => {
    return listings.find((l) => l.id === listingId);
  };

  const filteredAlerts = [...liveAlerts, ...alerts].filter(
    (alert, index, arr) => {
      // Remove duplicates
      const firstIndex = arr.findIndex((a) => a.id === alert.id);
      if (firstIndex !== index) return false;

      // Apply filter
      if (filter === "new") return liveAlerts.some((la) => la.id === alert.id);
      if (filter === "dismissed")
        return !liveAlerts.some((la) => la.id === alert.id) && !alert.delivered;
      return true;
    }
  );

  if (isLoading) {
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
              <Bell className="h-8 w-8 mr-3 text-primary-600" />
              Live Investment Alerts
            </h1>
            <p className="text-gray-600 mt-1">
              Real-time notifications when properties match your investment
              criteria
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={requestNotificationPermission}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Enable Browser Notifications
            </button>
            <button
              onClick={toggleListening}
              className={`btn ${
                isListening ? "btn-danger" : "btn-primary"
              } flex items-center space-x-2`}
            >
              {isListening ? (
                <>
                  <BellOff className="h-4 w-4" />
                  <span>Stop Listening</span>
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" />
                  <span>Start Listening</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={`rounded-lg p-4 border ${
          isListening
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-yellow-50 border-yellow-200 text-yellow-800"
        }`}
      >
        <div className="flex items-center">
          {isListening ? (
            <>
              <div className="pulse-dot mr-3"></div>
              <span className="font-medium">
                Live monitoring active - You'll be notified of new investment
                opportunities
              </span>
            </>
          ) : (
            <>
              <Clock className="h-5 w-5 mr-3" />
              <span className="font-medium">
                Live monitoring paused - Click "Start Listening" to resume
                alerts
              </span>
            </>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-gray-900">
            {alerts.length}
          </div>
          <div className="text-sm text-gray-600">Total Alerts</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-green-600">
            {liveAlerts.length}
          </div>
          <div className="text-sm text-gray-600">New Today</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">
            {searches.filter((s) => s.isActive).length}
          </div>
          <div className="text-sm text-gray-600">Active Searches</div>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <div className="text-2xl font-bold text-purple-600">
            {alerts.length > 0
              ? Math.round(
                  (alerts.reduce((sum, a) => sum + (a.score || 0), 0) /
                    alerts.length) *
                    100
                )
              : 0}
          </div>
          <div className="text-sm text-gray-600">Avg. Score</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Filter className="h-5 w-5 text-gray-400" />
            <div className="flex space-x-2">
              {[
                { key: "all", label: "All Alerts" },
                { key: "new", label: "New Today" },
                { key: "dismissed", label: "Dismissed" },
              ].map((option) => (
                <button
                  key={option.key}
                  onClick={() => setFilter(option.key as any)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    filter === option.key
                      ? "bg-primary-100 text-primary-700"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {filteredAlerts.length} alerts
          </div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.length > 0 ? (
          filteredAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              searchName={getSearchName(alert.searchId)}
              listing={getListingDetails(alert.listingId)}
              isNew={liveAlerts.some((la) => la.id === alert.id)}
              onDismiss={dismissAlert}
            />
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            {filter === "all" ? (
              <>
                <Bell className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No alerts yet
                </h3>
                <p className="text-gray-600">
                  {isListening
                    ? "We're monitoring for investment opportunities. Alerts will appear here when properties match your criteria."
                    : "Start listening to begin receiving investment alerts."}
                </p>
              </>
            ) : filter === "new" ? (
              <>
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No new alerts today
                </h3>
                <p className="text-gray-600">
                  New alerts will appear here as they arrive.
                </p>
              </>
            ) : (
              <>
                <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  No dismissed alerts
                </h3>
                <p className="text-gray-600">
                  Dismissed alerts will appear here.
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  searchName,
  listing,
  isNew,
  onDismiss,
}: {
  alert: Alert;
  searchName: string;
  listing?: Listing;
  isNew: boolean;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={`bg-white rounded-lg p-6 shadow-sm border-2 transition-all duration-200 ${
        isNew
          ? "border-green-200 bg-green-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-grow">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-3">
            {isNew && <div className="pulse-dot"></div>}
            <h3 className="text-lg font-semibold text-gray-900">
              Investment Match Found
            </h3>
            <div className={`text-lg font-bold ${getScoreColor(alert.score)}`}>
              {formatScore(alert.score)}
            </div>
          </div>

          {/* Alert Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <h4 className="font-medium text-gray-700 mb-2">
                Search Criteria
              </h4>
              <p className="text-sm text-gray-600">
                Matched: <span className="font-medium">{searchName}</span>
              </p>
            </div>

            {listing && (
              <div>
                <h4 className="font-medium text-gray-700 mb-2">
                  Property Details
                </h4>
                <div className="text-sm text-gray-600 space-y-1">
                  <p>{listing.address.street}</p>
                  <p>
                    {listing.address.city}, {listing.address.province}
                  </p>
                  <p className="font-medium">
                    {formatMoney(listing.listPrice)}
                  </p>
                  <p>
                    {listing.beds}bd/{listing.baths}ba • {listing.propertyType}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Investment Metrics */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="font-medium text-gray-700 mb-2 flex items-center">
              <Star className="h-4 w-4 mr-1" />
              Investment Highlights
            </h4>
            <div className="text-sm text-gray-600">
              <p>
                High-scoring investment opportunity with strong financial
                metrics.
              </p>
              <p>
                Result ID:{" "}
                <span className="font-mono text-xs">{alert.resultId}</span>
              </p>
            </div>
          </div>

          {/* Metadata */}
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center space-x-4">
              <span>Triggered: {formatRelativeTime(alert.triggeredAt)}</span>
              <span>Channels: {alert.channels.join(", ")}</span>
            </div>
            {alert.delivered && (
              <div className="flex items-center text-green-600">
                <CheckCircle className="h-3 w-3 mr-1" />
                <span>Delivered</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2 ml-4">
          <button
            onClick={() =>
              window.open(`/analysis?listing=${alert.listingId}`, "_blank")
            }
            className="text-primary-600 hover:text-primary-700 text-sm font-medium flex items-center"
          >
            <span>View Analysis</span>
            <ExternalLink className="h-3 w-3 ml-1" />
          </button>
          {isNew && (
            <button
              onClick={() => onDismiss(alert.id)}
              className="text-gray-400 hover:text-gray-600"
              title="Dismiss"
            >
              <CheckCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
