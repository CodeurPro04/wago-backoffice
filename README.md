# ZIWAGO Backoffice (React + Tailwind)

## Dossier
`C:\Users\ACER\Desktop\Projects\Wago\ZIWAGO-Backoffice`

## Installation
```bash
npm install
```

## Configuration
Copiez `.env.example` vers `.env` et adaptez l'URL backend:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

## Lancement dev
```bash
npm run dev
```

## Build production
```bash
npm run build
npm run preview
```

## Modules inclus
- Vue globale (KPIs)
- Gestion laveurs + validation/rejet documents
- Gestion clients
- Suivi commandes (statuts, annulations, créneaux)

## Endpoints backend utilisés
- `GET /api/admin/dashboard`
- `GET /api/admin/drivers`
- `PATCH /api/admin/drivers/{driver}/review`
- `GET /api/admin/customers`
- `GET /api/admin/bookings`

## Sécurité (important)
Les routes admin sont actuellement ouvertes au niveau API. 
Ajouter un middleware d'auth admin avant mise en production.
