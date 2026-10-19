import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sharedSource = await readFile(new URL("../shared.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const context = { window: {}, console };
vm.runInNewContext(sharedSource, context);
const utils = context.window.RapiflixShared;

function contrast(a, b) {
  const la = utils.relativeLuminance(a);
  const lb = utils.relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("shared slug function handles punctuation, accents, and duplicate records", () => {
  assert.equal(utils.slugify("Mad Max: Fury Road"), "mad-max-fury-road");
  assert.equal(utils.slugify("Amélie"), "amelie");
  assert.equal(utils.slugify("WALL·E"), "wall-e");
  assert.equal(utils.slugify("What's 2?"), "what-s-2");

  const records = [
    { id: 1, name: "Dune", year: 2021 },
    { id: 2, name: "Dune", year: 1984 },
    { id: 3, name: "Dune", year: 2021 }
  ];
  assert.equal(utils.slugForRecord(records[0], records), "dune-2021-1");
  assert.equal(utils.slugForRecord(records[1], records), "dune-1984");
  assert.match(utils.slugForRecord(records[2], records), /^dune-2021-3$/);
});

test("HSL conversion, hex output, luminance, and button text are bounded", () => {
  assert.deepEqual([...utils.hslToRgb(0, 100, 50)], [255, 0, 0]);
  assert.deepEqual([...utils.hslToRgb(120, 100, 50)], [0, 255, 0]);
  assert.equal(utils.rgbToHex([255, 90, 31]), "#FF5A1F");
  assert.equal(utils.buttonTextColor([0, 0, 0]), "#FFFFFF");
  assert.equal(utils.buttonTextColor([255, 255, 255]), "#0B0C12");
  for (let hue = 0; hue < 360; hue += 1) {
    const darkBg = utils.hslToRgb(hue, 42, 9);
    const darkFg = utils.hslToRgb(hue, 20, 95);
    const darkButton = utils.accessibleButtonRgb(hue, 'dark');
    const lightBg = utils.hslToRgb(hue, 75, 93);
    const lightFg = utils.hslToRgb(hue, 60, 11);
    const lightButton = utils.accessibleButtonRgb(hue, 'light');
    assert.ok(contrast(darkBg, darkFg) >= 4.5, `dark background contrast failed at ${hue}`);
    assert.ok(contrast(lightBg, lightFg) >= 4.5, `light background contrast failed at ${hue}`);
    assert.ok(contrast(darkButton, utils.buttonTextColor(darkButton) === "#FFFFFF" ? [255, 255, 255] : [11, 12, 18]) >= 4.5, `dark button contrast failed at ${hue}`);
    assert.ok(contrast(lightButton, utils.buttonTextColor(lightButton) === "#FFFFFF" ? [255, 255, 255] : [11, 12, 18]) >= 4.5, `light button contrast failed at ${hue}`);
  }
});

test("money formatting never emits NaN or Infinity", () => {
  assert.equal(utils.formatMoney(0), "Not reported");
  assert.equal(utils.formatMoney(null), "Not reported");
  assert.equal(utils.formatMoney(160000000), "$160M");
  assert.equal(utils.formatMoney(11400000), "$11.4M");
  assert.equal(utils.formatMoney(1010000000), "$1.01B");
  assert.equal(utils.formatMoney(Number.NaN), "Not reported");
  assert.equal(utils.formatMoney(Number.POSITIVE_INFINITY), "Not reported");
});

test("poster-fit contract uses a responsive frame and contained foreground artwork", () => {
  assert.match(css, /aspect-ratio:2\/3/);
  assert.match(css, /object-fit:contain!important/);
  assert.match(css, /\.hero-poster::before/);
  assert.match(css, /\.movie-card \.poster-wrap::before/);
  assert.match(css, /\.detail-poster-wrap::before/);
  assert.match(css, /\.detail-related-poster::before/);
  assert.match(html + css + sharedSource + app, /loading=.?lazy.?[\s\S]{0,100}decoding=.?async.?/);
});
