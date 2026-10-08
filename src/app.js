// Interface : De saison, fiche de recette, Livres. Tout le DOM est construit avec
// createElement / textContent (jamais innerHTML avec des données).
import {
  filtrerRecettes, typesDisponibles, saisonDuMois, facteur, quantiteAjustee, formaterQuantite,
  sourcesDisponibles, personnesDisponibles, ingredientsDisponibles,
} from "./lib.js";
import { chargerSemaine, sauverSemaine, basculer, definirPersonnes } from "./semaine.js";
import { lireRoute } from "./routes.js";
import { chargerListe, sauverListe, ajouterRecent, basculerFavori, CLES } from "./memoire.js";
import { compilerCourses, texteCourses, chargerCoches, sauverCoches } from "./courses.js";

const vue = document.getElementById("vue");
const barre = document.getElementById("nav");

// Stockage protégé : s'il est refusé, la semaine reste valable le temps de la session.
function ouvrirStockage() {
  try {
    const s = window.localStorage;
    s.getItem("compilation-recettes.test");
    return s;
  } catch {
    return { getItem() { return null; }, setItem() {} };
  }
}
const stockage = ouvrirStockage();

let donnees = null; // { recettes, ingredients, livres }
let semaine = {};
// Favoris et recettes vues récemment, gardés sur le téléphone.
let favoris = new Set(chargerListe(stockage, CLES.favoris));
let recents = chargerListe(stockage, CLES.recents);
// Filtres de l'écran « De saison », conservés pendant la session.
// saison : « auto » = la saison du moment, "" = toute l'année.
const FILTRES_PAR_DEFAUT = { saison: "auto", livre: "", categorie: "", type: "", temps: 0, personnes: 0, ingredient: "", favoris: false };
const filtres = { ...FILTRES_PAR_DEFAUT, recherche: "", ouvert: false, rechercheOuverte: false };
// Nombre de personnes choisi sur la fiche, par recette (pour les recettes hors semaine).
const personnesFiche = {};
// Ingrédients cochés sur la fiche, par recette (le temps de la session).
const cocheesFiche = new Map();
// Nombre d'écrans vus : tant qu'il n'y en a qu'un, « Retour » mène à la liste au lieu de quitter le site.
let ecransVus = 0;
function retourListe() {
  if (ecransVus > 1) window.history.back();
  else window.location.hash = "#/";
}
// Étape affichée en mode cuisine, par recette (le temps de la session).
const etapeCuisine = new Map();
let ingredientsOuverts = false;

// Nombre de personnes d'une recette : celui de « Ma semaine » s'il y est, sinon celui choisi sur la fiche, sinon celui du livre.
function personnesPour(recette) {
  if (Object.hasOwn(semaine, recette.id)) return semaine[recette.id];
  return personnesFiche[recette.id] ?? recette.personnes;
}

// Ajoute ou retire la recette de la semaine (donc des courses) ; renvoie vrai si elle y est maintenant.
function basculerCourses(recette) {
  const n = personnesPour(recette);
  personnesFiche[recette.id] = n;
  semaine = basculer(semaine, recette);
  if (Object.hasOwn(semaine, recette.id)) semaine = definirPersonnes(semaine, recette.id, n);
  sauverSemaine(stockage, semaine);
  return Object.hasOwn(semaine, recette.id);
}

// Écran allumé pendant qu'on cuisine (fiche et mode pas à pas). Sans effet si le téléphone ne le permet pas.
let verrouEcran = null;
let ecranAllumeVoulu = false;
async function garderEcranAllume(actif) {
  ecranAllumeVoulu = actif;
  try {
    if (!actif) {
      const ancien = verrouEcran;
      verrouEcran = null;
      await ancien?.release();
      return;
    }
    if (verrouEcran || !("wakeLock" in navigator)) return;
    verrouEcran = await navigator.wakeLock.request("screen");
    verrouEcran.addEventListener("release", () => { verrouEcran = null; });
  } catch {
    verrouEcran = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && ecranAllumeVoulu) garderEcranAllume(true);
});

function h(tag, attrs = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, val] of Object.entries(attrs)) {
    if (val === null || val === undefined || val === false) continue;
    if (cle === "class") el.className = val;
    else if (cle.startsWith("on")) el.addEventListener(cle.slice(2), val);
    else el.setAttribute(cle, val === true ? "" : String(val));
  }
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    el.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return el;
}

// Les écrans se redessinent en entier : on note le contrôle actif (data-cle) puis on lui rend le focus.
// Si le contrôle a disparu (ex. « Retirer »), le focus passe au titre de l'écran.
function gardantLeFocus(redessiner) {
  const cle = document.activeElement?.dataset?.cle;
  redessiner();
  if (!cle) return;
  const cible = vue.querySelector(`[data-cle="${CSS.escape(cle)}"]`) ?? vue.querySelector("h1");
  if (cible) {
    if (!cible.matches("button, a, input")) cible.setAttribute("tabindex", "-1");
    cible.focus();
  }
}

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lienRecette = (id) => `#/recette/${encodeURIComponent(id)}`;

