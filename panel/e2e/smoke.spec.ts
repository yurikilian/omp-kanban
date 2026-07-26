import { expect, test } from "@playwright/test";

test("serves the panel shell from the production build over loopback", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "OMP Panel" })).toBeVisible();
});

test("carries no permissive CORS header on the served shell", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.headers()["access-control-allow-origin"]).toBeUndefined();
});
