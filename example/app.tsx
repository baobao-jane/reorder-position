import { useState } from "react";
import type { MoveDirection, PositionChange } from "../src";
import { SortToolbar, useSortableList } from "../src/react";

type Banner = { id: number; title: string; sortPosition: number };

const INITIAL: Banner[] = [
  "Autumn sale",
  "New arrivals",
  "Free shipping",
  "Members only",
  "Gift guide",
  "Last chance",
].map((title, index, all) => ({ id: index + 1, title, sortPosition: all.length - 1 - index }));

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function App() {
  const [server, setServer] = useState(INITIAL);
  const [lastPayload, setLastPayload] = useState<PositionChange<number>[] | null>(null);
  const [rebalanceCount, setRebalanceCount] = useState(0);

  const list = useSortableList({
    initialItems: server,
    onSave: async (changes) => {
      await wait(600);
      setLastPayload(changes);
      setServer((prev) =>
        prev.map((item) => {
          const change = changes.find((entry) => entry.id === item.id);
          return change ? { ...item, sortPosition: change.sortPosition } : item;
        }),
      );
    },
  });

  const handleMove = (direction: MoveDirection) => {
    if (list.move(direction).rebalanced) setRebalanceCount((count) => count + 1);
  };

  const addFromServer = () => {
    setServer((prev) => {
      const nextId = Math.max(...prev.map((item) => item.id)) + 1;
      const bottom = Math.min(...prev.map((item) => item.sortPosition));
      return [...prev, { id: nextId, title: `Server item #${nextId}`, sortPosition: bottom - 1 }];
    });
  };

  return (
    <main className="demo">
      <h1>reorder-position</h1>
      <p className="demo-lead">
        Select rows and move them. Only the rows that moved get a new <code>sortPosition</code>,
        and only those are sent on save.
      </p>

      <div className="demo-bar">
        <SortToolbar
          canMoveUp={list.canMoveUp}
          canMoveDown={list.canMoveDown}
          onMove={handleMove}
          onSave={() => void list.save()}
          canSave={list.isDirty}
          isSaving={list.isSaving}
        />
        <button type="button" className="demo-button" onClick={list.reset} disabled={!list.isDirty}>
          Discard
        </button>
        <button type="button" className="demo-button" onClick={addFromServer}>
          Simulate server update
        </button>
      </div>

      <ul className="demo-list">
        {list.items.map((item) => (
          <li key={item.id} data-selected={list.isSelected(item.id) || undefined}>
            <label>
              <input
                type="checkbox"
                checked={list.isSelected(item.id)}
                onChange={() => list.toggleSelect(item.id)}
              />
              <span className="demo-title">{item.title}</span>
              <code className="demo-position">{Number(item.sortPosition.toFixed(6))}</code>
            </label>
          </li>
        ))}
      </ul>

      <section className="demo-panels">
        <div>
          <h2>Pending changes ({list.changes.length})</h2>
          <pre>{JSON.stringify(list.changes, null, 2)}</pre>
        </div>
        <div>
          <h2>Last save payload</h2>
          <pre>{lastPayload ? JSON.stringify(lastPayload, null, 2) : "—"}</pre>
          <p className="demo-note">Rebalanced {rebalanceCount} time(s)</p>
        </div>
      </section>
    </main>
  );
}
