# Planora — Frontend Only

Next.js App Router · React · TypeScript · Tailwind CSS. This archive contains only the frontend. It does **not** include the Express backend or database. Sign-in and workspace data require a compatible API service.

## Run locally

Requirements: Node.js 18.18 or newer.

```bash
npm install
copy .env.local.example .env.local
npm run dev
```

Open http://localhost:3000. On macOS/Linux, use `cp .env.local.example .env.local` instead of `copy`.

## API configuration

Set `NEXT_PUBLIC_API_URL` in `.env.local` to the URL of your running compatible API (the example uses `http://localhost:4000`). Without that API, the frontend can open, but authentication and server-backed project/task data will not work. Do not put secrets in `NEXT_PUBLIC_*` variables.

## Useful scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check
- `npm test` — unit tests (if the local test setup is installed)

## Included product areas

Home dashboard, lists/boards, task management, AI assistant, chat, inbox, people, admin, login and registration. Meeting-related archive removed.
