import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Edit, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteInventoryItem,
  fetchInventoryItems,
  getTabTableConfig,
  upsertInventoryItem,
  useInventoryCatalog,
} from "@/lib/inventoryApi";

// Utility functions
const normalizeSubColumns = (subColumns = [], parentKey = "") => {
  if (!Array.isArray(subColumns)) {
    return [];
  }
  
  return subColumns
    .filter((subColumn) => subColumn && subColumn.key)
    .map((subColumn) => {
      const key = String(subColumn.key).trim();
      return {
        key,
        label: String(subColumn.label || subColumn.key).trim(),
        data_type: String(subColumn.data_type || subColumn.type || "text").toLowerCase(),
        physicalKey: `${parentKey}_${key}`,
      };
    })
    .filter((subColumn) => subColumn.key);
};

const normalizeTemplateColumns = (columns = []) => {
  if (!Array.isArray(columns)) {
    return [];
  }
  
  return columns
    .filter((column) => column && column.key)
    .map((column) => {
      const key = String(column.key).trim();
      return {
        key,
        label: String(column.label || column.key).trim(),
        data_type: String(column.data_type || column.type || "text").toLowerCase(),
        visible: column.visible !== false,
        subColumns: normalizeSubColumns(column.subColumns, key),
      };
    })
    .filter((column) => column.key);
};

const castValueByType = (value, dataType) => {
  if (dataType === "boolean" || dataType === "bool") {
    return Boolean(value);
  }

  if (dataType === "int" || dataType === "integer") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (dataType === "float" || dataType === "number" || dataType === "numeric") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number.parseFloat(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (dataType === "date") {
    return value ? String(value) : null;
  }

  return value == null ? "" : String(value);
};

const formatCellValue = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
};

const modalCloseButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700";

