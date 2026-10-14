export type SortKey = string | number;

export interface SortableItem<K extends SortKey = SortKey> {
  id: K;
  sortPosition: number;
}

/** desc: larger sortPosition is shown first. asc: smaller first. */
export type SortOrder = "asc" | "desc";

export type MoveDirection = "top" | "up" | "down" | "bottom";

export type PositionChange<K extends SortKey = SortKey> = {
  id: K;
  sortPosition: number;
};

export type PositionOptions = {
  /** Default "desc". */
  order?: SortOrder;
  /** Spacing used when placing items past either end and when rebalancing. Default 1. */
  step?: number;
  /** Rebalance the whole list once two neighbours get closer than this. Default 1e-9. */
  minGap?: number;
  /** Rebalance once any |sortPosition| exceeds this. Disabled by default. */
  maxAbsPosition?: number | ((count: number) => number);
};

export type RepositionResult<T> = {
  items: T[];
  /** True when the list was renumbered from scratch instead of patching the moved items. */
  rebalanced: boolean;
};

export type MoveResult<T> = RepositionResult<T> & {
  /** False when the move was a no-op, e.g. moving the first item up. */
  changed: boolean;
};

type ResolvedOptions = {
  order: SortOrder;
  step: number;
  minGap: number;
  maxAbsPosition?: number | ((count: number) => number);
};

const resolveOptions = (options: PositionOptions = {}): ResolvedOptions => ({
  order: options.order ?? "desc",
  step: options.step ?? 1,
  minGap: options.minGap ?? 1e-9,
  maxAbsPosition: options.maxAbsPosition,
});

/** Stable: items with equal positions keep their input order. */
export function sortByPosition<T extends SortableItem>(
  items: readonly T[],
  order: SortOrder = "desc",
): T[] {
  return [...items].sort((a, b) =>
    order === "desc"
      ? b.sortPosition - a.sortPosition
      : a.sortPosition - b.sortPosition,
  );
}

/** Items whose sortPosition differs from `before`, including items missing from it. */
export function getPositionChanges<T extends SortableItem>(
  before: readonly T[],
  after: readonly T[],
): PositionChange<T["id"]>[] {
  const previous = new Map<T["id"], number>(
    before.map((item) => [item.id, item.sortPosition]),
  );

  return after
    .filter((item) => previous.get(item.id) !== item.sortPosition)
    .map((item) => ({ id: item.id, sortPosition: item.sortPosition }));
}

export function isSameOrder<T extends SortableItem>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  return a.length === b.length && a.every((item, index) => item.id === b[index].id);
}

const selectionFlags = <T extends SortableItem>(
  sorted: readonly T[],
  selectedIds: ReadonlySet<T["id"]>,
) => sorted.map((item) => selectedIds.has(item.id));

export function canMoveUp<T extends SortableItem>(
  sorted: readonly T[],
  selectedIds: ReadonlySet<T["id"]>,
): boolean {
  const selected = selectionFlags(sorted, selectedIds);
  return selected.some((isSelected, index) => isSelected && index > 0 && !selected[index - 1]);
}

export function canMoveDown<T extends SortableItem>(
  sorted: readonly T[],
  selectedIds: ReadonlySet<T["id"]>,
): boolean {
  const selected = selectionFlags(sorted, selectedIds);
  return selected.some(
    (isSelected, index) =>
      isSelected && index < selected.length - 1 && !selected[index + 1],
  );
}

/**
 * Reorders the list without touching sortPosition.
 * - top/bottom gather every selected item at that end, keeping their relative order.
 * - up/down move each selected item one slot, but never past another selected item,
 *   so contiguous blocks move together and blocks already at an edge stay put.
 */
export function moveSelected<T extends SortableItem>(
  items: readonly T[],
  selectedIds: ReadonlySet<T["id"]>,
  direction: MoveDirection,
  order: SortOrder = "desc",
): T[] {
  const sorted = sortByPosition(items, order);
  if (selectedIds.size === 0) return sorted;

  if (direction === "top" || direction === "bottom") {
    const selected = sorted.filter((item) => selectedIds.has(item.id));
    const rest = sorted.filter((item) => !selectedIds.has(item.id));
    return direction === "top" ? [...selected, ...rest] : [...rest, ...selected];
  }

  const result = [...sorted];
  const isSelected = (index: number) => selectedIds.has(result[index].id);
  const swap = (a: number, b: number) => {
    [result[a], result[b]] = [result[b], result[a]];
  };

  if (direction === "up") {
    for (let i = 1; i < result.length; i++) {
      if (isSelected(i) && !isSelected(i - 1)) swap(i, i - 1);
    }
  } else {
    for (let i = result.length - 2; i >= 0; i--) {
      if (isSelected(i) && !isSelected(i + 1)) swap(i, i + 1);
    }
  }

  return result;
}

/** Positions for `count` items placed between two neighbours in display order. */
function distributeRange(
  above: number | null,
  below: number | null,
  count: number,
  { order, step }: ResolvedOptions,
): number[] {
  const sign = order === "desc" ? 1 : -1;

  if (above === null && below === null) {
    return Array.from({ length: count }, (_, i) =>
      order === "desc" ? (count - 1 - i) * step : i * step,
    );
  }
  if (above === null) {
    return Array.from({ length: count }, (_, i) => below! + sign * (count - i) * step);
  }
  if (below === null) {
    return Array.from({ length: count }, (_, i) => above - sign * (i + 1) * step);
  }

  const gap = (below - above) / (count + 1);
  return Array.from({ length: count }, (_, i) => above + gap * (i + 1));
}

