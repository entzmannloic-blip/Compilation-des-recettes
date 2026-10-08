import { test } from "node:test";
import assert from "node:assert/strict";
import { chargerSemaine, sauverSemaine, basculer, definirPersonnes } from "../src/semaine.js";

const CLE = "compilation-recettes.semaine";
const recettes = [
  { id: "a", personnes: 4 },
  { id: "b", personnes: 2 },
  { id: "c", personnes: 6 },
];

function fauxStockage(contenu = {}) {
  const donnees = { ...contenu };
  return {
    getItem: (cle) => (cle in donnees ? donnees[cle] : null),
    setItem: (cle, valeur) => { donnees[cle] = String(valeur); },
  };
}

test("chargerSemaine : stockage vide → {}", () => {
  assert.deepEqual(chargerSemaine(fauxStockage(), recettes), {});
});

test("chargerSemaine : JSON illisible → {}", () => {
  assert.deepEqual(chargerSemaine(fauxStockage({ [CLE]: "{oups" }), recettes), {});
});

test("chargerSemaine : JSON qui n'est pas un objet → {}", () => {
  for (const brut of ["[1,2]", "42", '"texte"', "null", "true"]) {
    assert.deepEqual(chargerSemaine(fauxStockage({ [CLE]: brut }), recettes), {}, brut);
  }
});

test("chargerSemaine : getItem qui lève une erreur → {}", () => {
  const stockage = { getItem() { throw new Error("accès refusé"); }, setItem() {} };
  assert.deepEqual(chargerSemaine(stockage, recettes), {});
});

test("chargerSemaine : stockage absent → {}", () => {
  assert.deepEqual(chargerSemaine(undefined, recettes), {});
  assert.deepEqual(chargerSemaine(null, recettes), {});
});

test("chargerSemaine : retire les ids inconnus et les nombres de personnes invalides", () => {
  const brut = JSON.stringify({ a: 2, zzz: 3, b: 0, c: 1.5 });
  assert.deepEqual(chargerSemaine(fauxStockage({ [CLE]: brut }), recettes), { a: 2 });
});

test("chargerSemaine : refuse les valeurs non numériques et négatives", () => {
  const brut = JSON.stringify({ a: "2", b: -1, c: null });
  assert.deepEqual(chargerSemaine(fauxStockage({ [CLE]: brut }), recettes), {});
});

test("sauverSemaine : ne lève pas si setItem lève", () => {
  const stockage = { getItem: () => null, setItem() { throw new Error("quota dépassé"); } };
  assert.doesNotThrow(() => sauverSemaine(stockage, { a: 2 }));
});

test("sauverSemaine : ne lève pas si le stockage est absent", () => {
  assert.doesNotThrow(() => sauverSemaine(undefined, { a: 2 }));
});

test("sauverSemaine : la semaine sauvée se relit avec chargerSemaine", () => {
  const stockage = fauxStockage();
  sauverSemaine(stockage, { a: 3, c: 1 });
  assert.deepEqual(chargerSemaine(stockage, recettes), { a: 3, c: 1 });
});

test("basculer : ajoute avec le nombre de personnes de la recette puis retire", () => {
  const vide = {};
  const avecA = basculer(vide, recettes[0]);
  assert.deepEqual(avecA, { a: 4 });
  const sansA = basculer(avecA, recettes[0]);
  assert.deepEqual(sansA, {});
});

test("basculer : ne modifie pas l'objet reçu", () => {
  const origine = { b: 2 };
  const ajoute = basculer(origine, recettes[0]);
  assert.deepEqual(origine, { b: 2 });
  assert.notEqual(ajoute, origine);
  const retire = basculer(ajoute, recettes[0]);
  assert.deepEqual(ajoute, { b: 2, a: 4 });
  assert.notEqual(retire, ajoute);
});

test("definirPersonnes : minimum 1, arrondi", () => {
  const s = { a: 4 };
  assert.deepEqual(definirPersonnes(s, "a", 0), { a: 1 });
  assert.deepEqual(definirPersonnes(s, "a", -5), { a: 1 });
  assert.deepEqual(definirPersonnes(s, "a", 3.6), { a: 4 });
  assert.deepEqual(definirPersonnes(s, "a", 6), { a: 6 });
});

test("definirPersonnes : nombre invalide → 1", () => {
  assert.deepEqual(definirPersonnes({ a: 4 }, "a", NaN), { a: 1 });
});

test("definirPersonnes : id absent de la semaine → inchangé, sans modifier l'entrée", () => {
  const s = { a: 4 };
  assert.deepEqual(definirPersonnes(s, "absent", 3), { a: 4 });
  definirPersonnes(s, "a", 9);
  assert.deepEqual(s, { a: 4 });
});