// ---------- Barre de navigation ----------
const ICONES = {
  saison: ["M5 19c0-8 5-14 14-14 0 9-6 14-14 14z", "M5 19l8-8"],
  semaine: ["M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M4 10h16M9 3v4M15 3v4"],
  livres: ["M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z", "M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"],
  courses: ["M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6", "M10 20.5v.01M17 20.5v.01"],
  loupe: ["M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z", "M16 16l4.5 4.5"],
  filtres: ["M4 7h10M18 7h2M4 17h2M10 17h10", "M16 4v6M8 14v6"],
  retour: ["M15 5l-7 7 7 7"],
  bol: ["M4 11h16a8 8 0 0 1-16 0z", "M8 7l6-3M12 8l3-4"],
  plus: ["M12 5v14M5 12h14"],
  coche: ["M5 12.5l4.5 4.5L19 7.5"],
  croix: ["M6 6l12 12M18 6L6 18"],
  etoile: ["M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"],
};
const ONGLETS = [
  { nom: "saison", libelle: "Recettes", href: "#/" },
  { nom: "courses", libelle: "Courses", href: "#/courses" },
  { nom: "livres", libelle: "Livres", href: "#/livres" },
];

function icone(nom) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ICONES[nom]) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

let ongletActif = "saison";
function dessinerBarre(nomActif = ongletActif) {
  ongletActif = nomActif;
  const choisies = Object.keys(semaine).length;
  barre.replaceChildren(
    ...ONGLETS.map((o) =>
      h("a", { href: o.href, "aria-current": o.nom === nomActif ? "page" : null },
        icone(o.nom), o.libelle,
        o.nom === "courses" && choisies ? h("span", { class: "badge" }, String(choisies)) : null)
    )
  );
}

// ---------- Éléments communs ----------
function tempsTotal(recette) {
  const t = recette.temps;
  if (!t) return "";
  const total = (t.preparation ?? 0) + (t.cuisson ?? 0);
  return total > 0 ? `${total} min` : "";
}

