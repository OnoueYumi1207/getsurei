import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app replaces the starter preview with product content", async () => {
  const [page, layout, css, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /明王招福護摩供 参加報告/);
  assert.match(page, /全体集計/);
  assert.match(page, /参加者を追加/);
  assert.match(css, /@page\s*\{/);
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
