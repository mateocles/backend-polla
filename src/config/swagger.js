// Especificación OpenAPI 3.0 de la API de la Polla Mundialista.
// Servida con swagger-ui-express en /api-docs.

const PORT = process.env.PORT || 3000;

const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Polla Mundialista API',
    version: '1.0.0',
    description:
      'API para gestionar usuarios, grupos, partidos del Mundial 2026 y predicciones/puntos. ' +
      'Las rutas protegidas requieren un token JWT (botón **Authorize**, esquema Bearer).',
  },
  servers: [{ url: `http://localhost:${PORT}`, description: 'Local' }],
  tags: [
    { name: 'Auth', description: 'Registro, login y perfil' },
    { name: 'Groups', description: 'Grupos / ligas privadas' },
    { name: 'Predictions', description: 'Partidos, predicciones y tabla de posiciones' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      AuthCredentials: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', example: 'demo@test.com' },
          password: { type: 'string', example: '123456' },
        },
      },
      RegisterInput: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Juan Pérez' },
          email: { type: 'string', example: 'demo@test.com' },
          password: { type: 'string', example: '123456' },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string' },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true, description: 'Imagen en base64 (data URI)' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          avatarUrl: { type: 'string', description: 'Imagen en base64 (data URI)' },
        },
      },
      Group: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Oficina 2026' },
          imageUrl: { type: 'string', nullable: true, description: 'Imagen en base64' },
          isPublic: { type: 'boolean', description: 'Público (unirse sin código) o privado' },
          inviteCode: { type: 'string', example: 'WORLD-X89J' },
          ownerId: { type: 'string', format: 'uuid' },
          memberCount: { type: 'integer', example: 12 },
          myRank: { type: 'integer', nullable: true, example: 3 },
          myPoints: { type: 'integer', example: 24 },
          isAdmin: { type: 'boolean', description: 'true si el usuario es el creador/admin' },
        },
      },
      PublicGroup: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          imageUrl: { type: 'string', nullable: true },
          isPublic: { type: 'boolean' },
          ownerId: { type: 'string', format: 'uuid' },
          memberCount: { type: 'integer' },
        },
      },
      GoogleAuthInput: {
        type: 'object',
        required: ['idToken'],
        properties: { idToken: { type: 'string', description: 'ID token de Google (cliente)' } },
      },
      CreateGroupInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', example: 'Los Parrilleros' },
          isPublic: { type: 'boolean', default: false },
        },
      },
      JoinGroupInput: {
        type: 'object',
        required: ['inviteCode'],
        properties: { inviteCode: { type: 'string', example: 'GRILL-2026' } },
      },
      InviteInput: {
        type: 'object',
        required: ['groupId', 'email'],
        properties: {
          groupId: { type: 'string', format: 'uuid' },
          email: { type: 'string', example: 'amigo@test.com' },
        },
      },
      UpdateGroupInput: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          imageUrl: { type: 'string', description: 'Imagen en base64 (data URI)' },
        },
      },
      Match: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          homeTeamNameEn: { type: 'string', example: 'Argentina' },
          awayTeamNameEn: { type: 'string', example: 'Brazil' },
          matchDate: { type: 'string', format: 'date-time' },
          status: { type: 'string', enum: ['notstarted', 'finished'] },
          homeScore: { type: 'integer', nullable: true },
          awayScore: { type: 'integer', nullable: true },
          homeScorers: { type: 'array', items: { type: 'string' }, example: ["L. Messi 27'"] },
          awayScorers: { type: 'array', items: { type: 'string' } },
          prediction: { $ref: '#/components/schemas/Prediction' },
        },
      },
      Prediction: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          matchId: { type: 'string' },
          homeScore: { type: 'integer', example: 2 },
          awayScore: { type: 'integer', example: 1 },
          points: { type: 'integer', example: 6 },
        },
      },
      SubmitPredictionInput: {
        type: 'object',
        required: ['matchId', 'homeScore', 'awayScore'],
        properties: {
          matchId: { type: 'string', example: '6' },
          homeScore: { type: 'integer', example: 2 },
          awayScore: { type: 'integer', example: 1 },
        },
      },
      LeaderboardEntry: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          avatarUrl: { type: 'string', nullable: true },
          totalPoints: { type: 'integer', example: 42 },
        },
      },
      UserPredictionsResponse: {
        type: 'object',
        properties: {
          user: { $ref: '#/components/schemas/User' },
          matches: { type: 'array', items: { $ref: '#/components/schemas/Match' } },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  },
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Registrar usuario',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterInput' } } },
        },
        responses: {
          201: { description: 'Usuario creado' },
          400: { description: 'Email ya existe', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Iniciar sesión',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthCredentials' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Credenciales inválidas' },
        },
      },
    },
    '/api/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Login/registro con Google (ID token)',
        description: 'Verifica el ID token de Google; crea la cuenta si no existe y devuelve el JWT.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/GoogleAuthInput' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
          401: { description: 'Token de Google inválido' },
        },
      },
    },
    '/api/auth/profile': {
      patch: {
        tags: ['Auth'],
        summary: 'Actualizar perfil (nombre / avatar)',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateProfileInput' } } },
        },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          401: { description: 'No autenticado' },
        },
      },
    },
    '/api/groups': {
      get: {
        tags: ['Groups'],
        summary: 'Listar mis grupos (con rank, miembros, isAdmin)',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Group' } } } } },
        },
      },
      post: {
        tags: ['Groups'],
        summary: 'Crear grupo (el creador queda como admin)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateGroupInput' } } } },
        responses: { 201: { description: 'Grupo creado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Group' } } } } },
      },
    },
    '/api/groups/public': {
      get: {
        tags: ['Groups'],
        summary: 'Listar grupos públicos a los que no perteneces',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/PublicGroup' } } } } },
        },
      },
    },
    '/api/groups/{groupId}/join': {
      post: {
        tags: ['Groups'],
        summary: 'Unirse a un grupo público (sin código)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Unido' },
          403: { description: 'El grupo no es público' },
          400: { description: 'Ya eres miembro' },
        },
      },
    },
    '/api/groups/join': {
      post: {
        tags: ['Groups'],
        summary: 'Unirse a un grupo por código',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JoinGroupInput' } } } },
        responses: { 200: { description: 'Unido' }, 404: { description: 'Código inválido' } },
      },
    },
    '/api/groups/invite': {
      post: {
        tags: ['Groups'],
        summary: 'Invitar por correo (solo admin)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/InviteInput' } } } },
        responses: { 200: { description: 'Invitación enviada' }, 403: { description: 'Solo el admin puede invitar' } },
      },
    },
    '/api/groups/{groupId}': {
      patch: {
        tags: ['Groups'],
        summary: 'Editar grupo: nombre / imagen (solo admin)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateGroupInput' } } } },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Group' } } } },
          403: { description: 'Solo el admin puede editar' },
        },
      },
    },
    '/api/predictions/matches': {
      get: {
        tags: ['Predictions'],
        summary: 'Partidos con la predicción del usuario',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Match' } } } } } },
      },
    },
    '/api/predictions': {
      post: {
        tags: ['Predictions'],
        summary: 'Crear/actualizar predicción (bloqueada si el partido inició)',
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SubmitPredictionInput' } } } },
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Prediction' } } } },
          400: { description: 'El partido ya inició o terminó' },
        },
      },
    },
    '/api/predictions/leaderboard/{groupId}': {
      get: {
        tags: ['Predictions'],
        summary: 'Tabla de posiciones de un grupo (con avatar)',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'groupId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/LeaderboardEntry' } } } } } },
      },
    },
    '/api/predictions/user/{userId}/group/{groupId}': {
      get: {
        tags: ['Predictions'],
        summary: 'Pronósticos de otro usuario en un grupo compartido',
        description: 'Solo si ambos comparten el grupo; solo partidos ya iniciados/finalizados (anti-trampa).',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'userId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'groupId', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/UserPredictionsResponse' } } } },
          403: { description: 'No compartes el grupo' },
        },
      },
    },
    '/api/cron/sync': {
      get: {
        tags: ['Predictions'],
        summary: 'Sincroniza partidos y reparte puntos (cron)',
        description: 'Trae partidos de la API externa, actualiza marcadores/goleadores y calcula puntos. Protégelo con ?secret=CRON_SECRET si está configurado.',
        responses: { 200: { description: 'OK' }, 401: { description: 'Secret inválido' } },
      },
    },
  },
};

module.exports = swaggerSpec;