// Item Modal Component
function ItemModal({ section, item, onClose, onSaved, tableName, templateColumns }) {
  const useTemplate = Array.isArray(templateColumns) && templateColumns.length > 0;
  const [legacyForm, setLegacyForm] = useState(() => ({
    computerNumber: item?.computer_number ?? "",
    type: item?.type || "",
    brand: item?.brand || "",
    description: item?.description || "",
    status: item?.status || "",
  }));
  const [dynamicForm, setDynamicForm] = useState({});

  useEffect(() => {
    if (useTemplate) {
      const nextForm = {};
      for (const column of templateColumns) {
        if (column.subColumns && column.subColumns.length > 0) {
          for (const subColumn of column.subColumns) {
            nextForm[subColumn.physicalKey] = item?.[subColumn.physicalKey] ?? "";
          }
        } else {
          nextForm[column.key] = item?.[column.key] ?? "";
        }
      }
      setDynamicForm(nextForm);
      return;
    }

    setLegacyForm({
      computerNumber: item?.computer_number ?? "",
      type: item?.type || "",
      brand: item?.brand || "",
      description: item?.description || "",
      status: item?.status || "",
    });
  }, [item, templateColumns, useTemplate]);

  const save = async () => {
    if (useTemplate) {
      if (!tableName) {
        throw new Error("Physical table is not ready yet. Please wait for the table mapping to load.");
      }

      const recordData = {};
      for (const column of templateColumns) {
        if (column.subColumns && column.subColumns.length > 0) {
          for (const subColumn of column.subColumns) {
            recordData[subColumn.physicalKey] = castValueByType(
              dynamicForm[subColumn.physicalKey],
              subColumn.data_type
            );
          }
        } else {
          recordData[column.key] = castValueByType(dynamicForm[column.key], column.data_type);
        }
      }

      await upsertInventoryItem({
        id: item?.id,
        sectionId: section.id,
        tableName,
        recordData,
      });
      onSaved();
      return;
    }

    await upsertInventoryItem({
      id: item?.id,
      sectionId: section.id,
      computerNumber: Number(legacyForm.computerNumber || 0),
      type: legacyForm.type,
      brand: legacyForm.brand.trim(),
      description: legacyForm.description.trim(),
      status: legacyForm.status.trim(),
      tableName,
    });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {item ? "Edit item" : "Add item"}
            </h3>
            <p className="text-sm text-slate-500">
              {useTemplate
                ? "This form follows the tab template columns."
                : "This matches the legacy laboratory component flow."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={modalCloseButtonClass}
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
          {useTemplate ? (
            templateColumns.map((column) =>
              column.subColumns && column.subColumns.length > 0 ? (
                <div
                  key={column.key}
                  className="md:col-span-2 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <h4 className="text-sm font-semibold text-slate-700">
                    {column.label}
                  </h4>
                  <div className="grid gap-4 md:grid-cols-3">
                    {column.subColumns.map((subColumn) => (
                      <div key={subColumn.physicalKey}>
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                          {subColumn.label}
                        </label>
                        <Input
                          className="mt-2"
                          type={
                            subColumn.data_type === "date"
                              ? "date"
                              : ["int", "integer", "float", "number", "numeric"].includes(
                                  subColumn.data_type
                                )
                              ? "number"
                              : "text"
                          }
                          value={dynamicForm[subColumn.physicalKey] ?? ""}
                          onChange={(event) =>
                            setDynamicForm((current) => ({
                              ...current,
                              [subColumn.physicalKey]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div
                  key={column.key}
                  className={column.data_type === "text" ? "md:col-span-2" : ""}
                >
                  <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {column.label}
                  </label>
                  {column.data_type === "boolean" || column.data_type === "bool" ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(dynamicForm[column.key])}
                        onChange={(event) =>
                          setDynamicForm((current) => ({
                            ...current,
                            [column.key]: event.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm text-slate-600">
                        {dynamicForm[column.key] ? "True" : "False"}
                      </span>
                    </div>
                  ) : (
                    <Input
                      className="mt-2"
                      type={
                        column.data_type === "date"
                          ? "date"
                          : ["int", "integer", "float", "number", "numeric"].includes(
                              column.data_type
                            )
                          ? "number"
                          : "text"
                      }
                      value={dynamicForm[column.key] ?? ""}
                      onChange={(event) =>
                        setDynamicForm((current) => ({
                          ...current,
                          [column.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              )
            )
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Computer #
                </label>
                <Input
                  className="mt-2"
                  type="number"
                  min="1"
                  value={legacyForm.computerNumber}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      computerNumber: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Type
                </label>
                <Input
                  className="mt-2"
                  value={legacyForm.type}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Brand
                </label>
                <Input
                  className="mt-2"
                  value={legacyForm.brand}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      brand: event.target.value,
                    }))
                  }
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Status
                </label>
                <Input
                  className="mt-2"
                  value={legacyForm.status}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Description
                </label>
                <Textarea
                  className="mt-2 min-h-[120px]"
                  value={legacyForm.description}
                  onChange={(event) =>
                    setLegacyForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Save Component
          </button>
        </div>
      </div>
    </div>
  );
}

// Main Component
export default function InventorySection() {
  const { sectionSlug: tabSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { tabs, loading: tabsLoading, error: tabsError } = useInventoryCatalog();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSectionSlug, setSelectedSectionSlug] = useState("");
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tabTableName, setTabTableName] = useState("");
  const [templateColumns, setTemplateColumns] = useState([]);
  const [viewMode, setViewMode] = useState("table");
  const [gridEditMode, setGridEditMode] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this item?")) return;
    setDeletingId(itemId);
    await deleteInventoryItem(itemId, tabTableName || null);
    setDeletingId(null);
    setRefreshKey((current) => current + 1);
  };

  const tab = useMemo(
    () => tabs.find((currentTab) => currentTab.slug === tabSlug) || null,
    [tabs, tabSlug]
  );
  const selectedSection = useMemo(
    () =>
      tab?.sections?.find((section) => section.slug === selectedSectionSlug) ||
      null,
    [tab, selectedSectionSlug]
  );
  const sections = tab?.sections || [];
  const usesTemplateColumns = templateColumns.length > 0;
  const tableColSpan = templateColumns.length + 1;

  useEffect(() => {
    let cancelled = false;

    const loadTabState = async () => {
      if (!tab) {
        setSelectedSectionSlug("");
        setTabTableName("");
        setTemplateColumns([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const sectionQuery = searchParams.get("section");
        const fallbackSection = tab.sections?.[0]?.slug || "";
        const nextSection = tab.sections?.some(
          (section) => section.slug === sectionQuery
        )
          ? sectionQuery
          : fallbackSection;

        if (!cancelled) {
          setSelectedSectionSlug(nextSection);
        }

        const config = await getTabTableConfig(tab.id);
        if (!cancelled) {
          setTabTableName(config?.tableName || "");
          setTemplateColumns(normalizeTemplateColumns(config?.columns || []));
        }

        if (!nextSection && tab.sections?.length === 0) {
          setItems([]);
          setItemsError("");
          setItemsLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || "Failed to load inventory tab.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadTabState();

    return () => {
      cancelled = true;
    };
  }, [tab, searchParams]);

  useEffect(() => {
    if (!tab) return;
    const sectionQuery = searchParams.get("section");
    const fallbackSection = tab.sections?.[0]?.slug || "";
    const nextSection = tab.sections?.some(
      (section) => section.slug === sectionQuery
    )
      ? sectionQuery
      : fallbackSection;

    if (nextSection && nextSection !== sectionQuery) {
      setSearchParams({ section: nextSection }, { replace: true });
    }

    if (nextSection !== selectedSectionSlug) {
      setSelectedSectionSlug(nextSection);
    }
  }, [tab, searchParams, selectedSectionSlug, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      if (!selectedSection?.id) {
        setItems([]);
        return;
      }

      setItemsLoading(true);
      setItemsError("");

      try {
        const loadedItems = await fetchInventoryItems(
          selectedSection.id,
          tabTableName || null
        );
        if (!cancelled) {
          setItems(loadedItems || []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setItems([]);
          setItemsError(
            loadError?.message || "Failed to load section items."
          );
        }
      } finally {
        if (!cancelled) {
          setItemsLoading(false);
        }
      }
    };

    loadItems();

    return () => {
      cancelled = true;
    };
  }, [selectedSection?.id, tabTableName, refreshKey]);

  const openCreateModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleSaved = () => {
    setShowModal(false);
    setEditingItem(null);
    setRefreshKey((current) => current + 1);
  };

  if (tabsLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
        <div className="mx-auto max-w-7xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm text-slate-500">Loading inventory tab...</p>
        </div>
      </div>
    );
  }

  if (tabsError || error || !tab) {
    return (
      <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
        <div className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-slate-900">
            Inventory tab not found
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {tabsError || error || "The tab you opened does not exist yet."}
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              to="/manage/inventory"
              className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Go to management
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-6 sm:p-10">
      <div className="mx-auto max-w-7xl space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-700">
              Inventory
            </p>
             {/*<h1 className="mt-2 text-3xl font-bold text-slate-900">
              {tab.name}
            </h1> */}
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {tab.description ||
                "Choose a section below to manage its inventory components."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            
            {/*<Link
              to="/manage/inventory"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
            >
              Manage tabs
            </Link> */}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {sections.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-500">
                No sections yet. Add one from the inventory manager.
              </div>
            ) : (
              sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    setSelectedSectionSlug(section.slug);
                    setSearchParams(
                      { section: section.slug },
                      { replace: true }
                    );
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    section.slug === selectedSectionSlug
                      ? "bg-[#4a1111] text-white"
                      : "bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {section.name}
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {selectedSection?.name || "Select a section"}
              </h2>
              <p className="text-sm text-slate-500">
                {selectedSection?.description ||
                  "This section stores the inventory items."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              { /*<button
                type="button"
                onClick={() => setGridEditMode(!gridEditMode)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 ring-1 shadow-sm ${
                  gridEditMode
                    ? "bg-blue-600 text-white ring-blue-500 hover:bg-blue-700"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {gridEditMode ? "Edit Mode ON" : "Edit Mode OFF"}
              </button> */}

              <button
                type="button"
                onClick={openCreateModal}
                disabled={usesTemplateColumns && !tabTableName}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4a1111] px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-[#5a1717] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
              >
                <Plus className="h-4 w-4" />
                {usesTemplateColumns && !tabTableName
                  ? "Loading table..."
                  : "Add item"}
              </button>
            </div>
          </div>

          <div className="p-5">
            {!selectedSection ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                <p className="text-slate-500 font-medium">
                  Pick a section to view or add items.
                </p>
              </div>
            ) : itemsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="h-10 w-10 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin" />
                <p className="text-sm text-slate-500 font-medium">
                  Loading components...
                </p>
              </div>
            ) : itemsError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
                {itemsError}
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 py-20 text-center">
                <p className="text-slate-500 font-medium">
                  No records found for this section.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      {usesTemplateColumns &&
                        templateColumns.map((column) => (
                          <th
                            key={column.key}
                            className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-700"
                          >
                            {column.label}
                          </th>
                        ))}
                      {gridEditMode && (
                        <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {items.map((item, itemIndex) => (
                      <tr key={item.id}>
                    
                        {usesTemplateColumns &&
                          templateColumns.map((column) => (
                            <td
                              key={`${item.id}-${column.key}`}
                              className="px-4 py-3 align-top text-sm text-slate-700"
                            >
                              {column.subColumns &&
                              column.subColumns.length > 0 ? (
                                <div className="space-y-2">
                                  {column.subColumns.map((subColumn) => (
                                    <div
                                      key={subColumn.physicalKey}
                                      className="space-y-1"
                                    >
                                      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                        {subColumn.label}
                                      </div>
                                      <div className="
mt-1 font-medium text-slate-900
">
                                        {formatCellValue(
                                          item?.[subColumn.physicalKey]
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span>
                                  {formatCellValue(item?.[column.key])}
                                </span>
                              )}
                            </td>
                          ))}
                        {gridEditMode && (
                          <td className="px-4 py-3 align-middle">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(item || null);
                                  setShowModal(true);
                                }}
                                className="rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit item"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === item.id}
                                onClick={() => handleDelete(item.id)}
                                className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                                title="Delete item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showModal && selectedSection && (
        <ItemModal
          section={selectedSection}
          item={editingItem}
          tableName={tabTableName}
          templateColumns={templateColumns}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}