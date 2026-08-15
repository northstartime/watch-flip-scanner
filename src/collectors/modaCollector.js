import fs from "fs";
import { chromium } from "playwright";

async function findParentListingArticle(detailPage, postId) {
  const storyMessages = detailPage.locator(
    '[data-ad-rendering-role="story_message"]:visible'
  );

  const messageCount = await storyMessages.count();

  for (let i = 0; i < messageCount; i++) {
    const storyMessage = storyMessages.nth(i);

    const owner = storyMessage.locator(
      `xpath=ancestor::div[
        .//a[
          contains(@href, "set=gm.${postId}") or
          contains(@href, "set=pcb.${postId}")
        ]
      ][1]`
    );

    if ((await owner.count()) > 0) {
      return owner;
    }

    const canonicalOwner = storyMessage.locator(
      `xpath=ancestor::div[
        .//a[
          contains(@href, "/posts/${postId}") and
          not(contains(@href, "comment_id"))
        ]
      ][1]`
    );

    if ((await canonicalOwner.count()) > 0) {
      return canonicalOwner;
    }
  }

  return null;
}
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
  const seenListingTexts = new Set();

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

      await detailPage.waitForSelector(
        '[data-ad-rendering-role="story_message"]:visible',
        { timeout: 15000 }
      );
      const parentPost = await findParentListingArticle(
        detailPage,
        postId
      );

      if (!parentPost) {
        throw new Error(
          `No article owns Facebook post ${postId}`
        );
      }


const storyMessageTexts = await detailPage
  .locator(
    '[role="dialog"] [data-ad-rendering-role="story_message"]:visible'
  )
  .allInnerTexts()
  .catch(() => []);

const storyMessageText =
  storyMessageTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] || "";



      parentListingText =
  storyMessageText ||
await parentPost
              .evaluate((article) => {
                const cleanArticle = article.cloneNode(true);

                cleanArticle
                  .querySelectorAll(
                    '[role="article"][aria-label^="Comment by"], ' +
                    '[role="article"][aria-label^="Reply by"], ' +
                    "[data-commentid]"
                  )
                  .forEach((comment) => comment.remove());

                return cleanArticle.innerText || cleanArticle.textContent || "";
              })
              .catch(() => "");

    parentSeller = await parentPost
  .locator('a[href*="/groups/"][href*="/user/"]')
  .filter({ hasText: /\S/ })
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
const listingKey = parentListingText
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const firstListingLine =
  parentListingText
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
if (
  /^#\w+(?:\s+#\w+)*$/i.test(firstListingLine) ||
  seenListingTexts.has(listingKey)
) {
  continue;
}

seenListingTexts.add(listingKey);
    listings.push({
      id: `moda-${postId}`,
      seller: parentSeller,
      listingText: parentListingText,
      source: "Moda",
url: postLink,
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