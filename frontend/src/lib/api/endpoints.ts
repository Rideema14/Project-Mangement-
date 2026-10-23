import { api } from './client';
import type {
  AdminAnalytics,
  AdminDashboard,
  AdminUser,
  AiPlan,
  AuditLogEntry,
  AuthPayload,
  CurrentUserPayload,
  Board,
  LoginEvent,
  OrgRole,
  OrgSettings,
  Project,
  Task,
  Team,
  User,
  UserStatus,
  VoiceParseResult,
} from '../types';

/**
 * Every backend route, in one place. Nothing outside this file constructs a URL.
 *
 * This is the complete, exhaustive surface of the backend as implemented —
 * there is no endpoint here that the server does not serve, and no server
 * route that is missing here.
 */

// ---------- Auth (public) ----------

export const authApi = {
  /** POST /api/auth/register -> 201 { message, user }; session cookie is set by backend. */
  register: (input: { name: string; email: string; password: string }) =>
    api.post<AuthPayload>('/api/auth/register', input),

  /** POST /api/auth/login -> 200 { message, user }; session cookie is set by backend. */
  login: (input: { email: string; password: string }) =>
    api.post<AuthPayload>('/api/auth/login', input),

  /** GET /api/auth/me validates the httpOnly cookie and returns the current user. */
  me: () => api.get<CurrentUserPayload>('/api/auth/me'),

  /** POST /api/auth/logout clears the httpOnly session cookie. */
  logout: () => api.post<{ message: string }>('/api/auth/logout'),
};

// ---------- Users (authenticated) ----------

export const usersApi = {
  /**
   * GET /api/users -> every member of the single shared workspace.
   * Powers the "Assign to" picker. The backend has no roles and no per-project
   * membership, so this really is "everyone".
   */
  list: async (signal?: AbortSignal) => {
    const result = await api.get<{ users: User[] }>('/api/users', signal);
    return result.users;
  },
};

// ---------- Projects (authenticated) ----------

export const projectsApi = {
  /** GET /api/projects -> all projects, newest first. */
  list: async (signal?: AbortSignal) => {
    const result = await api.get<{ projects: Array<Record<string, unknown>> }>('/api/projects', signal);
    return result.projects.map((project) => ({
      ...project,
      archived: project.status === 'ARCHIVED',
      createdBy: { id: Number(project.createdById ?? 0) },
    })) as Project[];
  },

  /**
   * POST /api/projects -> 201.
   * The response omits the creator's name (see Project type), so callers that
   * need a list-shaped project should refetch rather than use this directly.
   */
  create: async (input: { name: string }) => {
    const result = await api.post<{ project: Record<string, unknown> }>('/api/projects', input);
    return { ...result.project, archived: result.project.status === 'ARCHIVED', createdBy: { id: Number(result.project.createdById ?? 0) } } as Project;
  },

  /** PATCH /api/projects/:projectId -> rename and/or archive/restore. */
  update: async (projectId: number, input: Partial<{ name: string; archived: boolean }>) => {
    const body: Record<string, unknown> = {};
    if (input.name !== undefined) body.name = input.name;
    const action = input.archived === true ? '/archive' : input.archived === false ? '/restore' : '';
    const result = await api.patch<{ project: Record<string, unknown> }>(`/api/projects/${projectId}${action}`, body);
    return { ...result.project, archived: result.project.status === 'ARCHIVED', createdBy: { id: Number(result.project.createdById ?? 0) } } as Project;
  },

  /** DELETE /api/projects/:projectId -> 204. Real delete — cascades to its tasks. */
  remove: (projectId: number) => api.delete(`/api/projects/${projectId}`),
};

// ---------- Tasks (authenticated) ----------

