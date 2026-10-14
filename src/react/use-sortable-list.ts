import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canMoveDown as canMoveDownIn,
  canMoveUp as canMoveUpIn,
  getPositionChanges,
  moveAndReposition,
  sortByPosition,
  type MoveDirection,
  type MoveResult,
  type PositionChange,
  type PositionOptions,
  type SortableItem,
} from "../index";

export type UseSortableListOptions<T extends SortableItem> = PositionOptions & {
  /** Server data. Ignored while there are unsaved changes, applied again after save or reset. */
  initialItems: readonly T[];
  /** Receives only the items whose sortPosition changed. */
  onSave?: (changes: PositionChange<T["id"]>[]) => void | Promise<void>;
};

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const pruneSelection = <K>(selected: ReadonlySet<K>, ids: Set<K>) => {
  const next = new Set([...selected].filter((id) => ids.has(id)));
  return next.size === selected.size ? selected : next;
};

export function useSortableList<T extends SortableItem>({
  initialItems,
  onSave,
  ...positionOptions
}: UseSortableListOptions<T>) {
  const order = positionOptions.order ?? "desc";

  const [items, setItemsState] = useState(() => sortByPosition(initialItems, order));
  const [baseline, setBaselineState] = useState(items);
  const [selectedIds, setSelectedState] = useState<ReadonlySet<T["id"]>>(
    () => new Set(),
  );
  const [isSaving, setIsSaving] = useState(false);

  // Refs mirror state synchronously so rapid clicks never act on a stale list.
  const itemsRef = useRef(items);
  const baselineRef = useRef(baseline);
  const selectedRef = useRef(selectedIds);
  const savingRef = useRef(false);
  const latestRef = useRef({ initialItems, onSave, positionOptions });

  useIsomorphicLayoutEffect(() => {
    latestRef.current = { initialItems, onSave, positionOptions };
  });

  const setItems = useCallback((next: T[]) => {
    itemsRef.current = next;
    setItemsState(next);
  }, []);

  const setBaseline = useCallback((next: T[]) => {
    baselineRef.current = next;
    setBaselineState(next);
  }, []);

  const setSelection = useCallback((ids: Iterable<T["id"]>) => {
    const next = new Set(ids);
    selectedRef.current = next;
    setSelectedState(next);
  }, []);

  const loadFromServer = useCallback(
    (source: readonly T[]) => {
      const sorted = sortByPosition(source, order);
      setItems(sorted);
      setBaseline(sorted);
      const pruned = pruneSelection(
        selectedRef.current,
        new Set(sorted.map((item) => item.id)),
      );
      if (pruned !== selectedRef.current) setSelection(pruned);
    },
    [order, setBaseline, setItems, setSelection],
  );

  const signature = useMemo(
    () => JSON.stringify(sortByPosition(initialItems, order)),
    [initialItems, order],
  );

  useEffect(() => {
    if (getPositionChanges(baselineRef.current, itemsRef.current).length > 0) return;
    if (JSON.stringify(itemsRef.current) === signature) return;
    loadFromServer(latestRef.current.initialItems);
  }, [loadFromServer, signature]);

  const changes = useMemo(() => getPositionChanges(baseline, items), [baseline, items]);

  const canMoveUp = useMemo(() => canMoveUpIn(items, selectedIds), [items, selectedIds]);
  const canMoveDown = useMemo(
    () => canMoveDownIn(items, selectedIds),
    [items, selectedIds],
  );

  const move = useCallback(
    (direction: MoveDirection): MoveResult<T> => {
      const result = moveAndReposition(
        itemsRef.current,
        selectedRef.current,
        direction,
        latestRef.current.positionOptions,
      );
      if (result.changed) setItems(result.items);
      return result;
    },
    [setItems],
  );

  /** Rejects with the onSave error; unsaved changes are kept in that case. */
  const save = useCallback(async () => {
    const handler = latestRef.current.onSave;
    const snapshot = itemsRef.current;
    const pending = getPositionChanges(baselineRef.current, snapshot);
    if (!handler || pending.length === 0 || savingRef.current) return;

    savingRef.current = true;
    setIsSaving(true);
    try {
      await handler(pending);
      // Moves made while saving stay dirty because the baseline is the snapshot.
      setBaseline(snapshot);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [setBaseline]);

  /** Drops unsaved changes and shows the latest initialItems. */
  const reset = useCallback(() => {
    loadFromServer(latestRef.current.initialItems);
  }, [loadFromServer]);

  const toggleSelect = useCallback(
    (id: T["id"]) => {
      const next = new Set(selectedRef.current);
      if (!next.delete(id)) next.add(id);
      setSelection(next);
    },
    [setSelection],
  );

  const isSelected = useCallback((id: T["id"]) => selectedIds.has(id), [selectedIds]);

  return {
    /** Display order. */
    items,
    /** Pending sortPosition updates relative to the last saved state. */
    changes,
    isDirty: changes.length > 0,
    isSaving,
    selectedIds,
    isSelected,
    toggleSelect,
    setSelection,
    clearSelection: useCallback(() => setSelection([]), [setSelection]),
    canMoveUp,
    canMoveDown,
    move,
    save,
    reset,
  };
}
