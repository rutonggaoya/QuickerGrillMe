import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const changedOption = "Maximum issue coverage";
const questionPrompt = "What should the first release optimize for?";

async function openQuestionnaire(page: Page): Promise<void> {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Shape the first QuickerGrillMe release" })
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: new RegExp(changedOption) })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openQuestionnaire(page);
});

test("restores changed answers and collapsed topics after refresh", async ({ page }) => {
  const changedRadio = page.getByRole("radio", { name: new RegExp(changedOption) });
  await changedRadio.check();

  const topicToggle = page.getByRole("button", { name: "Goals and boundaries" });
  await topicToggle.click();
  await expect(topicToggle).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.values(window.localStorage).some((value) =>
          value.includes('"value":"maximum-coverage"')
        )
      )
    )
    .toBe(true);

  await page.reload();

  await expect(page.getByText(/Restored your draft from/)).toBeVisible();
  await expect(topicToggle).toHaveAttribute("aria-expanded", "false");
  await topicToggle.click();
  await expect(changedRadio).toBeChecked();
});

test("shows decision context and returns focus to an edited answer", async ({ page }) => {
  await page.getByRole("radio", { name: new RegExp(changedOption) }).check();
  await page.getByRole("button", { name: "Review answers" }).click();

  const reviewItem = page.locator(".review-item").filter({ hasText: questionPrompt });
  await expect(reviewItem.getByText("Fast consequential decisions")).toBeVisible();
  await expect(reviewItem.getByText(changedOption)).toBeVisible();
  await expect(reviewItem.getByText(/Recommendation confidence: high/)).toBeVisible();
  await expect(reviewItem.getByText(/Answer confidence:/)).toHaveCount(0);
  await expect(reviewItem.getByText(/Affected decisions:/)).toBeVisible();

  await reviewItem.getByRole("button", { name: "Edit answer" }).click();

  const question = page.locator("#question-design-goal");
  await expect(page.getByRole("heading", { name: "Submission review" })).toHaveCount(0);
  await expect(question).toBeFocused();
  await expect(question.getByRole("radio", { name: new RegExp(changedOption) })).toBeChecked();
});

test("keeps answers editable while a preview fails and retries in place", async ({
  page
}) => {
  let shouldFail = true;
  await page.route("**/api/preview", async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary preview failure" })
      });
      return;
    }
    await route.continue();
  });

  const changedRadio = page.getByRole("radio", { name: new RegExp(changedOption) });
  await changedRadio.check();

  const error = page.getByText(
    "Could not refresh the visible questions: Temporary preview failure"
  );
  await expect(error).toBeVisible();
  await expect(changedRadio).toBeChecked();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(error).toHaveCount(0);
  await expect(changedRadio).toBeChecked();
});

test("keeps the review available when submission fails and retries successfully", async ({
  page
}) => {
  await page.getByRole("button", { name: "Review answers" }).click();
  let shouldFail = true;
  await page.route("**/api/submit", async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Temporary submission failure" })
      });
      return;
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Submit answers" }).click();

  const error = page.getByText(
    "Could not submit the answers: Temporary submission failure"
  );
  await expect(error).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review changes from Agent recommendations" }))
    .toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText("Answers saved.", { exact: true })).toBeVisible();
});

test("has no automatically detectable WCAG A or AA violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
