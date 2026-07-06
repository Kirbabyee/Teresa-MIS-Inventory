import { supabase } from "@/api/supabaseClient";

const BORROWER_ALLOWLIST_TABLE = "borrower_allowlist";
const STORAGE_KEY = "borrower-allowlist";
const LEGACY_STORAGE_KEY = "student-directory-users";

const formatSchoolId = (value = "") => {
  const digitsOnly = String(value).replace(/\D/g, "").slice(0, 7);
  if (digitsOnly.length <= 2) return digitsOnly;
  return `${digitsOnly.slice(0, 2)}-${digitsOnly.slice(2)}`;
};

const normalizePosition = (value = "") => {
  const normalized = String(value).trim().toLowerCase();
  if (["faculty", "teacher", "staff"].includes(normalized)) return "faculty";
  return "student";
};

const normalizeYear = (value = "") => String(value).trim();
const normalizeSection = (value = "") => String(value).trim();
const normalizeBorrowerText = (value = "") => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const isValidUuid = (value = "") => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
};

export const normalizeUserRecord = (record = {}) => {
  const name = String(record?.name ?? record?.full_name ?? "").trim();
  const schoolId = formatSchoolId(record?.schoolId ?? record?.school_id ?? record?.schoolid ?? "");
  const position = normalizePosition(record?.position ?? record?.role ?? record?.type ?? "student");
  const year = normalizeYear(record?.year ?? record?.year_level ?? record?.grade ?? "");
  const section = normalizeSection(record?.section ?? record?.section_name ?? record?.class_section ?? "");
  const isActive = record?.isActive ?? record?.is_active;

  return {
    id: String(record?.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    name,
    schoolId,
    position,
    year,
    section,
    isActive: isActive === undefined || isActive === null ? true : Boolean(isActive),
  };
};

export const readStoredBorrowerUsers = () => {
  if (typeof window === "undefined") return [];

  try {
    const primaryRaw = window.localStorage.getItem(STORAGE_KEY);
    const fallbackRaw = primaryRaw ? null : window.localStorage.getItem(LEGACY_STORAGE_KEY);
    const raw = primaryRaw || fallbackRaw || "[]";
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeUserRecord).filter((user) => user.name || user.schoolId);
  } catch {
    return [];
  }
};

export const saveBorrowerUsersToStorage = (users = []) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
};

export const getBorrowerAllowlistFromDb = async (fallbackUsers = [], options = {}) => {
  const includeInactive = Boolean(options?.includeInactive);

  try {
    let query = supabase
      .from(BORROWER_ALLOWLIST_TABLE)
      .select("id, name, school_id, position, year, section, is_active")
      .order("created_at", { ascending: false });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;

    if (error) throw error;

    const normalized = (data || [])
      .map((row) => normalizeUserRecord({ ...row, schoolId: row.school_id, school_id: row.school_id }))
      .filter((user) => user.name || user.schoolId);

    if (normalized.length > 0) {
      return normalized;
    }

    return Array.isArray(fallbackUsers) && fallbackUsers.length > 0 ? fallbackUsers : [];
  } catch (error) {
    console.error("Failed to load borrower allowlist from Supabase", error);
    return Array.isArray(fallbackUsers) && fallbackUsers.length > 0 ? fallbackUsers : [];
  }
};

export const upsertBorrowerUsersToDb = async (users = []) => {
  const rows = (users || [])
    .map((user) => {
      const row = {
        name: user.name,
        school_id: user.schoolId,
        position: user.position,
        year: user.year,
        section: user.section,
        is_active: user.isActive ?? user.is_active ?? true,
      };

      if (isValidUuid(user.id)) {
        row.id = user.id;
      }

      return row;
    })
    .filter((row) => row.name || row.school_id);

  if (!rows.length) return [];

  try {
    const { error } = await supabase
      .from(BORROWER_ALLOWLIST_TABLE)
      .upsert(rows, { onConflict: "school_id" });

    if (error) throw error;
    return rows;
  } catch (error) {
    console.error("Failed to sync borrower allowlist to Supabase", error);
    throw error;
  }
};

export const deleteBorrowerUserFromDb = async (schoolId = "") => {
  if (!schoolId) return;

  try {
    const { error } = await supabase.from(BORROWER_ALLOWLIST_TABLE).delete().eq("school_id", schoolId);
    if (error) throw error;
  } catch (error) {
    console.error("Failed to delete borrower from Supabase", error);
    throw error;
  }
};

export const updateBorrowerUserInDb = async (user = {}) => {
  if (!user?.id) return;

  const row = {
    name: user.name,
    school_id: user.schoolId,
    position: user.position,
    year: user.year,
    section: user.section,
    is_active: user.isActive ?? user.is_active ?? true,
  };

  try {
    const { error } = await supabase
      .from(BORROWER_ALLOWLIST_TABLE)
      .update(row)
      .eq("id", user.id);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to update borrower in Supabase", error);
    throw error;
  }
};

export const setBorrowerUserActiveInDb = async (schoolId = "", isActive = true) => {
  if (!schoolId) return;

  try {
    const { error } = await supabase
      .from(BORROWER_ALLOWLIST_TABLE)
      .update({ is_active: Boolean(isActive) })
      .eq("school_id", schoolId);

    if (error) throw error;
  } catch (error) {
    console.error("Failed to update borrower active state in Supabase", error);
    throw error;
  }
};

export { normalizeBorrowerText };
