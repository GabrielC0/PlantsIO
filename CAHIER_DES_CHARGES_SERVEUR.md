# Cahier des charges – Serveur PlantsIO
> Système d'irrigation automatique connecté (ESP32 + Web App)
> Version : 1.0 — Mars 2026

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique recommandée](#2-architecture-technique-recommandée)
3. [Modèles de données](#3-modèles-de-données)
4. [API REST – Endpoints détaillés](#4-api-rest--endpoints-détaillés)
   - 4.1 Santé & connexion ESP32
   - 4.2 État du système
   - 4.3 Contrôle de la pompe
   - 4.4 Mode automatique / manuel
   - 4.5 Programmation (schedules)
   - 4.6 Historique des arrosages
   - 4.7 Statistiques & graphiques
5. [Communication temps réel (WebSocket)](#5-communication-temps-réel-websocket)
6. [Scheduler – Exécution automatique](#6-scheduler--exécution-automatique)
7. [Communication avec l'ESP32](#7-communication-avec-lesp32)
8. [Sécurité](#8-sécurité)
9. [Contraintes non-fonctionnelles](#9-contraintes-non-fonctionnelles)
10. [Résumé des endpoints](#10-résumé-des-endpoints)

---

## 1. Vue d'ensemble

### 1.1 Contexte

PlantsIO est une application web d'irrigation automatique pilotée par un microcontrôleur **ESP32**. Le serveur joue le rôle de **pivot central** entre :
- le **client web** (Next.js – interface utilisateur),
- l'**ESP32** (matériel physique qui commande la pompe),
- la **base de données** (persistance des programmes, de l'historique et des statistiques).

### 1.2 Périmètre fonctionnel du serveur

| Fonctionnalité | Description |
|---|---|
| État de la connexion ESP32 | Surveiller en permanence si l'ESP32 est joignable |
| État de la pompe | Connaître et modifier l'état ON/OFF de la pompe en temps réel |
| Mode auto / manuel | Basculer entre arrosage automatique (programmé) et contrôle manuel |
| Gestion des programmes | CRUD complet sur les programmes d'arrosage hebdomadaires |
| Exécution des programmes | Lancer automatiquement la pompe selon les horaires configurés |
| Historique des arrosages | Enregistrer chaque arrosage (date, heure, durée, volume, mode) |
| Statistiques | Calculer les agrégats hebdomadaires et mensuels pour les graphiques |
| Activité récente | Retourner les N derniers arrosages pour l'affichage rapide |
| Prochain arrosage | Calculer dynamiquement la prochaine occurrence planifiée |
| Dernier arrosage | Retourner les informations du dernier arrosage terminé |
| Consommation actuelle | Volume consommé depuis minuit (journée en cours) |

---

## 2. Architecture technique recommandée

### 2.1 Stack serveur

| Composant | Technologie recommandée |
|---|---|
| Serveur HTTP | Node.js + Express **ou** Fastify |
| WebSocket | `ws` ou `socket.io` |
| Base de données | SQLite (simple, embarqué) **ou** PostgreSQL (production) |
| ORM | Prisma (compatible SQLite & PostgreSQL) |
| Scheduler (cron) | `node-cron` |
| Communication ESP32 | WebSocket côté ESP32 → serveur **ou** HTTP polling (ESP32 → serveur) |
| Variables d'environnement | `dotenv` |

### 2.2 Schéma d'architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVEUR NODE.JS                          │
│                                                                 │
│  ┌─────────────┐   REST API   ┌────────────────────────────┐   │
│  │  Client Web │ ←──────────→ │  Routes Express/Fastify    │   │
│  │  (Next.js)  │              │  /api/v1/...               │   │
│  └─────────────┘              └────────────┬───────────────┘   │
│                                            │                   │
│  ┌─────────────┐   WebSocket  ┌────────────▼───────────────┐   │
│  │  Client Web │ ←──────────→ │  WebSocket Hub             │   │
│  │  (Next.js)  │              │  (broadcast état temps réel)│   │
│  └─────────────┘              └────────────┬───────────────┘   │
│                                            │                   │
│  ┌─────────────┐   WebSocket  ┌────────────▼───────────────┐   │
│  │   ESP32     │ ←──────────→ │  ESP32 Gateway             │   │
│  │  (pompe)    │              │  (commandes + heartbeat)   │   │
│  └─────────────┘              └────────────┬───────────────┘   │
│                                            │                   │
│                               ┌────────────▼───────────────┐   │
│                               │  Base de données (SQLite/  │   │
│                               │  PostgreSQL via Prisma)    │   │
│                               └────────────────────────────┘   │
│                                                                 │
│                               ┌────────────────────────────┐   │
│                               │  Scheduler (node-cron)     │   │
│                               │  Déclenchement automatique │   │
│                               └────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Variables d'environnement requises

```env
PORT=3001
DATABASE_URL="file:./plantsio.db"          # SQLite
ESP32_WS_SECRET="<token_secret>"           # Authentification ESP32
JWT_SECRET="<secret>"                      # Auth utilisateur (optionnel)
PUMP_MAX_DURATION_SECONDS=3600             # Sécurité : durée max pompe (1h)
LOG_LEVEL="info"
```

---

## 3. Modèles de données

### 3.1 `Schedule` – Programme d'arrosage

```typescript
interface Schedule {
  id: string               // UUID v4
  name: string             // Ex: "Programme 1"
  enabled: boolean         // true = actif, false = suspendu
  times: string[]          // Horaires HH:MM, ex: ["07:00", "18:00"]
  activeDays: DayOfWeek[]  // ["Lun", "Mer", "Ven"]
  duration: number         // Durée en secondes (min: 10, max: 3600)
  createdAt: string        // ISO 8601
  updatedAt: string        // ISO 8601
}

type DayOfWeek = "Lun" | "Mar" | "Mer" | "Jeu" | "Ven" | "Sam" | "Dim"
```

**Contraintes de validation :**
- `times` : tableau non vide, chaque valeur au format `HH:MM` (regex : `/^([01]\d|2[0-3]):[0-5]\d$/`)
- `activeDays` : valeurs limitées à l'enum `DayOfWeek`
- `duration` : entier entre `10` et `3600`
- `name` : chaîne entre 1 et 50 caractères

---

### 3.2 `WateringSession` – Historique d'un arrosage

```typescript
interface WateringSession {
  id: string               // UUID v4
  startedAt: string        // ISO 8601 – horodatage début
  endedAt: string | null   // ISO 8601 – horodatage fin (null si en cours)
  durationSeconds: number  // Durée réelle constatée
  volumeLiters: number     // Volume estimé (durationSeconds × débit pompe)
  mode: "auto" | "manual"  // Déclenchement : automatique ou manuel
  scheduleId: string | null // ID du programme si mode=auto, sinon null
  triggeredBy: string      // "scheduler" | "user:<userId>" | "esp32"
  status: "completed" | "in_progress" | "aborted"
}
```

---

### 3.3 `SystemState` – État courant du système

Cet objet représente l'état en mémoire (ou en base pour persistance au redémarrage).

```typescript
interface SystemState {
  pumpOn: boolean           // true = pompe en marche
  autoMode: boolean         // true = mode automatique activé
  espConnected: boolean     // true = ESP32 joignable
  espLastSeen: string       // ISO 8601 – dernier heartbeat ESP32
  currentSessionId: string | null  // ID session en cours (ou null)
  flowRateLitersPerSecond: number  // Débit de la pompe (config, ex: 0.15)
}
```

---

### 3.4 Paramètres de configuration (persistés)

```typescript
interface Config {
  flowRateLitersPerSecond: number  // Débit pompe (L/s) – défaut: 0.15
  timezone: string                 // Ex: "Europe/Paris"
  pumpMaxDurationSeconds: number   // Sécurité: durée max par arrosage
}
```

---

## 4. API REST – Endpoints détaillés

**Base URL :** `http://<host>:<port>/api/v1`

**Format des réponses :**
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "PUMP_ALREADY_ON",
    "message": "La pompe est déjà en marche."
  }
}
```

**Codes HTTP utilisés :**
| Code | Usage |
|---|---|
| `200` | Succès (GET, PUT, PATCH) |
| `201` | Ressource créée (POST) |
| `400` | Données invalides (validation échouée) |
| `404` | Ressource introuvable |
| `409` | Conflit d'état (ex: pompe déjà ON) |
| `503` | ESP32 non joignable |

---

### 4.1 Santé & connexion ESP32

#### `GET /health`
Vérifie que le serveur est vivant.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "uptime": 3600,
    "timestamp": "2026-03-02T14:00:00.000Z"
  }
}
```

---

#### `GET /api/v1/esp/status`
Retourne l'état de la connexion avec l'ESP32.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "lastSeen": "2026-03-02T13:59:55.000Z",
    "ip": "192.168.1.42",
    "firmware": "1.2.0"
  }
}
```

**Cas déconnecté :**
```json
{
  "success": true,
  "data": {
    "connected": false,
    "lastSeen": "2026-03-02T13:45:00.000Z",
    "ip": null,
    "firmware": null
  }
}
```

---

### 4.2 État global du système

#### `GET /api/v1/system/state`
Retourne l'état complet du système en un seul appel (snapshot initial pour le client).

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "pumpOn": false,
    "autoMode": true,
    "espConnected": true,
    "espLastSeen": "2026-03-02T13:59:55.000Z",
    "currentSessionId": null,
    "lastWatering": {
      "date": "2026-03-01",
      "startTime": "07:00",
      "durationSeconds": 300,
      "volumeLiters": 45.0,
      "mode": "auto"
    },
    "nextWatering": {
      "scheduledAt": "2026-03-03T07:00:00.000Z",
      "scheduleId": "sch_abc123",
      "scheduleName": "Programme 1",
      "durationSeconds": 300
    },
    "todayConsumptionLiters": 45.0
  }
}
```

**Champs :**
| Champ | Description |
|---|---|
| `pumpOn` | État courant de la pompe |
| `autoMode` | Mode automatique activé |
| `espConnected` | ESP32 joignable |
| `lastWatering` | Dernier arrosage terminé (null si aucun) |
| `nextWatering` | Prochain arrosage planifié (null si mode manuel ou pas de programme) |
| `todayConsumptionLiters` | Volume total consommé aujourd'hui |

---

### 4.3 Contrôle de la pompe

#### `POST /api/v1/pump/on`
Démarre la pompe manuellement.

**Body (optionnel) :**
```json
{
  "durationSeconds": 300
}
```
- Si `durationSeconds` est absent, la pompe tourne jusqu'à un appel `POST /pump/off` ou jusqu'à `PUMP_MAX_DURATION_SECONDS`.
- Si `durationSeconds` est fourni : la pompe s'arrête automatiquement après ce délai.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_xyz789",
    "startedAt": "2026-03-02T14:05:00.000Z",
    "mode": "manual",
    "durationSeconds": 300,
    "autoStopAt": "2026-03-02T14:10:00.000Z"
  }
}
```

**Erreurs possibles :**
- `409 PUMP_ALREADY_ON` – La pompe est déjà en marche
- `503 ESP_DISCONNECTED` – L'ESP32 n'est pas joignable

---

#### `POST /api/v1/pump/off`
Arrête la pompe immédiatement.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "sessionId": "sess_xyz789",
    "endedAt": "2026-03-02T14:07:30.000Z",
    "durationSeconds": 150,
    "volumeLiters": 22.5,
    "status": "aborted"
  }
}
```

**Erreurs possibles :**
- `409 PUMP_ALREADY_OFF` – La pompe est déjà arrêtée
- `503 ESP_DISCONNECTED` – L'ESP32 n'est pas joignable

---

#### `GET /api/v1/pump/status`
Retourne uniquement l'état courant de la pompe.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "on": false,
    "sessionId": null,
    "mode": null,
    "startedAt": null,
    "durationSeconds": null
  }
}
```

---

### 4.4 Mode automatique / manuel

#### `GET /api/v1/mode`
Retourne le mode actuel.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "autoMode": true
  }
}
```

---

#### `PUT /api/v1/mode`
Bascule le mode automatique.

**Body :**
```json
{
  "autoMode": true
}
```

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "autoMode": true,
    "updatedAt": "2026-03-02T14:00:00.000Z"
  }
}
```

**Règle métier :** Si `autoMode` passe à `false` alors que la pompe tourne en mode auto, la pompe est arrêtée immédiatement et la session est marquée `aborted`.

---

### 4.5 Programmation – CRUD des schedules

#### `GET /api/v1/schedules`
Liste tous les programmes.

**Réponse 200 :**
```json
{
  "success": true,
  "data": [
    {
      "id": "sch_abc123",
      "name": "Programme 1",
      "enabled": true,
      "times": ["07:00", "18:00"],
      "activeDays": ["Lun", "Mer", "Ven"],
      "duration": 300,
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-03-01T08:00:00.000Z"
    }
  ]
}
```

---

#### `POST /api/v1/schedules`
Crée un nouveau programme.

**Body :**
```json
{
  "name": "Programme 2",
  "enabled": true,
  "times": ["08:00"],
  "activeDays": ["Mar", "Jeu", "Sam"],
  "duration": 180
}
```

**Validation :**
- `times` : requis, tableau non vide, chaque valeur `HH:MM`
- `activeDays` : requis, valeurs dans `["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"]`
- `duration` : requis, entier entre 10 et 3600

**Réponse 201 :**
```json
{
  "success": true,
  "data": {
    "id": "sch_def456",
    "name": "Programme 2",
    "enabled": true,
    "times": ["08:00"],
    "activeDays": ["Mar", "Jeu", "Sam"],
    "duration": 180,
    "createdAt": "2026-03-02T14:00:00.000Z",
    "updatedAt": "2026-03-02T14:00:00.000Z"
  }
}
```

**Après création :** Le scheduler se recharge automatiquement pour intégrer le nouveau programme.

---

#### `GET /api/v1/schedules/:id`
Retourne un programme par son ID.

**Réponse 404 :**
```json
{
  "success": false,
  "data": null,
  "error": { "code": "SCHEDULE_NOT_FOUND", "message": "Programme introuvable." }
}
```

---

#### `PUT /api/v1/schedules/:id`
Met à jour entièrement un programme.

**Body :** même structure que `POST /schedules`.

**Réponse 200 :** retourne le programme mis à jour.

**Après mise à jour :** Le scheduler se recharge automatiquement.

---

#### `PATCH /api/v1/schedules/:id`
Met à jour partiellement (ex: activer/désactiver uniquement).

**Body (partiel) :**
```json
{
  "enabled": false
}
```

**Réponse 200 :** retourne le programme mis à jour.

---

#### `DELETE /api/v1/schedules/:id`
Supprime un programme.

**Réponse 200 :**
```json
{
  "success": true,
  "data": { "deleted": true, "id": "sch_def456" }
}
```

**Règle métier :** Impossible de supprimer un programme si une session d'arrosage est en cours sur ce programme (retourne `409 SESSION_IN_PROGRESS`).

---

#### `PUT /api/v1/schedules` (bulk save)
Remplace l'intégralité des programmes en une seule opération (utilisé par le bouton "Enregistrer les programmes").

**Body :**
```json
{
  "schedules": [
    {
      "id": "sch_abc123",
      "name": "Programme 1",
      "enabled": true,
      "times": ["07:00"],
      "activeDays": ["Lun", "Mer", "Ven"],
      "duration": 300
    }
  ]
}
```

- Les programmes existants avec un `id` présent dans le tableau sont mis à jour.
- Les programmes sans `id` sont créés.
- Les programmes existants absents du tableau sont supprimés (sauf si une session est en cours).

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "saved": 1,
    "created": 0,
    "deleted": 0
  }
}
```

