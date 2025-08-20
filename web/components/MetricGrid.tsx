"use client";

import { UWMetrics } from "@/app/api/route-types";
import { Card } from "@/components/ui/card";
import { formatMoney, formatPercent } from "@/lib/money";
import { Calculator, DollarSign, TrendingDown, TrendingUp } from "lucide-react";

interface MetricGridProps {
  metrics: UWMetrics;
  loading?: boolean;
}

export function MetricGrid({ metrics, loading = false }: MetricGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded mb-2"></div>
            <div className="h-8 bg-gray-200 rounded"></div>
          </Card>
        ))}
      </div>
    );
  }

  const getVariant = (
    value: number,
    goodThreshold: number,
    isPercentage = false
  ) => {
    const threshold = isPercentage ? goodThreshold / 100 : goodThreshold;
    if (value >= threshold) return "secondary";
    if (value >= threshold * 0.8) return "outline";
    return "destructive";
  };

  const metrics_data = [
    {
      title: "DSCR",
      value: metrics.dscr,
      formatted: metrics.dscr.toFixed(2),
      icon: Calculator,
      tooltip: "Debt Service Coverage Ratio - measures ability to service debt",
      variant: getVariant(metrics.dscr, 1.2),
    },
    {
      title: "Cash on Cash",
      value: metrics.cashOnCashPct,
      formatted: formatPercent(metrics.cashOnCashPct),
      icon: TrendingUp,
      tooltip: "Annual cash flow as percentage of cash invested",
      variant: getVariant(metrics.cashOnCashPct, 0.08, true),
    },
    {
      title: "Cash Flow",
      value: metrics.cashFlowAnnual,
      formatted: formatMoney(metrics.cashFlowAnnual),
      icon: metrics.cashFlowAnnual >= 0 ? TrendingUp : TrendingDown,
      tooltip: "Annual cash flow after all expenses and debt service",
      variant: metrics.cashFlowAnnual >= 0 ? "secondary" : "destructive",
    },
    {
      title: "Cap Rate",
      value: metrics.capRatePct,
      formatted: formatPercent(metrics.capRatePct / 100),
      icon: DollarSign,
      tooltip: "Net Operating Income as percentage of property value",
      variant: getVariant(metrics.capRatePct, 4),
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics_data.map((metric) => {
        const IconComponent = metric.icon;
        const colorClasses = {
          secondary: "text-green-600 border-green-200 bg-green-50",
          outline: "text-yellow-600 border-yellow-200 bg-yellow-50",
          destructive: "text-red-600 border-red-200 bg-red-50",
          default: "text-gray-600 border-gray-200 bg-gray-50",
        };

        return (
          <Card
            key={metric.title}
            className={`p-4 ${
              colorClasses[metric.variant as keyof typeof colorClasses]
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">
                {metric.title}
              </h3>
              <IconComponent className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold">{metric.formatted}</div>
            {metric.tooltip && (
              <div className="text-xs text-gray-500 mt-1">{metric.tooltip}</div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
