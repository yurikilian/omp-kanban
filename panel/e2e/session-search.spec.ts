import { expect, test } from "@playwright/test";

interface SessionSummary {
  id: string;
  title: string;
}

test("a reload restores the query from the URL and shows the same filtered rows (E3-S2-AC3)", async ({ page }) => {
  const response = await page.request.get("/api/sessions");
  expect(response.ok()).toBe(true);
  const sessions = (await response.json()) as SessionSummary[];
  test.skip(sessions.length === 0, "no recorded sessions on this machine to search for");

  // A tail slice of a session id is unique across every real session (they
  // are UUIDs) and contains no characters that need escaping when typed or
  // matched against the URL.
  const target = sessions[0];
  const needle = target.id.slice(-12);

  await page.goto("/sessions");
  const searchbox = page.getByRole("searchbox", { name: "Search sessions" });
  await searchbox.fill(needle);

  await expect(page).toHaveURL(new RegExp(`[?&]q=${needle}(&|$)`));
  await expect(page.getByRole("row")).toHaveCount(2); // header row + the one matching session
  await expect(page.getByText(target.title, { exact: true })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("searchbox", { name: "Search sessions" })).toHaveValue(needle);
  await expect(page.getByRole("row")).toHaveCount(2);
  await expect(page.getByText(target.title, { exact: true })).toBeVisible();
});