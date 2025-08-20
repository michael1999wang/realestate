import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle,
  DollarSign,
  Percent,
  Target,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiService } from "../services/api";
import { Listing, ListingWithAnalysis, UnderwritingResult } from "../types";
import { formatMoney, formatNumber, formatPercent } from "../utils/format";

export function InvestmentAnalysis() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [selectedListing, setSelectedListing] = useState<string>("");
  const [analysis, setAnalysis] = useState<ListingWithAnalysis | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<
    "P25" | "P50" | "P75"
  >("P50");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    if (selectedListing) {
      loadAnalysis(selectedListing);
    }
  }, [selectedListing]);

  const loadListings = async () => {
    try {
      const response = await apiService.getListings();
      if (response.success && response.data) {
        setListings(response.data);
        if (response.data.length > 0) {
          setSelectedListing(response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to load listings:", error);
    }
  };

  const loadAnalysis = async (listingId: string) => {
    try {
      setIsLoading(true);
      const response = await apiService.getListingWithAnalysis(listingId);
      if (response.success && response.data) {
        setAnalysis(response.data);
      }
    } catch (error) {
      console.error("Failed to load analysis:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCurrentResult = (): UnderwritingResult | null => {
    if (!analysis?.underwriting || analysis.underwriting.length === 0)
      return null;
    return (
      analysis.underwriting.find((u) => u.rentScenario === selectedScenario) ||
      analysis.underwriting[0]
    );
  };

  const getScenarioData = () => {
    if (!analysis?.underwriting) return [];

    const scenarios = ["P25", "P50", "P75"] as const;
    return scenarios.map((scenario) => {
      const result = analysis.underwriting!.find(
        (u) => u.rentScenario === scenario
      );
      return {
        scenario,
        coc: result?.metrics.coc || 0,
        capRate: result?.metrics.capRate || 0,
        cashFlow: result?.metrics.cashFlow || 0,
        dscr: result?.metrics.dscr || 0,
      };
    });
  };

  const getInvestmentMetrics = () => {
    const result = getCurrentResult();
    if (!result) return [];

    return [
      {
        name: "Cash-on-Cash Return",
        value: result.metrics.coc,
        format: "percent",
        icon: Percent,
        status:
          result.metrics.coc >= 0.06
            ? "good"
            : result.metrics.coc >= 0.04
            ? "warning"
            : "poor",
        description: "Annual cash flow divided by cash invested",
      },
      {
        name: "Cap Rate",
        value: result.metrics.capRate,
        format: "percent",
        icon: Target,
        status:
          result.metrics.capRate >= 0.04
            ? "good"
            : result.metrics.capRate >= 0.03
            ? "warning"
            : "poor",
        description: "Net operating income divided by property value",
      },
      {
        name: "DSCR",
        value: result.metrics.dscr,
        format: "ratio",
        icon: Calculator,
        status:
          result.metrics.dscr >= 1.25
            ? "good"
            : result.metrics.dscr >= 1.1
            ? "warning"
            : "poor",
        description: "Debt service coverage ratio",
      },
      {
        name: "Annual Cash Flow",
        value: result.metrics.cashFlow,
        format: "money",
        icon: DollarSign,
        status: result.metrics.cashFlow >= 0 ? "good" : "poor",
        description: "Net cash flow after all expenses and debt service",
      },
    ];
  };

  const currentResult = getCurrentResult();
  const metrics = getInvestmentMetrics();
  const chartData = getScenarioData();

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
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <BarChart3 className="h-8 w-8 mr-3 text-primary-600" />
          Investment Analysis
        </h1>
        <p className="text-gray-600 mt-1">
          Comprehensive underwriting and investment metrics
        </p>
      </div>

      {/* Property Selector */}
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Property:
            </label>
            <select
              value={selectedListing}
              onChange={(e) => setSelectedListing(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.address.street}, {listing.address.city} -{" "}
                  {formatMoney(listing.listPrice)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rent Scenario:
            </label>
            <select
              value={selectedScenario}
              onChange={(e) =>
                setSelectedScenario(e.target.value as "P25" | "P50" | "P75")
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
            >
              <option value="P25">P25 - Conservative</option>
              <option value="P50">P50 - Expected</option>
              <option value="P75">P75 - Optimistic</option>
            </select>
          </div>
        </div>
      </div>

      {!currentResult ? (
        <div className="bg-white rounded-lg p-12 shadow-sm border border-gray-200 text-center">
          <Calculator className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Analysis Available
          </h3>
          <p className="text-gray-600">
            Underwriting analysis is not yet available for this property.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              const getStatusColor = (status: string) => {
                switch (status) {
                  case "good":
                    return "text-green-600 bg-green-50 border-green-200";
                  case "warning":
                    return "text-yellow-600 bg-yellow-50 border-yellow-200";
                  case "poor":
                    return "text-red-600 bg-red-50 border-red-200";
                  default:
                    return "text-gray-600 bg-gray-50 border-gray-200";
                }
              };

              const formatValue = () => {
                switch (metric.format) {
                  case "percent":
                    return formatPercent(metric.value);
                  case "money":
                    return formatMoney(metric.value);
                  case "ratio":
                    return `${metric.value.toFixed(2)}x`;
                  default:
                    return formatNumber(metric.value);
                }
              };

              return (
                <div
                  key={metric.name}
                  className={`p-6 rounded-lg border-2 ${getStatusColor(
                    metric.status
                  )}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="h-6 w-6" />
                    {metric.status === "good" ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : metric.status === "warning" ? (
                      <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  <div className="text-2xl font-bold mb-1">{formatValue()}</div>
                  <div className="font-medium text-sm mb-2">{metric.name}</div>
                  <div className="text-xs opacity-75">{metric.description}</div>
                </div>
              );
            })}
          </div>

          {/* Scenario Comparison Chart */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Scenario Comparison
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-md font-medium text-gray-700 mb-3">
                  Cash-on-Cash Returns
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="scenario" />
                    <YAxis tickFormatter={(value) => formatPercent(value)} />
                    <Tooltip
                      formatter={(value: number) => formatPercent(value)}
                    />
                    <Bar dataKey="coc" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div>
                <h3 className="text-md font-medium text-gray-700 mb-3">
                  Annual Cash Flow
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="scenario" />
                    <YAxis tickFormatter={(value) => formatMoney(value)} />
                    <Tooltip
                      formatter={(value: number) => formatMoney(value)}
                    />
                    <Bar dataKey="cashFlow" fill="#10b981" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Detailed Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Income & Expenses */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Income & Expenses
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Monthly Rent ({selectedScenario})
                  </span>
                  <span className="font-medium">
                    {analysis?.rentEstimate
                      ? formatMoney(
                          analysis.rentEstimate[
                            selectedScenario.toLowerCase() as
                              | "p25"
                              | "p50"
                              | "p75"
                          ] || 0
                        )
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Annual Gross Income</span>
                  <span className="font-medium">
                    {analysis?.rentEstimate
                      ? formatMoney(
                          (analysis.rentEstimate[
                            selectedScenario.toLowerCase() as
                              | "p25"
                              | "p50"
                              | "p75"
                          ] || 0) * 12
                        )
                      : "N/A"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Property Taxes</span>
                  <span className="font-medium text-red-600">
                    -
                    {formatMoney(
                      analysis?.enrichment?.taxes?.annualEstimate || 0
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Condo Fees</span>
                  <span className="font-medium text-red-600">
                    -
                    {formatMoney(
                      (analysis?.enrichment?.fees?.condoFeeMonthly || 0) * 12
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Insurance</span>
                  <span className="font-medium text-red-600">
                    -
                    {formatMoney(
                      (analysis?.enrichment?.costRules
                        ?.insuranceMonthlyEstimate || 0) * 12
                    )}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between font-semibold">
                  <span>Net Operating Income</span>
                  <span className="text-green-600">
                    {formatMoney(currentResult.metrics.noi)}
                  </span>
                </div>
              </div>
            </div>

            {/* Financing Details */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Financing Details
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Purchase Price</span>
                  <span className="font-medium">
                    {formatMoney(currentResult.metrics.price)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Down Payment ({formatPercent(currentResult.downPct)})
                  </span>
                  <span className="font-medium text-blue-600">
                    {formatMoney(currentResult.metrics.downPayment)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Loan Amount</span>
                  <span className="font-medium">
                    {formatMoney(currentResult.metrics.loanAmount)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Interest Rate</span>
                  <span className="font-medium">
                    {formatPercent(currentResult.rateBps / 10000)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Monthly Debt Service</span>
                  <span className="font-medium text-red-600">
                    -{formatMoney(currentResult.metrics.monthlyDS)}
                  </span>
                </div>
                <div className="border-t pt-3 flex justify-between font-semibold">
                  <span>Annual Cash Flow</span>
                  <span
                    className={
                      currentResult.metrics.cashFlow >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {formatMoney(currentResult.metrics.cashFlow)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Investment Summary */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Investment Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {formatMoney(currentResult.metrics.downPayment)}
                </div>
                <div className="text-sm text-gray-600">Cash Required</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {formatMoney(currentResult.metrics.cashFlow / 12)}
                </div>
                <div className="text-sm text-gray-600">Monthly Cash Flow</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {currentResult.score
                    ? `${Math.round(currentResult.score * 100)}/100`
                    : "N/A"}
                </div>
                <div className="text-sm text-gray-600">Investment Score</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
