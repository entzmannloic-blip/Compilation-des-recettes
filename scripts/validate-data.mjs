import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAISONS, CATEGORIES, RAYONS, UNITES, REGIMES_INGREDIENT, REGIMES_RECETTE } from "../src/schema.js";

const ETATS_JOURNAL = ["brouillon", "validé"];

const estTexte = (v) => typeof v === "string" && v.trim() !== "";
const estEntierMin = (v, min) => Number.isInteger(v) && v >= min;
const liste = (v) => (Array.isArray(v) ? v : []);

function verifierDoublons(erreurs, chemin, elements) {
  const vus = new Set();
  elements.forEach((el, i) => {
    if (vus.has(el?.id)) erreurs.push(`${chemin}[${i}].id: « ${el.id} » existe déjà`);
    vus.add(el?.id);
  });
}

function validerLivres(livres, erreurs) {
  livres.forEach((l, i) => {
    const c = `livres[${i}]`;
    if (!estTexte(l.id)) erreurs.push(`${c}.id: identifiant obligatoire`);
    if (!estTexte(l.titre)) erreurs.push(`${c}.titre: titre obligatoire`);
    if (l.auteur !== null && !estTexte(l.auteur)) erreurs.push(`${c}.auteur: texte ou null attendu`);
  });
  verifierDoublons(erreurs, "livres", livres);
}

function validerIngredients(ingredients, erreurs) {
  ingredients.forEach((ing, i) => {
    const c = `ingredients[${i}]`;
    if (!estTexte(ing.id)) erreurs.push(`${c}.id: identifiant obligatoire`);
    if (!estTexte(ing.nom)) erreurs.push(`${c}.nom: nom obligatoire`);
    if (!RAYONS.includes(ing.rayon)) erreurs.push(`${c}.rayon: « ${ing.rayon} » n'est pas un rayon connu`);
    if (!Array.isArray(ing.saisons) || ing.saisons.some((s) => !SAISONS.includes(s))) {
      erreurs.push(`${c}.saisons: liste de saisons attendue (vide = toute l'année)`);
    }
    if (ing.regime !== undefined && !REGIMES_INGREDIENT.includes(ing.regime)) {
      erreurs.push(`${c}.regime: « ${ing.regime} » n'est pas un régime connu (${REGIMES_INGREDIENT.join(", ")})`);
    }
  });
  verifierDoublons(erreurs, "ingredients", ingredients);
}

function validerOrigine(o, c, idsLivres, erreurs) {
  if (o?.type === "livre") {
    if (!idsLivres.has(o.livre)) erreurs.push(`${c}.livre: livre « ${o.livre} » introuvable`);
    if (!estEntierMin(o.page, 1)) erreurs.push(`${c}.page: numéro de page (entier ≥ 1) attendu`);
  } else if (o?.type === "web") {
    if (!estTexte(o.source)) erreurs.push(`${c}.source: nom de la source obligatoire`);
    if (typeof o.url !== "string" || !o.url.startsWith("https://")) {
      erreurs.push(`${c}.url: adresse en https obligatoire`);
    }
  } else {
    erreurs.push(`${c}.type: « livre » ou « web » attendu`);
  }
}

function validerLigne(ligne, c, idsIngredients, erreurs) {
  if (!idsIngredients.has(ligne.ingredient)) {
    erreurs.push(`${c}.ingredient: ingrédient « ${ligne.ingredient} » introuvable`);
  }
  const { quantite, unite } = ligne;
  if (quantite !== null && !(typeof quantite === "number" && quantite > 0)) {
    erreurs.push(`${c}.quantite: nombre > 0 ou null attendu`);
  }
  if (unite !== null && !UNITES.includes(unite)) {
    erreurs.push(`${c}.unite: « ${unite} » n'est pas une unité connue`);
  }
  if ((quantite === null) !== (unite === null)) {
    erreurs.push(`${c}: quantité et unité vont ensemble (toutes deux renseignées ou toutes deux null)`);
  }
}

