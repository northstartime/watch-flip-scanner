import { chromium } from "playwright";
import path from "path";

const userDataDir = path.resolve("./browser-profile");

(async () => {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 250,
  });

  const page = context.pages()[0] || await context.newPage();

  await page.goto("https://www.chrono24.com", {
    waitUntil: "domcontentloaded",
  });

  console.log("Chrono24 opened");

  // Wait a few seconds for popups if needed
  await page.waitForTimeout(3000);

  // Try clicking the search field
  const searchBox = page.locator('input[type="search"]').first();

  await searchBox.click();
  await searchBox.fill("226570");
  await page.keyboard.press("Enter");

  console.log("Searching...");

  await page.waitForLoadState("networkidle");

  console.log(page.url());

})();