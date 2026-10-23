# Planora backend/frontend contract audit

## Changes made

- Frontend API client now parses the Express backend's actual response format. It accepts raw JSON objects such as `{ message, user }`, `{ user }`, `{ projects, pagination }`, and `{ task }`; it no longer assumes every response is wrapped in `{ success, data }`.
- Frontend requests now use `credentials: 'include'` so the browser sends the backend's HTTP-only `token` cookie.
- Auth state now restores from `GET /api/auth/me`, not a JWT in localStorage. Login and logout match the backend cookie-session model.
- Added `POST /api/auth/register` to the backend because the frontend has a signup mode but the original backend did not. New public registrations are regular `TEAM_MEMBER` accounts and passwords are hashed with bcrypt.
- Added `PATCH /api/projects/:id/restore` because the frontend exposes restore for archived projects and the backend previously only supported archiving.
- Adapted project/user/task API response handling to the backend's actual `{ users }`, `{ projects }`, `{ tasks }`, and `{ task }` shapes.
- Task status updates now read the current task version and use the backend's `PATCH /api/tasks/:id` endpoint, which requires optimistic concurrency `version` and enum statuses.
- Frontend signup password validation now matches backend's minimum of 8 characters.

## Backend routes present

- `GET /api/health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, and now `POST /api/auth/register`
- `/api/users` (admin-only)
- `/api/projects` plus project details, membership, manager, archive, and now restore routes
- `/api/projects/:id/tasks`
- `/api/tasks/:id` and task comments

## Important remaining mismatch

The frontend source also contains integrations for `/api/teams`, `/api/admin`, `/api/ai`, and voice parsing endpoints, but those route groups are **not mounted or implemented in the supplied backend**. Those screens/API calls can still return 404 until the missing backend capabilities are implemented or the frontend features are disabled/reworked. This archive does not claim those unrelated modules are fully integrated.

## Local verification

The backend/frontend contract was reviewed against source. Automated TypeScript/build verification could not complete in this environment because `npm ci` timed out and left incomplete type packages; run `npm install` (or `npm ci`) locally, then `npm run typecheck` and `npm run build` in `frontend`, and `npm run dev` in `backend` to verify against your local environment.
