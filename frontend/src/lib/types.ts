/**
 * These types mirror the backend's response shapes exactly. They are
 * transcribed from the service-layer shaping functions, not guessed:
 *
 *   User    <- auth.service.shapeUser / users.repository.findAll
 *   Project <- projects.service.shapeProject
 *   Task    <- tasks.service.shapeTask
 *   Board   <- tasks.service.getBoard
 *
 * If the backend changes shape, this file is the single place to update.
 */

/** The three fixed columns. Backed by the `task_status` Postgres enum. */
export const STATUSES = ['To Do', 'In Progress', 'Done'] as const;
export type Status = (typeof STATUSES)[number];

/** GET /api/users — also the shape of `task.assignee`. */
export interface User {
  id: number;
  name: string;
  email: string;
}

/** The authenticated user, as returned inside the login/register payload. */
export type AuthUser = User;

export interface Project {
  id: number;
  name: string;
  archived: boolean;
  createdAt: string;
  /**
   * NOTE: `GET /api/projects` returns `{ id, name }` here, but the 201 body of
   * `POST /api/projects` returns only `{ id }` — the backend doesn't have the
   * creator's name on hand at insert time. Hence `name` is optional, and the
   * projects page refetches the list after a create rather than trusting the
   * create response to be list-shaped.
   */
  createdBy: { id: number; name?: string };
}

export interface Task {
  id: number;
  projectId: number;
  title: string;
  status: Status;
  /** 'YYYY-MM-DD' or null. The backend pins DATE to a plain string (config/db.js). */
  dueDate: string | null;
  /** Computed server-side: due in the past AND not Done. Never recompute this client-side. */
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
  assignee: User | null;
  /** Null for tasks created before this field existed. */
  createdBy: User | null;
}

/** GET /api/projects/:projectId/tasks — tasks arrive pre-grouped into columns. */
export type Board = Record<Status, Task[]>;

/** POST /api/projects/:projectId/tasks/voice/parse */
export interface VoiceParseResult {
  projectId: number;
  transcript: string;
  parsed: {
    title: string;
    dueDate: string | null;
    assignee: User | null;
    /** The name the model *heard*, which may not resolve to a real member. */
    assigneeNameHeard: string | null;
  };
  warnings: string[];
}

export interface AuthPayload {
  user: AuthUser;
  token: string;
}

// ---------- AI Workspace Assistant ----------

/** A filter the AI produces to target one or many tasks for a bulk action. */
export interface AiFilter {
  project?: string;
  assignee?: string;
  status?: string;
  priority?: string;
  overdue?: boolean;
  dueThisWeek?: boolean;
  dueToday?: boolean;
  text?: string;
}

/** One structured action in an AI plan. Kept loose (extra fields per type). */
export interface AiAction {
  type: string;
  project?: string;
  name?: string;
  title?: string;
  task?: string;
  assignee?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  color?: string;
  group?: string;
  filter?: AiFilter;
}

/** The plan returned by POST /api/ai/command. */
export interface AiPlan {
  reply: string;
  actions: AiAction[];
  needsConfirmation: boolean;
  confirmationPrompt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin (/api/admin, /api/teams) — server-backed, real org/role model.
// ─────────────────────────────────────────────────────────────────────────────

export const ORG_ROLES = ['owner', 'admin', 'manager', 'member', 'guest', 'bot'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export type UserStatus = 'active' | 'suspended';

/** GET /api/admin/users — one row per org member. */
export interface AdminUser {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  role: OrgRole;
}

/** GET /api/teams */
export interface Team {
  id: number;
  name: string;
  createdAt: string;
  members: User[];
}

/** GET /api/admin/audit-log, and the dashboard's recentAudit slice. */
export interface AuditLogEntry {
  id: number;
  action: string;
  targetType: string | null;
  targetId: string | null;
  actor: { id: number; name: string } | null;
  at: string;
}

/** GET /api/admin/login-history */
export interface LoginEvent {
  id: number;
  ip: string | null;
  userAgent: string | null;
  at: string;
  user: { id: number; name: string };
}

/** GET /api/admin/dashboard */
export interface AdminDashboard {
  counts: { members: number; projects: number; tasks: number };
  taskStats: { completed: number; overdue: number; total: number };
  roleBreakdown: { role: OrgRole; count: number }[];
  recentAudit: AuditLogEntry[];
}

/** GET /api/admin/analytics */
export interface AdminAnalytics {
  completed: number;
  overdue: number;
  total: number;
  completionRate: number;
  statusBreakdown: { status: string; count: number }[];
}

/** GET/PATCH /api/admin/settings */
export interface OrgSettings {
  id: number;
  name: string;
  settings: Record<string, unknown>;
}
