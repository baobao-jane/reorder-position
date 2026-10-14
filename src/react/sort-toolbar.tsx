import type { ReactNode } from "react";
import type { MoveDirection } from "../index";

export type SortToolbarLabels = Record<MoveDirection, string> & {
  save: ReactNode;
  saving: ReactNode;
};

export type SortToolbarProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (direction: MoveDirection) => void;
  /** The save button is hidden when omitted. */
  onSave?: () => void;
  canSave?: boolean;
  isSaving?: boolean;
  labels?: Partial<SortToolbarLabels>;
  className?: string;
};

export const DEFAULT_SORT_TOOLBAR_LABELS: SortToolbarLabels = {
  top: "Move to top",
  up: "Move up",
  down: "Move down",
  bottom: "Move to bottom",
  save: "Save",
  saving: "Saving...",
};

const ICON_PATHS: Record<MoveDirection, string> = {
  top: "m17 11-5-5-5 5M17 18l-5-5-5 5",
  up: "m18 15-6-6-6 6",
  down: "m6 9 6 6 6-6",
  bottom: "m7 6 5 5 5-5M7 13l5 5 5-5",
};

const DIRECTIONS: MoveDirection[] = ["top", "up", "down", "bottom"];

export function SortToolbar({
  canMoveUp,
  canMoveDown,
  onMove,
  onSave,
  canSave = false,
  isSaving = false,
  labels: labelOverrides,
  className,
}: SortToolbarProps) {
  const labels = { ...DEFAULT_SORT_TOOLBAR_LABELS, ...labelOverrides };

  return (
    <div className={className ? `sp-toolbar ${className}` : "sp-toolbar"} role="toolbar">
      {DIRECTIONS.map((direction) => {
        const enabled = direction === "top" || direction === "up" ? canMoveUp : canMoveDown;
        return (
          <button
            key={direction}
            type="button"
            className="sp-icon-button"
            disabled={!enabled}
            aria-label={labels[direction]}
            title={labels[direction]}
            onClick={() => onMove(direction)}
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={ICON_PATHS[direction]} />
            </svg>
          </button>
        );
      })}
      {onSave ? (
        <>
          <span className="sp-divider" aria-hidden="true" />
          <button
            type="button"
            className="sp-save-button"
            disabled={!canSave || isSaving}
            onClick={onSave}
          >
            {isSaving ? labels.saving : labels.save}
          </button>
        </>
      ) : null}
    </div>
  );
}
