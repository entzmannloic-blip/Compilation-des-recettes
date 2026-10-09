import { test } from "node:test";
import assert from "node:assert/strict";
import { generateur, contour, deformer, PIGMENTS, SAISONS_PAR_MOIS } from "../src/aquarelle.js";

test("generateur : la même graine donne toujours la même suite", () => {
  const a = generateur(7), b = generateur(7);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  const x = generateur(7)();
  assert.ok(x >= 0 && x < 1);
});

test("deformer : chaque passe double le nombre de sommets", () => {
  const hasard = generateur(1);
  const base = contour(100, 100, 50, 8, hasard);
  assert.equal(base.length, 8);
  assert.equal(deformer(base, 3, 0.2, hasard).length, 64);
  assert.equal(deformer(base, 0, 0.2, hasard).length, 8);
});

test("un pigment et une saison par mois", () => {
  assert.equal(PIGMENTS.length, 12);
  assert.equal(SAISONS_PAR_MOIS.length, 12);
  assert.ok(PIGMENTS.every((p) => p.length === 3 && p.every((v) => v >= 0 && v <= 255)));
});
