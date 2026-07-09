import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

export function WorkspaceSidePanel({
  title,
  side,
  collapsed,
  onCollapsedChange,
  onContextMenu,
  children,
}: {
  title: string;
  side: "left" | "right";
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <aside className={`side-rail side-rail-${side}`} onContextMenu={onContextMenu}>
        <button type="button" title={`Open ${title}`} onClick={() => onCollapsedChange(false)}>
          <span>{title}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className={`side-panel workspace-side-panel side-panel-${side}`} onContextMenu={onContextMenu}>
      <div className="panel-title">
        <strong>{title}</strong>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          title={`Collapse ${title}`}
          aria-label={`Collapse ${title}`}
        >
          {side === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>
      <div className="panel-scroll">{children}</div>
    </aside>
  );
}
