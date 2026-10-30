"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import {
  addManualGroceryItem,
  deleteGroceryItem,
  regenerateGroceryFromCalendar,
  toggleGroceryCostco,
  toggleGroceryItem,
  updateGroceryItemSection,
} from "@meals/actions/grocery";
import { Button } from "@meals/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@meals/components/ui/dialog";
import { Input } from "@meals/components/ui/input";
import { Label } from "@meals/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@meals/components/ui/select";
import { GroceryRecipeEditDialog } from "@meals/components/grocery/grocery-recipe-edit-dialog";
import { formatGroceryItemName } from "@meals/lib/grocery/consolidate";
import {
  recipeEditTargets,
  sourceNoteCoveredByLinks,
  type GroceryRecipeLink,
} from "@meals/lib/grocery/recipe-links";
import {
  isPackagingSurplusNote,
  packGroceryItemForStore,
} from "@meals/lib/grocery/packaging";
import {
  GROCERY_SECTIONS,
  inferGrocerySection,
  resolveGrocerySection,
  type GrocerySectionId,
} from "@meals/lib/grocery/sections";
import { formatQuantity } from "@meals/lib/recipes/display";
import type { GroceryItem } from "@meals/types/database";
import { cn } from "@meals/lib/utils";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";

type ListTab = "all" | "other" | "costco";

/** Hold checked items in place so the check animation plays before Done. */
const CHECK_SETTLE_MS = 380;
const UNCHECK_ENTER_MS = 320;
export type GroceryListOption = {
  id: string;
  status: string;
  generatedAt: string;
};

function listLabel(list: GroceryListOption) {
  const date = format(parseISO(list.generatedAt), "MMM d, yyyy");
  if (list.status === "active") return `${date} · Current`;
  return date;
}

