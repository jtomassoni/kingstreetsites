"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type WeekBulkContextValue = {
  selecting: boolean;
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  setSelecting: (value: boolean) => void;
  toggleSelected: (mealId: string) => void;
  toggleGroup: (mealIds: string[]) => void;
  selectAll: (mealIds: string[]) => void;
  clearSelected: () => void;
  isSelected: (mealId: string) => boolean;
};

const WeekBulkContext = createContext<WeekBulkContextValue | null>(null);

export function WeekBulkProvider({ children }: { children: ReactNode }) {
  const [selecting, setSelectingState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const setSelecting = useCallback((value: boolean) => {
    setSelectingState(value);
    if (!value) setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((mealId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(mealId)) next.delete(mealId);
      else next.add(mealId);
      return next;
    });
  }, []);

  const toggleGroup = useCallback((mealIds: string[]) => {
    if (!mealIds.length) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allOn = mealIds.every((id) => next.has(id));
      if (allOn) {
        for (const id of mealIds) next.delete(id);
      } else {
        for (const id of mealIds) next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((mealIds: string[]) => {
    setSelectedIds(new Set(mealIds));
  }, []);

  const clearSelected = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (mealId: string) => selectedIds.has(mealId),
    [selectedIds],
  );

  const value = useMemo<WeekBulkContextValue>(
    () => ({
      selecting,
      selectedIds,
      selectedCount: selectedIds.size,
      setSelecting,
      toggleSelected,
      toggleGroup,
      selectAll,
      clearSelected,
      isSelected,
    }),
    [
      selecting,
      selectedIds,
      setSelecting,
      toggleSelected,
      toggleGroup,
      selectAll,
      clearSelected,
      isSelected,
    ],
  );

  return (
    <WeekBulkContext.Provider value={value}>{children}</WeekBulkContext.Provider>
  );
}

export function useWeekBulk() {
  const ctx = useContext(WeekBulkContext);
  if (!ctx) {
    throw new Error("useWeekBulk must be used within WeekBulkProvider");
  }
  return ctx;
}
