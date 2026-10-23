# Planora — Full-Stack Project Management App

This project contains both the Next.js frontend and the Node.js/Express backend.

## Requirements
- Node.js (LTS) and npm
- A PostgreSQL database URL compatible with the Prisma schema

## 1. Configure the backend
Open a terminal in `backend` and install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and set the database URL and authentication secrets required by the backend. Then run the Prisma migration/generation commands described in `backend/package.json` and `backend/README.md` if present. Start the API using the backend scripts.

## 2. Configure the frontend
Open another terminal in `frontend`:

```bash
npm install
copy .env.local.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_API_URL` in `frontend/.env.local` to the backend API URL (the provided example uses `http://localhost:4000`). Open `http://localhost:3000`.

## Notes
- The frontend and backend are included in this ZIP.
- Login, projects, tasks, and other server-backed features require a correctly configured and running database/API.
- Review the backend environment example before starting; never commit real secrets.
