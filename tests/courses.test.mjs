import { test } from "node:test";
import assert from "node:assert/strict";
import { compilerCourses, texteCourses, chargerCoches, sauverCoches, GROUPES } from "../src/courses.js";

const ingredients = [
  { id: "carotte", nom: "carotte", rayon: "Légumes", saisons: [] },
  { id: "persil", nom: "persil", rayon: "Herbes", saisons: [] },
  { id: "pomme", nom: "pomme", rayon: "Fruits", saisons: [] },
  { id: "feta", nom: "feta", rayon: "Crèmerie", saisons: [] },
  { id: "oeufs", nom: "œufs", rayon: "Crèmerie", saisons: [] },
  { id: "poulet", nom: "poulet", rayon: "Boucherie", saisons: [] },
  { id: "pain", nom: "pain", rayon: "Boulangerie", saisons: [] },
  { id: "farine", nom: "farine", rayon: "Épicerie", saisons: [] },
  { id: "huile", nom: "huile", rayon: "Épicerie", saisons: [] },
  { id: "petits-pois", nom: "petits pois", rayon: "Surgelés", saisons: [] },
  { id: "vin", nom: "vin blanc", rayon: "Autre", saisons: [] },
];
const l = (ingredient, quantite = null, unite = null) => ({ ingredient, quantite, unite, precision: null });
const rec = (id, personnes, lignes) => ({ id, titre: `Recette ${id}`, personnes, ingredients: lignes });

function items(liste) {
  return Object.fromEntries(liste.groupes.flatMap((g) => g.items.map((i) => [i.id, i.texte])));
}

test("semaine vide : liste vide", () => {
  const liste = compilerCourses([rec("a", 2, [l("carotte", 2, "pièce")])], ingredients, {});
  assert.deepEqual(liste, { recettes: 0, articles: 0, groupes: [], placard: [] });
});

test("mêmes ingrédients, même unité : additionnés", () => {
  const recettes = [rec("a", 2, [l("farine", 200, "g")]), rec("b", 4, [l("farine", 300, "g")])];
  const liste = compilerCourses(recettes, ingredients, { a: 2, b: 4 });
  assert.equal(items(liste).farine, "500 g");
  assert.equal(liste.recettes, 2);
});

test("le nombre de personnes proportionne les quantités", () => {
  const recettes = [rec("a", 2, [l("farine", 100, "g")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 6 })).farine, "300 g");
});

test("g et kg s'additionnent ; au-delà de 1000 g on passe en kg", () => {
  const recettes = [rec("a", 2, [l("farine", 800, "g")]), rec("b", 2, [l("farine", 0.7, "kg")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 2, b: 2 })).farine, "1,5 kg");
});

test("ml, cl et l s'additionnent", () => {
  const recettes = [rec("a", 2, [l("huile", 20, "cl")]), rec("b", 2, [l("huile", 300, "ml")]), rec("c", 2, [l("huile", 1, "l")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 2, b: 2, c: 2 })).huile, "1,5 l");
  assert.equal(items(compilerCourses(recettes.slice(0, 2), ingredients, { a: 2, b: 2 })).huile, "500 ml");
});

test("unités différentes : 2 unités + 250 g, signalé comme mélange", () => {
  const recettes = [rec("a", 2, [l("carotte", 2, "pièce")]), rec("b", 2, [l("carotte", 250, "g")])];
  const liste = compilerCourses(recettes, ingredients, { a: 2, b: 2 });
  const carotte = liste.groupes[0].items[0];
  assert.equal(carotte.texte, "2 unités + 250 g");
  assert.equal(carotte.melange, true);
  assert.deepEqual(carotte.recettes, ["Recette a", "Recette b"]);
});

test("une seule unité : pas de « unités », arrondi à l'entier supérieur", () => {
  const recettes = [rec("a", 2, [l("oeufs", 1, "pièce")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 3 })).oeufs, "2");
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 2 })).oeufs, "1");
});

test("pas de faux arrondi supérieur sur 3 × 1/3", () => {
  const recettes = [rec("a", 3, [l("oeufs", 1, "pièce")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 1 })).oeufs, "1");
});

test("bouquet et cuillères gardent leurs fractions", () => {
  const recettes = [rec("a", 2, [l("persil", 0.5, "bouquet")]), rec("b", 2, [l("persil", 0.5, "bouquet")])];
  assert.equal(items(compilerCourses(recettes, ingredients, { a: 2, b: 2 })).persil, "1 bouquet");
  assert.equal(items(compilerCourses([recettes[0]], ingredients, { a: 2 })).persil, "½ bouquet");
});

test("sans quantité partout : au placard ; avec une quantité ailleurs : quantité seule", () => {
  const recettes = [
    rec("a", 2, [l("huile"), l("farine", 100, "g")]),
    rec("b", 2, [l("farine"), l("huile")]),
  ];
  const liste = compilerCourses(recettes, ingredients, { a: 2, b: 2 });
  assert.deepEqual(liste.placard.map((i) => i.id), ["huile"]);
  assert.equal(items(liste).farine, "100 g");
});

test("ordre du marché : légumes (herbes avec), fruits, crèmerie, viande, boulangerie, épicerie, surgelés, autre", () => {
  const tout = rec("a", 1, ingredients.map((i) => l(i.id, 1, "pièce")));
  const liste = compilerCourses([tout], ingredients, { a: 1 });
  assert.deepEqual(liste.groupes.map((g) => g.titre), [
    "Légumes", "Fruits", "Fromages et crèmerie", "Viande", "Boulangerie", "Épicerie", "Surgelés", "Autre",
  ]);
  assert.deepEqual(liste.groupes[0].items.map((i) => i.id), ["carotte", "persil"]);
  assert.equal(GROUPES[4].titre, "Poissonnerie");
});

test("recette absente de la semaine ignorée ; ingrédient inconnu rangé dans « Autre »", () => {
  const recettes = [rec("a", 2, [l("mystere", 1, "pièce")]), rec("b", 2, [l("carotte", 1, "pièce")])];
  const liste = compilerCourses(recettes, ingredients, { a: 2, zzz: 4 });
  assert.equal(liste.recettes, 1);
  assert.equal(liste.groupes[0].titre, "Autre");
  assert.equal(liste.groupes[0].items[0].nom, "mystere");
});

test("texteCourses : par rayon, sans les cases cochées", () => {
  const recettes = [rec("a", 2, [l("carotte", 2, "pièce"), l("farine", 100, "g"), l("huile")])];
  const liste = compilerCourses(recettes, ingredients, { a: 2 });
  const farine = liste.groupes[1].items[0];
  assert.equal(texteCourses(liste, new Set()), "Légumes\n- carotte : 2\n\nÉpicerie\n- farine : 100 g\n\nÀ vérifier au placard\n- huile");
  assert.equal(texteCourses(liste, new Set([farine.cle])), "Légumes\n- carotte : 2\n\nÀ vérifier au placard\n- huile");
});

test("cases cochées : enregistrées et relues, tolérantes aux erreurs", () => {
  const memoire = new Map();
  const stockage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
  sauverCoches(stockage, new Set(["a|1", "b|2 g"]));
  assert.deepEqual([...chargerCoches(stockage)], ["a|1", "b|2 g"]);
  assert.deepEqual([...chargerCoches({ getItem: () => "pas du json" })], []);
  assert.deepEqual([...chargerCoches({ getItem: () => { throw new Error("refusé"); } })], []);
  assert.doesNotThrow(() => sauverCoches({ setItem() { throw new Error("plein"); } }, new Set(["x"])));
});
