import { expect, type Page } from "@playwright/test";

/** Opens the New Project sheet from Home: the empty state's button, or the New menu once Projects exist. */
export async function openNewProjectSheet(page: Page) {
  const empty = page.getByRole("button", { name: "New Project", exact: true });
  const menu = page.getByRole("button", { name: "New", exact: true });
  await expect(empty.or(menu).first()).toBeVisible();
  if (await empty.isVisible()) return empty.click();
  await menu.click();
  await page.getByRole("menuitem", { name: "New Project" }).click();
}
