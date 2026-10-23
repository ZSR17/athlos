# API

Toutes les routes `/api/v1/*` demandent l'en-tête `Authorization: Bearer <jeton>`, sauf la connexion.
Les corps sont en JSON et validés par les schémas zod de `shared/`.

## Serveur

| Route | Rôle |
| --- | --- |
| `GET /api/health` | État du serveur et version (public, utilisé par le healthcheck Docker). |
| `GET /api/v1/storage` | Place occupée par la base et les médias. |

## Connexion et appareils

| Route | Rôle |
| --- | --- |
| `POST /api/v1/auth/login` `{ password, deviceName }` | Crée un appareil, renvoie `{ token, deviceId }`. Public, 10 essais par minute. |
| `POST /api/v1/auth/logout` | Déconnecte l'appareil courant. |
| `GET /api/v1/devices` | Appareils connectés. |
| `DELETE /api/v1/devices/:id` | Déconnecte un appareil (son jeton cesse de fonctionner). |

## Synchronisation

| Route | Rôle |
| --- | --- |
| `POST /api/v1/sync` `{ since, instance?, changes }` | Envoie les lignes modifiées, renvoie `{ instance, rev, changes, hasMore, remaining, rejected }`. Si `instance` (la base de la dernière synchro de l'appareil) n'est pas celle du serveur, rien n'est enregistré : l'appareil doit repartir de zéro. |
| `GET /api/v1/events` | Flux SSE : `{"rev":N}` quand les données changent. |
| `DELETE /api/v1/exercises/:id/override` | Supprime ta version d'un exercice de la bibliothèque. |

Le fonctionnement de la synchro est décrit dans [architecture.md](architecture.md#synchronisation).

## Médias

| Route | Rôle |
| --- | --- |
| `POST /api/v1/media` | Corps = le fichier, `Content-Type` = son type (`image/*` ou `video/*`), 100 Mo max. Renvoie `{ ids, urls }`. 415 si le type n'est pas pris en charge, 503 si ffmpeg est absent. |
| `GET /media/<sha256>.webp\|mp4` | Le fichier, mis en cache définitivement. Public pour que les balises `<img>` et `<video>` fonctionnent ; les noms ne se devinent pas. |