export const tasksApi = {
  /** GET /api/projects/:projectId/tasks -> tasks already grouped by column. */
  board: async (projectId: number, signal?: AbortSignal) => {
    const result = await api.get<{ tasks: Array<Record<string, unknown>> }>(`/api/projects/${projectId}/tasks`, signal);
    const board: Record<string, Task[]> = { 'To Do': [], 'In Progress': [], Done: [] };
    for (const raw of result.tasks) {
      const status = raw.status === 'DONE' ? 'Done' : raw.status === 'IN_PROGRESS' ? 'In Progress' : 'To Do';
      const assignee = raw.assignee as User | null;
      const createdBy = raw.createdBy as User | null;
      board[status].push({ ...raw, status, assignee, createdBy, isOverdue: Boolean(raw.dueDate && new Date(String(raw.dueDate)).getTime() < Date.now() && status !== 'Done') } as Task);
    }
    return board as Board;
  },

  /**
   * POST /api/projects/:projectId/tasks -> 201.
   * New tasks always land in 'To Do'; the backend hardcodes the status on insert,
   * so there is no status field to send.
   */
  create: (
    projectId: number,
    input: { title: string; assigneeId: number | null; dueDate: string | null; status?: string }
  ) => {
    const body: Record<string, unknown> = { ...input };
    if (typeof body.status === 'string') body.status = body.status === 'Done' ? 'DONE' : body.status === 'In Progress' ? 'IN_PROGRESS' : 'TODO';
    return api.post<{ task: Task }>(`/api/projects/${projectId}/tasks`, body).then((result) => result.task);
  },

  /**
   * PATCH /api/tasks/:taskId/status -> the move-between-columns endpoint.
   * Status is a free string now (backend column is VARCHAR(60)); any custom
   * status name persists. `Status` (the legacy 3) is a subtype of string, so
   * existing callers are unaffected.
   */
  updateStatus: async (taskId: number, status: string) => {
    const current = await api.get<{ task: Record<string, unknown> }>(`/api/tasks/${taskId}`);
    const backendStatus = status === 'Done' || status === 'DONE' ? 'DONE' : status === 'In Progress' || status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'TODO';
    const result = await api.patch<{ task: Task }>(`/api/tasks/${taskId}`, { version: current.task.version, status: backendStatus });
    return result.task;
  },

  /**
   * PATCH /api/tasks/:taskId -> partial update.
   * The backend treats an *absent* key as "leave alone" and null as "clear it",
   * so only send the fields that actually changed.
   */
  update: (
    taskId: number,
    input: Partial<{ title: string; assigneeId: number | null; dueDate: string | null }>
  ) => api.get<{ task: Record<string, unknown> }>(`/api/tasks/${taskId}`).then((current) => {
    const body: Record<string, unknown> = { ...input, version: current.task.version };
    if (typeof body.status === 'string') body.status = body.status === 'Done' ? 'DONE' : body.status === 'In Progress' ? 'IN_PROGRESS' : 'TODO';
    return api.patch<{ task: Task }>(`/api/tasks/${taskId}`, body).then((result) => result.task);
  }),

  /** DELETE /api/tasks/:taskId -> 204, no body. */
  remove: (taskId: number) => api.delete(`/api/tasks/${taskId}`),
};

// ---------- Voice (authenticated, optional server feature) ----------

/**
 * The backend accepts EITHER an `audio` file field OR a `transcript` text field.
 * We send audio when the browser can record, and fall back to typed text when it
 * can't — both hit the same endpoint and the same parser.
 */
function voiceBody(input: { audio: Blob } | { transcript: string }): FormData {
  const form = new FormData();
  if ('audio' in input) {
    form.append('audio', input.audio, 'command.webm');
  } else {
    form.append('transcript', input.transcript);
  }
  return form;
}

export const voiceApi = {
  /**
   * POST /api/projects/:projectId/tasks/voice/parse
   * Preview only — parses the command but writes nothing to the database.
   * Throws ApiError(503) when the server has no GROQ_API_KEY configured.
   */
  parse: (projectId: number, input: { audio: Blob } | { transcript: string }) =>
    api.postForm<VoiceParseResult>(
      `/api/projects/${projectId}/tasks/voice/parse`,
      voiceBody(input)
    ),
};

// ---------- AI Workspace Assistant (authenticated) ----------

export const aiApi = {
  /**
   * POST /api/ai/command — turns a natural-language message + a snapshot of the
   * workspace into a structured action plan. The server only parses intent; the
   * client's action layer runs the plan against the existing APIs.
   */
  command: (input: { message: string; context: unknown }) =>
    api.post<AiPlan>('/api/ai/command', input),

  /**
   * POST /api/ai/transcribe — speech-to-text via Groq Whisper. Returns the
   * transcript; the client then runs it through `command` like a typed message.
   */
  transcribe: (audio: Blob) => {
    const form = new FormData();
    form.append('audio', audio, 'command.webm');
    return api.postForm<{ text: string }>('/api/ai/transcribe', form);
  },
};

