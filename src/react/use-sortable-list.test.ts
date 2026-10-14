// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSortableList } from "./use-sortable-list";

const serverItems = () => [
  { id: 1, sortPosition: 2 },
  { id: 2, sortPosition: 1 },
  { id: 3, sortPosition: 0 },
];

const render = (onSave = vi.fn()) =>
  renderHook((props) => useSortableList({ ...props, onSave }), {
    initialProps: { initialItems: serverItems() },
  });

describe("useSortableList", () => {
  it("saves only the changed positions", async () => {
    const onSave = vi.fn();
    const { result } = render(onSave);

    act(() => result.current.toggleSelect(3));
    act(() => {
      result.current.move("up");
    });

    expect(result.current.items.map((item) => item.id)).toEqual([1, 3, 2]);
    expect(result.current.isDirty).toBe(true);

    await act(() => result.current.save());

    expect(onSave).toHaveBeenCalledWith([{ id: 3, sortPosition: 1.5 }]);
    expect(result.current.isDirty).toBe(false);
  });

  it("keeps local changes when server data arrives, and applies it on reset", () => {
    const { result, rerender } = render();

    act(() => result.current.toggleSelect(3));
    act(() => {
      result.current.move("top");
    });

    const refreshed = [...serverItems(), { id: 4, sortPosition: 9 }];
    rerender({ initialItems: refreshed });
    expect(result.current.items.map((item) => item.id)).toEqual([3, 1, 2]);

    act(() => result.current.reset());
    expect(result.current.items.map((item) => item.id)).toEqual([4, 1, 2, 3]);
    expect(result.current.isDirty).toBe(false);
  });

  it("follows server data while there are no local changes", () => {
    const { result, rerender } = render();
    rerender({ initialItems: [{ id: 9, sortPosition: 0 }] });
    expect(result.current.items).toEqual([{ id: 9, sortPosition: 0 }]);
  });

  it("keeps moves made during a save as unsaved changes", async () => {
    let finishSave: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finishSave = resolve)));
    const { result } = render(onSave);

    act(() => result.current.toggleSelect(3));
    act(() => {
      result.current.move("up");
    });

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.save();
    });
    act(() => {
      result.current.move("up");
    });

    await act(async () => {
      finishSave();
      await pending;
    });

    expect(result.current.items.map((item) => item.id)).toEqual([3, 1, 2]);
    expect(result.current.changes).toEqual([{ id: 3, sortPosition: 3 }]);
  });

  it("drops deleted ids from the selection", () => {
    const { result, rerender } = render();
    act(() => result.current.setSelection([2, 3]));
    rerender({ initialItems: serverItems().filter((item) => item.id !== 3) });
    expect([...result.current.selectedIds]).toEqual([2]);
  });
});