---

### 4.6 Historique des arrosages

#### `GET /api/v1/history`
Retourne l'historique paginé des arrosages (du plus récent au plus ancien).

**Paramètres de requête :**
| Paramètre | Type | Défaut | Description |
|---|---|---|---|
| `page` | `integer` | `1` | Numéro de page |
| `limit` | `integer` | `20` | Résultats par page (max 100) |
| `mode` | `"auto"\|"manual"` | tous | Filtrer par mode |
| `from` | `date (YYYY-MM-DD)` | — | Date de début (incluse) |
| `to` | `date (YYYY-MM-DD)` | — | Date de fin (incluse) |

**Exemple :** `GET /api/v1/history?page=1&limit=10&from=2026-01-01&to=2026-03-02`

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "sess_xyz789",
        "startedAt": "2026-03-02T07:00:00.000Z",
        "endedAt": "2026-03-02T07:05:00.000Z",
        "durationSeconds": 300,
        "volumeLiters": 45.0,
        "mode": "auto",
        "scheduleId": "sch_abc123",
        "scheduleName": "Programme 1",
        "status": "completed"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 85,
      "totalPages": 9
    }
  }
}
```

---

#### `GET /api/v1/history/recent`
Retourne les N derniers arrosages (pour le widget "Activité récente").

**Paramètre :** `?limit=5` (défaut : 5, max : 20)

**Réponse 200 :**
```json
{
  "success": true,
  "data": [
    {
      "id": "sess_xyz789",
      "date": "2026-03-02",
      "startTime": "07:00",
      "durationSeconds": 300,
      "volumeLiters": 45.0,
      "mode": "auto",
      "status": "completed"
    }
  ]
}
```

---

#### `GET /api/v1/history/last`
Retourne uniquement le dernier arrosage terminé (pour la stat card "Dernier arrosage").

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "id": "sess_xyz789",
    "date": "2026-03-01",
    "startTime": "07:00",
    "durationSeconds": 300,
    "volumeLiters": 45.0,
    "mode": "auto",
    "relativeLabel": "Hier 07:00"
  }
}
```

