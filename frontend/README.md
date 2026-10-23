# Planora Frontend

This is the Next.js frontend for the NeoStats Collaborative Project Management Platform.

Follow the root `README.md` for the complete Windows setup. The frontend uses `NEXT_PUBLIC_API_URL` from `.env.local` to connect to the Express backend (default `http://localhost:4000`).

From this folder:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000` after the backend and local PostgreSQL database are running.
