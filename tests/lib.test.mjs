import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliser, saisonDuMois, saisonsDeduites, filtrerRecettes,
  typesDisponibles, facteur, quantiteAjustee, formaterQuantite,
  tempsTotalMinutes, sourcesDisponibles, personnesDisponibles, ingredientsDisponibles,
} from "../src/lib.js";
import { SAISONS } from "../src/schema.js";

const ingredients = [
  { id: "courge", nom: "Courge", rayon: "Légumes", saisons: ["automne", "hiver"] },
  { id: "oignon", nom: "Oignon", rayon: "Légumes", saisons: [] },
  { id: "tomate", nom: "Tomate", rayon: "Légumes", saisons: ["été"] },
  { id: "echalote", nom: "Échalote", rayon: "Légumes", saisons: [] },
  { id: "lentilles", nom: "Lentilles cuites", rayon: "Épicerie", saisons: [] },
];

const ligne = (id) => ({ ingredient: id, quantite: 1, unite: "pièce", precision: null });

const recettes = [
  { id: "quiche", titre: "Quiche aux poireaux", saisons: ["hiver"], categorie: "plat", type: "tarte", personnes: 4, ingredients: [ligne("oignon")] },
  { id: "salade", titre: "Salade de lentilles", saisons: ["hiver"], categorie: "plat", type: "salade", personnes: 2, ingredients: [ligne("lentilles"), ligne("echalote")] },
  { id: "gaspacho", titre: "Gaspacho", saisons: ["été"], categorie: "entrée", type: "soupe", personnes: 4, ingredients: [ligne("tomate")] },
  { id: "velouté", titre: "Velouté de courge", saisons: ["automne", "hiver"], categorie: "entrée", type: "soupe", personnes: 4, ingredients: [ligne("courge")] },
];

test("normaliser : minuscules, sans accents, ligatures, espaces coupés", () => {
  assert.equal(normaliser("Échalote "), "echalote");
  assert.equal(normaliser("ŒUF"), "oeuf");
  assert.equal(normaliser("  Tæ "), "tae");
});

test("saisonDuMois : une saison par mois", () => {
  assert.equal(saisonDuMois(new Date(2026, 9, 8)), "automne");
  assert.equal(saisonDuMois(new Date(2026, 11, 1)), "hiver");
  assert.equal(saisonDuMois(new Date(2026, 2, 1)), "printemps");
  assert.equal(saisonDuMois(new Date(2026, 7, 31)), "été");
  assert.equal(saisonDuMois(new Date(2026, 1, 15)), "hiver");
  assert.equal(saisonDuMois(new Date(2026, 4, 31)), "printemps");
});

test("saisonsDeduites : intersection des ingrédients saisonniers", () => {
  assert.deepEqual(saisonsDeduites({ ingredients: [ligne("courge"), ligne("oignon")] }, ingredients), ["automne", "hiver"]);
  assert.deepEqual(saisonsDeduites({ ingredients: [ligne("courge"), ligne("tomate")] }, ingredients), []);
  assert.deepEqual(saisonsDeduites({ ingredients: [ligne("oignon")] }, ingredients), SAISONS);
});

test("filtrerRecettes : recherche sur titre et ingrédients, sans accents ni casse", () => {
  const parIngredient = filtrerRecettes(recettes, ingredients, { recherche: "echalote" });
  assert.deepEqual(parIngredient.map((r) => r.id), ["salade"]);
  const parTitre = filtrerRecettes(recettes, ingredients, { recherche: "QUICHE" });
  assert.deepEqual(parTitre.map((r) => r.id), ["quiche"]);
});

test("filtrerRecettes : filtres combinés en « et »", () => {
  assert.deepEqual(filtrerRecettes(recettes, ingredients, { saison: "été" }).map((r) => r.id), ["gaspacho"]);
  assert.deepEqual(filtrerRecettes(recettes, ingredients, { categorie: "entrée", saison: "hiver" }).map((r) => r.id), ["velouté"]);
  assert.deepEqual(filtrerRecettes(recettes, ingredients, { type: "soupe", saison: "automne" }).map((r) => r.id), ["velouté"]);
});

test("filtrerRecettes : liste vide si rien ne correspond", () => {
  assert.deepEqual(filtrerRecettes(recettes, ingredients, { recherche: "zzz" }), []);
  assert.deepEqual(filtrerRecettes(recettes, ingredients, { categorie: "plat", saison: "été" }), []);
});

test("filtrerRecettes : sans filtre, tout est rendu trié par titre", () => {
  assert.deepEqual(
    filtrerRecettes(recettes, ingredients, {}).map((r) => r.id),
    ["gaspacho", "quiche", "salade", "velouté"],
  );
});

