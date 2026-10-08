import { test } from "node:test";
import assert from "node:assert/strict";
import { lireRoute } from "../src/routes.js";

test("lireRoute : recette avec identifiant", () => {
  assert.deepEqual(lireRoute("#/recette/salade-x"), { nom: "recette", id: "salade-x" });
});

test("lireRoute : semaine et livres", () => {
  assert.deepEqual(lireRoute("#/semaine"), { nom: "semaine" });
  assert.deepEqual(lireRoute("#/livres"), { nom: "livres" });
});

test("lireRoute : vide, inconnu ou recette sans id → saison", () => {
  for (const hash of ["", "#", "#/", "#/n-importe-quoi", "#/recette/", "#/recette", "#/semaine/x"]) {
    assert.deepEqual(lireRoute(hash), { nom: "saison" }, hash);
  }
});

test("lireRoute : entrée non textuelle → saison", () => {
  assert.deepEqual(lireRoute(undefined), { nom: "saison" });
  assert.deepEqual(lireRoute(null), { nom: "saison" });
});
