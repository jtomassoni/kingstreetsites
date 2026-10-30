"use client";

import { useCallback, useRef } from "react";

type TouchPoint = { x: number; y: number };

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  disabled = false,
  minDistance = 56,
}: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  disabled?: boolean;
  minDistance?: number;
}) {
  const touchStart = useRef<TouchPoint | null>(null);

  const onTouchStart = useCallback(
    (event: React.TouchEvent) => {
      if (disabled) return;
      const touch = event.changedTouches[0] ?? event.touches[0];
      if (!touch) return;
      touchStart.current = { x: touch.clientX, y: touch.clientY };
    },
    [disabled],
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent) => {
      if (disabled || !touchStart.current) return;
      const touch = event.changedTouches[0];
      if (!touch) {
        touchStart.current = null;
        return;
      }

      const dx = touch.clientX - touchStart.current.x;
      const dy = touch.clientY - touchStart.current.y;
      touchStart.current = null;

      if (Math.abs(dx) < minDistance) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.25) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    },
    [disabled, minDistance, onSwipeLeft, onSwipeRight],
  );

  const onTouchCancel = useCallback(() => {
    touchStart.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
