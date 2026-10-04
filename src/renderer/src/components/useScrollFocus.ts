import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary';

/**
 * Keyboard access to a scroll container (WCAG 2.1.1): while `ref` scrolls and
 * holds nothing focusable, it becomes a Tab stop (a named region) so arrow
 * keys and Page Up/Down can scroll it. It stops being one as soon as it fits
 * or gains a control, so short dialogs keep their usual Tab order.
 */
export function useScrollFocus(
  ref: RefObject<HTMLElement | null>,
  labelledBy?: string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const scrolls =
        el.scrollHeight > el.clientHeight + 1 ||
        el.scrollWidth > el.clientWidth + 1;
      const needsStop = scrolls && !el.querySelector(FOCUSABLE);
      if (needsStop === (el.getAttribute("data-scroll-stop") === "true"))
        return;
      if (needsStop) {
        el.setAttribute("data-scroll-stop", "true");
        el.tabIndex = 0;
        el.setAttribute("role", "region");
        if (labelledBy) el.setAttribute("aria-labelledby", labelledBy);
      } else {
        el.removeAttribute("data-scroll-stop");
        el.removeAttribute("tabindex");
        el.removeAttribute("role");
        el.removeAttribute("aria-labelledby");
      }
    };
    update();
    // jsdom (unit tests) has no ResizeObserver.
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(el);
    const mutations = new MutationObserver(update);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      resize?.disconnect();
      mutations.disconnect();
    };
  }, [ref, labelledBy]);
}
