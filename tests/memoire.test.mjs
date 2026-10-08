import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerListe, sauverListe, basculerFavori, CLES } from "../src/memoire.js";

test("basculerFavori : ajoute puis retire, sans modifier la liste d'origine", () => {
  const depart = ["a"];
  assert.deepEqual(basculerFavori(depart, "b"), ["a", "b"]);
  assert.deepEqual(basculerFavori(["a", "b"], "a"), ["b"]);
  assert.deepEqual(depart, ["a"]);
});

test("chargerListe / sauverListe : aller-retour et tolérance aux erreurs", () => {
  const memoire = new Map();
  const stockage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
  sauverListe(stockage, CLES.favoris, ["x", "y"]);
  assert.deepEqual(chargerListe(stockage, CLES.favoris), ["x", "y"]);
  assert.deepEqual(chargerListe(stockage, CLES.aide), []);
  assert.deepEqual(chargerListe({ getItem: () => "pas du json" }, CLES.favoris), []);
  assert.deepEqual(chargerListe({ getItem: () => JSON.stringify({ a: 1 }) }, CLES.favoris), []);
  assert.deepEqual(chargerListe({ getItem: () => JSON.stringify(["a", 3, null, "b"]) }, CLES.favoris), ["a", "b"]);
  assert.deepEqual(chargerListe({ getItem: () => { throw new Error("refusé"); } }, CLES.favoris), []);
  assert.doesNotThrow(() => sauverListe({ setItem() { throw new Error("plein"); } }, CLES.favoris, ["x"]));
});