// Photo du plat ; vignette légère pour les listes. Sans photo, un fond neutre avec un bol.
function photoRecette(recette, premierPlan = false, vignette = false) {
  if (!recette.photo) return h("div", { class: "photo vide", "aria-hidden": "true" }, icone("bol"));
  const src = vignette ? recette.photo.replace(/^photos\//, "photos/vignettes/") : recette.photo;
  const cote = vignette ? 400 : 800;
  return h("figure", { class: "photo" },
    h("img", {
      src, alt: recette.titre, width: cote, height: cote,
      loading: premierPlan ? "eager" : "lazy", decoding: "async", fetchpriority: premierPlan ? "high" : null,
    }));
}

// « Salade p. 20 » ou « Papilles et Pupilles » : d'où vient la recette, en court.
function lieuCourt(recette) {
  const o = recette.origine;
  if (o.type !== "livre") return o.source || "Internet";
  const livre = donnees.livres.find((l) => l.id === o.livre);
  return `${livre ? livre.titre : o.livre} p. ${o.page}`;
}

function carteRecette(recette) {
  const temps = tempsTotal(recette);
  const bouton = h("button", {
    type: "button", class: "ajout", "data-cle": `ajout-${recette.id}`,
    onclick: () => { basculerCourses(recette); majBouton(); dessinerBarre(); },
  });
  function majBouton() {
    const dedans = Object.hasOwn(semaine, recette.id);
    bouton.setAttribute("aria-pressed", String(dedans));
    bouton.setAttribute("aria-label", dedans ? `Retirer ${recette.titre} des courses` : `Ajouter ${recette.titre} aux courses`);
    bouton.replaceChildren(icone(dedans ? "coche" : "plus"));
  }
  majBouton();
  return h("div", { class: "carte" },
    h("a", { class: "carte-lien", href: lienRecette(recette.id) },
      photoRecette(recette, false, true),
      h("div", { class: "carte-bandeau" },
        h("h2", {}, recette.titre),
        h("span", { class: "carte-temps" }, [temps, lieuCourt(recette)].filter(Boolean).join(" · ")))),
    bouton);
}

function messageErreur(texte, avecRetour = false) {
  return h("div", {},
    avecRetour ? h("a", { class: "retour", href: "#/" }, "‹ Retour") : null,
    h("p", { class: "erreur", role: "alert" }, texte));
}

// ---------- Écran « Recettes » ----------
const SAISONS_PUCES = ["printemps", "été", "automne", "hiver"];
const CATEGORIES_ONGLETS = [
  { valeur: "", libelle: "Tout" }, { valeur: "entrée", libelle: "Entrées" },
  { valeur: "plat", libelle: "Plats" }, { valeur: "dessert", libelle: "Desserts" },
];
const TEMPS_PUCES = [{ libelle: "30 min max", minutes: 30 }, { libelle: "1 h max", minutes: 60 }];
const deSaison = (saison) => (saison === "printemps" ? "de printemps" : `d'${saison}`);

function ecranSaison() {
  const { recettes, ingredients, livres } = donnees;
  const saisonActuelle = saisonDuMois(new Date());
  const compte = h("p", { class: "compte", "aria-live": "polite" });
  const onglets = h("div", { class: "onglets", role: "group", "aria-label": "Catégorie" });
  const categories = CATEGORIES_ONGLETS.filter((c) => c.valeur === "" || recettes.some((r) => r.categorie === c.valeur));
  const liste = h("div", { class: "liste" });
  const panneau = h("div", { class: "panneau", id: "panneau-filtres" });
  const pastille = h("span", { class: "pastille" });
  const boutonFiltres = h("button", {
    type: "button", class: "rond btn-filtres", "data-cle": "ouvrir-filtres", "aria-controls": "panneau-filtres", "aria-label": "Filtres",
    onclick: () => { filtres.ouvert = !filtres.ouvert; actualiserPanneauVisible(); },
  }, icone("filtres"), pastille);
  const boutonFavoris = h("button", {
    type: "button", class: "rond favori", "data-cle": "filtre-favoris", "aria-label": "Afficher seulement les favoris",
    onclick: () => { filtres.favoris = !filtres.favoris; actualiserTout(); },
  }, icone("etoile"));
  const recentsZone = h("section", { class: "recents", "aria-label": "Vus récemment" });
  const aide = chargerListe(stockage, CLES.aide).includes("accueil") ? null : h("div", { class: "aide", role: "note" },
    h("p", {}, "Touchez + sur une recette pour l'ajouter à vos courses : l'onglet Courses additionne tout et classe par rayon. L'étoile d'une fiche la garde en favori."),
    h("button", { type: "button", class: "lien-texte", "data-cle": "aide-ok", onclick: () => { sauverListe(stockage, CLES.aide, ["accueil"]); aide.remove(); } }, "Compris"));
  const boutonVoir = h("button", {
    type: "button", class: "btn", "data-cle": "voir-resultats",
    onclick: () => { filtres.ouvert = false; actualiserPanneauVisible(); window.scrollTo(0, 0); },
  });
  const effacer = h("button", { type: "button", class: "effacer", "data-cle": "effacer-filtres", onclick: () => reinitialiser() }, "Tout effacer");
  const choixIngredient = h("select", {
    id: "filtre-ingredient", class: "choix", "data-cle": "filtre-ingredient",
    onchange: (e) => { filtres.ingredient = e.target.value; actualiserTout(); },
  },
  h("option", { value: "" }, "Tous"),
  ...ingredientsDisponibles(recettes, ingredients).map((i) => h("option", { value: i.id }, i.nom)));
  const choixSaison = h("select", {
    id: "filtre-saison", class: "choix-saison", "data-cle": "filtre-saison", "aria-label": "Saison",
    onchange: (e) => { filtres.saison = e.target.value; actualiserListe(); },
  },
  h("option", { value: "auto" }, `De saison (${saisonActuelle})`),
  h("option", { value: "" }, "Toute l'année"),
  ...SAISONS_PUCES.map((x) => h("option", { value: x }, majuscule(x))));
  const recherche = h("input", {
    type: "search", id: "recherche", class: "recherche", placeholder: "Rechercher une recette ou un ingrédient",
    "aria-label": "Rechercher", autocomplete: "off", value: filtres.recherche,
    oninput: (e) => { filtres.recherche = e.target.value; actualiserListe(); },
  });

  const sources = sourcesDisponibles(recettes, livres);
  const types = typesDisponibles(recettes);
  const personnes = personnesDisponibles(recettes);

  const actifsDe = (cles) => cles.filter((cle) => filtres[cle] !== FILTRES_PAR_DEFAUT[cle]).length;
  const TOUTES = Object.keys(FILTRES_PAR_DEFAUT);
  // La pastille du bouton « Filtres » ne compte que le contenu du panneau : saison et catégorie sont toujours visibles.
  const nombreActifs = () => actifsDe(TOUTES.filter((cle) => cle !== "categorie" && cle !== "saison" && cle !== "favoris"));
  const afficherEffacer = () => actifsDe(TOUTES) > 0 || filtres.recherche !== "";

  function puce(cle, valeur, libelle) {
    const actif = filtres[cle] === valeur;
    return h("button", {
      type: "button", class: "puce", "data-cle": `puce-${cle}-${valeur}`, "aria-pressed": String(actif),
      onclick: () => { filtres[cle] = valeur; gardantLeFocus(actualiserPanneau); actualiserListe(); },
    }, libelle);
  }

  function groupe(libelle, ...puces) {
    return h("div", { class: "groupe", role: "group", "aria-label": libelle },
      h("p", { class: "groupe-titre" }, libelle), h("div", { class: "puces" }, puces));
  }

  function actualiserPanneauVisible() {
    panneau.hidden = !filtres.ouvert;
    boutonFiltres.setAttribute("aria-expanded", String(filtres.ouvert));
  }

  function actualiserOnglets() {
    onglets.replaceChildren(...categories.map((c) =>
      h("button", {
        type: "button", class: "onglet", "data-cle": `onglet-${c.valeur || "tout"}`, "aria-pressed": String(filtres.categorie === c.valeur),
        onclick: () => { filtres.categorie = c.valeur; gardantLeFocus(actualiserOnglets); actualiserListe(); },
      }, c.libelle)));
  }

  function actualiserPanneau() {
    choixIngredient.value = filtres.ingredient;
    panneau.replaceChildren(...[
      sources.length > 1 ? groupe("Livre", puce("livre", "", "Tous"), ...sources.map((x) => puce("livre", x.id, x.titre))) : null,
      types.length > 1 ? groupe("Type", puce("type", "", "Tous"), ...types.map((x) => puce("type", x, majuscule(x)))) : null,
      groupe("Temps (préparation + cuisson)", puce("temps", 0, "Tous"), ...TEMPS_PUCES.map((x) => puce("temps", x.minutes, x.libelle))),
      personnes.length > 1 ? groupe("Pour", puce("personnes", 0, "Tous"), ...personnes.map((n) => puce("personnes", n, `${n} personnes`))) : null,
      h("div", { class: "groupe" },
        h("label", { class: "groupe-titre", for: "filtre-ingredient" }, "Ingrédient"), choixIngredient),
      boutonVoir].filter(Boolean));
    majIndicateurs();
  }

  function majRecents() {
    const vues = recents.map((id) => recettes.find((r) => r.id === id)).filter(Boolean).slice(0, 6);
    const calme = actifsDe(TOUTES) === 0 && !filtres.recherche;
    recentsZone.hidden = !calme || vues.length === 0;
    recentsZone.replaceChildren(
      h("h2", { class: "mini-titre" }, "Vus récemment"),
      h("div", { class: "recents-liste" }, vues.map((r) =>
        h("a", { class: "recent", href: lienRecette(r.id) }, photoRecette(r, false, true), h("span", {}, r.titre)))));
  }

  function majIndicateurs() {
    boutonFavoris.setAttribute("aria-pressed", String(filtres.favoris));
    const actifs = nombreActifs();
    pastille.textContent = actifs ? String(actifs) : "";
    pastille.hidden = actifs === 0;
    effacer.hidden = !afficherEffacer();
  }

  // Rien trouvé : on dit pourquoi et on propose la sortie la plus utile.
  function pasDeResultat(saison) {
    if (filtres.favoris && favoris.size === 0) {
      return h("div", { class: "vide" }, "Aucun favori pour le moment. Touchez l'étoile dans une fiche pour en ajouter.",
        h("button", { type: "button", class: "lien-action", "data-cle": "voir-tout", onclick: () => { filtres.favoris = false; actualiserTout(); } }, "Voir toutes les recettes"));
    }
    const autres = TOUTES.filter((cle) => cle !== "saison");
    const seulementLaSaison = filtres.saison === "auto" && !filtres.recherche && actifsDe(autres) === 0;
    if (seulementLaSaison) {
      return h("div", { class: "vide" }, `Aucune recette de saison (${saison}) pour le moment.`,
        h("button", { type: "button", class: "lien-action", "data-cle": "toute-annee", onclick: () => { filtres.saison = ""; gardantLeFocus(actualiserTout); } }, "Voir toutes les recettes"));
    }
    return h("div", { class: "vide" }, "Aucune recette ne correspond à ces filtres.",
      h("button", { type: "button", class: "lien-action", "data-cle": "tout-effacer-vide", onclick: () => reinitialiser() }, "Tout effacer"));
  }

  function actualiserListe() {
    const saison = filtres.saison === "auto" ? saisonActuelle : filtres.saison;
    // Quand on cherche un mot, on cherche dans toute la bibliothèque : la saison ne cache pas les résultats.
    // Recherche et favoris portent sur toute la bibliothèque : la saison ne cache pas les résultats.
    let trouvees = filtrerRecettes(recettes, ingredients, {
      saison: filtres.recherche || filtres.favoris ? "" : saison, categorie: filtres.categorie, type: filtres.type, recherche: filtres.recherche,
      livre: filtres.livre, tempsMax: filtres.temps, personnes: filtres.personnes, ingredient: filtres.ingredient,
    });
    if (filtres.favoris) trouvees = trouvees.filter((r) => favoris.has(r.id));
    compte.textContent = filtres.recherche || filtres.favoris
      ? `${trouvees.length} résultat${trouvees.length > 1 ? "s" : ""} · toute l'année`
      : `${trouvees.length} sur ${recettes.length} recette${recettes.length > 1 ? "s" : ""}`;
    boutonVoir.textContent = `Voir ${trouvees.length} recette${trouvees.length > 1 ? "s" : ""}`;
    liste.replaceChildren(...(trouvees.length ? trouvees.map(carteRecette) : [pasDeResultat(saison)]));
    majRecents();
    majIndicateurs();
  }

  function actualiserTout() { choixSaison.value = filtres.saison; actualiserOnglets(); actualiserPanneau(); actualiserListe(); }

  function reinitialiser() {
    Object.assign(filtres, FILTRES_PAR_DEFAUT);
    filtres.recherche = "";
    recherche.value = "";
    gardantLeFocus(actualiserTout);
  }

  actualiserPanneauVisible();
  actualiserTout();
  return h("div", {},
    h("h1", { class: "sr-only" }, "Recettes"),
    h("header", { class: "entete" },
      h("p", { class: "marque" }, icone("bol"), "Compilation des recettes"),
      h("div", { class: "boutons-entete" }, boutonFavoris, boutonFiltres)),
    recherche,
    h("div", { class: "barre-outils" }, choixSaison, compte),
    aide,
    recentsZone,
    onglets,
    h("div", { class: "rangee-filtres" }, effacer),
    panneau, liste);
}

// ---------- Fiche de recette ----------
function ecranRecette(idBrut) {
  let id;
  try {
    id = decodeURIComponent(idBrut);
  } catch {
    return messageErreur("Recette introuvable", true);
  }
  const recette = donnees.recettes.find((r) => r.id === id);
  if (!recette) return messageErreur("Recette introuvable", true);

  recents = ajouterRecent(recents, id);
  sauverListe(stockage, CLES.recents, recents);

  const conteneur = h("div");
  // Même élément à chaque redessin, pour que le lecteur d'écran annonce le nouveau nombre.
  const compteur = h("b", { "aria-live": "polite" });

  function personnesActuelles() {
    return personnesPour(recette);
  }

  function changerPersonnes(delta) {
    const n = Math.max(1, personnesActuelles() + delta);
    personnesFiche[id] = n;
    if (Object.hasOwn(semaine, id)) {
      semaine = definirPersonnes(semaine, id, n);
      sauverSemaine(stockage, semaine);
    }
    gardantLeFocus(dessiner);
  }

  function basculerSemaine() {
    basculerCourses(recette);
    gardantLeFocus(dessiner);
  }

  function basculerFavoriFiche() {
    const liste = basculerFavori([...favoris], id);
    favoris = new Set(liste);
    sauverListe(stockage, CLES.favoris, liste);
    gardantLeFocus(dessiner);
  }

  function dessiner() {
    const personnes = personnesActuelles();
    const mult = facteur(recette, personnes);
    const dansSemaine = Object.hasOwn(semaine, id);
    const nomsIngredients = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
    const o = recette.origine;
    const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;

    const t = recette.temps;
    const ligneInfo = (libelle, ...contenu) => [h("dt", {}, libelle), h("dd", {}, ...contenu)];

    const cochees = cocheesFiche.get(id) ?? new Set();
    const ligneIngredient = (ligne, i) => {
      const caseACocher = h("input", {
        type: "checkbox", "data-cle": `coche-${i}`, checked: cochees.has(i),
        onchange: (e) => {
          const ensemble = cocheesFiche.get(id) ?? new Set();
          if (e.target.checked) ensemble.add(i); else ensemble.delete(i);
          cocheesFiche.set(id, ensemble);
          e.target.closest("label").classList.toggle("fait", e.target.checked);
        },
      });
      caseACocher.checked = cochees.has(i);
      return h("label", { class: `ing${cochees.has(i) ? " fait" : ""}` },
        caseACocher,
        h("span", { class: "nom" },
          h("b", { class: "quantite" }, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)), " ",
          nomsIngredients.get(ligne.ingredient) ?? ligne.ingredient,
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null));
    };

    conteneur.replaceChildren(
      h("div", { class: "fiche-tete" },
        h("div", { class: "fiche-photo" },
          photoRecette(recette, true),
          h("button", { type: "button", class: "rond retour", "aria-label": "Retour", onclick: retourListe }, icone("retour")),
          h("button", {
            type: "button", class: "rond favori", "data-cle": "favori", "aria-pressed": String(favoris.has(id)),
            "aria-label": favoris.has(id) ? "Retirer des favoris" : "Ajouter aux favoris", onclick: basculerFavoriFiche,
          }, icone("etoile"))),
        h("div", { class: "fiche-titre" },
          h("h1", { class: "titre-recette" }, recette.titre),
          h("p", {}, majuscule(recette.categorie), " · ", recette.saisons.join(", "))),
        h("dl", { class: "infos" },
          o.type === "livre"
            ? ligneInfo("Livre", livre ? livre.titre : o.livre, `, page ${o.page}`)
            : ligneInfo("Source", /^https?:\/\//i.test(o.url) ? h("a", { href: o.url, target: "_blank", rel: "noopener noreferrer" }, o.source) : o.source),
          ligneInfo("Portions",
            h("span", { class: "pas" },
              h("button", { type: "button", "data-cle": "pas-moins", "aria-label": "Moins de personnes", onclick: () => changerPersonnes(-1) }, "−"),
              compteur,
              h("button", { type: "button", "data-cle": "pas-plus", "aria-label": "Plus de personnes", onclick: () => changerPersonnes(1) }, "+"),
              h("span", { class: "ou" }, personnes > 1 ? "personnes" : "personne")),
            h("small", { class: "note-livre" },
              `Recette du livre pour ${recette.personnes} personne${recette.personnes > 1 ? "s" : ""}`,
              recette.personnes_texte ? ` (${recette.personnes_texte})` : "")),
          t && t.preparation ? ligneInfo("Préparation", `${t.preparation} min`) : null,
          t && t.cuisson ? ligneInfo("Cuisson", `${t.cuisson} min`) : null)),
      h("div", { class: "fiche-corps" },
        h("section", {},
          h("h2", { class: "section" }, "Ingrédients"),
          recette.ingredients.map(ligneIngredient)),
        h("section", {},
          h("h2", { class: "section" }, "Préparation"),
          ...recette.etapes.map((texte, i) =>
            h("div", { class: "etape" }, h("span", {}, String(i + 1)), h("div", {}, texte))),
          recette.notes && recette.notes.length
            ? h("div", {}, h("h2", { class: "section" }, "Notes"),
                h("ul", { class: "notes" }, recette.notes.map((n) => h("li", {}, n))))
            : null)),
      h("div", { class: "fiche-actions" },
        recette.etapes.length
          ? h("a", { class: "btn alt", href: `#/cuisine/${encodeURIComponent(id)}` }, "Cuisiner pas à pas")
          : null,
        h("button", { type: "button", "data-cle": "bascule-semaine", class: `btn${dansSemaine ? " alt" : ""}`, onclick: basculerSemaine },
          dansSemaine ? "Retirer des courses" : "Ajouter aux courses")));
    compteur.textContent = String(personnes);
  }

  dessiner();
  return conteneur;
}

// ---------- Mode cuisine : une étape à la fois, en gros ----------
function ecranCuisine(idBrut) {
  let id;
  try {
    id = decodeURIComponent(idBrut);
  } catch {
    return messageErreur("Recette introuvable", true);
  }
  const recette = donnees.recettes.find((r) => r.id === id);
  if (!recette || !recette.etapes.length) return messageErreur("Recette introuvable", true);

  const etapes = recette.etapes;
  const noms = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
  let n = Math.min(etapeCuisine.get(id) ?? 0, etapes.length - 1);
  const conteneur = h("div", { class: "cuisine" });

  function aller(delta) {
    n = Math.max(0, Math.min(etapes.length - 1, n + delta));
    etapeCuisine.set(id, n);
    gardantLeFocus(dessiner);
    window.scrollTo(0, 0);
  }

  function dessiner() {
    const personnes = personnesPour(recette);
    const mult = facteur(recette, personnes);
    const derniere = n === etapes.length - 1;
    conteneur.replaceChildren(
      h("div", { class: "cuisine-tete" },
        h("a", { class: "rond", href: lienRecette(id), "aria-label": "Quitter le mode pas à pas" }, icone("retour")),
        h("h1", { class: "cuisine-titre" }, recette.titre)),
      h("p", { class: "cuisine-progres", "aria-live": "polite" }, `Étape ${n + 1} sur ${etapes.length}`),
      h("div", { class: "cuisine-barre", "aria-hidden": "true" }, h("span", { style: `width:${((n + 1) / etapes.length) * 100}%` })),
      h("p", { class: "cuisine-etape" }, etapes[n]),
      h("details", {
        class: "cuisine-ingredients", open: ingredientsOuverts,
        ontoggle: (e) => { ingredientsOuverts = e.target.open; },
      },
      h("summary", {}, `Ingrédients pour ${personnes} personne${personnes > 1 ? "s" : ""}`),
      recette.ingredients.map((ligne) =>
        h("p", { class: "cuisine-ing" },
          h("b", {}, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)), " ",
          noms.get(ligne.ingredient) ?? ligne.ingredient,
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null))),
      h("div", { class: "cuisine-pas" },
        h("button", { type: "button", class: "btn alt", "data-cle": "precedent", disabled: n === 0, onclick: () => aller(-1) }, "Précédent"),
        derniere
          ? h("a", { class: "btn", href: lienRecette(id) }, "Terminé")
          : h("button", { type: "button", class: "btn", "data-cle": "suivant", onclick: () => aller(1) }, "Suivant")));
  }

  dessiner();
  return conteneur;
}

