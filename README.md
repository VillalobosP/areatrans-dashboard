# Areatrans Dashboard

Dashboard de gestión de rutas para Areatrans. Muestra KPIs mensuales de viajes, cuotas operativas y desviaciones, leyendo datos desde Google Sheets.

## Requisitos

- Node.js v18+
- Credenciales de cuenta de servicio de Google (`celtic-client-485117-p4-f4378a3f13f0.json`) en la raíz del proyecto
- La cuenta de servicio debe tener acceso de lectura al Google Sheet

## Estructura

```
areatrans-dashboard/
├── server/          ← Backend Express (puerto 3001)
│   ├── index.js
│   └── package.json
├── src/             ← Frontend React (puerto 3000)
│   ├── App.js
│   ├── components/
│   │   ├── KPICard.jsx
│   │   └── GraficoViajes.jsx
│   └── services/
│       └── api.js
├── .env             ← Variables de entorno del frontend
└── celtic-client-485117-p4-f4378a3f13f0.json  ← NO subir a git
```

## Arrancar el proyecto

### 1. Instalar dependencias del backend

```bash
cd server
npm install
```

### 2. Arrancar el backend (terminal 1)

```bash
cd server
npm start
```

El backend estará disponible en `http://localhost:3001`.

### 3. Arrancar el frontend (terminal 2)

```bash
# Desde la raíz del proyecto
npm start
```

El dashboard estará disponible en `http://localhost:3000`.

## Endpoints del backend

| Endpoint | Descripción |
|---|---|
| `GET /api/calendario?mes=2026-04` | Datos del calendario filtrados por mes |
| `GET /api/viajes?mes=2026-04` | Viajes agrupados por fecha |
| `GET /api/resumen?mes=2026-04` | KPIs calculados del mes |
| `GET /api/health` | Estado del servidor |

## Seguridad

- El JSON de credenciales **nunca** se expone al frontend
- Todos los cálculos se hacen en el backend
- El archivo `.env` y las credenciales están en `.gitignore`