**Champ `relativeLabel` :** calculé côté serveur selon la timezone configurée :
- Même jour → `"Aujourd'hui HH:MM"`
- Jour précédent → `"Hier HH:MM"`
- Autrement → `"DD/MM HH:MM"`

---

#### `GET /api/v1/history/current`
Retourne la session d'arrosage en cours (null si aucune).

**Réponse 200 (pompe active) :**
```json
{
  "success": true,
  "data": {
    "id": "sess_abc001",
    "startedAt": "2026-03-02T14:05:00.000Z",
    "elapsedSeconds": 45,
    "estimatedVolumeNow": 6.75,
    "mode": "manual",
    "scheduleId": null,
    "autoStopAt": null
  }
}
```

**Réponse 200 (aucune session) :**
```json
{
  "success": true,
  "data": null
}
```

---

### 4.7 Statistiques & graphiques

#### `GET /api/v1/stats/weekly`
Données pour le graphique "Durée d'arrosage quotidienne" (7 derniers jours).

**Réponse 200 :**
```json
{
  "success": true,
  "data": [
    { "day": "Lun", "date": "2026-02-24", "durationSeconds": 900,  "volumeLiters": 135.0, "sessions": 2 },
    { "day": "Mar", "date": "2026-02-25", "durationSeconds": 300,  "volumeLiters": 45.0,  "sessions": 1 },
    { "day": "Mer", "date": "2026-02-26", "durationSeconds": 300,  "volumeLiters": 45.0,  "sessions": 1 },
    { "day": "Jeu", "date": "2026-02-27", "durationSeconds": 0,    "volumeLiters": 0,     "sessions": 0 },
    { "day": "Ven", "date": "2026-02-28", "durationSeconds": 300,  "volumeLiters": 45.0,  "sessions": 1 },
    { "day": "Sam", "date": "2026-03-01", "durationSeconds": 300,  "volumeLiters": 45.0,  "sessions": 1 },
    { "day": "Dim", "date": "2026-03-02", "durationSeconds": 300,  "volumeLiters": 45.0,  "sessions": 1 }
  ]
}
```