// ---------- Écran « Courses » : recettes choisies, puis la liste par rayon ----------
function copierSecours(texte) {
  const zone = h("textarea", { "aria-hidden": "true", style: "position:fixed;opacity:0;top:0" });
  zone.value = texte;
  document.body.append(zone);
  zone.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  zone.remove();
  return ok;
}

let recettesOuvertes = true;

function ecranCourses() {
  const conteneur = h("div");
  const etat = { coches: chargerCoches(stockage), message: "", annulation: null };
  const compteurs = new Map(); // un compteur durable par recette, pour que le lecteur d'écran annonce le changement

  function enregistrer() { sauverCoches(stockage, etat.coches); }

  function cocher(cle, coche) {
    if (coche) etat.coches.add(cle); else etat.coches.delete(cle);
    enregistrer();
    etat.message = "";
    etat.annulation = null;
    gardantLeFocus(dessiner);
  }

  function toutDecocher() {
    etat.annulation = new Set(etat.coches);
    etat.coches.clear();
    enregistrer();
    etat.message = "Cases décochées.";
    gardantLeFocus(dessiner);
  }

  function annuler() {
    etat.coches = etat.annulation ?? etat.coches;
    etat.annulation = null;
    etat.message = "";
    enregistrer();
    gardantLeFocus(dessiner);
  }

  async function copier(liste) {
    const texte = texteCourses(liste, etat.coches);
    let ok = false;
    try {
      await navigator.clipboard.writeText(texte);
      ok = true;
    } catch {
      ok = copierSecours(texte);
    }
    etat.message = ok ? "Liste copiée." : "Copie impossible : sélectionnez la liste à la main.";
    etat.annulation = null;
    gardantLeFocus(dessiner);
  }

  function changerPersonnes(recette, delta) {
    const n = Math.max(1, semaine[recette.id] + delta);
    semaine = definirPersonnes(semaine, recette.id, n);
    personnesFiche[recette.id] = n;
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function retirer(recette) {
    semaine = basculer(semaine, recette);
    sauverSemaine(stockage, semaine);
    dessinerBarre();
    gardantLeFocus(dessiner);
  }

  function ligneRecette(recette) {
    if (!compteurs.has(recette.id)) compteurs.set(recette.id, h("b", { "aria-live": "polite" }));
    const compteur = compteurs.get(recette.id);
    compteur.textContent = String(semaine[recette.id]);
    return h("div", { class: "rec-ligne" },
      h("a", { href: lienRecette(recette.id) }, recette.titre),
      h("span", { class: "pas pas-compact" },
        h("button", { type: "button", "data-cle": `pas-moins-${recette.id}`, "aria-label": `Moins de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, -1) }, "−"),
        compteur,
        h("button", { type: "button", "data-cle": `pas-plus-${recette.id}`, "aria-label": `Plus de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, 1) }, "+")),
      h("button", { type: "button", class: "rond", "data-cle": `retirer-${recette.id}`, "aria-label": `Retirer ${recette.titre} des courses`, onclick: () => retirer(recette) }, icone("croix")));
  }

  function ligne(item) {
    const coche = etat.coches.has(item.cle);
    const caseACocher = h("input", { type: "checkbox", "data-cle": `coche-${item.cle}`, onchange: (e) => cocher(item.cle, e.target.checked) });
    caseACocher.checked = coche;
    return h("label", { class: `ing${coche ? " fait" : ""}` },
      caseACocher,
      h("span", { class: "nom" },
        item.texte ? h("b", { class: "quantite" }, item.texte) : null, item.texte ? " " : null, item.nom,
        item.melange ? h("small", { class: "alerte" }, "Unités différentes selon les recettes : à vérifier") : null,
        item.melange ? h("small", { class: "origine" }, item.recettes.join(" · ")) : null));
  }

  // Les articles pas encore cochés d'abord, les cochés en bas.
  const nonCochesAvant = (items) => [...items.filter((i) => !etat.coches.has(i.cle)), ...items.filter((i) => etat.coches.has(i.cle))];

  function dessiner() {
    const liste = compilerCourses(donnees.recettes, donnees.ingredients, semaine);
    const tous = [...liste.groupes.flatMap((g) => g.items), ...liste.placard];
    const restants = tous.filter((i) => !etat.coches.has(i.cle)).length;
    if (!liste.recettes) {
      conteneur.replaceChildren(
        h("h1", {}, "Courses"),
        h("div", { class: "vide" },
          "La liste est vide. Touchez « + » sur une recette, ou « Ajouter aux courses » dans sa fiche.",
          h("a", { class: "lien-action", href: "#/" }, "Voir les recettes")));
      return;
    }
    const choisies = Object.keys(semaine).map((id) => donnees.recettes.find((r) => r.id === id)).filter(Boolean);
    conteneur.replaceChildren(
      h("h1", {}, "Courses"),
      h("p", { class: "sub" }, `${restants} article${restants > 1 ? "s" : ""} à acheter sur ${tous.length}`),
      h("details", { class: "recettes-choisies", open: recettesOuvertes, ontoggle: (e) => { recettesOuvertes = e.target.open; } },
        h("summary", {}, `Recettes choisies (${choisies.length})`),
        choisies.map(ligneRecette)),
      h("div", { class: "actions" },
        h("button", { type: "button", class: "lien-action", "data-cle": "copier", onclick: () => copier(liste) }, "Copier la liste"),
        h("button", { type: "button", class: "lien-action", "data-cle": "decocher", onclick: toutDecocher }, "Tout décocher")),
      h("p", { class: "sub statut", role: "status" }, etat.message,
        etat.annulation ? h("button", { type: "button", class: "lien-texte", "data-cle": "annuler", onclick: annuler }, "Annuler") : null),
      ...liste.groupes.map((g) => h("section", {}, h("h2", { class: "section" }, g.titre), nonCochesAvant(g.items).map(ligne))),
      liste.placard.length
        ? h("section", {}, h("h2", { class: "section" }, "À vérifier au placard"), nonCochesAvant(liste.placard).map(ligne))
        : null);
  }

  dessiner();
  return conteneur;
}

