"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { RENT_SCENARIOS } from "@/lib/constants";
import { setAssumptions, useAssumptions } from "@/store/useAssumptions";
import { RotateCcw, Save, Settings } from "lucide-react";
import { toast } from "sonner";

export default function AssumptionsPage() {
  const { a } = useAssumptions();

  const handleReset = () => {
    setAssumptions({
      downPct: 0.2,
      rateBps: 500,
      amortMonths: 360,
      rentScenario: "P50",
    });
    toast.success("Assumptions reset to defaults");
  };

  const handleSave = () => {
    // In a real app, this would save to the backend
    toast.success("Assumptions saved successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <Settings className="w-6 h-6 mr-3 text-blue-600" />
            Default Assumptions
          </h1>
          <p className="text-gray-600 mt-1">
            Set your default underwriting assumptions for property analysis
          </p>
        </div>

        <div className="flex space-x-3">
          <Button variant="outline" onClick={handleReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Financing Assumptions */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-6">Financing</h2>

          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium">Down Payment</label>
                <span className="text-sm text-gray-600 font-mono">
                  {(a.downPct * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                min={5}
                max={35}
                step={1}
                value={[a.downPct * 100]}
                onValueChange={([v]) => setAssumptions({ downPct: v / 100 })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>5%</span>
                <span>20% (Conventional)</span>
                <span>35%</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Higher down payments reduce mortgage payments but require more
                capital upfront
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium">Interest Rate</label>
                <span className="text-sm text-gray-600 font-mono">
                  {(a.rateBps / 100).toFixed(2)}%
                </span>
              </div>
              <Slider
                min={300}
                max={800}
                step={5}
                value={[a.rateBps]}
                onValueChange={([v]) => setAssumptions({ rateBps: v })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>3.00%</span>
                <span>5.00% (Current avg)</span>
                <span>8.00%</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Current mortgage rates vary by lender, term, and borrower
                profile
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <label className="text-sm font-medium">
                  Amortization Period
                </label>
                <span className="text-sm text-gray-600 font-mono">
                  {a.amortMonths / 12} years
                </span>
              </div>
              <Slider
                min={240}
                max={360}
                step={60}
                value={[a.amortMonths]}
                onValueChange={([v]) => setAssumptions({ amortMonths: v })}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>20 years</span>
                <span>25 years (Standard)</span>
                <span>30 years</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Longer amortization reduces monthly payments but increases total
                interest paid
              </p>
            </div>
          </div>
        </Card>

        {/* Rental Assumptions */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-6">Rental Income</h2>

          <div className="space-y-6">
            <div>
              <label className="text-sm font-medium mb-3 block">
                Default Rent Scenario
              </label>
              <div className="grid grid-cols-1 gap-3">
                {RENT_SCENARIOS.map((scenario) => (
                  <button
                    key={scenario.value}
                    onClick={() =>
                      setAssumptions({
                        rentScenario: scenario.value as "P25" | "P50" | "P75",
                      })
                    }
                    className={`p-4 text-left rounded-lg border transition-colors ${
                      a.rentScenario === scenario.value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">{scenario.label}</div>
                    <div className="text-sm opacity-75 mt-1">
                      {scenario.value === "P25" &&
                        "Use 25th percentile rent estimates for conservative projections"}
                      {scenario.value === "P50" &&
                        "Use median rent estimates for balanced projections"}
                      {scenario.value === "P75" &&
                        "Use 75th percentile rent estimates for optimistic projections"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Summary */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Current Settings Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {(a.downPct * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-gray-600">Down Payment</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {(a.rateBps / 100).toFixed(2)}%
            </div>
            <div className="text-sm text-gray-600">Interest Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {a.amortMonths / 12}
            </div>
            <div className="text-sm text-gray-600">Years Amortization</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">
              {a.rentScenario}
            </div>
            <div className="text-sm text-gray-600">Rent Scenario</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
