import { useState, useEffect, useMemo } from "react";
import { useInventoryCatalog } from "@/lib/inventoryApi";
import { fetchInventoryItems, getTabTableConfig } from "@/lib/inventoryApi";

// ══════════════════════════════════════════════════════════════════════════════
// useInventoryItems — fetches all inventory items across all tabs/sections
// and provides filtering by tab, section, and free-text search.
// ══════════════════════════════════════════════════════════════════════════════

export const useInventoryItems = () => {
  const { tabs, loading: catalogLoading } = useInventoryCatalog();
  const [allItems, setAllItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [filterTabId, setFilterTabId] = useState("");
  const [filterSectionId, setFilterSectionId] = useState("");
  const [search, setSearch] = useState("");
  const [tabTableNames, setTabTableNames] = useState({});

  // Resolve table names for each tab (from inventory_settings)
  useEffect(() => {
    if (catalogLoading || tabs.length === 0) return;

    let cancelled = false;

    const loadTableNames = async () => {
      const results = await Promise.all(
        tabs.map(async (tab) => {
          try {
            const config = await getTabTableConfig(tab.id);
            return { tabId: tab.id, tableName: config?.tableName || null };
          } catch {
            return { tabId: tab.id, tableName: null };
          }
        })
      );

      if (!cancelled) {
        const names = {};
        for (const r of results) names[r.tabId] = r.tableName;
        setTabTableNames(names);
      }
    };

    loadTableNames();
    return () => { cancelled = true; };
  }, [catalogLoading, tabs]);

  // Fetch all items when tabs + table names are ready
  useEffect(() => {
    if (catalogLoading || tabs.length === 0 || Object.keys(tabTableNames).length === 0) return;

    let cancelled = false;
    setItemsLoading(true);

    const loadAll = async () => {
      try {
        const queries = [];
        tabs.forEach((tab) => {
          const tableName = tabTableNames[tab.id] || null;
          (tab.sections || []).forEach((section) => {
            queries.push(
              fetchInventoryItems(section.id, tableName).then((items) =>
                (items || []).map((item) => ({
                  ...item,
                  tabId: tab.id,
                  tabName: tab.name,
                  sectionId: section.id,
                  sectionName: section.name,
                  tableName: tableName || "",
                }))
              )
            );
          });
        });

        const results = await Promise.allSettled(queries);
        const flat = [];
        results.forEach((r) => {
          if (r.status === "fulfilled") flat.push(...r.value);
        });

        if (!cancelled) setAllItems(flat);
      } catch {
        if (!cancelled) setAllItems([]);
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [catalogLoading, tabs, tabTableNames]);

  // Derived: sections for the selected tab
  const filterSections = useMemo(() => {
    if (!filterTabId) return [];
    const tab = tabs.find((t) => String(t.id) === String(filterTabId));
    return tab?.sections || [];
  }, [tabs, filterTabId]);

  // Derived: filtered items
  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase().trim();
    return allItems.filter((item) => {
      if (filterTabId && String(item.tabId) !== String(filterTabId)) return false;
      if (filterSectionId && String(item.sectionId) !== String(filterSectionId)) return false;
      if (searchLower) {
        const haystack = [
          item.type || "",
          item.brand || "",
          item.description || "",
          item.computer_number || "",
          item.computerNumber || "",
          item.name || "",
          item.item_name || "",
          item.asset_name || "",
          item.tabName || "",
          item.sectionName || "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });
  }, [allItems, filterTabId, filterSectionId, search]);

  return {
    tabs,
    allItems,
    filteredItems,
    loading: catalogLoading || itemsLoading,
    filterTabId,
    setFilterTabId,
    filterSectionId,
    setFilterSectionId,
    filterSections,
    search,
    setSearch,
  };
};