// ---------- Écran « Livres » ----------
function ecranLivres() {
  const { recettes, livres } = donnees;
  const cartes = livres.map((livre) => {
    const siennes = recettes
      .filter((r) => r.origine.type === "livre" && r.origine.livre === livre.id)
      .sort((a, b) => a.origine.page - b.origine.page);
    return h("section", { class: "card" },
      h("h2", {}, livre.titre),
      livre.auteur ? h("div", { class: "ou" }, livre.auteur) : null,
      h("div", { style: "margin-top:8px" },
        siennes.length
          ? siennes.map((r) =>
              h("a", { class: "livre-ligne", href: lienRecette(r.id) },
                h("span", {}, r.titre), h("span", { class: "qte" }, `p. ${r.origine.page}`)))
          : h("div", { class: "ou" }, "Aucune recette pour le moment.")));
  });
  const web = recettes.filter((r) => r.origine.type === "web");
  if (web.length) {
    cartes.push(h("section", { class: "card" },
      h("h2", {}, "Recettes d'internet"),
      h("div", { style: "margin-top:8px" },
        web.map((r) =>
          h("a", { class: "livre-ligne", href: lienRecette(r.id) },
            h("span", {}, r.titre), h("span", { class: "tag web" }, r.origine.source || "Internet"))))));
  }
  return h("div", {},
    h("h1", {}, "Livres"),
    h("p", { class: "sub" }, `${livres.length} livre${livres.length > 1 ? "s" : ""} · retrouvez la page`),
    h("div", { class: "stack" }, cartes));
}

