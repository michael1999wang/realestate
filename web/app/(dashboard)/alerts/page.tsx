"use client";

import { Alert } from "@/app/api/route-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { connectAlerts } from "@/lib/sse";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellRing, History, MapPin, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function AlertsPage() {
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const { data: historyAlerts, isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.getAlerts,
    enabled: showHistory,
  });

  useEffect(() => {
    const cleanup = connectAlerts((alert: Alert) => {
      setLiveAlerts((prev) => [alert, ...prev]);
      setIsConnected(true);
    });

    // Set connected status after attempting connection
    const timer = setTimeout(() => setIsConnected(true), 1000);

    return () => {
      cleanup();
      clearTimeout(timer);
    };
  }, []);

  const allAlerts = showHistory
    ? [...liveAlerts, ...(historyAlerts || [])]
    : liveAlerts;

  const AlertCard = ({ alert }: { alert: Alert }) => (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <BellRing className="w-4 h-4 text-blue-600" />
          <span className="text-sm text-gray-500">
            {formatDate(alert.triggeredAt)}
          </span>
        </div>
        <Badge variant="outline" className="text-xs">
          New Match
        </Badge>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg text-green-600">
            {formatMoney(alert.payload.snapshot.listPrice)}
          </h3>
          <Link href={`/listings/${alert.listingId}`}>
            <Button variant="outline" size="sm">
              View Property
            </Button>
          </Link>
        </div>

        <div className="flex items-center text-gray-600">
          <MapPin className="w-4 h-4 mr-1" />
          <span className="text-sm">
            {alert.payload.snapshot.city}, {alert.payload.snapshot.province}
          </span>
        </div>

        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>{alert.payload.snapshot.beds} beds</span>
          <span>{alert.payload.snapshot.baths} baths</span>
          <span className="capitalize">
            {alert.payload.snapshot.propertyType}
          </span>
        </div>

        {alert.payload.metrics && (
          <div className="flex items-center space-x-3 pt-2">
            <Badge variant="secondary" className="text-xs">
              DSCR: {alert.payload.metrics.dscr.toFixed(2)}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              CoC: {(alert.payload.metrics.cashOnCashPct * 100).toFixed(1)}%
            </Badge>
            {alert.payload.metrics.cashFlowAnnual > 0 && (
              <Badge variant="secondary" className="text-xs flex items-center">
                <TrendingUp className="w-3 h-3 mr-1" />
                +CF
              </Badge>
            )}
          </div>
        )}

        {alert.payload.matched && alert.payload.matched.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-500">
              Matched criteria: {alert.payload.matched.join(", ")}
            </p>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Bell className="w-6 h-6 mr-3 text-blue-600" />
            Live Alerts
          </h1>
          <p className="text-gray-600 mt-1">
            Real-time notifications for properties matching your saved searches
          </p>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected ? "bg-green-500" : "bg-gray-400"
              }`}
            ></div>
            <span className="text-sm text-gray-600">
              {isConnected ? "Connected" : "Connecting..."}
            </span>
          </div>

          <Button
            variant="outline"
            onClick={() => setShowHistory(!showHistory)}
            disabled={isLoading}
          >
            <History className="w-4 h-4 mr-2" />
            {showHistory ? "Hide History" : "Load History"}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Live Alerts</p>
              <p className="text-2xl font-bold">{liveAlerts.length}</p>
            </div>
            <BellRing className="w-8 h-8 text-blue-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Today</p>
              <p className="text-2xl font-bold">
                {
                  allAlerts.filter(
                    (a) =>
                      new Date(a.triggeredAt).toDateString() ===
                      new Date().toDateString()
                  ).length
                }
              </p>
            </div>
            <Bell className="w-8 h-8 text-green-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Connection</p>
              <p className="text-lg font-medium">
                {isConnected ? "Active" : "Connecting"}
              </p>
            </div>
            <div
              className={`w-6 h-6 rounded-full ${
                isConnected ? "bg-green-500" : "bg-yellow-500"
              }`}
            ></div>
          </div>
        </Card>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-4">
        {allAlerts.length === 0 ? (
          <Card className="p-8 text-center">
            <Bell className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No alerts yet
            </h3>
            <p className="text-gray-600 mb-4">
              Alerts will appear here when properties match your saved searches
            </p>
            <Link href="/saved-searches">
              <Button>Create Saved Search</Button>
            </Link>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Recent Alerts ({allAlerts.length})
              </h2>
              {liveAlerts.length > 0 && (
                <Badge variant="secondary">{liveAlerts.length} new</Badge>
              )}
            </div>

            <div className="space-y-4">
              {allAlerts.map((alert, index) => (
                <AlertCard key={`${alert.id}-${index}`} alert={alert} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
