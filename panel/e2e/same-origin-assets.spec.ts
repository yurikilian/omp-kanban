import { expect, test, type Page, type Response } from "@playwright/test";

const FONT_PATH = /^\/fonts\/[^/]+\.woff2$/;

function isFontResponse(response: Response): boolean {
  const request = response.request();
  return (
    request.resourceType() === "font" ||
    /\.(?:woff2?|ttf|otf)$/i.test(new URL(response.url()).pathname)
  );
}

async function referencedAssets(page: Page): Promise<Record<string, string[]>> {
  return page.locator("script[src], link[href]").evaluateAll((elements) => {
    const assets = {
      scripts: [] as string[],
      stylesheets: [] as string[],
      fonts: [] as string[],
      icons: [] as string[],
    };

    for (const element of elements) {
      const url = new URL(
        element.getAttribute("src") ?? element.getAttribute("href") ?? "",
        window.location.href,
      ).href;

      if (element instanceof HTMLScriptElement && element.src) {
        assets.scripts.push(url);
      } else if (
        element instanceof HTMLLinkElement &&
        element.rel.split(/\s+/).includes("stylesheet")
      ) {
        assets.stylesheets.push(url);
      } else if (
        element instanceof HTMLLinkElement &&
        element.as === "font"
      ) {
        assets.fonts.push(url);
      } else if (
        element instanceof HTMLLinkElement &&
        element.rel.split(/\s+/).includes("icon")
      ) {
        assets.icons.push(url);
      }
    }

    return assets;
  });
}

test("[E2-S1-AC4] every requested local font file is served from the panel origin", async ({ page }) => {
  const fontResponses: Response[] = [];
  page.on("response", (response) => {
    if (isFontResponse(response)) {
      fontResponses.push(response);
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const origin = new URL(page.url()).origin;
  expect(fontResponses).not.toHaveLength(0);

  for (const response of fontResponses) {
    const url = new URL(response.url());
    expect(url.origin).toBe(origin);
    expect(url.pathname).toMatch(FONT_PATH);
    expect(response.status()).toBe(200);
  }
});

test("[E1-S4-AC3] every served script, stylesheet, font, and icon reference is same-origin", async ({ page }) => {
  const fetchedAssetUrls: string[] = [];
  page.on("request", (request) => {
    if (["script", "stylesheet", "font", "image"].includes(request.resourceType())) {
      fetchedAssetUrls.push(request.url());
    }
  });

  await page.goto("/", { waitUntil: "networkidle" });

  const origin = new URL(page.url()).origin;
  expect(fetchedAssetUrls).not.toHaveLength(0);
  for (const rawUrl of fetchedAssetUrls) {
    expect(new URL(rawUrl).origin).toBe(origin);
  }

  const assets = await referencedAssets(page);

  for (const [kind, urls] of Object.entries(assets)) {
    expect(urls, `expected the served page to reference at least one ${kind} asset`).not.toHaveLength(0);

    for (const rawUrl of urls) {
      const url = new URL(rawUrl);
      expect(url.origin).toBe(origin);
      if (kind === "fonts") {
        expect(url.pathname).toMatch(FONT_PATH);
      }
    }
  }
});
