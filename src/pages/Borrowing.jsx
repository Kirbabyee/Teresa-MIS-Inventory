import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchInventoryItems,
  getTabTableConfig,
  useInventoryCatalog,
} from "@/lib/inventoryApi";
import {
  createBorrowingRecord,
  fetchBorrowingRecords,
  returnBorrowingRecord,
} from "@/lib/borrowingApi";

const initialForm = {
  name: "",
  studentId: "",
  role: "",
};

const hiddenItemDetailKeys = new Set([
  "id",
  "section_id",
  "created_at",
  "updated_at",
  "sort_order",
  "data",
]);

const fieldLabels = {
  computer_number: "Computer #",
  computerNumber: "Computer #",
  item_name: "Item",
  asset_name: "Asset",
};

const formatFieldLabel = (key = "") =>
  fieldLabels[key] ||
  String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getItemLabel = (item = {}) => {
  const computerNumber = item.computer_number ?? item.computerNumber;
  const namedValue =
    item.name ||
    item.item_name ||
    item.asset_name ||
    item.brand ||
    item.type ||
    item.description;

  if (computerNumber) {
    const details = [item.type, item.brand, item.description].filter(Boolean).join(" - ");
    return details ? `Computer #${computerNumber} - ${details}` : `Computer #${computerNumber}`;
  }

  if (namedValue) return String(namedValue);

  const fallback = Object.entries(item).find(
    ([key, value]) =>
      !["id", "section_id", "created_at", "updated_at"].includes(key) &&
      value !== null &&
      value !== undefined &&
      String(value).trim() !== ""
  );

  return fallback ? String(fallback[1]) : `Item ${item.id || ""}`.trim();
};

