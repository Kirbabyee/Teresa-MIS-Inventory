import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/api/supabaseClient";
import {
  transferInventoryItem,
  getTabTableConfig,
} from "@/lib/inventoryApi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * @typedef {Object} TransferDestination
 * @property {string} tabId     - Destination tab UUID
 * @property {string} tableName - Destination physical table name
 * @property {string} sectionId - Destination section UUID
 * @property {number} quantity  - Quantity to transfer
 */

/**
 * ItemTransferModal — moves a quantity of an item to a different inventory/section.
 *
 * @param {Object} props
 * @param {boolean} props.open              - Whether the modal is visible
 * @param {Function} props.onOpenChange     - Callback to toggle open state
 * @param {Object}   props.sourceItem       - The inventory row to transfer from
 * @param {string}   props.sourceTableName  - Physical table name of the source
 * @param {string}   props.sourceSectionId  - Section UUID of the source
 * @param {Object}   props.sourceTab        - Source tab object { id, name, slug, sections }
 * @param {Array}    props.allTabs          - Full catalog of tabs with sections
 * @param {string}   [props.quantityColumn='quantity'] - Name of the quantity column
 * @param {Function} props.onTransferred    - Callback after successful transfer
 */
export default function ItemTransferModal({
  open,
  onOpenChange,
  sourceItem,
  sourceTableName,
  sourceSectionId,
  sourceTab,
  allTabs,
  quantityColumn = "quantity",
  onTransferred,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Cascading dropdown state ──
  const [selectedTabId, setSelectedTabId] = useState("");
  const [selectedTableName, setSelectedTableName] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [transferQty, setTransferQty] = useState(1);

  // ── Resolved destination data (tab config fetched on selection) ──
  const [destTableConfig, setDestTableConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(false);

  // ── Available destinations ──
  const availableTabs = useMemo(() => {
    if (!Array.isArray(allTabs)) return [];
    return allTabs.filter((t) => t && t.id && t.sections && t.sections.length > 0);
  }, [allTabs]);

  const selectedTab = useMemo(
    () => availableTabs.find((t) => t.id === selectedTabId) || null,
    [availableTabs, selectedTabId]
  );

  const availableSections = useMemo(() => {
    if (!selectedTab?.sections) return [];
    return selectedTab.sections;
  }, [selectedTab]);

  // Max transferable quantity
  const maxQty = useMemo(() => {
    if (!sourceItem) return 0;
    return Math.max(0, Math.floor(Number(sourceItem[quantityColumn]) || 0));
  }, [sourceItem, quantityColumn]);

  // Whether user is trying to transfer to the same location
  const isSameLocation = useMemo(() => {
    if (!sourceTab || !selectedTabId) return false;
    const sameTable = sourceTableName === selectedTableName;
    const sameSection = sameTable && sourceSectionId === selectedSectionId;
    return sameSection;
  }, [sourceTab, sourceTableName, sourceSectionId, selectedTabId, selectedTableName, selectedSectionId]);

  // ── When tab changes, resolve its tableName and reset downstream ──
  useEffect(() => {
    if (!selectedTabId) {
      setSelectedTableName("");
      setSelectedSectionId("");
      setDestTableConfig(null);
      return;
    }

    let cancelled = false;
    const resolveConfig = async () => {
      setConfigLoading(true);
      setSelectedTableName("");
      setSelectedSectionId("");
      setDestTableConfig(null);

      try {
        const config = await getTabTableConfig(selectedTabId);
        if (!cancelled) {
          setDestTableConfig(config);
          setSelectedTableName(config?.tableName || "");

          // Auto-select section if only one
          const tab = availableTabs.find((t) => t.id === selectedTabId);
          if (tab?.sections?.length === 1) {
            setSelectedSectionId(tab.sections[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setDestTableConfig(null);
          setSelectedTableName("");
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    };

    resolveConfig();
    return () => { cancelled = true; };
  }, [selectedTabId, availableTabs]);

  // ── Reset form when modal opens ──
  useEffect(() => {
    if (!open) return;
    setSelectedTabId("");
    setSelectedTableName("");
    setSelectedSectionId("");
    setTransferQty(1);
    setError("");
    setDestTableConfig(null);
    setSaving(false);
  }, [open, sourceItem?.id]);

  // ── Clamp quantity when maxQty changes ──
  useEffect(() => {
    if (transferQty > maxQty && maxQty > 0) {
      setTransferQty(maxQty);
    }
  }, [maxQty, transferQty]);

  const canSubmit = useMemo(() => {
    return (
      !saving &&
      !configLoading &&
      selectedTabId &&
      selectedTableName &&
      selectedSectionId &&
      !isSameLocation &&
      transferQty >= 1 &&
      transferQty <= maxQty &&
      maxQty > 0
    );
  }, [saving, configLoading, selectedTabId, selectedTableName, selectedSectionId, isSameLocation, transferQty, maxQty]);

  const handleTransfer = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError("");

    try {
      const result = await transferInventoryItem({
        sourceItemId: sourceItem.id,
        sourceTable: sourceTableName,
        sourceSectionId,
        destTable: selectedTableName,
        destSectionId: selectedSectionId,
        transferQty,
        quantityColumn,
      });

      if (result.success) {
        toast.success(`Transferred ${transferQty} unit${transferQty > 1 ? "s" : ""} successfully.`);
        onOpenChange(false);
        onTransferred?.(result);
      } else {
        setError(result.error || "Transfer failed.");
      }
    } catch (err) {
      setError(err?.message || "An unexpected error occurred during transfer.");
    } finally {
      setSaving(false);
    }
  };

  const itemName = useMemo(() => {
    if (!sourceItem) return "";
    return sourceItem.name || sourceItem.type || sourceItem.description || `Item #${sourceItem.item_number || sourceItem.computer_number || ""}`;
  }, [sourceItem]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && saving) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden rounded-[28px] p-0">
        <DialogHeader className="border-b border-slate-200 bg-slate-50 px-6 py-5 sm:px-8">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <ArrowRightLeft className="h-5 w-5 text-[#4a1111]" />
            Transfer Item
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm">
            Move item quantity to a different inventory location.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 sm:px-8">
          {/* No item selected message */}
          {!sourceItem ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-12 text-center">
              <ArrowRightLeft className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No item selected</p>
              <p className="mt-1 text-xs text-slate-400">
                Enter edit mode and click the transfer button on a specific item row to transfer it.
              </p>
            </div>
          ) : (
          <>
          {/* Source summary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Source</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {itemName}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {sourceTab?.name || "Unknown"} &rsaquo; {sourceItem?.section_name || ""}
              <span className="ml-2 font-medium text-slate-700">
                Qty: {maxQty}
              </span>
            </p>
          </div>

          {/* Destination Inventory */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">
              Destination Inventory <span className="text-rose-500">*</span>
            </Label>
            <Select
              value={selectedTabId || ""}
              onValueChange={(val) => {
                setSelectedTabId(val);
                setError("");
              }}
              disabled={saving}
            >
              <SelectTrigger className="focus:ring-[#4a1111]">
                <SelectValue placeholder="Select inventory..." />
              </SelectTrigger>
              <SelectContent className="rounded-lg border border-slate-200 bg-white shadow-md">
                {availableTabs.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Destination Section (shown after inventory is selected) */}
          {selectedTabId && (
            <div
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: selectedTabId ? "200px" : "0px",
                opacity: selectedTabId ? 1 : 0,
              }}
            >
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-slate-700">
                  Destination Section <span className="text-rose-500">*</span>
                </Label>
                {configLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading sections...
                  </div>
                ) : availableSections.length === 0 ? (
                  <p className="text-sm text-slate-500">No sections available.</p>
                ) : availableSections.length === 1 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    {availableSections[0].name}
                    <span className="ml-2 text-xs text-slate-400">(auto-selected)</span>
                  </div>
                ) : (
                  <Select
                    value={selectedSectionId || ""}
                    onValueChange={(val) => {
                      setSelectedSectionId(val);
                      setError("");
                    }}
                    disabled={saving}
                  >
                    <SelectTrigger className="focus:ring-[#4a1111]">
                      <SelectValue placeholder="Select section..." />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border border-slate-200 bg-white shadow-md">
                      {availableSections.map((s) => (
                        <SelectItem
                          key={s.id}
                          value={s.id}
                          disabled={isSameLocation && sourceSectionId === s.id}
                        >
                          {s.name}
                          {sourceTableName === selectedTableName && sourceSectionId === s.id && (
                            <span className="ml-2 text-xs text-slate-400">(current)</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          {/* Quantity */}
          {maxQty > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Quantity to Transfer <span className="text-rose-500">*</span>
              </Label>
              <Input
                type="number"
                min={1}
                max={maxQty}
                value={transferQty}
                onChange={(event) => {
                  const raw = Math.floor(Number(event.target.value)) || 0;
                  const clamped = Math.max(1, Math.min(maxQty, raw));
                  setTransferQty(clamped);
                }}
                disabled={saving || maxQty <= 0}
                className={cn(
                  "focus-visible:ring-[#4a1111]",
                  transferQty > maxQty && "border-rose-400 bg-rose-50/50"
                )}
              />
              <p className="text-xs text-slate-500">
                {maxQty === 1
                  ? "Only 1 unit available"
                  : `Max: ${maxQty} unit${maxQty > 1 ? "s" : ""}`}
              </p>
            </div>
          )}

          {/* Same-location warning */}
          {isSameLocation && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Cannot transfer to the same section the item is already in.
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          </>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:space-x-2 sm:px-8">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="rounded-lg"
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleTransfer}
            disabled={!canSubmit}
            className="rounded-lg bg-[#4a1111] px-6 text-white hover:bg-[#3f0f0f] disabled:opacity-50"
          >
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Transferring...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Transfer
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
