import assert from "node:assert/strict";

export async function homepageContentSignature(page) {
  return page.evaluate(() => ({
    headings: Array.from(document.querySelectorAll("main > section h2, #coming-soon h3")).map(node => node.textContent.trim()),
    trackSlugs: Array.from(document.querySelectorAll("#coming-soon [data-track-slug]")).map(node => node.dataset.trackSlug),
    railCounts: Array.from(document.querySelectorAll("main [class*='home-horizontal-rail'][tabindex='0']")).map(node => ({ label: node.getAttribute("aria-label"), count: node.children.length })),
    paymentMethods: Array.from(document.querySelectorAll("#payment [class*='paymentBrands'] > span")).map(node => node.textContent.trim()),
  }));
}

export async function assertHomepageContentParity(page, expected) {
  assert.deepEqual(await homepageContentSignature(page), expected, "Changing viewport/theme must not remove homepage content");
  const missing = await page.evaluate(() => {
    const selectors = ["[class*='noteCard']", "[class*='toolsCard']", "[class*='playPreview'] small", "#coming-soon article", "main > section h2", "#payment [class*='paymentBrands'] > span"];
    return selectors.flatMap(selector => Array.from(document.querySelectorAll(selector)).flatMap(node => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return !rect.width || !rect.height || style.visibility === "hidden" || style.display === "none" ? [{ selector, text: node.textContent.slice(0, 70) }] : [];
    }));
  });
  assert.deepEqual(missing, [], "Meaningful homepage content has been hidden: " + JSON.stringify(missing));
}

export async function assertHomepageCardsReadable(page) {
  const failures = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("#home-intent-panel, [class*='noteCard'], [class*='toolsCard'], #coming-soon article, main [class*='home-horizontal-rail'][tabindex='0'] > *, [class*='featureGrid'] > article, #payment aside, [class*='credentialGrid'] > *"));
    const problems = [];
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      if (!box.width || !box.height) { problems.push({ type: "hidden", text: card.textContent.slice(0, 60) }); continue; }
      if (card.closest("#coming-soon") && box.width < Math.min(innerWidth - 40, 230)) problems.push({ type: "collapsed-track", width: box.width });
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim() || node.parentElement.closest("[aria-hidden='true'],script,style")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          if (rect.left < box.left - 2 || rect.right > box.right + 2 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2) {
            problems.push({ type: "clipped-text", card: card.className, text: node.textContent.trim().slice(0, 65), left: rect.left - box.left, right: rect.right - box.right });
            break;
          }
        }
      }
      for (const action of card.querySelectorAll("a,button")) {
        const rect = action.getBoundingClientRect();
        if (rect.width && (rect.left < box.left - 2 || rect.right > box.right + 2)) problems.push({ type: "clipped-action", text: action.textContent });
      }
    }
    return problems.slice(0, 20);
  });
  assert.deepEqual(failures, [], "Cards must contain all text/actions, not just avoid document overflow: " + JSON.stringify(failures));
}

export async function assertHomepageRailsReachable(page) {
  const rails = page.locator("main [class*='home-horizontal-rail'][tabindex='0']");
  for (const rail of await rails.all()) {
    const last = rail.locator(":scope > *").last();
    await last.evaluate(node => node.scrollIntoView({ block: "center", inline: "end", behavior: "instant" }));
    const geometry = await last.evaluate(node => {
      const box = node.getBoundingClientRect(), railBox = node.parentElement.getBoundingClientRect();
      return { left: box.left, right: box.right, railLeft: railBox.left, railRight: railBox.right, width: box.width };
    });
    assert.ok(geometry.left >= geometry.railLeft - 2 && geometry.right <= geometry.railRight + 2, "Last horizontal card is unreachable: " + JSON.stringify(geometry));
    await rail.locator(":scope > *").first().evaluate(node => node.scrollIntoView({ block: "center", inline: "start", behavior: "instant" }));
  }
}
