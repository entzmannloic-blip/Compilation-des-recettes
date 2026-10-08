import { test } from "node:test";
import assert from "node:assert/strict";
import { validerDonnees } from "../scripts/validate-data.mjs";

function jeuValide() {
  return {
    livres: [{ id: "la-flemme", titre: "La flemme", auteur: null }],
    ingredients: [
      { id: "carotte", nom: "carotte", rayon: "Légumes", saisons: [] },
      { id: "feta", nom: "feta", rayon: "Crèmerie", saisons: [] },
      { id: "sel", nom: "sel", rayon: "Épicerie", saisons: [] },
    ],
    recettes: [
      {
        id: "salade-test",
        titre: "Salade test",
        origine: { type: "livre", livre: "la-flemme", page: 22 },
        saisons: ["hiver"],
        categorie: "plat",
        type: "salade",
        personnes: 2,
        personnes_texte: null,
        temps: { preparation: 8, cuisson: 2 },
        ingredients: [
          { ingredient: "carotte", quantite: 3, unite: "pièce", precision: null },
          { ingredient: "feta", quantite: 100, unite: "g", precision: null },
          { ingredient: "sel", quantite: null, unite: null, precision: null },
        ],
        etapes: ["Mélanger."],
        notes: [],
        photo: null,
      },
    ],
    journal: [],
  };
}

function messages(modifier) {
  const jeu = jeuValide();
  modifier(jeu);
  return validerDonnees(jeu);
}

function secondeRecette(jeu, surcharge) {
  jeu.recettes.push({ ...structuredClone(jeu.recettes[0]), ...surcharge });
}

test("un jeu valide ne produit aucune erreur", () => {
  assert.deepEqual(validerDonnees(jeuValide()), []);
});

for (const [libelle, valeur] of [["0", 0], ["-1", -1], ["2.5", 2.5], ['"2"', "2"]]) {
  test(`personnes = ${libelle} est refusé`, () => {
    const erreurs = messages((j) => { j.recettes[0].personnes = valeur; });
    assert.ok(erreurs.some((e) => e.includes("personnes")), erreurs.join("\n"));
  });
}

test("personnes absent est refusé", () => {
  const erreurs = messages((j) => { delete j.recettes[0].personnes; });
  assert.ok(erreurs.some((e) => e.includes("personnes")), erreurs.join("\n"));
});

test("un ingrédient de recette inexistant est refusé", () => {
  const erreurs = messages((j) => { j.recettes[0].ingredients[0].ingredient = "inconnu"; });
  assert.ok(erreurs.some((e) => e.includes("inconnu")), erreurs.join("\n"));
});

test("quantité absente avec une unité est refusée", () => {
  const erreurs = messages((j) => {
    Object.assign(j.recettes[0].ingredients[0], { quantite: null, unite: "g" });
  });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("quantité et unité toutes deux absentes (sel, poivre) sont acceptées", () => {
  const erreurs = messages((j) => {
    Object.assign(j.recettes[0].ingredients[0], { quantite: null, unite: null });
  });
  assert.deepEqual(erreurs, []);
});

test("une unité inconnue est refusée", () => {
  const erreurs = messages((j) => { j.recettes[0].ingredients[0].unite = "tasse"; });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("un rayon inconnu est refusé", () => {
  const erreurs = messages((j) => { j.ingredients[0].rayon = "Cave"; });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("une catégorie inconnue est refusée", () => {
  const erreurs = messages((j) => { j.recettes[0].categorie = "dessert"; });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("une recette sans saison est refusée", () => {
  const erreurs = messages((j) => { j.recettes[0].saisons = []; });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("une origine livre vers un livre absent est refusée", () => {
  const erreurs = messages((j) => { j.recettes[0].origine.livre = "absent"; });
  assert.ok(erreurs.some((e) => e.includes("absent")), erreurs.join("\n"));
});

test("une origine web doit être en https", () => {
  const erreurs = messages((j) => {
    j.recettes[0].origine = { type: "web", source: "Un blog", url: "http://x" };
  });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("une origine web en https est acceptée", () => {
  const erreurs = messages((j) => {
    j.recettes[0].origine = { type: "web", source: "Un blog", url: "https://x.fr/recette" };
  });
  assert.deepEqual(erreurs, []);
});

test("deux recettes avec le même id sont refusées", () => {
  const erreurs = messages((j) => {
    secondeRecette(j, { titre: "Autre titre", origine: { type: "livre", livre: "la-flemme", page: 30 } });
  });
  assert.ok(erreurs.some((e) => e.includes("id")), erreurs.join("\n"));
});

test("même livre, même page et même titre sont refusés", () => {
  const erreurs = messages((j) => { secondeRecette(j, { id: "autre-id" }); });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("même livre et même page avec des titres différents sont acceptés", () => {
  const erreurs = messages((j) => { secondeRecette(j, { id: "autre-id", titre: "Autre salade" }); });
  assert.deepEqual(erreurs, []);
});

test("une recette sans étape est refusée", () => {
  const erreurs = messages((j) => { j.recettes[0].etapes = []; });
  assert.equal(erreurs.length, 1, erreurs.join("\n"));
});

test("une entrée de journal vers une recette inexistante est refusée", () => {
  const erreurs = messages((j) => {
    j.journal.push({ livre: "la-flemme", page: 22, date: "2026-10-08", etat: "brouillon", recette: "fantome" });
  });
  assert.ok(erreurs.some((e) => e.includes("fantome")), erreurs.join("\n"));
});
