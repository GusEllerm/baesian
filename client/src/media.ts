import { useCallback, useSyncExternalStore } from "react";

// The phone layout (D130): the same client, laid out for a phone below a width, and worded for touch where touch is
// all there is. The layout follows the window's width; the words follow the input, so a narrow desktop window keeps
// its keys, and a touch screen loses the key hints whatever its size. style.css uses the same two queries.

/** Below this width, the card fills the screen and the path folds into a sheet you pull up. */
export const PHONE = "(max-width: 760px)";
/**
 * A screen you touch, with no mouse or trackpad: no key hints, "tap" and "press" rather than "click", and a card held
 * until it lifts, then dragged, while a drag on it scrolls (B-yfehp, Lift.tsx).
 */
export const TOUCH = "(hover: none) and (pointer: coarse)";

/** Whether a media query matches now, kept up to date. */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (changed: () => void) => {
      const m = matchMedia(query);
      m.addEventListener("change", changed);
      return () => m.removeEventListener("change", changed);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches);
}