const getItemDetails = (item = {}) =>
  Object.entries(item)
    .filter(
      ([key, value]) =>
        !hiddenItemDetailKeys.has(key) &&
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
    .slice(0, 8)
    .map(([key, value]) => ({
      key,
      label: formatFieldLabel(key),
      value: String(value),
    }));

export default function Borrowing() {
  const { tabs, loading: inventoryLoading, error: inventoryError } = useInventoryCatalog();
  const [sortOrder, setSortOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selectedTabId, setSelectedTabId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [tabTableNames, setTabTableNames] = useState({});
  const [formError, setFormError] = useState("");
  const [pendingReturn, setPendingReturn] = useState(null);
  const [borrowingsLoading, setBorrowingsLoading] = useState(true);
  const [borrowingsError, setBorrowingsError] = useState("");
  const [savingBorrow, setSavingBorrow] = useState(false);
  const [returningBorrow, setReturningBorrow] = useState(false);

  const [statusFilter, setStatusFilter] = useState("borrowed");
  const [showHistory, setShowHistory] = useState(false);
  const [customItems, setCustomItems] = useState([]);
  const [customItemForm, setCustomItemForm] = useState({ name: "", description: "" });
  const [addingCustom, setAddingCustom] = useState(false);

  const [data, setData] = useState([]);

  const selectedTab = useMemo(
    () => tabs.find((tab) => String(tab.id) === String(selectedTabId)) || null,
    [tabs, selectedTabId]
  );
  const sections = selectedTab?.sections || [];
  const selectedSection = useMemo(
    () => sections.find((section) => String(section.id) === String(selectedSectionId)) || null,
    [sections, selectedSectionId]
  );
  const selectedItems = useMemo(
    () => inventoryItems.filter((item) => selectedItemIds.includes(String(item.id))),
    [inventoryItems, selectedItemIds]
  );
  const inventoryNameLookup = useMemo(() => {
    const tabNames = {};
    const sectionNames = {};

    tabs.forEach((tab) => {
      tabNames[tab.id] = tab.name;
      (tab.sections || []).forEach((section) => {
        sectionNames[section.id] = section.name;
      });
    });

    return { tabNames, sectionNames };
  }, [tabs]);

  const filteredData = data
    .filter((d) => d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      sortOrder === "asc"
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date)
    );

  useEffect(() => {
    let cancelled = false;

    const loadBorrowings = async () => {
      setBorrowingsLoading(true);
      setBorrowingsError("");

      try {
        const records = await fetchBorrowingRecords({ status: statusFilter === "all" ? null : "borrowed" });
        if (!cancelled) {
          setData(records);
        }
      } catch (error) {
        if (!cancelled) {
          setData([]);
          setBorrowingsError(error?.message || "Failed to load borrowing records.");
        }
      } finally {
        if (!cancelled) {
          setBorrowingsLoading(false);
        }
      }
    };

    loadBorrowings();

    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  useEffect(() => {
    let cancelled = false;

    const loadTableNames = async () => {
      const entries = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const config = await getTabTableConfig(tab.id);
            return [tab.id, config?.tableName || null];
          } catch (error) {
            return [tab.id, null];
          }
        })
      );

      if (!cancelled) {
        setTabTableNames(Object.fromEntries(entries));
      }
    };

    if (tabs.length > 0) loadTableNames();

    return () => {
      cancelled = true;
    };
  }, [tabs]);

  useEffect(() => {
    if (!selectedSectionId) {
      setInventoryItems([]);
      setSelectedItemIds([]);
      return;
    }

    let cancelled = false;

    const loadItems = async () => {
      setItemsLoading(true);
      setItemsError("");
      setSelectedItemIds([]);

      try {
        const loadedItems = await fetchInventoryItems(
          selectedSectionId,
          tabTableNames[selectedTabId] || null
        );

        if (!cancelled) {
          setInventoryItems(loadedItems || []);
        }
      } catch (error) {
        if (!cancelled) {
          setInventoryItems([]);
          setItemsError(error?.message || "Failed to load inventory items.");
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
  }, [selectedSectionId, selectedTabId, tabTableNames]);

  const resetBorrowForm = () => {
    setForm(initialForm);
    setSelectedTabId("");
    setSelectedSectionId("");
    setSelectedItemIds([]);
    setInventoryItems([]);
    setCustomItems([]);
    setCustomItemForm({ name: "", description: "" });
    setItemsError("");
    setFormError("");
  };

  const closeBorrowModal = () => {
    setShowModal(false);
    setShowConfirm(false);
    resetBorrowForm();
  };

  const requestReturn = (record) => {
    setPendingReturn(record);
  };

  const cancelReturn = () => {
    setPendingReturn(null);
  };

  const confirmReturn = async () => {
    if (!pendingReturn?.id || returningBorrow) return;

    setReturningBorrow(true);
    try {
      await returnBorrowingRecord(pendingReturn.id);
      setData((prev) => prev.filter((item) => item.id !== pendingReturn.id));
      setSuccessMessage("Borrowed item returned successfully.");
      setPendingReturn(null);
    } catch (error) {
      setBorrowingsError(error?.message || "Failed to return borrowed item.");
    } finally {
      setReturningBorrow(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFormError("");
  };

  const toggleItem = (itemId) => {
    const normalizedId = String(itemId);
    setSelectedItemIds((current) =>
      current.includes(normalizedId)
        ? current.filter((id) => id !== normalizedId)
        : [...current, normalizedId]
    );
    setFormError("");
  };

  const requestBorrowConfirmation = () => {
    if (!form.name.trim() || !form.studentId.trim() || !form.role) {
      setFormError("Complete the borrower's details first.");
      return;
    }

    const pendingCustomItemName = customItemForm.name.trim();
    const hasSelectedItems = selectedItemIds.length > 0 || customItems.length > 0 || pendingCustomItemName;

    if (!hasSelectedItems) {
      setFormError("Choose at least one item to borrow.");
      return;
    }

    if (pendingCustomItemName) {
      const newCustomItem = {
        id: `custom-${Date.now()}`,
        label: pendingCustomItemName,
        details: customItemForm.description.trim()
          ? [
              {
                key: "description",
                label: "Description",
                value: customItemForm.description.trim(),
              },
            ]
          : [],
        inventoryItemId: null,
        inventoryTabId: null,
        inventorySectionId: null,
        inventoryTableName: "",
      };

      setCustomItems((current) => [...current, newCustomItem]);
      setCustomItemForm({ name: "", description: "" });
    }

    setShowConfirm(true);
  };

  const confirmBorrow = async () => {
    if (savingBorrow) return;

    setSavingBorrow(true);
    try {
      const savedRecord = await createBorrowingRecord({
        borrowerName: form.name.trim(),
        borrowerIdNumber: form.studentId.trim(),
        borrowerRole: form.role,
        items: [...selectedItems.map((item) => ({
          inventoryItemId: item.id,
          inventoryTabId: selectedTab?.id || null,
          inventoryTabName: selectedTab?.name || "",
          inventorySectionId: selectedSection?.id || null,
          inventorySectionName: selectedSection?.name || "",
          inventoryTableName: tabTableNames[selectedTabId] || "",
          label: getItemLabel(item),
          details: getItemDetails(item),
        })), ...customItems.map((item) => ({
          inventoryItemId: null,
          inventoryTabId: null,
          inventoryTabName: "",
          inventorySectionId: null,
          inventorySectionName: "",
          inventoryTableName: "",
          label: item.label,
          details: item.details,
        }))],
      });

      const newEntry = {
        ...savedRecord,
        items: [...selectedItems.map((item) => ({
          id: item.id,
          inventoryItemId: item.id,
          inventoryTabId: selectedTab?.id || null,
          inventorySectionId: selectedSection?.id || null,
          label: getItemLabel(item),
          details: getItemDetails(item),
          tab: selectedTab?.name || "",
          section: selectedSection?.name || "",
        })), ...customItems.map((item) => ({
          id: item.id,
          inventoryItemId: null,
          inventoryTabId: null,
          inventorySectionId: null,
          label: item.label,
          details: item.details,
          tab: "",
          section: "",
        }))],
      };

      setData((prev) => [newEntry, ...prev]);
      setSuccessMessage("Borrowing record added successfully.");
      closeBorrowModal();
    } catch (error) {
      setFormError(error?.message || "Failed to save borrowing record.");
      setShowConfirm(false);
    } finally {
      setSavingBorrow(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">
            {statusFilter === "borrowed" ? "Borrowed Items" : "Borrowing History"}
          </h1>

          <Link to="/login" className="text-sm text-slate-500 hover:text-red-500">
            Sign out
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            type="button"
            onClick={() => setSortOrder("desc")}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              sortOrder === "desc"
                ? "bg-[#4a1111] text-white border-[#4a1111]"
                : "text-[#4a1111] border-[#4a1111] hover:bg-[#4a1111] hover:text-white"
            }`}
          >
            Descending
          </button>

          <button
            type="button"
            onClick={() => setSortOrder("asc")}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              sortOrder === "asc"
                ? "bg-[#4a1111] text-white border-[#4a1111]"
                : "text-[#4a1111] border-[#4a1111] hover:bg-[#4a1111] hover:text-white"
            }`}
          >
            Ascending
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === "borrowed" ? "all" : "borrowed")}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              statusFilter === "all"
                ? "bg-[#4a1111] text-white border-[#4a1111]"
                : "text-[#4a1111] border-[#4a1111] hover:bg-[#4a1111] hover:text-white"
            }`}
          >
            {statusFilter === "borrowed" ? "Show History" : "Show Current"}
          </button>

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border rounded-full px-4 py-2 text-sm"
          />

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="bg-[#4a1111] text-white px-5 py-2 rounded-full text-sm hover:opacity-90 transition"
          >
            + Borrow
          </button>
        </div>

        {borrowingsError ? (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {borrowingsError}
          </div>
        ) : null}

        {borrowingsLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Loading {statusFilter === "borrowed" ? "borrowed items" : "borrowing records"}...
          </div>
        ) : filteredData.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            {statusFilter === "borrowed" ? "No borrowed items yet." : "No borrowing records found."}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredData.map((person) => (
            <div key={person.id} className={`bg-white border rounded-xl p-5 ${person.status === "returned" ? "opacity-75" : ""}`}>
              <div className="flex justify-between mb-3 gap-4">
                <div>
                  <h3 className="font-medium">{person.name}</h3>
                  <p className="text-xs text-gray-400">{person.studentId}</p>
                  <p className="text-xs text-gray-400">{person.role}</p>
                  {person.status === "returned" && (
                    <p className="text-xs text-green-600 font-medium">Returned</p>
                  )}
                </div>

                {person.status === "borrowed" && (
                  <button
                    type="button"
                    onClick={() => requestReturn(person)}
                    className="self-start text-xs border px-3 py-1 rounded"
                  >
                    Return
                  </button>
                )}
              </div>

              <p className="text-xs text-gray-400">
                Borrowed: {new Date(person.date).toLocaleString()}
                {person.returnedAt && ` | Returned: ${new Date(person.returnedAt).toLocaleString()}`}
              </p>

              {person.items?.length > 0 ? (
                <div className="mt-4 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#4a1111]">
                    Borrowed
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {person.items.map((item) => (
                      <li key={`${person.id}-${item.id}`} className="rounded-lg bg-slate-50 px-3 py-2">
                        <span className="font-medium">{item.label}</span>
                        <span className="block text-xs text-slate-400">
                          {item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} /{" "}
                          {item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}
                        </span>
                        {item.details?.length > 0 ? (
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {item.details.map((detail) => (
                              <span
                                key={`${person.id}-${item.id}-${detail.key}`}
                                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                              >
                                <span className="font-semibold text-slate-700">
                                  {detail.label}:
                                </span>{" "}
                                {detail.value}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-white p-6 shadow-md">
            <h2 className="text-xl font-bold mb-6 text-[#4a1111]">
              BORROWER'S INFORMATION
            </h2>

            <div className="grid grid-cols-3 gap-4 items-center">
              <label className="text-sm font-semibold text-[#4a1111]">NAME</label>
              <input
                name="name"
                placeholder="Enter full name"
                value={form.name}
                onChange={handleChange}
                className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
              />

              <label className="text-sm font-semibold text-[#4a1111]">ID NUMBER</label>
              <input
                name="studentId"
                placeholder="Enter ID number"
                value={form.studentId}
                onChange={handleChange}
                className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
              />

              <label className="text-sm font-semibold text-[#4a1111]">ROLE</label>
              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
              >
                <option value="">Select role</option>
                <option value="Student">Student</option>
                <option value="Teacher">Teacher</option>
              </select>
            </div>

            <div className="mt-8 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111]">
                Choose item to borrow
              </h3>

              {inventoryError ? (
                <p className="mt-3 text-sm text-rose-600">{inventoryError}</p>
              ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <select
                    value={selectedTabId}
                    onChange={(event) => {
                      setSelectedTabId(event.target.value);
                      setSelectedSectionId("");
                      setInventoryItems([]);
                      setSelectedItemIds([]);
                      setFormError("");
                    }}
                    disabled={inventoryLoading}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  >
                    <option value="">{inventoryLoading ? "Loading inventory..." : "Select inventory tab"}</option>
                    {tabs.map((tab) => (
                      <option key={tab.id} value={tab.id}>
                        {tab.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={selectedSectionId}
                    onChange={(event) => {
                      setSelectedSectionId(event.target.value);
                      setFormError("");
                    }}
                    disabled={!selectedTabId}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  >
                    <option value="">Select section</option>
                    {sections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-4 rounded-lg border border-slate-200 bg-white">
                {!selectedSectionId ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Select an inventory tab and section to show items.
                  </p>
                ) : itemsLoading ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    Loading items...
                  </p>
                ) : itemsError ? (
                  <p className="px-4 py-8 text-center text-sm text-rose-600">{itemsError}</p>
                ) : inventoryItems.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">
                    No items found in this section.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {inventoryItems.map((item) => {
                      const itemId = String(item.id);
                      const checked = selectedItemIds.includes(itemId);
                      const details = getItemDetails(item);

                      return (
                        <label
                          key={item.id}
                          className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(itemId)}
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm font-medium text-slate-800">
                              {getItemLabel(item)}
                            </span>
                            <span className="block text-xs text-slate-400">
                              {selectedTab?.name} / {selectedSection?.name}
                            </span>
                            {details.length > 0 ? (
                              <span className="mt-2 flex flex-wrap gap-1.5">
                                {details.map((detail) => (
                                  <span
                                    key={`${item.id}-${detail.key}`}
                                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                                  >
                                    <span className="font-semibold text-slate-700">
                                      {detail.label}:
                                    </span>{" "}
                                    {detail.value}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-2">
                  Or Add Custom Item (Outside Inventory)
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Item name"
                    value={customItemForm.name}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, name: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={customItemForm.description}
                    onChange={(e) => setCustomItemForm({ ...customItemForm, description: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (customItemForm.name.trim()) {
                      const newItem = {
                        id: `custom-${Date.now()}`,
                        label: customItemForm.name.trim(),
                        details: customItemForm.description.trim() ? [{ key: "description", label: "Description", value: customItemForm.description.trim() }] : [],
                        inventoryItemId: null,
                        inventoryTabId: null,
                        inventorySectionId: null,
                        inventoryTableName: "",
                      };
                      setCustomItems([...customItems, newItem]);
                      setCustomItemForm({ name: "", description: "" });
                    }
                  }}
                  className="mt-2 px-4 py-1 bg-[#4a1111] text-white text-sm rounded hover:opacity-90"
                >
                  Add Custom Item
                </button>
              </div>

              {(selectedItems.length > 0 || customItems.length > 0) && (
                <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                  <h4 className="text-sm font-bold uppercase tracking-[0.18em] text-[#4a1111] mb-2">
                    Selected Items
                  </h4>
                  <div className="space-y-2">
                    {selectedItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span className="text-sm">{getItemLabel(item)}</span>
                        <button
                          type="button"
                          onClick={() => toggleItem(String(item.id))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {customItems.map((item) => (
                      <div key={item.id} className="flex justify-between items-center">
                        <span className="text-sm">{item.label}</span>
                        <button
                          type="button"
                          onClick={() => setCustomItems(customItems.filter((i) => i.id !== item.id))}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {formError ? <p className="mt-4 text-sm text-rose-600">{formError}</p> : null}

            <div className="mt-6 flex shrink-0 justify-end gap-4">
              <button
                type="button"
                onClick={closeBorrowModal}
                className="px-6 py-2 rounded-lg text-sm border border-[#4a1111] text-[#4a1111] hover:bg-[#4a1111] hover:text-white transition"
              >
                CANCEL
              </button>

              <button
                type="button"
                onClick={requestBorrowConfirmation}
                className="px-6 py-2 rounded-lg text-sm bg-[#4a1111] text-white hover:opacity-90 transition"
              >
                PROCEED
              </button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#4a1111]">Confirm borrowing</h3>
            <p className="mt-2 text-sm text-slate-600">
              Add this borrowing record for {form.name.trim()}?
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {[...selectedItems, ...customItems].map((item) => {
                const details = item.inventoryItemId ? getItemDetails(item) : item.details || [];

                return (
                  <li key={item.id} className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-800">{item.label || getItemLabel(item)}</span>
                    {details.length > 0 ? (
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {details.map((detail) => (
                          <span
                            key={`${item.id}-${detail.key}`}
                            className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600"
                          >
                            <span className="font-semibold text-slate-700">
                              {detail.label}:
                            </span>{" "}
                            {detail.value}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBorrow}
                disabled={savingBorrow}
                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {savingBorrow ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingReturn && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-[#4a1111]">Confirm return</h3>
            <p className="mt-2 text-sm text-slate-600">
              Mark borrowed items from {pendingReturn.name} as returned?
            </p>
            {pendingReturn.items?.length > 0 ? (
              <ul className="mt-4 space-y-2 text-sm">
                {pendingReturn.items.map((item) => (
                  <li key={`${pendingReturn.id}-${item.id}`} className="rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-800">{item.label}</span>
                    <span className="block text-xs text-slate-400">
                      {item.tab || inventoryNameLookup.tabNames[item.inventoryTabId] || "Inventory"} /{" "}
                      {item.section || inventoryNameLookup.sectionNames[item.inventorySectionId] || "Section"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelReturn}
                disabled={returningBorrow}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReturn}
                disabled={returningBorrow}
                className="rounded-lg bg-[#4a1111] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              >
                {returningBorrow ? "Returning..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-700">
              ✓
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Success</h3>
            <p className="mt-2 text-sm text-slate-500">{successMessage}</p>
            <button
              type="button"
              onClick={() => setSuccessMessage("")}
              className="mt-5 rounded-lg bg-[#4a1111] px-5 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
