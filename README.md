# Factory Flow — prototype jouable

Prototype web mobile-first destiné à valider le **core loop** avant un développement Unity/Godot plus lourd.

## Boucle testée

1. Une file de pièces colorées arrive sur la ligne.
2. Le joueur envoie la première pièce vers la machine correspondante.
3. Certaines machines ont un temps de cycle : elles restent indisponibles pendant plusieurs tours.
4. Le joueur peut dévier une pièce vers un buffer de capacité limitée afin de modifier l'ordre de traitement.
5. Une pièce stockée peut être sélectionnée puis réinjectée vers sa machine.
6. Victoire : toutes les pièces sont traitées. Défaite : plus aucun mouvement utile n'est possible et le buffer est saturé.

## Contenu du MVP

- 10 niveaux faits main.
- 2 à 4 machines/couleurs.
- Temps de cycle par machine.
- Maintenance initiale sur certains niveaux.
- Buffer limité.
- Feedback sonore et vibration si supportés.
- UI portrait mobile-first.
- PWA installable (manifest minimal).
- Analytics locaux de prototype (localStorage + CustomEvent `factoryflow:event`).
- Outils debug : `window.FactoryFlowDebug` dans la console.

## Lancer localement

```bash
python3 -m http.server 4173
```

Puis ouvrir `http://localhost:4173` depuis ce dossier.

## KPI à observer sur les premiers tests

- Temps de compréhension du niveau 1.
- Taux de réussite des niveaux 3, 5 et 10.
- Nombre moyen d'utilisations du buffer.
- Nombre d'erreurs de machine.
- Ouverture d'indice.
- Temps/session et abandon par niveau.

## QA automatisée des niveaux

```bash
python3 tools/validate_levels.py
```

Le solveur effectue une recherche exhaustive BFS et échoue si un niveau n'a aucune séquence gagnante.
