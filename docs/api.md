# API

Toutes les routes `/api/v1/*` demandent l'en-tête `Authorization: Bearer <jeton>`, sauf la connexion.
Les corps sont en JSON et validés par les schémas zod de `shared/`.

## Serveur

| Route | Rôle |
| --- | --- |
| `GET /api/health` | État du serveur et version (public, utilisé par le healthcheck Docker). |
| `GET /api/v1/network` | `{ location: 'home' \| 'remote' }`, d'après `HOME_CIDRS` (réglage « à la maison uniquement »). |
| `GET /api/v1/storage` | Place occupée par la base et les médias. |

## Connexion et appareils

| Route | Rôle |
| --- | --- |
| `POST /api/v1/auth/login` `{ password, deviceName }` | Crée un appareil, renvoie `{ token, deviceId }`. Public, 10 essais par minute. |
| `POST /api/v1/auth/logout` | Déconnecte l'appareil courant. |
| `GET /api/v1/devices` | Appareils connectés. |
| `DELETE /api/v1/devices/:id` | Déconnecte un appareil (son jeton cesse de fonctionner). |
| `POST /api/v1/devices/shortcut` `{ name? }` | Crée la clé du Raccourci Apple Watch (un appareil comme les autres). |

## Synchronisation

| Route | Rôle |
| --- | --- |
| `POST /api/v1/sync` `{ since, changes }` | Envoie les lignes modifiées, renvoie `{ rev, changes, hasMore, remaining }`. |
| `GET /api/v1/events` | Flux SSE : `{"rev":N}` quand les données changent, `{"live":1}` quand la montre a validé une série. |
| `DELETE /api/v1/exercises/:id/override` | Supprime ta version d'un exercice de la bibliothèque. |

Le fonctionnement de la synchro est décrit dans [architecture.md](architecture.md#synchronisation).

## Médias

| Route | Rôle |
| --- | --- |
| `POST /api/v1/media` | Corps = le fichier, `Content-Type` = son type (`image/*` ou `video/*`), 100 Mo max. Renvoie `{ ids, urls }`. 415 si le type n'est pas pris en charge, 503 si ffmpeg est absent. |
| `GET /media/<sha256>.webp\|mp4` | Le fichier, mis en cache définitivement. Public pour que les balises `<img>` et `<video>` fonctionnent ; les noms ne se devinent pas. |

## Notifications de fin de repos

| Route | Rôle |
| --- | --- |
| `GET /api/v1/push/key` | Clé publique VAPID du serveur. |
| `GET\|PUT\|DELETE /api/v1/push/subscription` | Abonnement Web Push de l'appareil (`PUT` : l'objet `PushSubscription` du navigateur). |
| `PUT /api/v1/push/rest` `{ inMs, body? }` | Notification dans `inMs` millisecondes (30 min max), remplace la précédente. Renvoie `{ scheduled }` : `false` si l'appareil n'est pas abonné. |
| `DELETE /api/v1/push/rest` | Annule la notification prévue. |

## Séance en cours (Apple Watch)

| Route | Rôle |
| --- | --- |
| `PUT /api/v1/live` `{ steps: [{ label, restS }] }` | Le téléphone publie les séries à venir (liste vide : pas de séance). |
| `DELETE /api/v1/live` | Séance terminée : oublie les séries et les actions en attente. |
| `POST /api/v1/live/actions` | Appelé par le raccourci : valide la série suivante. Répond en texte brut pour la montre ; 409 sans séance en cours. |
| `POST /api/v1/live/actions/take` | L'app récupère les actions en attente `{ actions: [{ id, at }] }` (une seule fois ; oubliées après 30 min). |
