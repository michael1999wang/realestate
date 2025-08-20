"use client";

import { Badge } from "@/components/ui/badge";
import { HelpCircle } from "lucide-react";

interface KPIProps {
  label: string;
  value: string | number;
  unit?: string;
  tooltip?: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
  size?: "sm" | "md" | "lg";
}

export function KPI({
  label,
  value,
  unit,
  tooltip,
  variant = "default",
  size = "md",
}: KPIProps) {
  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-2",
    lg: "text-base px-4 py-3",
  };

  const formatValue = () => {
    if (typeof value === "number") {
      return value.toFixed(2);
    }
    return value;
  };

  return (
    <div className="flex items-center space-x-2">
      <Badge variant={variant} className={sizeClasses[size]}>
        <span className="font-medium">{label}:</span>
        <span className="ml-1">
          {formatValue()}
          {unit && <span className="ml-1">{unit}</span>}
        </span>
      </Badge>
      {tooltip && (
        <div className="group relative">
          <HelpCircle className="w-4 h-4 text-gray-400 cursor-help" />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
            {tooltip}
          </div>
        </div>
      )}
    </div>
  );
}
