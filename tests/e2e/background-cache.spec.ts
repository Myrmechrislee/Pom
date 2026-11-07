import { test, expect } from "@playwright/test";
import { SCENES } from "../../lib/types";

test("bundled scenery is reused from the browser cache across visits", async ({ page }) => {
  // Playwright routing disables HTTP caching, so use the real guest API here.
  const imagePaths = SCENES.map((scene) => scene.url);
  for (let visit = 0; visit < 2; visit++) {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start focusing", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Backgrounds", exact: true }).click();
    const imageTimings = () =>
      page.evaluate(
        (paths) =>
          paths.map((path) => {
            const image = performance.getEntriesByName(new URL(path, location.href).href)[0] as
              PerformanceResourceTiming | undefined;
            return image && { transferred: image.transferSize, size: image.decodedBodySize };
          }),
        imagePaths,
      );
    await expect
      .poll(async () => (await imageTimings()).every((image) => image && image.size > 0))
      .toBe(true);
    for (const image of await imageTimings()) {
      if (visit === 0) expect(image!.transferred).toBeGreaterThan(0);
      else expect(image!.transferred).toBe(0);
    }
  }
});
