import { RefObject, useEffect } from "react";

/**
 * Prevents browser back/forward swipe navigation that can be triggered by
 * horizontal overscrolling (trackpad/mouse) inside a horizontal scroll container.
 *
 * This hook only intercepts wheel events at scroll edges to prevent browser navigation.
 * Vertical scrolling is not affected.
 * 
 * Works in Chrome and Firefox. Safari has WebKit limitations.
 */
export function usePreventHorizontalOverscrollNavigation(
  ref: RefObject<HTMLElement>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const el = ref.current;
    if (!el) return;

    // Helper: Check if at scroll edge
    const isAtScrollEdge = (element: HTMLElement, deltaX: number): boolean => {
      const scrollLeft = element.scrollLeft;
      const maxScrollLeft = element.scrollWidth - element.clientWidth;
      const atLeft = scrollLeft <= 0;
      const atRight = scrollLeft >= maxScrollLeft - 1; // tolerate rounding
      return (deltaX < 0 && atLeft) || (deltaX > 0 && atRight);
    };

    // Only intercept wheel events - primary mechanism for trackpad
    const onWheel = (e: WheelEvent) => {
      // Ignore if movement is primarily vertical - allow vertical scrolling
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

      // Only prevent default at horizontal edges to block browser navigation
      if (isAtScrollEdge(el, e.deltaX)) {
        e.preventDefault();
        // No stopPropagation() - allows events to bubble up for vertical scrolling
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, [ref, enabled]);
}
