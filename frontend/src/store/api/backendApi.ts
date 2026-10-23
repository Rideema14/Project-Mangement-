import { createApi } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn } from '@reduxjs/toolkit/query';
import { ApiError } from '@/lib/api/client';
import {
  adminApi,
  aiApi,
  projectsApi,
  tasksApi,
  teamsApi,
  usersApi,
  voiceApi,
} from '@/lib/api/endpoints';
import type {
  AdminAnalytics,
  AdminDashboard,
  AdminUser,
  AiPlan,
  AuditLogEntry,
  LoginEvent,
  OrgRole,
  OrgSettings,
  Project,
  Task,
  Team,
  User,
  UserStatus,
  VoiceParseResult,
} from '@/lib/types';

/**
 * The board is keyed by arbitrary status NAME now (backend `tasks.status` is
 * VARCHAR(60)), so it's a dynamic map rather than the fixed 3-column shape.
 */
export type DynamicBoard = Record<string, Task[]>;

/**
 * RTK Query surface over the (immutable) backend.
 *
 * Rather than reimplement the wire format, each endpoint's `queryFn` calls the
 * existing typed endpoint functions in `lib/api/endpoints.ts`, which already own
 * the success/error envelope, the 401 session interceptor, the 204-on-DELETE
 * case, and the `Authorization: Bearer` header. RTK Query adds the caching,
 * tag-based invalidation, and optimistic-update machinery on top.
 *
 * This is the ONLY place the app talks to the server for projects/tasks/users in
 * the redesigned surface. Everything else (hierarchy, statuses, rich task fields,
 * comments, presence) is client-persisted and never hits this api.
 */

type Thunk<T> = () => Promise<T>;

/** Adapts a throwing endpoint call into RTK Query's { data } | { error } result. */
const passthroughBaseQuery: BaseQueryFn<Thunk<unknown>, unknown, { status: number; message: string }> =
  async (run) => {
    try {
      return { data: await run() };
    } catch (err) {
      if (err instanceof ApiError) return { error: { status: err.status, message: err.message } };
      return { error: { status: 0, message: (err as Error)?.message ?? 'Unknown error' } };
    }
  };