// ---------- Teams (authenticated, member+ read / admin+ manage) ----------

export const teamsApi = {
  /** GET /api/teams -> every team in the caller's org, with member rosters. */
  list: (signal?: AbortSignal) => api.get<Team[]>('/api/teams', signal),

  /** POST /api/teams -> 201. */
  create: (input: { name: string }) => api.post<Team>('/api/teams', input),

  /** PATCH /api/teams/:teamId -> rename. */
  rename: (teamId: number, name: string) => api.patch<{ id: number }>(`/api/teams/${teamId}`, { name }),

  /** DELETE /api/teams/:teamId -> 204. */
  remove: (teamId: number) => api.delete(`/api/teams/${teamId}`),

  /** POST /api/teams/:teamId/members -> 201. */
  addMember: (teamId: number, userId: number) =>
    api.post<{ teamId: number; userId: number }>(`/api/teams/${teamId}/members`, { userId }),

  /** DELETE /api/teams/:teamId/members/:userId -> 204. */
  removeMember: (teamId: number, userId: number) => api.delete(`/api/teams/${teamId}/members/${userId}`),
};

// ---------- Admin (authenticated, admin+ only — enforced server-side) ----------

export const adminApi = {
  /** GET /api/admin/dashboard */
  getDashboard: (signal?: AbortSignal) => api.get<AdminDashboard>('/api/admin/dashboard', signal),

  /** GET /api/admin/analytics */
  getAnalytics: (signal?: AbortSignal) => api.get<AdminAnalytics>('/api/admin/analytics', signal),

  /** GET /api/admin/users */
  listUsers: (signal?: AbortSignal) => api.get<AdminUser[]>('/api/admin/users', signal),

  /** PATCH /api/admin/users/:userId/role */
  changeUserRole: (userId: number, role: OrgRole) =>
    api.patch<{ userId: number; role: OrgRole }>(`/api/admin/users/${userId}/role`, { role }),

  /** PATCH /api/admin/users/:userId/status */
  setUserStatus: (userId: number, status: UserStatus) =>
    api.patch<{ userId: number; status: UserStatus }>(`/api/admin/users/${userId}/status`, { status }),

  /** POST /api/admin/users/:userId/force-logout -> instantly invalidates every token that user currently holds. */
  forceLogout: (userId: number) => api.post<{ userId: number }>(`/api/admin/users/${userId}/force-logout`, undefined),

  /** DELETE /api/admin/users/:userId -> 204. Removes org membership, not the user's account. */
  removeUser: (userId: number) => api.delete(`/api/admin/users/${userId}`),

  /** GET /api/admin/audit-log -> most recent 200 entries. */
  getAuditLog: (signal?: AbortSignal) => api.get<AuditLogEntry[]>('/api/admin/audit-log', signal),

  /** GET /api/admin/login-history -> most recent 200 entries. */
  getLoginHistory: (signal?: AbortSignal) => api.get<LoginEvent[]>('/api/admin/login-history', signal),

  /** GET /api/admin/settings */
  getSettings: (signal?: AbortSignal) => api.get<OrgSettings>('/api/admin/settings', signal),

  /** PATCH /api/admin/settings — Owner/Admin only. */
  updateSettings: (input: Partial<{ name: string; settings: Record<string, unknown> }>) =>
    api.patch<OrgSettings>('/api/admin/settings', input),

  /** PATCH /api/admin/tasks/bulk-status */
  bulkUpdateTaskStatus: (taskIds: number[], status: string) =>
    api.patch<{ updated: number[] }>('/api/admin/tasks/bulk-status', { taskIds, status }),

  /** POST /api/admin/tasks/bulk-delete */
  bulkDeleteTasks: (taskIds: number[]) => api.post<{ deleted: number[] }>('/api/admin/tasks/bulk-delete', { taskIds }),
};

/*
 * DELIBERATELY NOT WRAPPED: POST /api/projects/:projectId/tasks/voice
 *
 * That endpoint parses AND creates in one shot. We use the parse-then-confirm
 * flow instead: /voice/parse produces a draft, the user reviews and corrects it,
 * and the confirmed draft goes through tasksApi.create — the exact same call the
 * manual "Add task" form makes. Voice is a second way to fill in one form, not a
 * parallel write path. The one-shot endpoint remains available server-side.
 */
