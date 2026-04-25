import { useEffect, useMemo } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import type { RectBounds } from "../types/flood";

interface DragBounds {
  width: number;
  height: number;
}

interface WindowPosition {
  x: number;
  y: number;
}

interface DraggableWindowProps {
  id: string;
  title: string;
  children: ReactNode;
  width?: number;
  height?: number;
  initialPosition: WindowPosition;
  bounds: DragBounds;
  avoidRects?: RectBounds[];
  zIndex?: number;
  onClose: () => void;
  onFocus?: () => void;
}

const EDGE_PADDING = 12;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function intersects(a: RectBounds, b: RectBounds): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function resolveBounds(bounds: DragBounds, width: number, height: number) {
  const maxX = Math.max(EDGE_PADDING, bounds.width - width - EDGE_PADDING);
  const maxY = Math.max(EDGE_PADDING, bounds.height - height - EDGE_PADDING);
  return {
    minX: EDGE_PADDING,
    maxX,
    minY: EDGE_PADDING,
    maxY,
  };
}

function resolveCollision(
  position: WindowPosition,
  size: { width: number; height: number },
  bounds: DragBounds,
  avoidRects: RectBounds[],
): WindowPosition {
  const limits = resolveBounds(bounds, size.width, size.height);
  let next = {
    x: clamp(position.x, limits.minX, limits.maxX),
    y: clamp(position.y, limits.minY, limits.maxY),
  };

  for (const rect of avoidRects) {
    const currentWindowRect: RectBounds = {
      x: next.x,
      y: next.y,
      width: size.width,
      height: size.height,
    };

    if (!intersects(currentWindowRect, rect)) {
      continue;
    }

    const candidatePositions: WindowPosition[] = [
      { x: rect.x - size.width - EDGE_PADDING, y: next.y },
      { x: rect.x + rect.width + EDGE_PADDING, y: next.y },
      { x: next.x, y: rect.y - size.height - EDGE_PADDING },
      { x: next.x, y: rect.y + rect.height + EDGE_PADDING },
    ].map((candidate) => ({
      x: clamp(candidate.x, limits.minX, limits.maxX),
      y: clamp(candidate.y, limits.minY, limits.maxY),
    }));

    const validCandidates = candidatePositions.filter((candidate) => {
      const candidateRect: RectBounds = {
        x: candidate.x,
        y: candidate.y,
        width: size.width,
        height: size.height,
      };
      return !avoidRects.some((blocked) => intersects(candidateRect, blocked));
    });

    if (validCandidates.length === 0) {
      next = {
        x: next.x,
        y: clamp(rect.y - size.height - EDGE_PADDING, limits.minY, limits.maxY),
      };
      continue;
    }

    validCandidates.sort((a, b) => {
      const distA = Math.hypot(a.x - next.x, a.y - next.y);
      const distB = Math.hypot(b.x - next.x, b.y - next.y);
      return distA - distB;
    });

    next = validCandidates[0];
  }

  return next;
}

export function DraggableWindow({
  id,
  title,
  children,
  width = 420,
  height = 320,
  initialPosition,
  bounds,
  avoidRects = [],
  zIndex = 60,
  onClose,
  onFocus,
}: DraggableWindowProps) {
  const initialResolvedPosition = useMemo(
    () =>
      resolveCollision(
        initialPosition,
        { width, height },
        bounds,
        avoidRects,
      ),
    [initialPosition, width, height, bounds, avoidRects],
  );

  const x = useMotionValue(initialResolvedPosition.x);
  const y = useMotionValue(initialResolvedPosition.y);

  useEffect(() => {
    const targetPosition = resolveCollision(
      initialPosition,
      { width, height },
      bounds,
      avoidRects,
    );
    x.set(targetPosition.x);
    y.set(targetPosition.y);
  }, [initialPosition, width, height, bounds, avoidRects, x, y]);

  return (
    <motion.div
      key={id}
      className="absolute left-0 top-0 overflow-hidden rounded-xl border border-slate-700/90 bg-slate-900/95 shadow-2xl backdrop-blur-sm pointer-events-auto"
      style={{ x, y, width, height, zIndex }}
      drag
      dragMomentum={false}
      dragElastic={0.06}
      onPointerDown={onFocus}
      onDragEnd={() => {
        const target = resolveCollision(
          { x: x.get(), y: y.get() },
          { width, height },
          bounds,
          avoidRects,
        );
        animate(x, target.x, { type: "spring", stiffness: 360, damping: 30 });
        animate(y, target.y, { type: "spring", stiffness: 360, damping: 30 });
      }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between border-b border-slate-700/90 bg-slate-800/90 px-4 py-2">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-300 transition hover:bg-slate-700 hover:text-slate-100"
          aria-label={`Close ${title}`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-[calc(100%-41px)] overflow-auto p-4 text-slate-200">
        {children}
      </div>
    </motion.div>
  );
}