function validerRecette(r, i, idsLivres, idsIngredients, erreurs) {
  const c = `recettes[${i}]`;
  if (!estTexte(r.id)) erreurs.push(`${c}.id: identifiant obligatoire`);
  if (!estTexte(r.titre)) erreurs.push(`${c}.titre: titre obligatoire`);
  validerOrigine(r.origine, `${c}.origine`, idsLivres, erreurs);
  if (!Array.isArray(r.saisons) || r.saisons.length === 0 || r.saisons.some((s) => !SAISONS.includes(s))) {
    erreurs.push(`${c}.saisons: au moins une saison attendue`);
  }
  if (!CATEGORIES.includes(r.categorie)) erreurs.push(`${c}.categorie: « ${r.categorie} » n'est pas une catégorie connue`);
  if (!estTexte(r.type)) erreurs.push(`${c}.type: type obligatoire`);
  if (!estEntierMin(r.personnes, 1)) erreurs.push(`${c}.personnes: nombre entier ≥ 1 obligatoire`);
  if (r.personnes_texte !== null && !estTexte(r.personnes_texte)) {
    erreurs.push(`${c}.personnes_texte: texte ou null attendu`);
  }
  for (const k of ["preparation", "cuisson"]) {
    const t = r.temps?.[k];
    if (t !== null && !estEntierMin(t, 0)) erreurs.push(`${c}.temps.${k}: entier ≥ 0 ou null attendu`);
  }
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    erreurs.push(`${c}.ingredients: au moins un ingrédient attendu`);
  }
  liste(r.ingredients).forEach((l, j) => {
    validerLigne(l, `${c}.ingredients[${j}]`, idsIngredients, erreurs);
    if (l.precision !== null && !estTexte(l.precision)) {
      erreurs.push(`${c}.ingredients[${j}].precision: texte ou null attendu`);
    }
  });
  if (!Array.isArray(r.etapes) || r.etapes.length === 0 || r.etapes.some((e) => !estTexte(e))) {
    erreurs.push(`${c}.etapes: au moins une étape (texte) attendue`);
  }
  if (!Array.isArray(r.notes) || r.notes.some((n) => !estTexte(n))) {
    erreurs.push(`${c}.notes: liste de textes attendue`);
  }
  if (r.photo !== null && !estTexte(r.photo)) erreurs.push(`${c}.photo: texte ou null attendu`);
  if (r.regime !== undefined && !REGIMES_RECETTE.includes(r.regime)) {
    erreurs.push(`${c}.regime: « ${r.regime} » n'est pas un régime connu (${REGIMES_RECETTE.join(", ")})`);
  }
}

function verifierUniciteLivrePage(recettes, erreurs) {
  const vues = new Map();
  recettes.forEach((r, i) => {
    if (r.origine?.type !== "livre") return;
    const cle = `${r.origine.livre}|${r.origine.page}|${r.titre}`;
    if (vues.has(cle)) {
      erreurs.push(`recettes[${i}]: même livre, même page et même titre que recettes[${vues.get(cle)}]`);
    }
    vues.set(cle, i);
  });
}

function validerJournal(journal, idsRecettes, idsLivres, erreurs) {
  journal.forEach((e, i) => {
    const c = `journal[${i}]`;
    if (!idsLivres.has(e.livre)) erreurs.push(`${c}.livre: livre « ${e.livre} » introuvable`);
    if (!estEntierMin(e.page, 1)) erreurs.push(`${c}.page: numéro de page (entier ≥ 1) attendu`);
    if (!estTexte(e.date)) erreurs.push(`${c}.date: date obligatoire`);
    if (!ETATS_JOURNAL.includes(e.etat)) erreurs.push(`${c}.etat: « brouillon » ou « validé » attendu`);
    if (!idsRecettes.has(e.recette)) erreurs.push(`${c}.recette: recette « ${e.recette} » introuvable`);
  });
}

function validerSaisonnalite(aliments, idsIngredients, erreurs) {
  aliments.forEach((a, i) => {
    const c = `saisonnalite[${i}]`;
    if (!estTexte(a.id)) erreurs.push(`${c}.id: identifiant obligatoire`);
    if (!estTexte(a.nom)) erreurs.push(`${c}.nom: nom obligatoire`);
    if (a.type !== "legume" && a.type !== "fruit") erreurs.push(`${c}.type: « legume » ou « fruit » attendu`);
    if (!Array.isArray(a.mois) || a.mois.length === 0 || a.mois.some((m) => !estEntierMin(m, 1) || m > 12) || new Set(a.mois).size !== a.mois.length) {
      erreurs.push(`${c}.mois: liste de mois (1 à 12, sans doublon) attendue`);
    }
    liste(a.ingredients).forEach((id) => {
      if (!idsIngredients.has(id)) erreurs.push(`${c}.ingredients: ingrédient « ${id} » introuvable`);
    });
  });
  verifierDoublons(erreurs, "saisonnalite", aliments);
}

export function validerDonnees({ livres, ingredients, recettes, journal, saisonnalite = [] }) {
  const erreurs = [];
  validerLivres(livres, erreurs);
  validerIngredients(ingredients, erreurs);
  const idsLivres = new Set(livres.map((l) => l.id));
  const idsIngredients = new Set(ingredients.map((i) => i.id));
  recettes.forEach((r, i) => validerRecette(r, i, idsLivres, idsIngredients, erreurs));
  verifierDoublons(erreurs, "recettes", recettes);
  verifierUniciteLivrePage(recettes, erreurs);
  validerJournal(journal, new Set(recettes.map((r) => r.id)), idsLivres, erreurs);
  validerSaisonnalite(saisonnalite, idsIngredients, erreurs);
  return erreurs;
}

function lireDonnees() {
  const lire = (nom) => JSON.parse(readFileSync(new URL(`../data/${nom}.json`, import.meta.url), "utf8"));
  return {
    livres: lire("livres"),
    ingredients: lire("ingredients"),
    recettes: lire("recettes"),
    journal: lire("journal"),
    saisonnalite: lire("saisonnalite"),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const donnees = lireDonnees();
  const erreurs = validerDonnees(donnees);
  if (erreurs.length === 0) {
    console.log(`OK : ${donnees.recettes.length} recettes, ${donnees.saisonnalite.length} aliments de saison`);
  } else {
    console.error(erreurs.join("\n"));
    process.exit(1);
  }
}
