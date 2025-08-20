"use client";

import { SavedSearch } from "@/app/api/route-types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PROPERTY_TYPES } from "@/lib/constants";
import { Plus, Save } from "lucide-react";
import { useState } from "react";

interface ThresholdEditorProps {
  onSave: (search: SavedSearch) => void;
  loading?: boolean;
}

export function ThresholdEditor({
  onSave,
  loading = false,
}: ThresholdEditorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<Partial<SavedSearch>>({
    name: "",
    filter: {},
    thresholds: {},
  });

  const handleSave = () => {
    if (!search.name?.trim()) return;

    onSave({
      id: Date.now().toString(), // Will be replaced by server
      name: search.name,
      filter: search.filter || {},
      thresholds: search.thresholds || {},
    });

    setSearch({ name: "", filter: {}, thresholds: {} });
    setOpen(false);
  };

  const updateFilter = (key: string, value: string | number | undefined) => {
    setSearch((prev) => ({
      ...prev,
      filter: { ...prev.filter, [key]: value },
    }));
  };

  const updateThreshold = (
    key: string,
    value: number | boolean | undefined
  ) => {
    setSearch((prev) => ({
      ...prev,
      thresholds: { ...prev.thresholds, [key]: value },
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Create Saved Search
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Saved Search</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Info */}
          <div>
            <label className="text-sm font-medium mb-2 block">
              Search Name
            </label>
            <Input
              placeholder="e.g., Toronto Condos Under $800k"
              value={search.name || ""}
              onChange={(e) =>
                setSearch((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </div>

          {/* Search Filters */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Search Criteria</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">City</label>
                <Input
                  placeholder="Toronto, Vancouver..."
                  value={search.filter?.city || ""}
                  onChange={(e) => updateFilter("city", e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Property Type
                </label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={search.filter?.propertyType || ""}
                  onChange={(e) => updateFilter("propertyType", e.target.value)}
                >
                  <option value="">All Types</option>
                  {PROPERTY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Min Bedrooms
                </label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={search.filter?.minBeds || ""}
                  onChange={(e) =>
                    updateFilter(
                      "minBeds",
                      parseInt(e.target.value) || undefined
                    )
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Max Price
                </label>
                <Input
                  type="number"
                  min="0"
                  step="50000"
                  placeholder="1000000"
                  value={search.filter?.maxPrice || ""}
                  onChange={(e) =>
                    updateFilter(
                      "maxPrice",
                      parseInt(e.target.value) || undefined
                    )
                  }
                />
              </div>
            </div>
          </Card>

          {/* Investment Thresholds */}
          <Card className="p-4">
            <h3 className="font-medium mb-4">Investment Thresholds</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Min DSCR
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="1.2"
                  value={search.thresholds?.minDSCR || ""}
                  onChange={(e) =>
                    updateThreshold(
                      "minDSCR",
                      parseFloat(e.target.value) || undefined
                    )
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Min Cash-on-Cash (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="8"
                  value={
                    search.thresholds?.minCoC
                      ? search.thresholds.minCoC * 100
                      : ""
                  }
                  onChange={(e) =>
                    updateThreshold(
                      "minCoC",
                      (parseFloat(e.target.value) || 0) / 100
                    )
                  }
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">
                  Min Cap Rate (%)
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="4"
                  value={search.thresholds?.minCapRate || ""}
                  onChange={(e) =>
                    updateThreshold(
                      "minCapRate",
                      parseFloat(e.target.value) || undefined
                    )
                  }
                />
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="requirePositiveCF"
                  checked={search.thresholds?.requireNonNegativeCF || false}
                  onChange={(e) =>
                    updateThreshold("requireNonNegativeCF", e.target.checked)
                  }
                />
                <label htmlFor="requirePositiveCF" className="text-sm">
                  Require non-negative cash flow
                </label>
              </div>
            </div>
          </Card>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading || !search.name?.trim()}
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? "Saving..." : "Save Search"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
