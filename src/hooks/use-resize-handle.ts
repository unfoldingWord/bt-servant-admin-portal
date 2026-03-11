import { useCallback, useEffect, useRef, useState } from "react";

interface UseResizeHandleOptions {
  onResize: (width: number) => void;
  onCommit?: () => void;
  currentWidth: number;
  minWidth: number;
  maxWidth: number;
}

export function useResizeHandle({
  onResize,
  onCommit,
  currentWidth,
  minWidth,
  maxWidth,
}: UseResizeHandleOptions) {
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startX.current = e.clientX;
      startWidth.current = currentWidth;
      setIsResizing(true);
    },
    [currentWidth]
  );

  useEffect(() => {
    if (!isResizing) return;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(e: MouseEvent) {
      // Dragging left (decreasing X) makes the panel wider
      const delta = startX.current - e.clientX;
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, startWidth.current + delta)
      );
      onResize(newWidth);
    }

    function onMouseUp() {
      setIsResizing(false);
      onCommit?.();
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [isResizing, minWidth, maxWidth, onResize, onCommit]);

  return { handleMouseDown, isResizing };
}