---

#### `GET /api/v1/stats/monthly`
Données pour le graphique "Consommation mensuelle" (12 derniers mois).

**Paramètre optionnel :** `?months=6` (défaut : 6, max : 12)

**Réponse 200 :**
```json
{
  "success": true,
  "data": [
    { "month": "Oct", "year": 2025, "volumeLiters": 1100, "durationSeconds": 7333, "sessions": 22 },
    { "month": "Nov", "year": 2025, "volumeLiters": 1200, "durationSeconds": 8000, "sessions": 24 },
    { "month": "Déc", "year": 2025, "volumeLiters": 980,  "durationSeconds": 6533, "sessions": 19 },
    { "month": "Jan", "year": 2026, "volumeLiters": 1200, "durationSeconds": 8000, "sessions": 24 },
    { "month": "Fév", "year": 2026, "volumeLiters": 1100, "durationSeconds": 7333, "sessions": 22 },
    { "month": "Mar", "year": 2026, "volumeLiters": 450,  "durationSeconds": 3000, "sessions": 10 }
  ]
}
```

---

#### `GET /api/v1/stats/today`
Volume et durée consommés depuis minuit (journée en cours).

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "date": "2026-03-02",
    "volumeLiters": 45.0,
    "durationSeconds": 300,
    "sessions": 1,
    "lastSession": "2026-03-02T07:00:00.000Z"
  }
}
```

---

#### `GET /api/v1/schedules/next`
Calcule et retourne le prochain arrosage planifié.

**Réponse 200 :**
```json
{
  "success": true,
  "data": {
    "scheduledAt": "2026-03-03T07:00:00.000Z",
    "scheduleId": "sch_abc123",
    "scheduleName": "Programme 1",
    "durationSeconds": 300,
    "relativeLabel": "Demain 07:00"
  }
}
```

**Réponse si mode manuel ou aucun programme actif :**
```json
{
  "success": true,
  "data": null
}
```

---

## 5. Communication temps réel (WebSocket)

**URL :** `ws://<host>:<port>/ws`