// ---------- Affichage ----------
function afficher() {
  if (!donnees) return;
  const route = lireRoute(window.location.hash);
  const ecrans = {
    saison: ecranSaison,
    semaine: ecranCourses, // ancien nom de l'écran, gardé pour les liens déjà enregistrés
    courses: ecranCourses,
    livres: ecranLivres,
    recette: () => ecranRecette(route.id),
    cuisine: () => ecranCuisine(route.id),
  };
  ecransVus += 1;
  dessinerBarre(route.nom === "recette" || route.nom === "cuisine" ? "saison" : route.nom === "semaine" ? "courses" : route.nom);
  barre.closest(".barre").hidden = route.nom === "cuisine" || route.nom === "recette"; // ces écrans ont leurs propres boutons en bas
  garderEcranAllume(route.nom === "recette" || route.nom === "cuisine");
  vue.className = "app" + (route.nom === "saison" ? " large" : route.nom === "recette" ? " fiche-large" : "");
  vue.replaceChildren(ecrans[route.nom]());
  window.scrollTo(0, 0);
}

async function lireJson(chemin) {
  const reponse = await fetch(chemin);
  if (!reponse.ok) throw new Error(`${chemin} : ${reponse.status}`);
  return reponse.json();
}

async function demarrer() {
  dessinerBarre("saison");
  try {
    const [recettes, ingredients, livres] = await Promise.all([
      lireJson("data/recettes.json"),
      lireJson("data/ingredients.json"),
      lireJson("data/livres.json"),
    ]);
    donnees = { recettes, ingredients, livres };
    semaine = chargerSemaine(stockage, recettes);
  } catch {
    vue.replaceChildren(messageErreur("Impossible de charger les recettes"));
    return;
  }
  window.addEventListener("hashchange", afficher);
  afficher();
}

demarrer();
