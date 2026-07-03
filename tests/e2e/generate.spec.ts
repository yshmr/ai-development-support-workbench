import { expect, test } from "@playwright/test";

test("submits a requirement memo and shows structured output", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "生成する" }).click();

  await expect(page.getByRole("heading", { name: "要約" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "仕様" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "受け入れ条件" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Jiraチケット" })).toBeVisible();
  await expect(page.getByText("mock-local")).toBeVisible();
});
