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
// Ingrédients cochés sur la fiche, par recette (le temps de la session).
const cocheesFiche = new Map();
// Nombre d'écrans vus : tant qu'il n'y en a qu'un, « Retour » mène à la liste au lieu de quitter le site.
let ecransVus = 0;
function retourListe() {
  if (ecransVus > 1) window.history.back();
  else window.location.hash = "#/";
}

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
function tempsTotal(recette) {
  const t = recette.temps;
  if (!t) return "";
  const total = (t.preparation ?? 0) + (t.cuisson ?? 0);
  return total > 0 ? `${total} min` : "";
}

// Photo du plat ; sans photo (livre pas encore photographié), un aplat avec l'initiale.
function photoRecette(recette, premierPlan = false) {
  if (!recette.photo) return h("div", { class: "photo vide", "aria-hidden": "true" }, recette.titre.charAt(0).toUpperCase());
  return h("figure", { class: "photo" },
    h("img", {
      src: recette.photo, alt: recette.titre, width: 800, height: 800,
      loading: premierPlan ? "eager" : "lazy", decoding: "async", fetchpriority: premierPlan ? "high" : null,
    }));
}

function carteRecette(recette) {
  const o = recette.origine;
  const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;
  const lieu = o.type === "livre" ? `${livre ? livre.titre : o.livre} · page ${o.page}` : (o.source || "Internet");
  const temps = tempsTotal(recette);
  return h("a", { class: "carte", href: lienRecette(recette.id) },
    photoRecette(recette),
    h("h2", {}, recette.titre),
    h("p", { class: "meta" }, lieu, temps ? ` · ${temps}` : ""));
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
  const liste = h("div", { class: "liste" });
  const sousTitre = h("p", { class: "sub" });
  const zoneCategories = h("div", { class: "rubriques", role: "group", "aria-label": "Entrée ou plat" });
  const zoneTypes = h("div", { class: "rubriques", role: "group", "aria-label": "Type de recette" });

  function chip(groupe, libelle, actif, quandClic) {
    return h("button", { type: "button", class: "rubrique", "data-cle": `puce-${groupe}-${libelle}`, "aria-pressed": String(actif), onclick: quandClic }, libelle);
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
    const choisir = (cle, valeur) => () => { filtres[cle] = valeur; gardantLeFocus(actualiserPuces); actualiserListe(); };
    zoneCategories.replaceChildren(
      chip("categorie", "Tout", filtres.categorie === "", choisir("categorie", "")),
      chip("categorie", "Entrée", filtres.categorie === "entrée", choisir("categorie", "entrée")),
      chip("categorie", "Plat", filtres.categorie === "plat", choisir("categorie", "plat")));
    const types = typesDisponibles(recettes);
    zoneTypes.hidden = types.length < 2; // un seul type : la rangée ne sert à rien
    zoneTypes.replaceChildren(
      chip("type", "Tous", filtres.type === "", choisir("type", "")),
      ...types.map((t) => chip("type", majuscule(t), filtres.type === t, choisir("type", t))));
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
  // Même élément à chaque redessin, pour que le lecteur d'écran annonce le nouveau nombre.
  const compteur = h("b", { "aria-live": "polite" });

  function personnesActuelles() {
    if (Object.hasOwn(semaine, id)) return semaine[id];
    return personnesFiche[id] ?? recette.personnes;
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
    const n = personnesActuelles();
    personnesFiche[id] = n;
    semaine = basculer(semaine, recette);
    if (Object.hasOwn(semaine, id)) semaine = definirPersonnes(semaine, id, n);
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function dessiner() {
    const personnes = personnesActuelles();
    const mult = facteur(recette, personnes);
    const dansSemaine = Object.hasOwn(semaine, id);
    const nomsIngredients = new Map(donnees.ingredients.map((i) => [i.id, i.nom]));
    const o = recette.origine;
    const livre = o.type === "livre" ? donnees.livres.find((l) => l.id === o.livre) : null;

    const lieu = o.type === "livre"
      ? h("p", { class: "ou" }, "Livre ", h("b", {}, livre ? livre.titre : o.livre), `, page ${o.page}`)
      : h("p", { class: "ou" }, "Source : ",
          /^https?:\/\//i.test(o.url) ? h("a", { href: o.url, target: "_blank", rel: "noopener noreferrer" }, o.source) : o.source);

    const t = recette.temps;
    const temps = t
      ? [t.preparation ? `${t.preparation} min` : "", t.cuisson ? `cuisson ${t.cuisson} min` : ""].filter(Boolean).join(" · ")
      : "";

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
        h("span", { class: "nom" }, nomsIngredients.get(ligne.ingredient) ?? ligne.ingredient,
          ligne.precision ? h("small", {}, ` (${ligne.precision})`) : null),
        h("span", { class: "qte" }, formaterQuantite(quantiteAjustee(ligne.quantite, mult), ligne.unite)));
    };

    conteneur.replaceChildren(
      h("div", { class: "fiche-tete" },
        h("button", { type: "button", class: "retour", onclick: retourListe }, "‹ Retour"),
        photoRecette(recette, true),
        h("h1", { class: "titre-recette" }, recette.titre),
        h("p", { class: "meta" }, majuscule(recette.categorie), " · ", recette.saisons.join(", ")),
        lieu,
        h("div", { class: "portions" },
          h("b", {}, "Pour"),
          h("div", { class: "pas" },
            h("button", { type: "button", "data-cle": "pas-moins", "aria-label": "Moins de personnes", onclick: () => changerPersonnes(-1) }, "−"),
            compteur,
            h("button", { type: "button", "data-cle": "pas-plus", "aria-label": "Plus de personnes", onclick: () => changerPersonnes(1) }, "+")),
          h("span", { class: "ou" }, personnes > 1 ? "personnes" : "personne")),
        h("p", { class: "note-livre" },
          `Recette du livre pour ${recette.personnes} personne${recette.personnes > 1 ? "s" : ""}`,
          recette.personnes_texte ? ` (${recette.personnes_texte})` : ""),
        h("button", { type: "button", "data-cle": "bascule-semaine", class: `btn${dansSemaine ? " alt" : ""}`, onclick: basculerSemaine },
          dansSemaine ? "Retirer de ma semaine" : "Ajouter à ma semaine")),
      h("div", { class: "fiche-corps" },
        h("section", {},
          h("h2", { class: "section" }, "Ingrédients"),
          recette.ingredients.map(ligneIngredient)),
        h("section", {},
          h("h2", { class: "section" }, "Préparation", temps ? ` · ${temps}` : ""),
          ...recette.etapes.map((texte, i) =>
            h("div", { class: "etape" }, h("span", {}, String(i + 1)), h("div", {}, texte))),
          recette.notes && recette.notes.length
            ? h("div", {}, h("h2", { class: "section" }, "Notes"),
                h("ul", { class: "notes" }, recette.notes.map((n) => h("li", {}, n))))
            : null)));
    compteur.textContent = String(personnes);
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

// ---------- Écran « Ma semaine » ----------
function ecranSemaine() {
  const conteneur = h("div");
  const compteurs = new Map(); // un compteur durable par recette (voir la fiche)

  function changerPersonnes(recette, delta) {
    semaine = definirPersonnes(semaine, recette.id, Math.max(1, semaine[recette.id] + delta));
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function retirer(recette) {
    semaine = basculer(semaine, recette);
    sauverSemaine(stockage, semaine);
    gardantLeFocus(dessiner);
  }

  function carteSemaine(recette) {
    const personnes = semaine[recette.id];
    if (!compteurs.has(recette.id)) compteurs.set(recette.id, h("b", { "aria-live": "polite" }));
    const compteur = compteurs.get(recette.id);
    compteur.textContent = String(personnes);
    return h("section", { class: "card" },
      h("h2", {}, recette.titre),
      h("div", { class: "ligne", style: "align-items:center; margin-top:10px" },
        h("b", {}, "Pour"),
        h("div", { class: "pas" },
          h("button", { type: "button", "data-cle": `pas-moins-${recette.id}`, "aria-label": `Moins de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, -1) }, "−"),
          compteur,
          h("button", { type: "button", "data-cle": `pas-plus-${recette.id}`, "aria-label": `Plus de personnes pour ${recette.titre}`, onclick: () => changerPersonnes(recette, 1) }, "+"),
          h("span", { class: "ou", style: "margin:0" }, personnes > 1 ? "personnes" : "personne"))),
      h("div", { class: "actions" },
        h("a", { class: "lien-action", href: lienRecette(recette.id) }, "Voir la fiche"),
        h("button", { type: "button", class: "lien-action", "data-cle": `retirer-${recette.id}`, onclick: () => retirer(recette) }, "Retirer")));
  }

  function dessiner() {
    // Les recettes enregistrées mais disparues des données sont ignorées.
    const choisies = Object.keys(semaine)
      .map((id) => donnees.recettes.find((r) => r.id === id))
      .filter(Boolean);
    conteneur.replaceChildren(
      h("h1", {}, "Ma semaine"),
      h("p", { class: "sub" }, `${choisies.length} recette${choisies.length > 1 ? "s" : ""}`),
      choisies.length
        ? h("div", { class: "stack" }, choisies.map(carteSemaine))
        : h("div", { class: "vide" }, "Rien pour l'instant. Ouvrez une recette et touchez « Ajouter à ma semaine »."));
  }

  dessiner();
  return conteneur;
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
  ecransVus += 1;
  dessinerBarre(route.nom === "recette" ? "saison" : route.nom);
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