export const backendApi = createApi({
  reducerPath: 'backendApi',
  baseQuery: passthroughBaseQuery,
  tagTypes: [
    'Projects',
    'Board',
    'Users',
    'Teams',
    'AdminUsers',
    'AdminDashboard',
    'AdminAnalytics',
    'AuditLog',
    'LoginHistory',
    'OrgSettings',
  ],
  endpoints: (build) => ({
    // ---- Users ----
    getUsers: build.query<User[], void>({
      query: () => () => usersApi.list(),
      providesTags: ['Users'],
    }),

    // ---- Projects (= Lists) ----
    getProjects: build.query<Project[], void>({
      query: () => () => projectsApi.list(),
      providesTags: ['Projects'],
    }),
    createProject: build.mutation<Project, { name: string }>({
      query: (input) => () => projectsApi.create(input),
      invalidatesTags: ['Projects'],
    }),
    updateProject: build.mutation<Project, { projectId: number; input: Partial<{ name: string; archived: boolean }> }>({
      query: ({ projectId, input }) => () => projectsApi.update(projectId, input),
      invalidatesTags: ['Projects'],
    }),
    deleteProject: build.mutation<void, number>({
      query: (projectId) => () => projectsApi.remove(projectId),
      invalidatesTags: ['Projects'],
    }),

    // ---- Tasks ----
    getBoard: build.query<DynamicBoard, number>({
      query: (projectId) => () => tasksApi.board(projectId),
      providesTags: (_r, _e, projectId) => [{ type: 'Board', id: projectId }],
    }),
    createTask: build.mutation<
      Task,
      { projectId: number; title: string; assigneeId: number | null; dueDate: string | null; status?: string }
    >({
      query: ({ projectId, ...input }) => () => tasksApi.create(projectId, input),
      invalidatesTags: (_r, _e, { projectId }) => [{ type: 'Board', id: projectId }],
    }),
    updateTaskStatus: build.mutation<Task, { projectId: number; taskId: number; status: string }>({
      query: ({ taskId, status }) => () => tasksApi.updateStatus(taskId, status),
      // Optimistically move the card into the destination column (any status name).
      async onQueryStarted({ projectId, taskId, status }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          backendApi.util.updateQueryData('getBoard', projectId, (board) => {
            let moved: Task | undefined;
            for (const col of Object.keys(board)) {
              const idx = board[col].findIndex((t) => t.id === taskId);
              if (idx !== -1) {
                moved = { ...board[col][idx], status: status as Task['status'] };
                board[col].splice(idx, 1);
                break;
              }
            }
            if (moved) (board[status] ??= []).unshift(moved);
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    updateTask: build.mutation<
      Task,
      {
        projectId: number;
        taskId: number;
        input: Partial<{ title: string; assigneeId: number | null; dueDate: string | null }>;
      }
    >({
      query: ({ taskId, input }) => () => tasksApi.update(taskId, input),
      invalidatesTags: (_r, _e, { projectId }) => [{ type: 'Board', id: projectId }],
    }),
    deleteTask: build.mutation<void, { projectId: number; taskId: number }>({
      query: ({ taskId }) => () => tasksApi.remove(taskId),
      async onQueryStarted({ projectId, taskId }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          backendApi.util.updateQueryData('getBoard', projectId, (board) => {
            for (const col of Object.keys(board)) {
              const idx = board[col].findIndex((t) => t.id === taskId);
              if (idx !== -1) {
                board[col].splice(idx, 1);
                break;
              }
            }
          })
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    // ---- Voice (optional server feature) ----
    parseVoice: build.mutation<
      VoiceParseResult,
      { projectId: number; input: { audio: Blob } | { transcript: string } }
    >({
      query: ({ projectId, input }) => () => voiceApi.parse(projectId, input),
    }),

    // ---- AI Workspace Assistant ----
    sendAiCommand: build.mutation<AiPlan, { message: string; context: unknown }>({
      query: (input) => () => aiApi.command(input),
    }),

    // ---- Teams ----
    getTeams: build.query<Team[], void>({
      query: () => () => teamsApi.list(),
      providesTags: ['Teams'],
    }),
    createTeam: build.mutation<Team, { name: string }>({
      query: (input) => () => teamsApi.create(input),
      invalidatesTags: ['Teams'],
    }),
    renameTeam: build.mutation<{ id: number }, { teamId: number; name: string }>({
      query: ({ teamId, name }) => () => teamsApi.rename(teamId, name),
      invalidatesTags: ['Teams'],
    }),
    deleteTeam: build.mutation<void, number>({
      query: (teamId) => () => teamsApi.remove(teamId),
      invalidatesTags: ['Teams'],
    }),
    addTeamMember: build.mutation<{ teamId: number; userId: number }, { teamId: number; userId: number }>({
      query: ({ teamId, userId }) => () => teamsApi.addMember(teamId, userId),
      invalidatesTags: ['Teams'],
    }),
    removeTeamMember: build.mutation<void, { teamId: number; userId: number }>({
      query: ({ teamId, userId }) => () => teamsApi.removeMember(teamId, userId),
      invalidatesTags: ['Teams'],
    }),

    // ---- Admin ----
    getAdminDashboard: build.query<AdminDashboard, void>({
      query: () => () => adminApi.getDashboard(),
      providesTags: ['AdminDashboard'],
    }),
    getAdminAnalytics: build.query<AdminAnalytics, void>({
      query: () => () => adminApi.getAnalytics(),
      providesTags: ['AdminAnalytics'],
    }),
    getAdminUsers: build.query<AdminUser[], void>({
      query: () => () => adminApi.listUsers(),
      providesTags: ['AdminUsers'],
    }),
    changeUserRole: build.mutation<{ userId: number; role: OrgRole }, { userId: number; role: OrgRole }>({
      query: ({ userId, role }) => () => adminApi.changeUserRole(userId, role),
      invalidatesTags: ['AdminUsers', 'AdminDashboard'],
    }),
    setUserStatus: build.mutation<{ userId: number; status: UserStatus }, { userId: number; status: UserStatus }>({
      query: ({ userId, status }) => () => adminApi.setUserStatus(userId, status),
      invalidatesTags: ['AdminUsers'],
    }),
    forceLogoutUser: build.mutation<{ userId: number }, number>({
      query: (userId) => () => adminApi.forceLogout(userId),
    }),
    removeAdminUser: build.mutation<void, number>({
      query: (userId) => () => adminApi.removeUser(userId),
      invalidatesTags: ['AdminUsers', 'AdminDashboard'],
    }),
    getAuditLog: build.query<AuditLogEntry[], void>({
      query: () => () => adminApi.getAuditLog(),
      providesTags: ['AuditLog'],
    }),
    getLoginHistory: build.query<LoginEvent[], void>({
      query: () => () => adminApi.getLoginHistory(),
      providesTags: ['LoginHistory'],
    }),
    getOrgSettings: build.query<OrgSettings, void>({
      query: () => () => adminApi.getSettings(),
      providesTags: ['OrgSettings'],
    }),
    updateOrgSettings: build.mutation<OrgSettings, Partial<{ name: string; settings: Record<string, unknown> }>>({
      query: (input) => () => adminApi.updateSettings(input),
      invalidatesTags: ['OrgSettings'],
    }),
    bulkUpdateTaskStatus: build.mutation<{ updated: number[] }, { taskIds: number[]; status: string }>({
      query: ({ taskIds, status }) => () => adminApi.bulkUpdateTaskStatus(taskIds, status),
      invalidatesTags: ['Board'],
    }),
    bulkDeleteTasks: build.mutation<{ deleted: number[] }, number[]>({
      query: (taskIds) => () => adminApi.bulkDeleteTasks(taskIds),
      invalidatesTags: ['Board'],
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetProjectsQuery,
  useCreateProjectMutation,
  useUpdateProjectMutation,
  useDeleteProjectMutation,
  useGetBoardQuery,
  useCreateTaskMutation,
  useUpdateTaskStatusMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useParseVoiceMutation,
  useSendAiCommandMutation,
  useGetTeamsQuery,
  useCreateTeamMutation,
  useRenameTeamMutation,
  useDeleteTeamMutation,
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
  useGetAdminDashboardQuery,
  useGetAdminAnalyticsQuery,
  useGetAdminUsersQuery,
  useChangeUserRoleMutation,
  useSetUserStatusMutation,
  useForceLogoutUserMutation,
  useRemoveAdminUserMutation,
  useGetAuditLogQuery,
  useGetLoginHistoryQuery,
  useGetOrgSettingsQuery,
  useUpdateOrgSettingsMutation,
  useBulkUpdateTaskStatusMutation,
  useBulkDeleteTasksMutation,
} = backendApi;
