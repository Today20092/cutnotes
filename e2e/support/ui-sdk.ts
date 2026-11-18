import type { Page } from "@playwright/test";

/** The app's own alerts: ui-sdk keeps an empty `role="alert"` live region on every page for its announcements. */
export const appAlert = (page: Page) =>
  page.getByRole("alert").and(page.locator(":not([data-ui-sdk-announcer])"));

/** List items outside the toast region: ui-sdk renders each toast as an `<li>`. */
export const pageListItem = (page: Page) =>
  page.getByRole("listitem").and(page.locator(':not([data-slot="toast"])'));
