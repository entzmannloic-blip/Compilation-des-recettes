// Liste de courses : additionne les ingrédients des recettes de « Ma semaine »,
// rangés dans l'ordre du marché. Fonctions pures ; le stockage est injecté comme pour semaine.js.
import { facteur, quantiteAjustee, formaterQuantite } from "./lib.js";

const CLE_COCHES = "compilation-recettes.courses-cochees";

// Ordre du marché puis de l'épicerie. Un rayon inconnu tombe dans « Autre ».
export const GROUPES = [
  { titre: "Légumes", rayons: ["Légumes", "Herbes"] },
  { titre: "Fruits", rayons: ["Fruits"] },
  { titre: "Fromages et crèmerie", rayons: ["Crèmerie"] },
  { titre: "Viande", rayons: ["Boucherie"] },
  { titre: "Poissonnerie", rayons: ["Poissonnerie"] },
  { titre: "Boulangerie", rayons: ["Boulangerie"] },
  { titre: "Épicerie", rayons: ["Épicerie"] },
  { titre: "Surgelés", rayons: ["Surgelés"] },
  { titre: "Autre", rayons: ["Autre"] },
];

const arrondir2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const virgule = (n) => String(arrondir2(n)).replace(".", ",");

// Unités qu'on peut additionner entre elles (g + kg, ml + cl + l) ; les autres ne s'additionnent qu'à l'identique.
function famille(unite) {
  switch (unite) {
    case "g": return { cle: "masse", base: 1 };
    case "kg": return { cle: "masse", base: 1000 };
    case "ml": return { cle: "volume", base: 1 };
    case "cl": return { cle: "volume", base: 10 };
    case "l": return { cle: "volume", base: 1000 };
    default: return { cle: unite || "pièce", base: 1 };
  }
}

const ORDRE_UNITES = ["pièce", "masse", "volume", "bouquet", "gousse", "c. à soupe", "c. à café", "pincée", "boîte"];
const ARRONDI_SUPERIEUR = ["pièce", "gousse", "boîte"]; // « 1,5 œuf » s'achète 2 œufs

function rang(cle) {
  const i = ORDRE_UNITES.indexOf(cle);
  return i === -1 ? ORDRE_UNITES.length : i;
}

function texteQuantite(cle, valeur, melange) {
  const v = arrondir2(valeur);
  if (cle === "masse") return v >= 1000 ? `${virgule(v / 1000)} kg` : `${virgule(v)} g`;
  if (cle === "volume") return v >= 1000 ? `${virgule(v / 1000)} l` : `${virgule(v)} ml`;
  if (cle === "pièce") {
    const n = Math.ceil(v);
    return melange ? `${n} unité${n > 1 ? "s" : ""}` : String(n);
  }
  if (ARRONDI_SUPERIEUR.includes(cle)) return formaterQuantite(Math.ceil(v), cle);
  return formaterQuantite(v, cle);
}

/**
 * Compile la liste de courses.
 * `semaine` : { [idRecette]: personnes }. Renvoie
 * { recettes, articles, groupes: [{ titre, items }], placard: [item] } ; un item est
 * { id, nom, texte, melange, recettes: [titres], cle } (texte vide pour le placard).
 */
export function compilerCourses(recettes, ingredients, semaine) {
  const infos = new Map(ingredients.map((i) => [i.id, i]));
  const brut = new Map();
  let nbRecettes = 0;

  for (const recette of recettes) {
    if (!Object.hasOwn(semaine, recette.id)) continue;
    nbRecettes += 1;
    const mult = facteur(recette, semaine[recette.id]);
    for (const ligne of recette.ingredients) {
      const info = infos.get(ligne.ingredient);
      let entree = brut.get(ligne.ingredient);
      if (!entree) {
        entree = { id: ligne.ingredient, nom: info ? info.nom : ligne.ingredient, rayon: info ? info.rayon : "Autre", totaux: new Map(), recettes: new Set() };
        brut.set(ligne.ingredient, entree);
      }
      entree.recettes.add(recette.titre);
      const quantite = quantiteAjustee(ligne.quantite, mult);
      if (quantite === null) continue;
      const { cle, base } = famille(ligne.unite);
      entree.totaux.set(cle, (entree.totaux.get(cle) ?? 0) + quantite * base);
    }
  }

  const parGroupe = new Map(GROUPES.map((g) => [g.titre, []]));
  const placard = [];
  for (const entree of brut.values()) {
    const base = { id: entree.id, nom: entree.nom, recettes: [...entree.recettes] };
    if (entree.totaux.size === 0) {
      placard.push({ ...base, texte: "", melange: false, cle: `${entree.id}|` });
      continue;
    }
    const cles = [...entree.totaux.keys()].sort((a, b) => rang(a) - rang(b));
    const melange = cles.length > 1;
    const texte = cles.map((c) => texteQuantite(c, entree.totaux.get(c), melange)).join(" + ");
    const groupe = GROUPES.find((g) => g.rayons.includes(entree.rayon)) ?? GROUPES[GROUPES.length - 1];
    parGroupe.get(groupe.titre).push({ ...base, texte, melange, cle: `${entree.id}|${texte}` });
  }

  const parNom = (a, b) => a.nom.localeCompare(b.nom, "fr");
  const groupes = GROUPES
    .map((g) => ({ titre: g.titre, items: parGroupe.get(g.titre).sort(parNom) }))
    .filter((g) => g.items.length > 0);
  placard.sort(parNom);
  const articles = groupes.reduce((n, g) => n + g.items.length, 0) + placard.length;
  return { recettes: nbRecettes, articles, groupes, placard };
}

/** Texte à coller (Google Keep…) : seulement ce qui n'est pas encore coché. */
export function texteCourses(liste, coches) {
  const blocs = [];
  for (const g of liste.groupes) {
    const restants = g.items.filter((i) => !coches.has(i.cle));
    if (restants.length) blocs.push([g.titre, ...restants.map((i) => `- ${i.nom} : ${i.texte}`)].join("\n"));
  }
  const restantsPlacard = liste.placard.filter((i) => !coches.has(i.cle));
  if (restantsPlacard.length) blocs.push(["À vérifier au placard", ...restantsPlacard.map((i) => `- ${i.nom}`)].join("\n"));
  return blocs.join("\n\n");
}

/** Cases cochées (clés d'items) ; ensemble vide si le stockage est absent ou illisible. */
export function chargerCoches(storage) {
  try {
    const lu = JSON.parse(storage.getItem(CLE_COCHES));
    return new Set(Array.isArray(lu) ? lu.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Enregistre les cases cochées ; ne lève jamais d'erreur. */
export function sauverCoches(storage, coches) {
  try {
    storage.setItem(CLE_COCHES, JSON.stringify([...coches]));
  } catch {
    // Sans stockage, les cases restent valables pour la session en cours.
  }
}
