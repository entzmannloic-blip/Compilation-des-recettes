// Interface : De saison, fiche de recette, Livres. Tout le DOM est construit avec
// createElement / textContent (jamais innerHTML avec des données).
import { filtrerRecettes, typesDisponibles, saisonDuMois, facteur, quantiteAjustee, formaterQuantite } from "./lib.js";
import { chargerSemaine, sauverSemaine, basculer, definirPersonnes } from "./semaine.js";
import { lireRoute } from "./routes.js";

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
// Filtres de l'écran « De saison », conservés pendant la session.
const filtres = { saisonSeulement: true, categorie: "", type: "", recherche: "" };
// Nombre de personnes choisi sur la fiche, par recette (pour les recettes hors semaine).
const personnesFiche = {};

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

const majuscule = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const lienRecette = (id) => `#/recette/${encodeURIComponent(id)}`;

// ---------- Barre de navigation ----------
const ICONES = {
  saison: ["M5 19c0-8 5-14 14-14 0 9-6 14-14 14z", "M5 19l8-8"],
  semaine: ["M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M4 10h16M9 3v4M15 3v4"],
  livres: ["M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4z", "M20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"],
};
const ONGLETS = [
  { nom: "saison", libelle: "De saison", href: "#/" },
  { nom: "semaine", libelle: "Ma semaine", href: "#/semaine" },
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

function dessinerBarre(nomActif) {
  barre.replaceChildren(
    ...ONGLETS.map((o) =>
      h("a", { href: o.href, "aria-current": o.nom === nomActif ? "page" : null }, icone(o.nom), o.libelle)
    )
  );
}

// ---------- Éléments communs ----------
function texteOrigine(recette, livres) {
  const o = recette.origine;
  if (o.type === "livre") {
    const livre = livres.find((l) => l.id === o.livre);
    return `${livre ? livre.titre : o.livre}, page ${o.page}`;
  }
  return "Recette d'internet";
}

function ouEstLaRecette(recette) {
  const o = recette.origine;
  if (o.type === "livre") {
    const livre = donnees.livres.find((l) => l.id === o.livre);
    return h("div", { class: "ou" }, "Livre ", h("b", {}, livre ? livre.titre : o.livre), `, page ${o.page}`);
  }
  return h("div", { class: "ou" }, h("span", { class: "tag web" }, "Internet"));
}

function tempsTotal(recette) {
  const t = recette.temps;
  if (!t) return "";
  const total = (t.preparation ?? 0) + (t.cuisson ?? 0);
  return total > 0 ? `${total} min` : "";
}

function carteRecette(recette) {
  return h("a", { class: "card carte", href: lienRecette(recette.id) },
    h("div", { class: "ligne" }, h("h2", {}, recette.titre), h("span", { class: "ou" }, tempsTotal(recette))),
    h("div", { class: "tags" },
      h("span", { class: "tag" }, majuscule(recette.categorie)),
      h("span", { class: "tag" }, majuscule(recette.type))),
    ouEstLaRecette(recette));
}

function messageErreur(texte, avecRetour = false) {
  return h("div", {},
    avecRetour ? h("a", { class: "retour", href: "#/" }, "‹ Retour") : null,
    h("p", { class: "erreur", role: "alert" }, texte));
}

// ---------- Écran « De saison » ----------
function ecranSaison() {
  const { recettes, ingredients } = donnees;
  const saison = saisonDuMois(new Date());
  const liste = h("div", { class: "stack" });
  const sousTitre = h("p", { class: "sub" });
  const zoneCategories = h("div", { class: "chips", role: "group", "aria-label": "Entrée ou plat" });
  const zoneTypes = h("div", { class: "chips", role: "group", "aria-label": "Type de recette" });

  function chip(libelle, actif, quandClic) {
    return h("button", { type: "button", class: "chip", "aria-pressed": actif, onclick: quandClic }, libelle);
  }

  function actualiserListe() {
    const trouvees = filtrerRecettes(recettes, ingredients, {
      saison: filtres.saisonSeulement ? saison : "",
      categorie: filtres.categorie,
      type: filtres.type,
      recherche: filtres.recherche,
    });
    sousTitre.textContent = `${majuscule(saison)} · ${trouvees.length} recette${trouvees.length > 1 ? "s" : ""}`;
    liste.replaceChildren(
      ...(trouvees.length ? trouvees.map(carteRecette) : [h("div", { class: "vide" }, "Aucune recette avec ces filtres.")])
    );
  }

  function actualiserPuces() {
    const choisir = (cle, valeur) => () => { filtres[cle] = valeur; actualiserPuces(); actualiserListe(); };
    zoneCategories.replaceChildren(
      chip("Tout", filtres.categorie === "", choisir("categorie", "")),
      chip("Entrée", filtres.categorie === "entrée", choisir("categorie", "entrée")),
      chip("Plat", filtres.categorie === "plat", choisir("categorie", "plat")));
    zoneTypes.replaceChildren(
      chip("Tous", filtres.type === "", choisir("type", "")),
      ...typesDisponibles(recettes).map((t) => chip(majuscule(t), filtres.type === t, choisir("type", t))));
  }

  const recherche = h("input", {
    type: "search", id: "recherche", placeholder: "Titre ou ingrédient (ex. oignon)",
    "aria-label": "Rechercher", autocomplete: "off", value: filtres.recherche,
    oninput: (e) => { filtres.recherche = e.target.value; actualiserListe(); },
  });
  const interrupteur = h("input", {
    type: "checkbox", id: "saison-seulement", checked: filtres.saisonSeulement,
    onchange: (e) => { filtres.saisonSeulement = e.target.checked; actualiserListe(); },
  });
  interrupteur.checked = filtres.saisonSeulement;

  actualiserPuces();
  actualiserListe();
  return h("div", {},
    h("h1", {}, "De saison"), sousTitre, recherche,
    h("label", { class: "interrupteur" }, interrupteur, "Seulement les recettes de saison"),
    zoneCategories, zoneTypes, liste);
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

  const conteneur = h("div");

  function personnesActuelles() {
    if (id in semaine) return semaine[id];
    return personnesFiche[id] ?? recette.personnes;
  }

  function changerPersonnes(delta) {
    const n = Math.max(1, personnesActuelles() + delta);
    personnesFiche[id] = n;
    if (id in semaine) {
      semaine = definirPersonnes(semaine, id, n);
      sauverSemaine(stockage, semaine);
    }
    dessiner();
  }

  function basculerSemaine() {
    const n = personnesActuelles();
    semaine = basculer(semaine, recette);
    if (id in semaine) semaine = definirPersonnes(semaine, id, n);
    sauverSemaine(stockage, semaine);
    dessiner();
  }

  function dessiner() {
    const personnes = personnesActuelles();
    const mult = facteur(recette, personnes);
    const dansSemaine = id in semaine;
    const nomsIngredients = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
    const o = recette.origine;
    const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;

    const blocOu = o.type === "livre"
      ? h("div", { class: "pill-ou" }, `Livre ${livre ? livre.titre : o.livre}, page ${o.page}`)
      : h("div", { class: "pill-ou" }, "Source : ",
          /^https?:\/\//i.test(o.lien) ? h("a", { href: o.lien, target: "_blank", rel: "noopener noreferrer" }, o.lien) : o.lien);

    const t = recette.temps;
    const temps = t
      ? [t.preparation ? `${t.preparation} min` : "", t.cuisson ? `cuisson ${t.cuisson} min` : ""].filter(Boolean).join(" · ")
      : "";

    conteneur.replaceChildren(
      h("a", { class: "retour", href: "#/" }, "‹ Retour"),
      h("h1", { class: "titre-recette" }, recette.titre),
      h("div", { class: "tags", style: "margin-top:0" },
        h("span", { class: "tag" }, majuscule(recette.categorie)),
        h("span", { class: "tag" }, majuscule(recette.type)),
        recette.saisons.map((s) => h("span", { class: "tag" }, majuscule(s)))),
      blocOu,
      h("p", { class: "sub" },
        `Recette du livre pour ${recette.personnes} personne${recette.personnes > 1 ? "s" : ""}`,
        recette.personnes_texte ? ` (${recette.personnes_texte})` : ""),
      h("div", { class: "card" },
        h("div", { class: "ligne", style: "align-items:center" },
          h("b", {}, "Pour"),
          h("div", { class: "pas" },
            h("button", { type: "button", "aria-label": "Moins de personnes", onclick: () => changerPersonnes(-1) }, "−"),
            h("b", { "aria-live": "polite" }, String(personnes)),
            h("button", { type: "button", "aria-label": "Plus de personnes", onclick: () => changerPersonnes(1) }, "+"),
            h("span", { class: "ou", style: "margin:0" }, personnes > 1 ? "personnes" : "personne"))),
        h("div", { style: "margin-top:6px" },
          recette.ingredients.map((ligne) =>
            h("div", { class: "ing" },
              h("span", {}, nomsIngredients.get(ligne.ingredient) ?? ligne.ingredient,
                ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null),
              h("span", { class: "qte" }, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)))))),
      h("h2", { class: "section" }, "Préparation", temps ? ` · ${temps}` : ""),
      ...recette.etapes.map((texte, i) =>
        h("div", { class: "etape" }, h("span", {}, String(i + 1)), h("div", {}, texte))),
      recette.notes && recette.notes.length
        ? h("div", {}, h("h2", { class: "section" }, "Notes"),
            h("ul", { class: "notes" }, recette.notes.map((n) => h("li", {}, n))))
        : null,
      h("button", { type: "button", class: `btn${dansSemaine ? " alt" : ""}`, onclick: basculerSemaine },
        dansSemaine ? "Retirer de ma semaine" : "Ajouter à ma semaine"));
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
  const web = recettes.filter((r) => r.origine.type === "internet");
  if (web.length) {
    cartes.push(h("section", { class: "card" },
      h("h2", {}, "Recettes d'internet"),
      h("div", { style: "margin-top:8px" },
        web.map((r) =>
          h("a", { class: "livre-ligne", href: lienRecette(r.id) },
            h("span", {}, r.titre), h("span", { class: "tag web" }, "Internet"))))));
  }
  return h("div", {},
    h("h1", {}, "Livres"),
    h("p", { class: "sub" }, `${livres.length} livre${livres.length > 1 ? "s" : ""} · retrouvez la page`),
    h("div", { class: "stack" }, cartes));
}

// ---------- Écran « Ma semaine » : provisoire, rempli à la tâche 5 ----------
function ecranSemaine() {
  return h("div", {}, h("h1", {}, "Ma semaine"), h("p", { class: "vide" }, "Cet écran arrive bientôt."));
}

// ---------- Affichage ----------
function afficher() {
  if (!donnees) return;
  const route = lireRoute(window.location.hash);
  const ecrans = {
    saison: ecranSaison,
    semaine: ecranSemaine,
    livres: ecranLivres,
    recette: () => ecranRecette(route.id),
  };
  dessinerBarre(route.nom === "recette" ? "saison" : route.nom);
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
