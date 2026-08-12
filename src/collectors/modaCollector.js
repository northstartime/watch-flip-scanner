import fs from "fs";
import { chromium } from "playwright";

export async function getLatestModaPage() {
  console.log("Connecting to North Star Chrome...");

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");

  for (const context of browser.contexts()) {
    console.log(`Pages in context: ${context.pages().length}`);

    for (const page of context.pages()) {
      const title = await page.title();
      const url = page.url();

      console.log("--------------------------------");
      console.log("Title:", title);
      console.log("URL:", url);

      if (url.includes("facebook.com/groups")) {
        console.log("✓ Connected to:", title);

        await page.bringToFront();
        await page.waitForTimeout(2000);

        return page;
      }
    }
  }

  throw new Error("No Facebook group open.");
}

export async function dumpAccessibilityTree() {
  const page = await getLatestModaPage();

  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(3000);

  console.log("Waiting for posts...");

  await page.waitForSelector('[role="article"]', {
    timeout: 15000,
  });

  const posts = page.locator('[role="feed"] [role="article"]');

  const count = Math.min(await posts.count(), 40);

  console.log("Feed articles found:", count);

  const listings = [];
  const seenPostIds = new Set();

  for (let i = 0; i < count; i++) {
    const post = posts.nth(i);

    const candidateLinks = await post
      .locator("a")
      .evaluateAll((links) =>
        links
          .map((link) => link.href)
          .filter((href) =>
            /stories|posts|permalink|multi_permalinks/i.test(href)
          )
      )
      .catch(() => []);

    const postLink = candidateLinks.find((href) =>
      /\/groups\/\d+\/posts\/\d+/i.test(href)
    );

    const postId =
      postLink?.match(/\/posts\/(\d+)/i)?.[1] ?? null;

    if (!postId || seenPostIds.has(postId)) {
      continue;
    }

    seenPostIds.add(postId);

    const cleanPostUrl =
      `https://www.facebook.com/groups/558871041349029/posts/${postId}/`;

    console.log("Opening parent Moda post:", cleanPostUrl);

    const detailPage = await page.context().newPage();

    let parentListingText = "";
    let parentSeller = "Unknown seller";
    let image = null;

    try {
      await detailPage.goto(cleanPostUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await detailPage.waitForTimeout(2000);

await detailPage.waitForSelector('[role="dialog"], [role="article"]', {
  timeout: 15000,
});

let parentPost = detailPage.locator('[role="dialog"]').first();

if ((await parentPost.count()) === 0) {
  parentPost = detailPage.locator('[role="article"]').first();
}
      parentListingText = await parentPost
        .innerText()
        .catch(() => "");

      parentSeller = await parentPost
        .locator('[data-ad-rendering-role="profile_name"]')
        .first()
        .innerText()
        .catch(() => "Unknown seller");

      image = await parentPost
        .locator("img")
        .first()
        .getAttribute("src")
        .catch(() => null);

      console.log("\n===== PARENT MODA LISTING =====");
      console.log(parentListingText);
      console.log("===== END PARENT LISTING =====\n");
    } catch (error) {
      console.log(
        "Could not read parent Moda post:",
        cleanPostUrl,
        error.message
      );
    } finally {
      await detailPage.close();
    }

    if (!parentListingText) {
      continue;
    }

    listings.push({
      id: `moda-${postId}`,
      seller: parentSeller,
      listingText: parentListingText,
      source: "Moda",
      url: cleanPostUrl,
      image,
      capturedAt: new Date().toISOString(),
    });

    // Stop once we have enough real parent listings.
    if (listings.length >= 4) {
      break;
    }
  }

  fs.writeFileSync(
    "moda-listings.json",
    JSON.stringify(listings, null, 2),
    "utf8"
  );

  console.log(`✓ Saved ${listings.length} structured Moda listings.`);
  console.dir(listings, { depth: null });

  return listings;
}