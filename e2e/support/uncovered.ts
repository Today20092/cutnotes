import { expect, type Locator } from "@playwright/test";

/**
 * `toBeVisible()` passes even when another element paints over the target, such as the sticky
 * picture on a phone. This asks the browser what is actually drawn at the target's center.
 */
export async function expectUncovered(target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((element: HTMLElement) => {
        // Hit testing skips pointer-events: none, which overlays such as the scrub preview use.
        const previous = element.style.pointerEvents;
        element.style.pointerEvents = "auto";
        const box = element.getBoundingClientRect();
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        element.style.pointerEvents = previous;
        return hit === null
          ? "nothing"
          : element.contains(hit)
            ? "uncovered"
            : hit.outerHTML.slice(0, 80);
      }),
    )
    .toBe("uncovered");
}
