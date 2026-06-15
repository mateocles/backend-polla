# 🧠 Contexto — `backend_polla` (API)

## ¿Qué es?
El **cerebro y fuente de verdad** de la Polla Mundialista. Una API REST que gestiona usuarios, grupos, partidos del Mundial 2026 y el sistema de predicciones/puntos. Tanto la app móvil (`frontend_polla`) como la web (`frontend_polla_web`) consumen **este mismo backend**.

## Stack
- **Node.js + Express** — servidor HTTP / rutas.
- **Prisma ORM + PostgreSQL (Neon)** — base de datos.
- **JWT + bcrypt** — autenticación.
- **Passport (Google OAuth)** — login con Google.
- **node-cron + Axios** — sincronización automática de partidos.
- **Nodemailer** — invitaciones por correo.

## Responsabilidades clave
1. **Auth**: registro/login (JWT), `PATCH /auth/profile` (nombre + avatar base64).
2. **Grupos**: crear, listar (con `memberCount`, `myRank`, `isAdmin`), unirse por código, invitar, y `PATCH /groups/:id` (editar nombre/imagen — **solo el admin/creador**).
3. **Predicciones y puntos**:
   - Reglas: **6 pts** marcador exacto · **3 pts** acierto de resultado · **0 pts** fallo.
   - Regla de cierre: **no se aceptan ni modifican** pronósticos una vez el partido inició (`status !== notstarted` o fecha pasada).
4. **Sincronización (cron cada 30 min)**: trae partidos de `worldcup26.ir`, actualiza estados/marcadores, parsea **goleadores** (`homeScorers`/`awayScorers`) y **calcula puntos** al finalizar. Resiliente: timeout + reintentos.

## Modelo de datos (Prisma)
- **User**: email, passwordHash, name, `avatarUrl` (base64), googleId.
- **Group**: name, `imageUrl` (base64), `ownerId` (= admin), `inviteCode`.
- **UserGroup**: relación N:M usuario↔grupo.
- **Match**: equipos, fecha, status, marcador, `homeScorers[]`, `awayScorers[]`.
- **Prediction**: userId+matchId (único), marcador, points.

## Endpoints principales
| Método | Ruta | Notas |
|---|---|---|
| POST | `/api/auth/register` · `/api/auth/login` | público |
| PATCH | `/api/auth/profile` | JWT — actualiza nombre/avatar |
| GET·POST | `/api/groups` | listar / crear |
| POST | `/api/groups/join` · `/api/groups/invite` | unirse / invitar |
| PATCH | `/api/groups/:groupId` | **solo admin** — nombre/imagen |
| GET | `/api/predictions/matches` | partidos + tu predicción |
| POST | `/api/predictions` | crear/editar (bloqueado si inició) |
| GET | `/api/predictions/leaderboard/:groupId` | tabla del grupo |

## Notas operativas
- Variables en `.env` (DB, JWT, Google, email). Imágenes en **base64** → `express.json({ limit: '30mb' })`.
- Neon (free) se auto-suspende; el primer request tras inactividad puede tardar/fallar mientras despierta.
- Arranque: `node src/app.js` (puerto 3000, CORS abierto). Schema: `npx prisma db push`.

## Relación con el resto
```
worldcup26.ir ──(cron)──▶ backend_polla ◀── REST ── frontend_polla (móvil)
                              │           ◀── REST ── frontend_polla_web (web)
                          PostgreSQL (Neon)
```
