import {
  Bell,
  CheckCircle,
  Edit,
  Filter,
  Plus,
  Search,
  Settings,
  Trash2,
  XCircle,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { SavedSearch } from "../types";
import { formatMoney, formatPercent } from "../utils/format";

export function SavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSearch, setEditingSearch] = useState<SavedSearch | null>(null);

  useEffect(() => {
    loadSavedSearches();
  }, []);

  const loadSavedSearches = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getSavedSearches();
      if (response.success && response.data) {
        setSearches(response.data);
      }
    } catch (error) {
      console.error("Failed to load saved searches:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSearch = () => {
    setEditingSearch(null);
    setShowCreateForm(true);
  };

  const handleEditSearch = (search: SavedSearch) => {
    setEditingSearch(search);
    setShowCreateForm(true);
  };

  const handleDeleteSearch = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this saved search?")) {
      try {
        await apiService.deleteSavedSearch(id);
        setSearches((prev) => prev.filter((s) => s.id !== id));
      } catch (error) {
        console.error("Failed to delete search:", error);
      }
    }
  };

  const handleToggleActive = async (search: SavedSearch) => {
    try {
      const response = await apiService.updateSavedSearch(search.id, {
        isActive: !search.isActive,
      });
      if (response.success && response.data) {
        setSearches((prev) =>
          prev.map((s) => (s.id === search.id ? response.data! : s))
        );
      }
    } catch (error) {
      console.error("Failed to update search:", error);
    }
  };

  const handleSaveSearch = async (searchData: Omit<SavedSearch, "id">) => {
    try {
      if (editingSearch) {
        // Update existing search
        const response = await apiService.updateSavedSearch(
          editingSearch.id,
          searchData
        );
        if (response.success && response.data) {
          setSearches((prev) =>
            prev.map((s) => (s.id === editingSearch.id ? response.data! : s))
          );
        }
      } else {
        // Create new search
        const response = await apiService.createSavedSearch(searchData);
        if (response.success && response.data) {
          setSearches((prev) => [...prev, response.data!]);
        }
      }
      setShowCreateForm(false);
      setEditingSearch(null);
    } catch (error) {
      console.error("Failed to save search:", error);
    }
  };

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
              <Search className="h-8 w-8 mr-3 text-primary-600" />
              Saved Searches
            </h1>
            <p className="text-gray-600 mt-1">
              Manage your investment criteria and get notified of matches
            </p>
          </div>
          <button
            onClick={handleCreateSearch}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>Create Search</span>
          </button>
        </div>
      </div>

      {/* Searches List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {searches.map((search) => (
          <SearchCard
            key={search.id}
            search={search}
            onEdit={handleEditSearch}
            onDelete={handleDeleteSearch}
            onToggleActive={handleToggleActive}
          />
        ))}
      </div>

      {searches.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No saved searches yet
          </h3>
          <p className="text-gray-600 mb-4">
            Create your first search to start receiving investment
            opportunities.
          </p>
          <button onClick={handleCreateSearch} className="btn btn-primary">
            Create Your First Search
          </button>
        </div>
      )}

      {/* Create/Edit Form Modal */}
      {showCreateForm && (
        <SearchForm
          search={editingSearch}
          onSave={handleSaveSearch}
          onCancel={() => {
            setShowCreateForm(false);
            setEditingSearch(null);
          }}
        />
      )}
    </div>
  );
}

