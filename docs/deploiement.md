# Déploiement

Athlos se déploie en une image Docker qui contient l'API, l'application compilée et ffmpeg. Elle tourne sur
n'importe quel serveur Linux, arm64 ou amd64, même modeste : 512 Mo de RAM suffisent.

## Prérequis

- **Docker** (avec Docker Compose de préférence).
- **HTTPS**, recommandé : le mot de passe, le jeton de l'appareil et les données passent par le réseau.
  Sur un réseau privé, un reverse proxy avec sa propre autorité de certification convient, à condition
  d'installer le certificat racine sur chaque appareil.
- **Accès Internet sortant** pour le serveur, seulement pour le premier téléchargement de la bibliothèque
  d'exercices. L'app elle-même n'a pas besoin d'être exposée sur Internet :
  un accès local, plus un VPN pour l'extérieur, est l'usage prévu.

## Installation avec Docker Compose

```sh
git clone https://github.com/ZSR17/athlos.git athlos-src
docker build -t athlos:latest athlos-src

mkdir -p athlos/env athlos/data && cd athlos
# Mot de passe de l'app : demandé deux fois, seule son empreinte est écrite (fichier en chmod 600)
docker run --rm -it -v "$PWD/env:/out" athlos:latest \
  node --import tsx src/scripts/hash-password.ts --write /out/athlos.env
```

`compose.yml` :

```yaml
services:
  athlos:
    image: athlos:latest
    container_name: athlos
    restart: unless-stopped
    env_file: env/athlos.env
    environment:
      HOME_CIDRS: 192.168.1.0/24       # ton réseau local
    volumes:
      - ./data:/data                   # base, médias, sauvegardes
    tmpfs:
      - /tmp:size=64m                  # conversions vidéo en cours
    mem_limit: 512m
    ports:
      - "127.0.0.1:3000:3000"          # uniquement pour le reverse proxy
```

```sh
docker compose up -d
docker logs -f athlos     # « library import » : téléchargement de la bibliothèque au premier démarrage
```

Le conteneur tourne avec l'utilisateur `node` (uid 1000) : le dossier `data/` doit lui être accessible en
écriture.

## Reverse proxy

N'importe quel reverse proxy HTTPS convient, avec trois réglages :

- **Taille des envois** : au moins 110 Mo, pour les vidéos (le serveur accepte 100 Mo).
- **Pas de mise en tampon** des réponses `text/event-stream` (`/api/v1/events`), sinon les autres appareils
  ne sont plus prévenus en temps réel.
- **Pas de page de connexion** devant l'app (authentification unique, etc.) : elle a son propre mot de
  passe, et une redirection casserait la synchronisation.

Si le proxy n'est pas sur la même machine ou le même réseau Docker, ajoute son adresse à `TRUST_PROXY` :
le serveur a besoin de la vraie adresse de l'appareil pour savoir s'il est « à la maison ».

## Configuration

Variables d'environnement, dans `env/athlos.env` ou dans `compose.yml` :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `APP_PASSWORD_HASH` | *(vide)* | Empreinte scrypt du mot de passe. **Obligatoire** : sans elle, toute connexion est refusée. Entre apostrophes dans un fichier lu par Compose, sinon chaque `$` est pris pour une variable. |
| `HOME_CIDRS` | `192.168.1.0/24` | Réseaux considérés comme « à la maison » (réglage de synchro « à la maison uniquement »). Plusieurs valeurs séparées par des virgules. |
| `TRUST_PROXY` | `127.0.0.1/32,172.16.0.0/12` | Proxys dont l'en-tête `X-Forwarded-For` est accepté. |
| `LOG_LEVEL` | `info` | Niveau des logs (`debug`, `info`, `warn`, `error`). |
| `PORT`, `HOST` | `3000`, `0.0.0.0` | Écoute du serveur. |
| `DATA_DIR` | `/data` | Base SQLite, médias et sauvegardes. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | `ffmpeg`, `ffprobe` | Conversion des vidéos (déjà dans l'image). |

## Ouvrir l'app

Ouvrir l'adresse du serveur dans un navigateur récent. Au premier lancement, l'app demande le mot de passe, puis le mode de synchronisation.

## Sauvegardes

- Chaque jour, le serveur copie la base dans `data/backups/` (`VACUUM INTO`) et garde les 7 dernières.
- Les médias sont dans `data/media/`. Sauvegarder tout `data/` suffit.
- Depuis l'app, Réglages → Mes données exporte toutes tes données en JSON.

Restaurer une copie : arrêter le conteneur, remplacer `data/athlos.db` par une copie de `data/backups/`,
supprimer `athlos.db-wal` et `athlos.db-shm`, puis redémarrer.

## Mettre à jour

```sh
git -C athlos-src pull
docker build -t athlos:latest athlos-src
docker compose up -d
```

Les migrations de la base s'appliquent toutes seules au démarrage. Les appareils récupèrent la nouvelle
version de l'app à leur prochaine ouverture.

## Surveillance

`GET /api/health` répond `{ ok: true, version }` sans authentification. L'image a déjà un `HEALTHCHECK`
Docker qui l'utilise ; le même lien convient à un outil de surveillance.