Le client web se connecte au démarrage et maintient la connexion ouverte pour recevoir les mises à jour d'état en temps réel sans polling.

### 5.1 Format des messages

```typescript
interface WsMessage {
  type: string     // identifiant de l'événement
  payload: object  // données de l'événement
  ts: string       // ISO 8601 timestamp
}
```

### 5.2 Messages serveur → client

#### `state:pump`
Envoyé chaque fois que l'état de la pompe change.
```json
{
  "type": "state:pump",
  "payload": {
    "on": true,
    "sessionId": "sess_xyz789",
    "mode": "manual",
    "startedAt": "2026-03-02T14:05:00.000Z"
  },
  "ts": "2026-03-02T14:05:00.050Z"
}
```

#### `state:esp`
Envoyé chaque fois que l'état de connexion de l'ESP32 change.
```json
{
  "type": "state:esp",
  "payload": {
    "connected": false,
    "lastSeen": "2026-03-02T13:45:00.000Z"
  },
  "ts": "2026-03-02T13:45:05.000Z"
}
```

#### `state:mode`
Envoyé lorsque le mode auto/manuel bascule.
```json
{
  "type": "state:mode",
  "payload": { "autoMode": true },
  "ts": "2026-03-02T14:00:00.000Z"
}
```

#### `session:started`
Envoyé au démarrage d'une session d'arrosage.
```json
{
  "type": "session:started",
  "payload": {
    "sessionId": "sess_xyz789",
    "mode": "auto",
    "scheduleId": "sch_abc123",
    "startedAt": "2026-03-02T07:00:00.000Z",
    "durationSeconds": 300
  },
  "ts": "2026-03-02T07:00:00.010Z"
}
```

