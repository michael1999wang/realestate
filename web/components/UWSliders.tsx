"use client";

import { Assumptions, UWMetrics } from "@/app/api/route-types";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { api } from "@/lib/api";
import { RENT_SCENARIOS } from "@/lib/constants";
import { setAssumptions, useAssumptions } from "@/store/useAssumptions";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { MetricGrid } from "./MetricGrid";

interface UWSlidersProps {
  listingId: string;
  initialMetrics: UWMetrics;
}

export function UWSliders({ listingId, initialMetrics }: UWSlidersProps) {
  const { a } = useAssumptions();
  const [metrics, setMetrics] = useState(initialMetrics);

  const mutation = useMutation({
    mutationFn: (body: Assumptions) =>
      api.underwrite({ listingId, assumptions: body }),
    onSuccess: (res) => setMetrics(res.metrics),
  });

  const updateAssumption = (patch: Partial<Assumptions>) => {
    const newAssumptions = { ...a, ...patch };
    setAssumptions(patch);
    mutation.mutate(newAssumptions);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-6">Underwriting Assumptions</h3>

        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium">Down Payment</label>
              <span className="text-sm text-gray-600">
                {(a.downPct * 100).toFixed(0)}%
              </span>
            </div>
            <Slider
              min={5}
              max={35}
              step={1}
              value={[a.downPct * 100]}
              onValueChange={([v]) => updateAssumption({ downPct: v / 100 })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>5%</span>
              <span>35%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium">Interest Rate</label>
              <span className="text-sm text-gray-600">
                {(a.rateBps / 100).toFixed(2)}%
              </span>
            </div>
            <Slider
              min={300}
              max={800}
              step={5}
              value={[a.rateBps]}
              onValueChange={([v]) => updateAssumption({ rateBps: v })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>3.00%</span>
              <span>8.00%</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="text-sm font-medium">Amortization</label>
              <span className="text-sm text-gray-600">
                {a.amortMonths / 12} years
              </span>
            </div>
            <Slider
              min={240}
              max={360}
              step={60}
              value={[a.amortMonths]}
              onValueChange={([v]) => updateAssumption({ amortMonths: v })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>20 years</span>
              <span>30 years</span>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-3 block">
              Rent Scenario
            </label>
            <div className="grid grid-cols-3 gap-2">
              {RENT_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.value}
                  onClick={() =>
                    updateAssumption({
                      rentScenario: scenario.value as "P25" | "P50" | "P75",
                    })
                  }
                  className={`p-2 text-xs rounded border transition-colors ${
                    a.rentScenario === scenario.value
                      ? "bg-blue-50 border-blue-300 text-blue-700"
                      : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div>
        <h3 className="text-lg font-semibold mb-4">Updated Metrics</h3>
        <MetricGrid metrics={metrics} loading={mutation.isPending} />
      </div>
    </div>
  );
}
