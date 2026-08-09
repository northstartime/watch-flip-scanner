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
        timeout: 15000
    });

const posts = page
  .locator('[aria-posinset]')
  .filter({
    has: page.locator('[data-ad-rendering-role="story_message"]'),
  });

const count = Math.min(await posts.count(), 4);

console.log("Listings found:", count);

const listings = [];

for (let i = 0; i < count; i++) {
  const post = posts.nth(i);

  const listingText = await post
    .locator('[data-ad-rendering-role="story_message"]')
    .first()
    .innerText()
    .catch(() => "");

  const seller = await post
    .locator('[data-ad-rendering-role="profile_name"]')
    .first()
    .innerText()
    .catch(() => "Unknown seller");

  const html = await post.evaluate((element) => element.outerHTML);
  const candidateLinks = await post.locator("a").evaluateAll((links) =>
  links
    .map((link) => link.href)
    .filter((href) =>
      /stories|posts|permalink|multi_permalinks/i.test(href)
    )
);

console.log("CANDIDATE LINKS:", candidateLinks);

const postLink = candidateLinks.find((href) =>
  /\/groups\/\d+\/posts\/\d+/i.test(href)
);

const postId =
  postLink?.match(/\/posts\/(\d+)/i)?.[1] ?? null;


const photo = post
  .locator('a[href*="photo"][href*="set=pcb."]')
  .first();

const photoUrl = await photo
  .getAttribute("href")
  .catch(() => null);

const image = await photo
  .locator("img")
  .getAttribute("src")
  .catch(() => null);

  if (!listingText || !postId) {
    continue;
  }

  listings.push({
    id: `moda-${postId}`,
    seller,
    listingText,
    source: "Moda",
url: postId
 ? `https://www.facebook.com/groups/558871041349029/permalink/${postId}/`
  : photoUrl,
    image,
    capturedAt: new Date().toISOString(),
  });
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