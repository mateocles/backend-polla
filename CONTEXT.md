# 🧠 Contexto — `backend_polla` (API)

> Documento para que otra IA/dev continúe. Refleja el estado actual del backend.

## ¿Qué es?
La **fuente de verdad** de la Polla Mundialista: API REST que gestiona usuarios, grupos (públicos/privados), partidos del Mundial 2026 y el sistema de predicciones/puntos. La consumen la app móvil (`frontend_polla`) y la web (`frontend_polla_web`).

## Stack
- **Node.js + Express 5**, **Prisma ORM + PostgreSQL (Neon)**.
- **JWT + bcrypt** (auth); **google-auth-library** (login con Google por ID token).
- **node-cron + Axios** (sync de partidos); **Nodemailer** (invitaciones).
- **swagger-ui** vía CDN en `/api-docs` (spec en `src/config/swagger.js`).

## Despliegue: **Vercel (serverless)**
- `src/app.js` **exporta la app** (`module.exports = app`); `app.listen`/cron **solo corren fuera de Vercel** (`process.env.VERCEL`).
- `api/index.js` = handler serverless. `vercel.json` reescribe todo a esa función + cron diario a `/api/cron/sync`.
- **Prisma en Vercel**: `binaryTargets = ["native","rhel-openssl-3.0.x"]` + script **`vercel-build: prisma generate`** (Vercel cachea deps y no corre postinstall → hay que generar en build). Cliente Prisma **singleton** en `src/lib/prisma.js`.
- Imágenes en **base64** → `express.json({ limit: '30mb' })`.
- URL producción actual: `https://backend-polla-v2.vercel.app`.
- Variables en Vercel (Settings → Env): `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_USER/PASS`, opcional `CRON_SECRET`, y `GOOGLE_IOS/ANDROID/WEB_CLIENT_ID` si validas esas audiencias.

## Modelo de datos (Prisma)
- **User**: email, passwordHash?, googleId?, name, **avatarUrl** (base64).
- **Group**: name, **imageUrl** (base64), **isPublic**, **ownerId** (=admin), inviteCode.
- **UserGroup**: relación N:M.
- **Match**: equipos, fecha, **status (`notstarted`/`live`/`finished`)**, marcador, **homeScorers[]**, **awayScorers[]**.
- **Prediction**: `@@unique([userId, matchId])`, marcador, points.

## Endpoints (ver `/api-docs` para el detalle)
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | público |
| POST | `/api/auth/google` | login/registro con **ID token** de Google |
| PATCH | `/api/auth/profile` | JWT — nombre/avatar (base64) |
| GET·POST | `/api/groups` | listar (con memberCount, myRank, isAdmin, isPublic) / crear (`isPublic`) |
| GET | `/api/groups/public` | grupos públicos a los que NO perteneces |
| POST | `/api/groups/:groupId/join` | unirse a público (sin código) |
| POST | `/api/groups/join` · `/api/groups/invite` | unirse por código / invitar (admin) |
| PATCH | `/api/groups/:groupId` | editar nombre/imagen (**solo admin**) |
| GET | `/api/predictions/matches` | partidos + tu predicción |
| POST | `/api/predictions` | crear/editar (**bloqueado si el partido inició**) |
| GET | `/api/predictions/leaderboard/:groupId` | tabla del grupo (con avatar) |
| GET | `/api/predictions/user/:userId/group/:groupId` | pronósticos de otro usuario (grupo compartido; solo partidos cerrados) |
| GET | `/api/cron/sync` | sincroniza partidos + reparte puntos (cron) |

## Reglas de negocio clave
- **Puntos**: 6 (marcador exacto) · 3 (acierto de resultado) · 0 (fallo). En `services/pointsCalculator.js`, idempotente (solo actualiza si cambió).
- **Sync** (`services/matchSync.js`): trae de `worldcup26.ir` (timeout + 3 reintentos). Mapea estado desde `time_elapsed` → `notstarted`/`live`/`finished`; actualiza marcador/**goleadores** (también en vivo), y al pasar a `finished` **reparte puntos**.
- **Partidos en vivo (`live`)**: la API externa NO da el minuto, solo el estado y el marcador actual. `MatchSyncService.syncIfStale(30s)` hace **sync-on-read** (throttle + dedupe) llamado desde `getMatchesWithPredictions` y `getLeaderboard`, para mantener frescos los marcadores en vivo sin cron frecuente.
- **Predicción cerrada al iniciar el partido**: validado en `submitPrediction` (`status !== notstarted || now >= matchDate`).
- **Admin = creador** del grupo (`ownerId`). Solo el admin edita el grupo.
- **Anti-trampa**: los pronósticos de otros usuarios solo se ven para partidos ya iniciados/finalizados.

## Cron en Vercel Hobby
El plan Hobby permite cron **1×/día** (`vercel.json` ya está en diario). Para sync frecuente: cron externo gratis (cron-job.org) cada ~15–30 min a `/api/cron/sync` (con `?secret=CRON_SECRET`).

## Cómo correr local
```bash
npm install
npx prisma db push        # sincroniza schema con la DB
node src/app.js           # http://localhost:3000  (docs: /api-docs)
```

## Pendientes / ideas
- Mover imágenes base64 a almacenamiento de archivos (S3/Cloudinary) si crece el volumen.
- Google OAuth nativo móvil (iOS/Android client IDs) — el endpoint ya está listo.
- Paginación en leaderboard/partidos si crecen mucho.

## Relación
```
worldcup26.ir ──(cron)──▶ backend_polla ◀── REST ── frontend_polla (móvil)
                              │           ◀── REST ── frontend_polla_web (web)
                          PostgreSQL (Neon)
```
