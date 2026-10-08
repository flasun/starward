#!/usr/bin/env node
/**
 * Loads the built game in headless Chromium, with WebGL on SwiftShader, and
 * exits non-zero if it does not render or the guided first flight does not
 * chart Earth. CI runs it against `npm run preview`.
 *
 *   node scripts/render-check.mjs [url]     default http://127.0.0.1:8081/
 *
 * CHROMIUM_PATH points at a browser binary; otherwise Playwright's own is used.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://127.0.0.1:8081/";
const origin = new URL(url).origin;
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "phone", width: 390, height: 844 },
];
const failures = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});

try {
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    const fail = (message) => failures.push(`${viewport.name}: ${message}`);
    page.on("pageerror", (err) => fail(`uncaught error: ${err.message}`));
    // Third-party scripts (the Grok pill) can fail on their own; only the game's errors count.
    page.on("console", (msg) => {
      if (msg.type() === "error" && (msg.location().url || origin).startsWith(origin)) fail(`console error: ${msg.text()}`);
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean(window.__controlsTest), null, { timeout: 30_000 });
    await page.waitForTimeout(1500);

    const state = await page.evaluate(() => ({
      // The engine's own context comes back if it is WebGL2; null means it fell back to 2D.
      webgl: Boolean(document.querySelector("canvas.field")?.getContext("webgl2")),
      // A shader that fails to compile is reported here.
      error: document.querySelector(".field-error")?.textContent ?? "",
      title: document.querySelector(".wordmark")?.textContent ?? "",
    }));
    if (!state.webgl) fail("WebGL2 is not running; the engine fell back to 2D");
    if (state.error) fail(`engine error: ${state.error}`);
    if (state.title !== "Starward") fail(`expected the Starward HUD, found "${state.title}"`);

    if (viewport.name === "desktop" && !state.error) {
      await page.click(".hint-go");
      const charted = await page
        .waitForFunction(() => document.querySelector(".kicker .chart")?.textContent?.trim().startsWith("1 of"), null, {
          timeout: 90_000,
        })
        .then(() => true, () => false);
      if (!charted) fail("First flight did not chart Earth within 90 s");
    }

    console.log(`${viewport.name}: webgl=${state.webgl} error=${JSON.stringify(state.error)}`);
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\nRender check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("Render check passed.");
