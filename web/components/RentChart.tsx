"use client";

import { RentEstimate } from "@/app/api/route-types";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface RentChartProps {
  rent: RentEstimate;
  title?: string;
}

export function RentChart({ rent, title = "Rent Estimates" }: RentChartProps) {
  const data = [
    {
      scenario: "Conservative",
      value: rent.p25 || 0,
      label: "P25",
    },
    {
      scenario: "Moderate",
      value: rent.p50,
      label: "P50",
    },
    {
      scenario: "Optimistic",
      value: rent.p75 || 0,
      label: "P75",
    },
  ].filter((item) => item.value > 0);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
  }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border rounded-lg shadow-md">
          <p className="font-medium">{`${label}`}</p>
          <p className="text-green-600">
            {`Rent: ${formatMoney(payload[0].value)}/month`}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-gray-600">
          Method: {rent.method.charAt(0).toUpperCase() + rent.method.slice(1)}
        </p>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="scenario" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 text-center text-sm">
        {data.map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="font-medium text-gray-600">{item.scenario}</div>
            <div className="text-lg font-bold text-green-600">
              {formatMoney(item.value)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
