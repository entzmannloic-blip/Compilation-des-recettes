# Compilation des recettes — cahier des charges

Date : 8 octobre 2026 · Statut : à relire par Loïc (rien n'est codé)

## 1. Objectif

Digitaliser les recettes des livres de cuisine du foyer (une dizaine de livres) et des recettes choisies sur internet, pour :

1. **Retrouver** vite une recette de saison, en sachant **dans quel livre et à quelle page** elle se trouve ;
2. **Cuisiner** à partir d'une fiche uniforme (ingrédients, quantités, étapes) ;
3. **Faire la liste de courses du week-end** à partir des recettes cochées, rangée par rayon, exportée vers Google Keep.

Utilisateurs : Loïc et son foyer, sur iPhone en priorité (usage ordinateur possible). Le foyer consulte et choisit ; seul Loïc, via Claude, ajoute et corrige des recettes.

## 2. Décisions prises

| Sujet | Décision |
|---|---|
| Alimentation depuis les livres | Loïc envoie des photos de pages (ici, ou dossier du PC / Drive). Claude lit, propose une fiche brouillon avec les doutes, Loïc valide, Claude range. Un livre à la fois. |
| Nommage des photos | Aucun format imposé. Loïc indique le livre pour chaque lot. Claude lit le titre et le numéro de page imprimés sur la photo et demande la page si elle n'est pas visible. |
| Format des photos | Les photos HEIC d'iPhone sont converties en JPEG par Claude sur le PC (fonctionne avec les outils Windows). Le connecteur Drive ne lit pas le HEIC. |
| Recettes d'internet | Sites choisis par Loïc, en parallèle des livres. Papilles et Pupilles d'abord. On garde ingrédients, étapes et lien d'origine pour usage personnel. |
| Architecture | Option 1 : site installable sur l'écran d'accueil (comme l'appli Running), sans serveur ni compte, données en fichiers dans le dépôt, mises à jour par Claude. |
| Partage dans le foyer | Le foyer lit l'appli. La liste de courses partagée vit dans Google Keep. |
| Hors-ligne | Non nécessaire (la liste est exportée vers Keep). |
| Hébergement | Public sur GitHub accepté par Loïc, qui a été informé du risque (droits d'auteur du contenu des livres). Aucune donnée personnelle dans le site. |
| Look | Proche de l'appli Running (cartes claires, polices système, titres de recette en serif), accent vert herbe à valider. À revoir après la maquette (étape 4). |
| Nom | « Compilation des recettes » |

## 3. Classement de chaque recette

- **Saison** : une ou plusieurs (printemps, été, automne, hiver). Reprend la saison imprimée dans le livre si elle existe, sinon déduite de la saison des ingrédients, corrigeable à la main.
- **Catégorie** : entrée ou plat (un dessert pourra s'ajouter si besoin).
- **Type** : salade, quiche, gratin, viande en sauce, soupe, risotto, etc. Liste qui s'enrichit au fil de l'import.
- **Origine** : livre + page, ou internet + lien.

## 3 bis. Nombre de personnes (champ obligatoire)

- Chaque recette porte le **nombre de personnes prévu par le livre ou le site** (ex. « Pour 2 personnes »). Une recette sans ce nombre ne peut pas être validée à l'import ; si la page ne l'indique pas, Claude le demande à Loïc.
- Il est visible sur la carte de la recette et sur la fiche. Cas particuliers conservés tels quels : une fourchette (« 4 à 6 personnes ») ou un nombre de parts (« 8 parts » pour une tarte). Dans ce cas, une valeur de base unique est choisie pour le calcul, et le texte d'origine est gardé en note.
- Dans **Ma semaine**, Loïc choisit pour chaque recette le **nombre de personnes à servir** (par défaut : celui de la recette). Les quantités de la fiche et de la **liste de courses** sont recalculées en proportion.
- Les quantités qui ne se divisent pas bien (« 1 œuf », « 1 échalote ») sont arrondies à l'entier supérieur dans la liste de courses.

## 4. Données (tables)

- **Livres** : titre, auteur.
- **Recettes** : titre, origine (livre + page, ou source web + lien), saison(s), catégorie, type, nombre de personnes de base, temps de préparation et de cuisson, étapes, notes, photo du plat (facultative).
- **Ingrédients (référence)** : nom unique, rayon du marché, saison du produit.
- **Ingrédients de chaque recette** : recette, ingrédient, quantité (nombre), unité (g, cl, c. à soupe, pièce…), précision éventuelle (« cuites, en bocal »).
- **Journal d'import** : livre, page, date, état (brouillon, validé), pour éviter les doublons.

Règles : « oignon » et « oignons » sont un seul ingrédient (rapprochement proposé à Loïc à chaque import). Les fractions sont converties en nombres (½ devient 0,5). L'historique des fichiers permet de revenir en arrière.

Exemple de recette lue pendant la conception : *Salade de lentilles, carottes et feta*, La flemme, page 22, hiver, plat, salade, 2 personnes, 8 min de préparation et 2 min de cuisson.

## 5. Écrans (maquette validée sur le principe)

Maquette cliquable : https://claude.ai/artifact/42uxjPofRRnUfaxonmMgFi (données d'exemple).

1. **De saison** : recettes du mois, filtres entrée/plat et type, recherche par titre ou ingrédient, interrupteur « seulement de saison ».
2. **Fiche recette** : « Livre X, page N » bien visible, nombre de personnes réglable (quantités recalculées), ingrédients, étapes, bouton « Ajouter à ma semaine ».
3. **Ma semaine** : les recettes choisies.
4. **Courses** : ingrédients additionnés, rangés par rayon, cases à cocher, bouton « Copier pour Google Keep » (comportement des cases à cocher dans Keep à vérifier avant livraison).
5. **Livres** : recettes classées par livre et par page, rubrique des recettes d'internet.

Lisible sur ordinateur, pensé d'abord pour le téléphone.

## 6. Qualité et vérifications

- Contrôles automatiques avant chaque mise en ligne : chaque recette a un titre, une origine, **un nombre de personnes**, des ingrédients reconnus et des quantités numériques ; aucun doublon livre + page + titre (une même page peut contenir plusieurs recettes).
- Test sur mobile et ordinateur, console sans erreur, avant de déclarer une étape terminée.
- Livraison en petites étapes, avec estimation avant et compte rendu après.

## 7. Étapes

1. **Socle** : structure des données, écrans, premières recettes d'un livre test.
2. **Courses** : liste par rayon, export vers Google Keep.
3. **Recettes d'internet** : Papilles et Pupilles, puis les autres sites choisis.
4. **Look** : refonte à partir des retours de Loïc.
5. **Plus tard** : renvois entre recettes, mode cuisine, favoris, planning par jour.

## 8. Hors périmètre pour l'instant

- Renvois entre recettes (« vinaigrette au tahini, p. 18 ») : le texte reste en note dans la fiche, sans lien.
- Appli qui lit elle-même les photos (bouton photo) ; fonctionnement hors réseau ; comptes et connexions ; modification des recettes par le foyer ; mode cuisine ; favoris ; planning détaillé.

## 9. Points à vérifier avant ou pendant la construction

- Que les cases à cocher survivent au collage de la liste dans Google Keep.
- Le coût réel de lecture d'un lot de photos (mesuré sur le premier livre).
- La liste des types de recettes, qui sera fixée avec les premiers livres.
- Le choix définitif de la couleur d'accent.
