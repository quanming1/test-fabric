import type { Canvas } from "fabric";

export type KeyboardHandlers = {
  onDeleteSelected: () => void;
  onSpaceDownChange: (down: boolean) => void;
};

export function attachKeyboardShortcuts(handlers: KeyboardHandlers) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      handlers.onSpaceDownChange(true);
    }

    if (e.code === "Delete" || e.code === "Backspace") {
      handlers.onDeleteSelected();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") {
      e.preventDefault();
      handlers.onSpaceDownChange(false);
    }
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown as any);
    window.removeEventListener("keyup", onKeyUp as any);
  };
}

export function deleteActiveObject(canvas: Canvas | null) {
  if (!canvas) return;
  const active = canvas.getActiveObject();
  if (active) {
    canvas.remove(active);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }
}