/**
 * Gives new positions to `movedIds` only, placing each run of consecutive moved
 * items evenly between its neighbours. Everything else keeps its sortPosition,
 * which keeps the save payload small.
 */
export function assignPositions<T extends SortableItem>(
  ordered: readonly T[],
  movedIds: ReadonlySet<T["id"]>,
  options?: PositionOptions,
): T[] {
  const resolved = resolveOptions(options);
  const result = ordered.map((item) => ({ ...item }));

  let start = 0;
  while (start < result.length) {
    if (!movedIds.has(result[start].id)) {
      start++;
      continue;
    }

    let end = start;
    while (end < result.length && movedIds.has(result[end].id)) end++;

    const above = start > 0 ? result[start - 1].sortPosition : null;
    const below = end < result.length ? result[end].sortPosition : null;
    const positions = distributeRange(above, below, end - start, resolved);

    positions.forEach((sortPosition, offset) => {
      result[start + offset].sortPosition = sortPosition;
    });
    start = end;
  }

  return result;
}

/**
 * True when midpoints can no longer be trusted: neighbours are too close (repeated
 * bisection eventually hits floating point limits), out of order, or too large.
 */
export function needsRebalance<T extends SortableItem>(
  ordered: readonly T[],
  options?: PositionOptions,
): boolean {
  const { order, minGap, maxAbsPosition } = resolveOptions(options);

  for (let i = 1; i < ordered.length; i++) {
    const gap =
      order === "desc"
        ? ordered[i - 1].sortPosition - ordered[i].sortPosition
        : ordered[i].sortPosition - ordered[i - 1].sortPosition;
    if (!(gap >= minGap)) return true;
  }

  if (maxAbsPosition === undefined) return false;
  const limit =
    typeof maxAbsPosition === "function"
      ? maxAbsPosition(ordered.length)
      : maxAbsPosition;
  return ordered.some((item) => Math.abs(item.sortPosition) > limit);
}

/** Renumbers the list in display order: desc gives (n-1)*step ... 0, asc gives 0 ... (n-1)*step. */
export function rebalancePositions<T extends SortableItem>(
  ordered: readonly T[],
  options?: PositionOptions,
): T[] {
  const { order, step } = resolveOptions(options);
  return ordered.map((item, index) => ({
    ...item,
    sortPosition:
      order === "desc" ? (ordered.length - 1 - index) * step : index * step,
  }));
}

/** assignPositions, falling back to a full rebalance when precision runs out. */
export function applyReorderedPositions<T extends SortableItem>(
  ordered: readonly T[],
  movedIds: ReadonlySet<T["id"]>,
  options?: PositionOptions,
): RepositionResult<T> {
  const patched = assignPositions(ordered, movedIds, options);
  if (needsRebalance(patched, options)) {
    return { items: rebalancePositions(ordered, options), rebalanced: true };
  }
  return { items: patched, rebalanced: false };
}

/** Indices of one longest strictly increasing subsequence. Non-finite values are skipped. */
function longestIncreasingIndices(values: readonly number[]): Set<number> {
  const tails: number[] = [];
  const previous = new Array<number>(values.length).fill(-1);

  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (values[tails[mid]] < value) low = mid + 1;
      else high = mid;
    }
    if (low > 0) previous[index] = tails[low - 1];
    tails[low] = index;
  });

  const kept = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i >= 0; i = previous[i]) kept.add(i);
  return kept;
}

/**
 * For an arbitrary new order (e.g. after drag and drop): keeps the largest set of
 * items that are already in valid order and only repositions the rest.
 */
export function repositionOrdered<T extends SortableItem>(
  ordered: readonly T[],
  options?: PositionOptions,
): RepositionResult<T> {
  const { order } = resolveOptions(options);
  const kept = longestIncreasingIndices(
    ordered.map((item) => (order === "desc" ? -item.sortPosition : item.sortPosition)),
  );
  const movedIds = new Set(
    ordered.filter((_, index) => !kept.has(index)).map((item) => item.id),
  );
  return applyReorderedPositions(ordered, movedIds, options);
}

/**
 * moveSelected + applyReorderedPositions in one step. Only selected items that
 * actually changed slot get new positions; ones stuck at an edge keep theirs.
 */
export function moveAndReposition<T extends SortableItem>(
  items: readonly T[],
  selectedIds: ReadonlySet<T["id"]>,
  direction: MoveDirection,
  options?: PositionOptions,
): MoveResult<T> {
  const { order } = resolveOptions(options);
  const sorted = sortByPosition(items, order);
  const moved = moveSelected(sorted, selectedIds, direction, order);

  if (isSameOrder(sorted, moved)) {
    return { items: sorted, changed: false, rebalanced: false };
  }

  const movedIds = new Set(
    moved
      .filter((item, index) => selectedIds.has(item.id) && sorted[index].id !== item.id)
      .map((item) => item.id),
  );
  return { ...applyReorderedPositions(moved, movedIds, options), changed: true };
}
