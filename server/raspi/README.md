# Déploiement Raspberry Pi – PlantsIO Server

## Prérequis

- Raspberry Pi OS / Debian 12 (64 bits)
- Node.js ≥ 20.11 :
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- MariaDB en cours d'exécution avec la base `plant-io`

## Installation

```bash
# 1. Installer les dépendances
cd /home/pi/rem0teApi/PlantsIO/server
npm install

# 2. Vérifier / adapter le fichier .env
nano .env
#  → PORT=45024
#  → DATABASE_URL=mysql://...
#  → SERVICE_PREFIX_ENABLED=true

# 3. Générer le client Prisma et pousser le schéma
npm run db:generate
npm run db:push

# 4. Builder le TypeScript
npm run build
```

## Service systemd (démarrage au boot)

```bash
# Copier le fichier de service
sudo cp raspi/systemd/plantsio-server.service /etc/systemd/system/

# Recharger systemd et activer le service
sudo systemctl daemon-reload
sudo systemctl enable plantsio-server
sudo systemctl start plantsio-server

# Vérifier l'état
sudo systemctl status plantsio-server
journalctl -u plantsio-server -f
```

## Routes disponibles

| Méthode | URL | Description |
|---------|-----|-------------|
| GET | `/plantsio/health` | Health check |
| GET | `/plantsio/api/v1/esp/status` | Statut ESP32 |
| GET | `/plantsio/api/v1/system/state` | État complet du système |
| POST | `/plantsio/api/v1/pump/start` | Démarrer la pompe |
| POST | `/plantsio/api/v1/pump/stop` | Arrêter la pompe |
| GET/POST/DELETE | `/plantsio/api/v1/schedules` | Gestion des programmes |
| GET | `/plantsio/api/v1/history` | Historique des arrosages |
| GET | `/plantsio/api/v1/stats/weekly` | Statistiques hebdomadaires |
| WS | `ws://<ip>:45024/plantsio/esp?token=<secret>` | Connexion ESP32 |

> Si `SERVICE_PREFIX_ENABLED=false` dans `.env`, les routes fonctionnent sans prefixe (`/api/v1/...`) pour la compatibilité backward.

## Maintenance

```bash
# Mettre à jour
git pull && npm install && npm run build && sudo systemctl restart plantsio-server

# Logs en direct
journalctl -u plantsio-server -f

# Arrêter / désactiver
sudo systemctl stop plantsio-server
sudo systemctl disable plantsio-server
```