#### `session:ended`
Envoyé à la fin d'une session d'arrosage.
```json
{
  "type": "session:ended",
  "payload": {
    "sessionId": "sess_xyz789",
    "endedAt": "2026-03-02T07:05:00.000Z",
    "durationSeconds": 300,
    "volumeLiters": 45.0,
    "status": "completed"
  },
  "ts": "2026-03-02T07:05:00.010Z"
}
```

#### `session:tick`
Envoyé chaque seconde pendant qu'une session est en cours (pour un compteur live).
```json
{
  "type": "session:tick",
  "payload": {
    "sessionId": "sess_xyz789",
    "elapsedSeconds": 45,
    "estimatedVolumeNow": 6.75
  },
  "ts": "2026-03-02T14:05:45.010Z"
}
```

#### `schedules:updated`
Envoyé après toute modification des programmes.
```json
{
  "type": "schedules:updated",
  "payload": {
    "count": 2
  },
  "ts": "2026-03-02T14:00:00.000Z"
}
```

### 5.3 Messages client → serveur

Le client peut envoyer des commandes directement via WebSocket (alternative à l'API REST pour les actions temps réel) :

#### `cmd:pump:on`
```json
{ "type": "cmd:pump:on", "payload": { "durationSeconds": 300 } }
```

#### `cmd:pump:off`
```json
{ "type": "cmd:pump:off", "payload": {} }
```

---

## 6. Scheduler – Exécution automatique

### 6.1 Principe

Le serveur maintient en mémoire un ensemble de tâches cron générées à partir des programmes actifs. À chaque modification des programmes, le scheduler est rechargé.

### 6.2 Algorithme de déclenchement

```
Pour chaque Schedule (enabled=true, autoMode=true) :
  Pour chaque time HH:MM dans schedule.times :
    Pour chaque day dans schedule.activeDays :
      Planifier une tâche cron : "MM HH * * <dayIndex>"

À l'exécution :
  1. Vérifier que autoMode=true
  2. Vérifier que le schedule existe toujours et est enabled
  3. Vérifier que l'ESP32 est connecté
  4. Vérifier qu'aucune session n'est déjà en cours
  5. Envoyer commande ON à l'ESP32
  6. Créer une WateringSession { mode: "auto", scheduleId: ... }
  7. Planifier le OFF après schedule.duration secondes
  8. Broadcaster session:started via WebSocket
```

**Correspondance jours :**
| Label | Index cron |
|---|---|
| Lun | 1 |
| Mar | 2 |
| Mer | 3 |
| Jeu | 4 |
| Ven | 5 |
| Sam | 6 |
| Dim | 0 |

### 6.3 Sécurité automatique (watchdog)

- Si une session `in_progress` dépasse `PUMP_MAX_DURATION_SECONDS`, le serveur force l'arrêt de la pompe et marque la session `aborted`.
- Si l'ESP32 se déconnecte pendant une session, la session est marquée `aborted` et une alerte WebSocket est émise.

---

## 7. Communication avec l'ESP32

### 7.1 Protocole

L'ESP32 se connecte au serveur via **WebSocket** avec un token d'authentification :

```
ws://<server>:<port>/esp?token=<ESP32_WS_SECRET>
```

### 7.2 Messages serveur → ESP32

#### `pump:on`
```json
{ "cmd": "pump:on", "durationSeconds": 300 }
```

#### `pump:off`
```json
{ "cmd": "pump:off" }
```

### 7.3 Messages ESP32 → serveur

#### `heartbeat`
Envoyé toutes les **10 secondes** par l'ESP32 pour signaler qu'il est en vie.
```json
{
  "type": "heartbeat",
  "payload": {
    "firmware": "1.2.0",
    "uptime": 3600,
    "pumpOn": false
  }
}
```

#### `pump:ack`
Confirmation que la pompe a bien changé d'état.
```json
{
  "type": "pump:ack",
  "payload": { "on": true, "ts": "2026-03-02T14:05:00.010Z" }
}
```

#### `pump:error`
Erreur matérielle (surcharge, relais défaillant, etc.).
```json
{
  "type": "pump:error",
  "payload": { "code": "RELAY_FAILURE", "message": "Relais défaillant" }
}
```

### 7.4 Détection de déconnexion

- Si aucun `heartbeat` n'est reçu pendant **30 secondes**, l'ESP32 est marqué `disconnected`.
- Un message `state:esp { connected: false }` est broadcasté à tous les clients web.
- Si une session est en cours, elle est immédiatement arrêtée et marquée `aborted`.

---

## 8. Sécurité

### 8.1 Authentification (optionnelle pour v1, recommandée pour production)

Ajouter une authentification JWT minimale pour protéger les endpoints sensibles (contrôle pompe, modification programmes).

**Endpoints protégés :**
- `POST /pump/on`, `POST /pump/off`
- `POST /schedules`, `PUT /schedules`, `DELETE /schedules/:id`
- `PUT /mode`

**Endpoints publics :**
- `GET /health`, `GET /esp/status`, `GET /system/state`
- Tous les GET d'historique et statistiques

### 8.2 Validation des entrées

- Toutes les données entrantes validées par un schéma (ex: `zod` ou `joi`)
- Aucune valeur non attendue ne doit passer au scheduler ou à l'ESP32

### 8.3 Limites de taux (rate limiting)

- `POST /pump/on` et `POST /pump/off` : max **10 req/min** par IP
- Endpoints CRUD : max **60 req/min** par IP
- WebSocket : max **1 connexion simultanée** par client

### 8.4 Durée maximale de la pompe

- Quelle que soit la source de déclenchement, la pompe ne peut jamais tourner plus de `PUMP_MAX_DURATION_SECONDS` secondes (variable d'environnement, défaut 3600s)
- Ce watchdog est implémenté côté **serveur** (indépendant de l'ESP32)

---

## 9. Contraintes non-fonctionnelles

### 9.1 Performance

| Critère | Cible |
|---|---|
| Temps de réponse API REST | < 100ms (P95) |
| Latence WebSocket pump:on → ESP32 ack | < 500ms |
| Déclenchement scheduler (écart / heure prévue) | < 2 secondes |

### 9.2 Persistance

- L'état `autoMode`, les schedules et l'historique doivent survivre au redémarrage du serveur
- L'état `pumpOn` est **recalculé** au démarrage depuis l'ESP32 (non persisté)

### 9.3 Timezone

- Toutes les heures stockées en base sont en **UTC**
- Toutes les heures affichées au client sont converties dans la timezone configurée (`Europe/Paris` par défaut)
- Le scheduler tient compte de la timezone pour les crons (champ `tz` de `node-cron`)

### 9.4 Logging

Chaque événement critique doit être loggué :
- Démarrage/arrêt de la pompe (avec source)
- Connexion/déconnexion ESP32
- Création/modification/suppression de programme
- Erreurs ESP32
- Déclenchements automatiques

### 9.5 Compatibilité client

- L'API doit supporter **CORS** pour permettre au client Next.js (potentiellement sur un port différent) d'y accéder
- Header requis : `Access-Control-Allow-Origin: <client_origin>`

---

## 10. Résumé des endpoints

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Santé du serveur |
| `GET` | `/api/v1/esp/status` | État connexion ESP32 |
| `GET` | `/api/v1/system/state` | Snapshot complet du système |
| `GET` | `/api/v1/pump/status` | État pompe |
| `POST` | `/api/v1/pump/on` | Démarrer pompe |
| `POST` | `/api/v1/pump/off` | Arrêter pompe |
| `GET` | `/api/v1/mode` | Mode actuel |
| `PUT` | `/api/v1/mode` | Changer mode |
| `GET` | `/api/v1/schedules` | Lister programmes |
| `POST` | `/api/v1/schedules` | Créer programme |
| `GET` | `/api/v1/schedules/:id` | Détail programme |
| `PUT` | `/api/v1/schedules/:id` | Remplacer programme |
| `PATCH` | `/api/v1/schedules/:id` | Modifier partiellement |
| `DELETE` | `/api/v1/schedules/:id` | Supprimer programme |
| `PUT` | `/api/v1/schedules` | Sauvegarder tout (bulk) |
| `GET` | `/api/v1/schedules/next` | Prochain arrosage planifié |
| `GET` | `/api/v1/history` | Historique paginé |
| `GET` | `/api/v1/history/recent` | N derniers arrosages |
| `GET` | `/api/v1/history/last` | Dernier arrosage |
| `GET` | `/api/v1/history/current` | Session en cours |
| `GET` | `/api/v1/stats/weekly` | Stats 7 derniers jours |
| `GET` | `/api/v1/stats/monthly` | Stats mensuelles |
| `GET` | `/api/v1/stats/today` | Consommation du jour |
| `WS` | `/ws` | WebSocket client web |
| `WS` | `/esp` | WebSocket ESP32 |

---

*Ce cahier des charges couvre l'intégralité des besoins du client web PlantsIO. Chaque endpoint est conçu pour correspondre précisément à un widget ou une action de l'interface.*
