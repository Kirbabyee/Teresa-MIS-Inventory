import { useEffect, useState } from "react";

const INVENTORY_STORAGE_KEY = "inventory_structure_v1";
const INVENTORY_EVENT = "inventory_structure_change";

const createId = (prefix) => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

export const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const makeUniqueSlug = (baseSlug, existingSlugs = [], currentSlug = "") => {
  const normalizedBase = slugify(baseSlug) || "item";
  const availableSlugs = new Set(existingSlugs.filter(Boolean).filter((slug) => slug !== currentSlug));

  if (!availableSlugs.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  let nextSlug = `${normalizedBase}-${suffix}`;

  while (availableSlugs.has(nextSlug)) {
    suffix += 1;
    nextSlug = `${normalizedBase}-${suffix}`;
  }

  return nextSlug;
};

const createItem = (item = {}) => ({
  id: item.id || createId("item"),
  name: item.name || "",
  assetTag: item.assetTag || "",
  quantity: Number(item.quantity ?? 1) || 1,
  condition: item.condition || "Good",
  location: item.location || "",
  notes: item.notes || "",
  filterSlug: item.filterSlug || "",
  createdAt: item.createdAt || new Date().toISOString(),
  updatedAt: item.updatedAt || new Date().toISOString(),
});

const createFilter = (filter = {}) => ({
  id: filter.id || createId("filter"),
  name: filter.name || "",
  slug: filter.slug || slugify(filter.name) || "filter",
  description: filter.description || "",
  items: Array.isArray(filter.items) ? filter.items.map((item) => createItem(item)) : [],
});

const createSection = (section = {}) => ({
  id: section.id || createId("section"),
  name: section.name || "",
  slug: section.slug || slugify(section.name) || "section",
  description: section.description || "",
  filters: Array.isArray(section.filters) ? section.filters.map((filter) => createFilter(filter)) : [],
});

export const DEFAULT_INVENTORY_STRUCTURE = [
  createSection({
    name: "Laboratory",
    slug: "laboratory",
    description: "Laboratory inventory and per-lab filters.",
    filters: [
      { name: "Laboratory 1", slug: "laboratory-1" },
      { name: "Laboratory 2", slug: "laboratory-2" },
      { name: "Laboratory 3", slug: "laboratory-3" },
      { name: "Laboratory 4", slug: "laboratory-4" },
      { name: "Laboratory 5", slug: "laboratory-5" },
    ],
  }),
];

const normalizeStructure = (structure) => {
  const safeStructure = Array.isArray(structure) ? structure : [];

  return safeStructure.map((section) => {
    const normalizedSection = createSection(section);
    const sectionSlug = normalizedSection.slug || slugify(normalizedSection.name) || "section";
    const sectionFilterSlugs = normalizedSection.filters.map((filter) => filter.slug);

    normalizedSection.slug = sectionSlug;
    normalizedSection.filters = normalizedSection.filters.map((filter, index) => ({
      ...filter,
      slug: makeUniqueSlug(filter.slug || filter.name || `filter-${index + 1}`, sectionFilterSlugs, filter.slug),
      items: filter.items.map((item) => createItem(item)),
    }));

    return normalizedSection;
  });
};

export const readInventoryStructure = () => {
  if (typeof window === "undefined") {
    return DEFAULT_INVENTORY_STRUCTURE;
  }

  const raw = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_INVENTORY_STRUCTURE;
  }

  try {
    return normalizeStructure(JSON.parse(raw));
  } catch {
    return DEFAULT_INVENTORY_STRUCTURE;
  }
};

export const saveInventoryStructure = (structure) => {
  const nextStructure = normalizeStructure(structure);

  if (typeof window !== "undefined") {
    window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(nextStructure));
    window.dispatchEvent(new Event(INVENTORY_EVENT));
  }

  return nextStructure;
};

export const subscribeToInventoryStructure = (onChange) => {
  if (typeof window === "undefined") {
    return () => {};
  }

  const notify = () => onChange();
  window.addEventListener(INVENTORY_EVENT, notify);
  window.addEventListener("storage", notify);

  return () => {
    window.removeEventListener(INVENTORY_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};

export const useInventoryStructure = () => {
  const [structure, setStructure] = useState(() => readInventoryStructure());

  useEffect(() => subscribeToInventoryStructure(() => setStructure(readInventoryStructure())), []);

  return structure;
};

export const getInventorySection = (structure, sectionSlug) =>
  (Array.isArray(structure) ? structure : []).find((section) => section.slug === sectionSlug) || null;

export const getInventoryFilter = (section, filterSlug) =>
  section?.filters?.find((filter) => filter.slug === filterSlug) || null;

export const createInventorySection = ({ name, slug, description = "" }) => ({
  id: createId("section"),
  name,
  slug: makeUniqueSlug(slug || name || "section", []),
  description,
  filters: [],
});

export const createInventoryFilter = ({ name, slug, description = "" }) => ({
  id: createId("filter"),
  name,
  slug: makeUniqueSlug(slug || name || "filter", []),
  description,
  items: [],
});

export const makeUniqueInventorySlug = makeUniqueSlug;
export const createInventoryItem = createItem;