function SearchCard({
  search,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  search: SavedSearch;
  onEdit: (search: SavedSearch) => void;
  onDelete: (id: string) => void;
  onToggleActive: (search: SavedSearch) => void;
}) {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-semibold text-gray-900">{search.name}</h3>
          <button
            onClick={() => onToggleActive(search)}
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              search.isActive
                ? "bg-green-100 text-green-800 hover:bg-green-200"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
          >
            {search.isActive ? (
              <>
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </>
            ) : (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Inactive
              </>
            )}
          </button>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit(search)}
            className="text-gray-400 hover:text-gray-600"
          >
            <Edit className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(search.id)}
            className="text-gray-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
          <Filter className="h-4 w-4 mr-1" />
          Property Filters
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {search.filter.city && (
            <div>
              <span className="text-gray-600">City:</span>
              <span className="ml-1 font-medium">{search.filter.city}</span>
            </div>
          )}
          {search.filter.propertyType && (
            <div>
              <span className="text-gray-600">Type:</span>
              <span className="ml-1 font-medium">
                {search.filter.propertyType}
              </span>
            </div>
          )}
          {search.filter.minBeds && (
            <div>
              <span className="text-gray-600">Min Beds:</span>
              <span className="ml-1 font-medium">{search.filter.minBeds}</span>
            </div>
          )}
          {search.filter.maxPrice && (
            <div>
              <span className="text-gray-600">Max Price:</span>
              <span className="ml-1 font-medium">
                {formatMoney(search.filter.maxPrice)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Thresholds */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
          <Settings className="h-4 w-4 mr-1" />
          Investment Thresholds
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {search.thresholds.minDSCR && (
            <div>
              <span className="text-gray-600">Min DSCR:</span>
              <span className="ml-1 font-medium">
                {search.thresholds.minDSCR}x
              </span>
            </div>
          )}
          {search.thresholds.minCoC && (
            <div>
              <span className="text-gray-600">Min CoC:</span>
              <span className="ml-1 font-medium">
                {formatPercent(search.thresholds.minCoC)}
              </span>
            </div>
          )}
          {search.thresholds.minCapRate && (
            <div>
              <span className="text-gray-600">Min Cap Rate:</span>
              <span className="ml-1 font-medium">
                {formatPercent(search.thresholds.minCapRate)}
              </span>
            </div>
          )}
          {search.thresholds.requireNonNegativeCF && (
            <div className="col-span-2">
              <span className="text-gray-600">Positive Cash Flow Required</span>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
          <Bell className="h-4 w-4 mr-1" />
          Notifications
        </h4>
        <div className="flex flex-wrap gap-2">
          {search.notify.channel.map((channel) => (
            <span
              key={channel}
              className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded"
            >
              {channel}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchForm({
  search,
  onSave,
  onCancel,
}: {
  search: SavedSearch | null;
  onSave: (search: Omit<SavedSearch, "id">) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState<Omit<SavedSearch, "id">>({
    userId: "user-demo",
    name: search?.name || "",
    filter: {
      city: search?.filter.city || "",
      province: search?.filter.province || "",
      propertyType: search?.filter.propertyType || "",
      minBeds: search?.filter.minBeds || undefined,
      maxPrice: search?.filter.maxPrice || undefined,
    },
    thresholds: {
      minDSCR: search?.thresholds.minDSCR || undefined,
      minCoC: search?.thresholds.minCoC || undefined,
      minCapRate: search?.thresholds.minCapRate || undefined,
      requireNonNegativeCF: search?.thresholds.requireNonNegativeCF || false,
    },
    notify: {
      channel: search?.notify.channel || ["devbrowser"],
    },
    isActive: search?.isActive ?? true,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const handleChannelChange = (channel: string, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      notify: {
        ...prev.notify,
        channel: checked
          ? [...prev.notify.channel, channel as any]
          : prev.notify.channel.filter((c) => c !== channel),
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              {search ? "Edit Search" : "Create New Search"}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircle className="h-6 w-6" />
            </button>
          </div>

          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search Name
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
              placeholder="e.g., Toronto Downtown Condos"
            />
          </div>

          {/* Property Filters */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Property Filters
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={formData.filter.city || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filter: {
                        ...prev.filter,
                        city: e.target.value || undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="e.g., Toronto"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Province
                </label>
                <select
                  value={formData.filter.province || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filter: {
                        ...prev.filter,
                        province: e.target.value || undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="">Any Province</option>
                  <option value="ON">Ontario</option>
                  <option value="BC">British Columbia</option>
                  <option value="AB">Alberta</option>
                  <option value="QC">Quebec</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Property Type
                </label>
                <select
                  value={formData.filter.propertyType || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filter: {
                        ...prev.filter,
                        propertyType: e.target.value || undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                >
                  <option value="">Any Type</option>
                  <option value="Condo">Condo</option>
                  <option value="House">House</option>
                  <option value="Townhouse">Townhouse</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Bedrooms
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.filter.minBeds || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filter: {
                        ...prev.filter,
                        minBeds: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Price
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.filter.maxPrice || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      filter: {
                        ...prev.filter,
                        maxPrice: e.target.value
                          ? parseInt(e.target.value)
                          : undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="Maximum purchase price"
                />
              </div>
            </div>
          </div>

          {/* Investment Thresholds */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Investment Thresholds
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min DSCR
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={formData.thresholds.minDSCR || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        minDSCR: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="e.g., 1.25"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Cash-on-Cash (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={
                    formData.thresholds.minCoC
                      ? formData.thresholds.minCoC * 100
                      : ""
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        minCoC: e.target.value
                          ? parseFloat(e.target.value) / 100
                          : undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="e.g., 6"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Cap Rate (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={
                    formData.thresholds.minCapRate
                      ? formData.thresholds.minCapRate * 100
                      : ""
                  }
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        minCapRate: e.target.value
                          ? parseFloat(e.target.value) / 100
                          : undefined,
                      },
                    }))
                  }
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                  placeholder="e.g., 3.5"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="requirePositiveCF"
                  checked={formData.thresholds.requireNonNegativeCF}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      thresholds: {
                        ...prev.thresholds,
                        requireNonNegativeCF: e.target.checked,
                      },
                    }))
                  }
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor="requirePositiveCF"
                  className="ml-2 text-sm text-gray-700"
                >
                  Require positive cash flow
                </label>
              </div>
            </div>
          </div>

          {/* Notification Channels */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">
              Notification Channels
            </h3>
            <div className="space-y-2">
              {[
                { id: "devbrowser", label: "Browser (Demo)" },
                { id: "email", label: "Email" },
                { id: "sms", label: "SMS" },
                { id: "slack", label: "Slack" },
              ].map((channel) => (
                <label key={channel.id} className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.notify.channel.includes(
                      channel.id as any
                    )}
                    onChange={(e) =>
                      handleChannelChange(channel.id, e.target.checked)
                    }
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="ml-2 text-sm text-gray-700">
                    {channel.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {search ? "Update Search" : "Create Search"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
