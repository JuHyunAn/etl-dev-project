import { useRef, useState, useCallback } from 'react';

interface Size { width: number; height: number; }
interface Pos  { x: number; y: number; }

export function useDraggableResizable(
  initialWidth: number,
  initialHeight: number,
  minWidth  = 480,
  minHeight = 320,
) {
  const [size, setSize] = useState<Size>(() => ({ width: initialWidth, height: initialHeight }));
  const [pos,  setPos]  = useState<Pos>(() => ({
    x: Math.max(0, (window.innerWidth  - initialWidth)  / 2),
    y: Math.max(0, (window.innerHeight - initialHeight) / 2),
  }));

  // ── Drag (header mousedown) ───────────────────────────────────
  const onDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // 버튼 클릭은 제외
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPX = pos.x;  // 클로저로 캡처
    const startPY = pos.y;

    // pos 최신값을 ref로 추적
    let curX = startPX, curY = startPY;

    const onMove = (ev: MouseEvent) => {
      curX = startPX + ev.clientX - startX;
      curY = startPY + ev.clientY - startY;
      // 화면 밖으로 나가지 않도록 최소 제한
      curX = Math.max(-initialWidth + 80, curX);
      curY = Math.max(0, curY);
      setPos({ x: curX, y: curY });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos.x, pos.y, initialWidth]);

  // ── Resize (edge/corner mousedown) ───────────────────────────
  const onResizeStart = useCallback((e: React.MouseEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX  = e.clientX;
    const startY  = e.clientY;
    const startW  = size.width;
    const startH  = size.height;
    const startPX = pos.x;
    const startPY = pos.y;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let newW = startW, newH = startH, newX = startPX, newY = startPY;

      if (dir.includes('e')) newW = Math.max(minWidth,  startW + dx);
      if (dir.includes('w')) { newW = Math.max(minWidth, startW - dx); newX = startPX + startW - newW; }
      if (dir.includes('s')) newH = Math.max(minHeight, startH + dy);
      if (dir.includes('n')) { newH = Math.max(minHeight, startH - dy); newY = startPY + startH - newH; }

      setSize({ width: newW, height: newH });
      setPos({ x: newX, y: newY });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [size.width, size.height, pos.x, pos.y, minWidth, minHeight]);

  return { size, pos, onDragStart, onResizeStart };
}

// 방향별 커서 스타일
export const RESIZE_CURSORS: Record<string, string> = {
  n:  'ns-resize',
  s:  'ns-resize',
  e:  'ew-resize',
  w:  'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};
