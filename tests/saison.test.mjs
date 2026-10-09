import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOIS_DE_SAISON, saisonDuMoisNumero, alimentsDuMois, alimentsDeLaSaison, chercherAliments,
  seriesDeMois, libelleMois, moisParIngredient, recettesAvecAliment,
} from "../src/saison.js";
import { validerDonnees } from "../scripts/validate-data.mjs";

const aliments = [
  { id: "fraise", nom: "Fraise", type: "fruit", mois: [4, 5, 6] },
  { id: "endive", nom: "Endive", type: "legume", mois: [11, 12, 1, 2, 3, 4] },
  { id: "echalote", nom: "Échalote", type: "legume", mois: [10, 11, 12], ingredients: ["echalote"] },
  { id: "carotte", nom: "Carotte", type: "legume", mois: [1, 2, 3], ingredients: ["carotte"] },
  { id: "carotte-nouvelle", nom: "Carotte nouvelle", type: "legume", mois: [5, 6], ingredients: ["carotte"] },
];

test("saisonDuMoisNumero : chaque mois a une saison, l'hiver enjambe l'année", () => {
  assert.equal(saisonDuMoisNumero(10), "automne");
  assert.equal(saisonDuMoisNumero(1), "hiver");
  assert.equal(saisonDuMoisNumero(12), "hiver");
  assert.equal(saisonDuMoisNumero(3), "printemps");
  assert.equal(saisonDuMoisNumero(7), "été");
  assert.equal(Object.values(MOIS_DE_SAISON).flat().length, 12);
});

test("alimentsDuMois : filtre par mois et par type, trié sans tenir compte des accents", () => {
  assert.deepEqual(alimentsDuMois(aliments, 4).map((a) => a.nom), ["Endive", "Fraise"]);
  assert.deepEqual(alimentsDuMois(aliments, 4, "fruit").map((a) => a.nom), ["Fraise"]);
  assert.deepEqual(alimentsDuMois(aliments, 11).map((a) => a.nom), ["Échalote", "Endive"]);
});

test("alimentsDeLaSaison : réunit les trois mois et garde les mois présents", () => {
  const hiver = alimentsDeLaSaison(aliments, "hiver");
  assert.deepEqual(hiver.map((a) => a.nom), ["Carotte", "Échalote", "Endive"]);
  assert.deepEqual(hiver.find((a) => a.id === "endive").moisDeLaSaison, [12, 1, 2]);
  assert.deepEqual(alimentsDeLaSaison(aliments, "été").map((a) => a.nom), ["Carotte nouvelle", "Fraise"]);
});

test("chercherAliments : sans accent ni majuscule", () => {
  assert.deepEqual(chercherAliments(aliments, "echal").map((a) => a.nom), ["Échalote"]);
  assert.deepEqual(chercherAliments(aliments, "  CAROTTE ").map((a) => a.nom), ["Carotte", "Carotte nouvelle"]);
  assert.deepEqual(chercherAliments(aliments, ""), []);
});

test("seriesDeMois et libelleMois : séries consécutives, fin d'année comprise", () => {
  assert.deepEqual(seriesDeMois([5, 6]), [{ debut: 5, fin: 6 }]);
  assert.deepEqual(seriesDeMois([11, 12, 1, 2]), [{ debut: 11, fin: 2 }]);
  assert.equal(libelleMois([11, 12, 1, 2]), "nov. – févr.");
  assert.equal(libelleMois([6]), "juin");
  assert.equal(libelleMois([1, 2, 7, 8]), "janv. – févr. · juil. – août");
  assert.equal(libelleMois([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), "toute l'année");
  assert.equal(libelleMois([]), "");
});

test("moisParIngredient : réunit les mois des aliments qui partagent un ingrédient", () => {
  const carte = moisParIngredient(aliments);
  assert.deepEqual(carte.get("carotte"), [1, 2, 3, 5, 6]);
  assert.deepEqual(carte.get("echalote"), [10, 11, 12]);
  assert.equal(carte.get("fraise"), undefined);
});

test("recettesAvecAliment : recettes qui utilisent un de ses ingrédients", () => {
  const recettes = [
    { id: "a", ingredients: [{ ingredient: "carotte" }] },
    { id: "b", ingredients: [{ ingredient: "sel" }] },
  ];
  assert.deepEqual(recettesAvecAliment(recettes, aliments[3]).map((r) => r.id), ["a"]);
  assert.deepEqual(recettesAvecAliment(recettes, aliments[0]), []);
});

test("données réelles : data/saisonnalite.json est valide et couvre toute l'année", () => {
  const lire = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url), "utf8"));
  const reel = lire("saisonnalite");
  const erreurs = validerDonnees({
    livres: lire("livres"), ingredients: lire("ingredients"), recettes: lire("recettes"), journal: lire("journal"), saisonnalite: reel,
  });
  assert.deepEqual(erreurs, []);
  for (let m = 1; m <= 12; m += 1) {
    assert.ok(alimentsDuMois(reel, m, "legume").length >= 15, `légumes du mois ${m}`);
    assert.ok(alimentsDuMois(reel, m, "fruit").length >= 10, `fruits du mois ${m}`);
  }
});

test("validerDonnees : refuse un mois hors 1-12, un type inconnu et un ingrédient introuvable", () => {
  const erreurs = validerDonnees({
    livres: [], ingredients: [{ id: "sel", nom: "sel", rayon: "Épicerie", saisons: [] }], recettes: [], journal: [],
    saisonnalite: [
      { id: "x", nom: "X", type: "autre", mois: [13] },
      { id: "y", nom: "Y", type: "fruit", mois: [3], ingredients: ["inconnu"] },
    ],
  });
  assert.equal(erreurs.length, 3);
});