test("typesDisponibles : types uniques triés", () => {
  assert.deepEqual(typesDisponibles(recettes), ["salade", "soupe", "tarte"]);
});

test("facteur et quantiteAjustee", () => {
  assert.equal(facteur({ personnes: 2 }, 4), 2);
  assert.equal(quantiteAjustee(3, 0.5), 1.5);
  assert.equal(quantiteAjustee(null, 2), null);
  assert.equal(quantiteAjustee(1, 1 / 3), 0.33);
});

test("formaterQuantite", () => {
  assert.equal(formaterQuantite(200, "g"), "200 g");
  assert.equal(formaterQuantite(0.5, "bouquet"), "0,5 bouquet");
  assert.equal(formaterQuantite(3, "pièce"), "3");
  assert.equal(formaterQuantite(null, null), "au goût");
  assert.equal(formaterQuantite(2, "c. à soupe"), "2 c. à soupe");
  assert.equal(formaterQuantite(1.333, "cl"), "1,33 cl");
});

// ---------- filtres supplémentaires : livre, temps, personnes, ingrédient ----------
const livres = [{ id: "a", titre: "Livre A", auteur: null }, { id: "b", titre: "Livre B", auteur: null }, { id: "vide", titre: "Sans recette", auteur: null }];
const q = (id, n = 1) => ({ ingredient: id, quantite: n, unite: "pièce", precision: null });
const base = { ingredient: "oignon", quantite: null, unite: null, precision: null };
const riches = [
  { id: "r1", titre: "Rapide", saisons: ["hiver"], categorie: "plat", type: "salade", personnes: 2, origine: { type: "livre", livre: "a", page: 1 }, temps: { preparation: 10, cuisson: 5 }, ingredients: [q("courge"), base] },
  { id: "r2", titre: "Long", saisons: ["hiver"], categorie: "plat", type: "tarte", personnes: 4, origine: { type: "livre", livre: "b", page: 2 }, temps: { preparation: 20, cuisson: 60 }, ingredients: [q("tomate")] },
  { id: "r3", titre: "Sans temps", saisons: ["été"], categorie: "entrée", type: "salade", personnes: 4, origine: { type: "web", source: "Site", url: "https://exemple.fr" }, temps: { preparation: null, cuisson: null }, ingredients: [q("courge")] },
];

test("tempsTotalMinutes : somme, ou null si aucun temps", () => {
  assert.equal(tempsTotalMinutes(riches[0]), 15);
  assert.equal(tempsTotalMinutes({ temps: { preparation: 10, cuisson: null } }), 10);
  assert.equal(tempsTotalMinutes(riches[2]), null);
  assert.equal(tempsTotalMinutes({}), null);
});

test("filtrerRecettes : livre, web, temps max, personnes, ingrédient", () => {
  const ids = (f) => filtrerRecettes(riches, ingredients, f).map((r) => r.id);
  assert.deepEqual(ids({ livre: "a" }), ["r1"]);
  assert.deepEqual(ids({ livre: "web" }), ["r3"]);
  assert.deepEqual(ids({ tempsMax: 30 }), ["r1"]); // r3 sans temps connu : écartée
  assert.deepEqual(ids({ tempsMax: 90 }), ["r2", "r1"]); // triés par titre : Long, Rapide
  assert.deepEqual(ids({ personnes: 4 }), ["r2", "r3"]);
  assert.deepEqual(ids({ ingredient: "courge" }), ["r1", "r3"]);
  assert.deepEqual(ids({ ingredient: "courge", livre: "web" }), ["r3"]);
});

test("sourcesDisponibles : livres avec recettes, plus Internet", () => {
  assert.deepEqual(sourcesDisponibles(riches, livres), [
    { id: "a", titre: "Livre A" }, { id: "b", titre: "Livre B" }, { id: "web", titre: "Internet" },
  ]);
  assert.deepEqual(sourcesDisponibles([], livres), []);
});

test("personnesDisponibles : valeurs uniques croissantes", () => {
  assert.deepEqual(personnesDisponibles(riches), [2, 4]);
});

test("ingredientsDisponibles : au moins 2 recettes, sans les ingrédients jamais quantifiés", () => {
  assert.deepEqual(ingredientsDisponibles(riches, ingredients), [{ id: "courge", nom: "Courge" }]);
  assert.deepEqual(ingredientsDisponibles(riches, ingredients, 1), [
    { id: "courge", nom: "Courge" }, { id: "tomate", nom: "Tomate" },
  ]);
});
