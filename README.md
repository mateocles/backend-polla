# Polla Mundialista API 🏆

Este proyecto es una API (Backend) construida con Node.js y Express para gestionar una "Polla Mundialista" (quiniela/prode). Permite a los usuarios registrarse, crear grupos, invitar amigos y apostar por los resultados de los partidos del Mundial de Fútbol.

## Características Principales 🚀

1. **Autenticación**:
   - Registro e inicio de sesión tradicional (Email/Contraseña) protegido por tokens JWT y bcrypt.
   - Inicio de sesión rápido con **Google OAuth**.

2. **Gestión de Grupos**:
   - Creación de grupos privados.
   - Generación automática de códigos de invitación únicos.
   - Invitación de amigos vía correo electrónico automático (configurado con Nodemailer).

3. **Sistema de Predicciones y Puntos**:
   - Los usuarios pueden apostar el marcador exacto de cualquier partido futuro.
   - **Reglas de Puntuación**:
     - **6 puntos**: Si acierta exactamente el marcador (Ej: predice 2-1 y queda 2-1).
     - **3 puntos**: Si falla el marcador, pero acierta quién gana, quién pierde, o si hay empate (Ej: predice 1-0 y queda 2-0).
     - **0 puntos**: Si el resultado es completamente incorrecto.
   - **Tabla de posiciones (Leaderboard)** por grupo para ver quién tiene más puntos.

4. **Sincronización Automática (Cron Job)**:
   - El sistema se conecta a la API de partidos (`https://worldcup26.ir/get/games`) cada 30 minutos de forma invisible.
   - Actualiza el estado de los partidos ("no iniciado" a "terminado").
   - ¡Reparte y calcula los puntos de todas las predicciones automáticamente cuando un partido finaliza!

## Requisitos Previos 📋

- **Node.js** (Versión recomendada: 20, definida en `.nvmrc`). Usa `nvm use` en tu terminal para fijar la versión.
- **PostgreSQL** (o conexión a una nube como NeonDB).
- Una cuenta de Google Cloud para el Client ID (Si deseas usar login de Google).

## Instalación y Configuración ⚙️

1. **Clonar/Abrir el proyecto** e instalar dependencias:
   ```bash
   npm install
   ```

2. **Configurar Variables de Entorno**:
   Asegúrate de que tu archivo `.env` esté configurado. Ejemplo:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://usuario:clave@host:puerto/basededatos?sslmode=require"
   JWT_SECRET="super-secret-jwt-key"
   GOOGLE_CLIENT_ID="tu-client-id"
   GOOGLE_CLIENT_SECRET="tu-client-secret"
   EMAIL_USER="tu-correo@gmail.com"
   EMAIL_PASS="tu-contraseña-de-aplicación"
   ```

3. **Sincronizar la Base de Datos**:
   Empuja la estructura de las tablas (Prisma Schema) a tu base de datos:
   ```bash
   npx prisma db push
   ```

4. **Iniciar el Servidor**:
   ```bash
   node src/app.js
   ```
   *(El servidor arrancará en http://localhost:3000)*

## Pruebas Rápidas (Postman) 🧪

En la raíz del proyecto encontrarás el archivo `postman_collection.json`. 
1. Ábrelo e impórtalo en tu aplicación de Postman.
2. Contiene todos los endpoints configurados con datos de prueba (`dummy data`).
3. **Importante**: Al hacer el request de "Login", copia el "token" que te devuelve el sistema, y pégalo en la autorización de las demás llamadas para que te permita acceder.

---
*Desarrollado con Express, Prisma y PostgreSQL.*