export function GroceryListClient({
  listId,
  weeklyPlanId = null,
  items: initialItems,
  recipeLinks = {},
  lists = [],
}: {
  listId: string;
  weeklyPlanId?: string | null;
  items: GroceryItem[];
  recipeLinks?: Record<string, GroceryRecipeLink[]>;
  lists?: GroceryListOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
  /** Checked but still shown in Need while the check animation plays. */
  const [settlingOutIds, setSettlingOutIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Just moved back into Need after uncheck. */
  const [settlingInIds, setSettlingInIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** Just arrived in Done after the check settle. */
  const [arrivingDoneIds, setArrivingDoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const settleTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [adding, setAdding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemSection, setNewItemSection] = useState<GrocerySectionId>("other");
  const [newItemSectionManual, setNewItemSectionManual] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [listTab, setListTab] = useState<ListTab>("all");
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [syncState, setSyncState] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const chromeRef = useRef<HTMLDivElement>(null);
  const [chromeBottom, setChromeBottom] = useState(0);
  const currentList = lists.find((l) => l.id === listId) ?? null;
  const showListPicker = lists.length > 1;
  const filtersActive = listTab !== "all" || uncheckedOnly;

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const timers = settleTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const el = chromeRef.current;
    if (!el) return;
    const update = () => setChromeBottom(el.getBoundingClientRect().bottom);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [filtersOpen, showListPicker]);

  const costcoItems = useMemo(
    () => items.filter((i) => i.costco_bulk_candidate),
    [items],
  );
  const otherItems = useMemo(
    () => items.filter((i) => !i.costco_bulk_candidate),
    [items],
  );
  const activeItems =
    listTab === "costco"
      ? costcoItems
      : listTab === "other"
        ? otherItems
        : items;

  const remainingCount = activeItems.filter((i) => !i.is_checked).length;
  const checkedCount = activeItems.length - remainingCount;

  const groups = useMemo(() => {
    const map = new Map<string, { need: GroceryItem[]; done: GroceryItem[] }>();
    for (const item of activeItems) {
      if (uncheckedOnly && item.is_checked && !settlingOutIds.has(item.id)) {
        continue;
      }
      const key = resolveGrocerySection(item.section, item.name);
      const bucket = map.get(key) ?? { need: [], done: [] };
      // Keep just-checked rows in Need until the settle animation finishes.
      if (item.is_checked && !settlingOutIds.has(item.id)) {
        bucket.done.push(item);
      } else {
        bucket.need.push(item);
      }
      map.set(key, bucket);
    }
    const order = new Map<string, number>(
      GROCERY_SECTIONS.map((s, i) => [s.id, i]),
    );
    return [...map.entries()].sort((a, b) => {
      const ai = order.get(a[0]) ?? 999;
      const bi = order.get(b[0]) ?? 999;
      return ai - bi || a[0].localeCompare(b[0]);
    });
  }, [activeItems, uncheckedOnly, settlingOutIds]);

  function markPending(id: string, on: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function patchLocal(id: string, patch: Partial<GroceryItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function clearSettleTimer(id: string) {
    for (const key of [id, `${id}:arrive`]) {
      const existing = settleTimers.current.get(key);
      if (existing) {
        clearTimeout(existing);
        settleTimers.current.delete(key);
      }
    }
  }

  function toggleChecked(item: GroceryItem) {
    const next = !item.is_checked;
    clearSettleTimer(item.id);

    // Instant optimistic check — do not wait for the server action.
    patchLocal(item.id, { is_checked: next });
    markPending(item.id, true);
    setSyncState("saving");

    if (next) {
      // Play check animation in Need, then ease into Done.
      setSettlingInIds((prev) => {
        if (!prev.has(item.id)) return prev;
        const n = new Set(prev);
        n.delete(item.id);
        return n;
      });
      setArrivingDoneIds((prev) => {
        if (!prev.has(item.id)) return prev;
        const n = new Set(prev);
        n.delete(item.id);
        return n;
      });
      setSettlingOutIds((prev) => new Set(prev).add(item.id));
      const timer = setTimeout(() => {
        setSettlingOutIds((prev) => {
          if (!prev.has(item.id)) return prev;
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        setArrivingDoneIds((prev) => new Set(prev).add(item.id));
        const arriveTimer = setTimeout(() => {
          setArrivingDoneIds((prev) => {
            if (!prev.has(item.id)) return prev;
            const n = new Set(prev);
            n.delete(item.id);
            return n;
          });
          settleTimers.current.delete(`${item.id}:arrive`);
        }, UNCHECK_ENTER_MS);
        settleTimers.current.set(`${item.id}:arrive`, arriveTimer);
        settleTimers.current.delete(item.id);
      }, CHECK_SETTLE_MS);
      settleTimers.current.set(item.id, timer);
    } else {
      setSettlingOutIds((prev) => {
        if (!prev.has(item.id)) return prev;
        const n = new Set(prev);
        n.delete(item.id);
        return n;
      });
      setArrivingDoneIds((prev) => {
        if (!prev.has(item.id)) return prev;
        const n = new Set(prev);
        n.delete(item.id);
        return n;
      });
      setSettlingInIds((prev) => new Set(prev).add(item.id));
      const timer = setTimeout(() => {
        setSettlingInIds((prev) => {
          if (!prev.has(item.id)) return prev;
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        settleTimers.current.delete(item.id);
      }, UNCHECK_ENTER_MS);
      settleTimers.current.set(item.id, timer);
    }

    void toggleGroceryItem(item.id, next).then((r) => {
      markPending(item.id, false);
      if (r.error) {
        clearSettleTimer(item.id);
        setSettlingOutIds((prev) => {
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        setSettlingInIds((prev) => {
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        setArrivingDoneIds((prev) => {
          const n = new Set(prev);
          n.delete(item.id);
          return n;
        });
        patchLocal(item.id, { is_checked: !next });
        setSyncState("error");
        toast.error(r.error);
      } else {
        setSyncState("saved");
      }
    });
  }

  function toggleCostco(item: GroceryItem) {
    const next = !item.costco_bulk_candidate;
    const packed = packGroceryItemForStore(
      {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      },
      next ? "costco" : "grocery",
    );
    const previous = {
      costco_bulk_candidate: item.costco_bulk_candidate,
      preferred_store: item.preferred_store,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes,
    };
    patchLocal(item.id, {
      costco_bulk_candidate: next,
      preferred_store: next ? "costco" : "any",
      quantity: packed.quantity,
      unit: packed.unit,
      notes: packed.notes,
    });
    markPending(item.id, true);
    setSyncState("saving");

    void toggleGroceryCostco(item.id, next).then((r) => {
      markPending(item.id, false);
      if (r.error) {
        patchLocal(item.id, previous);
        setSyncState("error");
        toast.error(r.error);
      } else {
        if ("item" in r && r.item) {
          patchLocal(item.id, r.item);
        }
        setSyncState("saved");
      }
    });
  }

  function removeItem(item: GroceryItem) {
    const snapshot = item;
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    markPending(item.id, true);
    setSyncState("saving");

    void deleteGroceryItem(item.id).then((r) => {
      markPending(item.id, false);
      if (r.error) {
        setItems((prev) =>
          [...prev, snapshot].sort((a, b) => a.sort_order - b.sort_order),
        );
        setSyncState("error");
        toast.error(r.error);
      } else {
        setSyncState("saved");
      }
    });
  }

  function changeSection(item: GroceryItem, section: string) {
    if (!section || section === item.section) return;
    const previous = item.section;
    patchLocal(item.id, { section, is_user_edited: true });
    markPending(item.id, true);
    setSyncState("saving");

    void updateGroceryItemSection(item.id, section).then((r) => {
      markPending(item.id, false);
      if (r.error) {
        patchLocal(item.id, { section: previous });
        setSyncState("error");
        toast.error(r.error);
      } else {
        setSyncState("saved");
      }
    });
  }

  function confirmRegenerate() {
    if (regenerating || !weeklyPlanId) return;
    setRegenerating(true);
    setSyncState("saving");
    void regenerateGroceryFromCalendar(listId).then((r) => {
      setRegenerating(false);
      if (r.error || !("success" in r) || !r.success) {
        setSyncState("error");
        toast.error(r.error ?? "Could not regenerate list");
        return;
      }
      setRegenerateOpen(false);
      setSyncState("saved");
      toast.success("Grocery list rebuilt from your meal calendar");
      router.refresh();
    });
  }

  function submitNewItem(event?: FormEvent) {
    event?.preventDefault();
    const name = newItemName.trim();
    if (!name || adding) return;
    setAdding(true);
    setSyncState("saving");
    void addManualGroceryItem({
      listId,
      name,
      section: newItemSection,
      sectionUserEdited: newItemSectionManual,
    }).then((r) => {
      setAdding(false);
      if (r.error || !("item" in r) || !r.item) {
        setSyncState("error");
        toast.error(r.error ?? "Could not add item");
        return;
      }
      setItems((prev) => [...prev, r.item as GroceryItem]);
      setNewItemName("");
      setNewItemSection("other");
      setNewItemSectionManual(false);
      setAddOpen(false);
      setSyncState("saved");
    });
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-3">
      <div
        ref={chromeRef}
        className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 -mx-3 space-y-2 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur min-[400px]:-mx-4 min-[400px]:px-4 md:static md:top-auto md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <p className="font-display text-lg font-semibold tracking-tight min-[400px]:text-xl md:text-2xl">
              Grocery
            </p>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground min-[400px]:text-sm">
              {remainingCount === 0 && activeItems.length > 0 ? (
                <span className="font-medium text-success">All done</span>
              ) : (
                <>
                  <span className="font-medium text-foreground">
                    {remainingCount}
                  </span>{" "}
                  left
                  {checkedCount > 0 ? (
                    <span className="ml-1.5 text-muted-foreground/80">
                      · {checkedCount} done
                    </span>
                  ) : null}
                </>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                "size-2 rounded-full",
                syncState === "saved" && "bg-success",
                syncState === "saving" && "animate-pulse bg-muted-foreground",
                syncState === "error" && "bg-destructive",
              )}
              title={
                syncState === "saved"
                  ? "Synced"
                  : syncState === "saving"
                    ? "Saving…"
                    : "Sync error"
              }
              aria-label={
                syncState === "saved"
                  ? "Synced"
                  : syncState === "saving"
                    ? "Saving"
                    : "Sync error"
              }
            />
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors md:hidden",
                filtersOpen || filtersActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
              aria-expanded={filtersOpen}
              aria-controls="grocery-filters"
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
              {filtersActive && !filtersOpen ? (
                <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">
                  {listTab === "costco"
                    ? "Costco"
                    : listTab === "other"
                      ? "Other"
                      : "On"}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/80 bg-card text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <Plus className="size-4" />
            Add item
          </button>
          {weeklyPlanId ? (
            <button
              type="button"
              onClick={() => setRegenerateOpen(true)}
              disabled={regenerating}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-card px-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground disabled:opacity-60"
              title="Rebuild from meal calendar"
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              <span className="hidden min-[400px]:inline">Sync week</span>
            </button>
          ) : null}
        </div>

        <div
          id="grocery-filters"
          className={cn("space-y-2", !filtersOpen && "max-md:hidden")}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] leading-snug text-muted-foreground">
              Pack sizes are typical store amounts. Check the fridge before you
              shop.
            </p>
            <button
              type="button"
              onClick={() => setUncheckedOnly((v) => !v)}
              className={cn(
                "shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition-colors",
                uncheckedOnly
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
              aria-pressed={uncheckedOnly}
            >
              {uncheckedOnly ? "Show done" : "Hide done"}
            </button>
          </div>

          {showListPicker ? (
            <Select
              value={listId}
              onValueChange={(nextId) => {
                if (nextId && nextId !== listId) {
                  router.push(`/tools/meals/grocery/${nextId}`);
                }
              }}
            >
              <SelectTrigger
                aria-label="Choose grocery list"
                className="min-h-10 border-border/80 bg-card"
              >
                <SelectValue placeholder="Choose a list" />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {listLabel(list)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : currentList ? (
            <p className="text-xs text-muted-foreground">
              {listLabel(currentList)}
            </p>
          ) : null}

          <div className="flex rounded-lg border border-border bg-card p-0.5">
            <button
              type="button"
              className={cn(
                "min-h-9 flex-1 rounded-md px-1 text-sm font-medium transition-colors",
                listTab === "all"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setListTab("all")}
            >
              All
              <span className="ml-1 tabular-nums opacity-80">
                ({items.length})
              </span>
            </button>
            <button
              type="button"
              className={cn(
                "min-h-9 flex-1 rounded-md px-1 text-sm font-medium transition-colors",
                listTab === "other"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => setListTab("other")}
            >
              Other
              <span className="ml-1 tabular-nums opacity-80">
                ({otherItems.length})
              </span>
            </button>
            <button
              type="button"
              className={cn(
                "min-h-9 flex-1 rounded-md px-1 text-sm font-black uppercase tracking-wide transition-colors",
                listTab === "costco"
                  ? "bg-[#005daa] text-white shadow-sm shadow-[#005daa]/25"
                  : "text-muted-foreground hover:bg-[#005daa]/8 hover:text-[#005daa]",
              )}
              onClick={() => setListTab("costco")}
            >
              Costco
              <span className="ml-1 font-semibold normal-case tracking-normal tabular-nums opacity-80">
                ({costcoItems.length})
              </span>
            </button>
          </div>
        </div>
      </div>

      <Dialog
        open={regenerateOpen}
        onOpenChange={(open) => {
          if (!open && !regenerating) setRegenerateOpen(false);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rebuild from meal calendar?</DialogTitle>
            <DialogDescription>
              Ingredients are recalculated from the meals on your week board.
              Items you added manually stay. Deleted items, aisle changes, Costco
              picks, and checkmarks on generated items reset.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={regenerating}
              onClick={() => setRegenerateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-1.5"
              disabled={regenerating}
              onClick={confirmRegenerate}
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Rebuild list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) {
            setNewItemName("");
            setNewItemSection("other");
            setNewItemSectionManual(false);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add item</DialogTitle>
            <DialogDescription>
              Something extra that isn’t on the generated list.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submitNewItem}>
            <div className="space-y-2">
              <Label htmlFor="grocery-add-name">Item</Label>
              <Input
                id="grocery-add-name"
                value={newItemName}
                onChange={(e) => {
                  const name = e.target.value;
                  setNewItemName(name);
                  if (!newItemSectionManual) {
                    setNewItemSection(
                      inferGrocerySection(name) as GrocerySectionId,
                    );
                  }
                }}
                placeholder="e.g. paper towels"
                autoComplete="off"
                autoFocus
                disabled={adding}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grocery-add-section">Section</Label>
              <Select
                value={newItemSection}
                onValueChange={(value) => {
                  setNewItemSection(value as GrocerySectionId);
                  setNewItemSectionManual(true);
                }}
                disabled={adding}
              >
                <SelectTrigger
                  id="grocery-add-section"
                  className="min-h-10 border-border/80 bg-card"
                >
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent>
                  {GROCERY_SECTIONS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
                disabled={adding}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="gap-1.5"
                disabled={adding || !newItemName.trim()}
              >
                {adding ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {groups.length === 0 ? (
        <div className="space-y-3 rounded-xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">
          <p>
            {listTab === "costco"
              ? "Nothing marked maybe Costco yet. Tap Costco on any item in All."
              : listTab === "other" &&
                  costcoItems.length > 0 &&
                  otherItems.length === 0
                ? "Everything is on the Costco list. Switch to Costco or All."
                : uncheckedOnly && checkedCount > 0
                  ? "Nothing left to buy. Tap “Show done” to see checked-off items."
                  : items.length === 0 && weeklyPlanId
                    ? "Your list is empty. Rebuild it from the meals on your week board."
                    : "Nothing to show with the current filters."}
          </p>
          {items.length === 0 && weeklyPlanId && listTab === "all" ? (
            <Button
              type="button"
              variant="outline"
              className="gap-1.5"
              disabled={regenerating}
              onClick={() => setRegenerateOpen(true)}
            >
              {regenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Rebuild from calendar
            </Button>
          ) : null}
        </div>
      ) : null}

      {groups.map(([group, { need, done }]) => {
        const sectionLabel =
          GROCERY_SECTIONS.find((s) => s.id === group)?.label ?? group;
        return (
          <section key={group} className="space-y-1.5">
            <div
              className="sticky z-[1] -mx-1 flex items-baseline justify-between gap-2 bg-background/95 px-1 py-1 backdrop-blur md:static md:top-auto md:mx-0 md:bg-transparent md:px-0 md:backdrop-blur-none"
              style={
                chromeBottom
                  ? { top: chromeBottom }
                  : { top: "calc(7.5rem + env(safe-area-inset-top))" }
              }
            >
              <h2 className="font-display text-base font-semibold md:text-lg">
                {sectionLabel}
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {need.length === 0 && done.length > 0
                  ? "Done"
                  : `${need.length} left`}
              </span>
            </div>

            {need.length > 0 ? (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card">
                {need.map((item) => (
                  <GroceryRow
                    key={item.id}
                    item={item}
                    busy={pendingIds.has(item.id)}
                    settlePhase={
                      settlingOutIds.has(item.id)
                        ? "checking"
                        : settlingInIds.has(item.id)
                          ? "entering"
                          : null
                    }
                    onToggleChecked={() => toggleChecked(item)}
                    onToggleCostco={() => toggleCostco(item)}
                    onChangeSection={(section) => changeSection(item, section)}
                    onDelete={() => removeItem(item)}
                    recipeLinks={recipeLinks[item.id] ?? []}
                    onEditRecipe={setEditingRecipeId}
                  />
                ))}
              </ul>
            ) : null}

            {done.length > 0 ? (
              <div className="space-y-1">
                <p className="flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <Check className="size-3 text-success" strokeWidth={3} />
                  Done
                  <span className="font-normal normal-case tracking-normal tabular-nums">
                    ({done.length})
                  </span>
                </p>
                <ul className="divide-y divide-border/50 overflow-hidden rounded-xl border border-dashed border-border/70 bg-muted/30">
                  {done.map((item) => (
                    <GroceryRow
                      key={item.id}
                      item={item}
                      busy={pendingIds.has(item.id)}
                      settlePhase={
                        arrivingDoneIds.has(item.id) ? "in-done" : null
                      }
                      onToggleChecked={() => toggleChecked(item)}
                      onToggleCostco={() => toggleCostco(item)}
                      onChangeSection={(section) => changeSection(item, section)}
                      onDelete={() => removeItem(item)}
                      recipeLinks={recipeLinks[item.id] ?? []}
                      onEditRecipe={setEditingRecipeId}
                    />
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
      <GroceryRecipeEditDialog
        recipeId={editingRecipeId}
        onClose={() => setEditingRecipeId(null)}
      />
    </div>
  );
}


function GroceryRow({
  item,
  busy,
  settlePhase,
  onToggleChecked,
  onToggleCostco,
  onChangeSection,
  onDelete,
  recipeLinks,
  onEditRecipe,
}: {
  item: GroceryItem;
  busy: boolean;
  settlePhase: "checking" | "entering" | "in-done" | null;
  onToggleChecked: () => void;
  onToggleCostco: () => void;
  onChangeSection: (section: string) => void;
  onDelete: () => void;
  recipeLinks: GroceryRecipeLink[];
  onEditRecipe: (recipeId: string) => void;
}) {
  const qtyNum =
    item.quantity == null || item.quantity === undefined
      ? null
      : Number(item.quantity);
  const qty = formatQuantity(
    qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : null,
    item.unit,
  );
  const label = formatGroceryItemName(item.name);
  const checked = item.is_checked;
  const justChecked = settlePhase === "checking";
  const isCostco = item.costco_bulk_candidate;
  const surplusNote = isPackagingSurplusNote(item.notes);
  const editTargets = recipeEditTargets(recipeLinks);
  const showNotes =
    Boolean(item.notes) && !sourceNoteCoveredByLinks(item.notes, recipeLinks);
  const section =
    resolveGrocerySection(item.section, item.name) || item.section || "other";

  return (
    <li
      className={cn(
        settlePhase === "entering" && "grocery-row--settling-in",
        settlePhase === "in-done" && "grocery-row--settling-in",
      )}
    >
      <div
        className={cn(
          "space-y-1.5 px-2.5 py-1.5 transition-[opacity,background-color] duration-300 ease-out",
          isCostco &&
            "border-l-[3px] border-l-[#e31837] bg-gradient-to-r from-[#005daa]/[0.09] via-[#005daa]/[0.04] to-transparent",
          checked && !justChecked && "opacity-60",
          justChecked && "grocery-row--just-checked",
          busy && !isCostco && !justChecked && "bg-muted/30",
        )}
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleChecked}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-0.5 text-left transition-transform duration-150 active:scale-[0.985]"
            aria-pressed={checked}
            aria-busy={busy}
            aria-label={
              checked ? `Mark ${label} as still needed` : `Mark ${label} done`
            }
          >
            <span
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out",
                checked
                  ? "border-success bg-success text-primary-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--success)_18%,transparent)]"
                  : "border-foreground/35 bg-background text-transparent shadow-none",
                justChecked && "grocery-check-ring--just-checked",
              )}
              aria-hidden
            >
              <Check
                className={cn(
                  "size-3.5 transition-[opacity,transform] duration-200 ease-out",
                  checked ? "opacity-100 scale-100" : "opacity-0 scale-50",
                  justChecked && "grocery-check-mark--just-checked",
                )}
                strokeWidth={3}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "block truncate text-[15px] font-medium leading-tight transition-[color,opacity] duration-300 ease-out",
                  checked &&
                    "text-muted-foreground line-through decoration-muted-foreground/60",
                )}
              >
                {label}
                {item.is_manual ? (
                  <span className="ml-1.5 text-[10px] font-normal uppercase tracking-wide text-muted-foreground no-underline">
                    manual
                  </span>
                ) : null}
              </span>
              {showNotes ? (
                <span
                  className={cn(
                    "mt-0.5 block text-xs leading-snug transition-opacity duration-300",
                    surplusNote
                      ? "text-amber-800 dark:text-amber-200"
                      : "truncate text-muted-foreground",
                    checked &&
                      "line-through decoration-muted-foreground/50",
                  )}
                >
                  {item.notes}
                </span>
              ) : null}
            </span>
            {qty ? (
              <span
                className={cn(
                  "shrink-0 text-sm tabular-nums text-muted-foreground transition-opacity duration-300",
                  checked && "line-through decoration-muted-foreground/50",
                )}
              >
                {qty}
              </span>
            ) : null}
          </button>

          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            disabled={busy}
            aria-label={`Delete ${label}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {editTargets.length > 0 ? (
          <div className="flex flex-wrap gap-1 pl-9">
            {editTargets.map((target) => (
              <button
                key={target.recipeId}
                type="button"
                disabled={busy}
                onClick={() => onEditRecipe(target.recipeId)}
                className={cn(
                  "inline-flex min-h-10 max-w-full items-center gap-1 rounded-md px-1.5 text-left text-xs font-medium text-primary hover:bg-primary/10",
                  checked && "text-muted-foreground",
                )}
                aria-label={`Edit ${target.label} recipe`}
              >
                <Pencil className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{target.label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-2 pl-9">
          <label className="sr-only" htmlFor={`section-${item.id}`}>
            Aisle for {label}
          </label>
          <select
            id={`section-${item.id}`}
            value={section}
            disabled={busy}
            onChange={(e) => onChangeSection(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="min-h-8 min-w-0 flex-1 rounded-lg border border-border/80 bg-background px-2 text-xs text-foreground"
          >
            {GROCERY_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={onToggleCostco}
            className={cn(
              "min-h-8 shrink-0 rounded-sm px-2 text-[10px] font-black uppercase tracking-[0.08em] transition-colors",
              isCostco
                ? "bg-[#e31837] text-white shadow-sm shadow-[#e31837]/30 ring-1 ring-[#005daa]/40"
                : "border border-dashed border-[#005daa]/45 bg-[#005daa]/[0.06] text-[#005daa] hover:border-[#005daa] hover:bg-[#005daa]/12",
              busy && "opacity-60",
            )}
            aria-pressed={isCostco}
            aria-label={
              isCostco
                ? `Remove ${label} from Costco list`
                : `Add ${label} to Costco list`
            }
            title={
              isCostco
                ? "On Costco list — tap to remove"
                : "Tap to add to Costco list"
            }
          >
            {isCostco ? "On Costco · Remove" : "+ Costco"}
          </button>
        </div>
      </div>
    </li>
  );
}
