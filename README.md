# LZTracker

Scaffolded LZTracker app (frontend + backend). 

Important setup:
- Copy .env.example -> .env and fill STRIPE and MAPBOX keys if you want to test payments and map tiles.
- Backend (server):
  cd server
  npm install
  npx prisma generate
  npx prisma migrate dev --name init
  npm run seed
  npm run dev
- Frontend:
  npm install
  npm run dev

Notes:
- This is a demo scaffold: Stripe/Mapbox keys are placeholders. For GitHub Pages ensure vite.config.js base='/lztracker/'.
- Set GitHub repository secrets for STRIPE secret and MAPBOX token if you add CI.
.
