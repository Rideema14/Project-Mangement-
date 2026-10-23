"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Role = "ADMIN" | "PROJECT_MANAGER" | "TEAM_MEMBER" | "VIEWER";
type User = { id: number; name: string; email: string; role: Role; isActive?: boolean };
type Task = { id: number; title: string; description?: string | null; status: "TODO" | "IN_PROGRESS" | "DONE"; priority: "LOW" | "MEDIUM" | "HIGH"; dueDate?: string | null; version: number; assigneeId?: number | null; assignee?: { id: number; name: string } | null; createdBy?: { id: number; name: string } };
type Member = { id: number; role: "MANAGER" | "MEMBER" | "VIEWER"; user: User };
type Project = { id: number; name: string; description?: string | null; status: "ACTIVE" | "ARCHIVED"; createdAt: string; _count?: { tasks: number; members: number }; members?: Member[]; tasks?: Task[] };
type Comment = { id: number; content: string; createdAt: string; author: { id: number; name: string } };

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Request failed (${response.status})`);
  return data as T;
}
const roleLabel = (role: string) => ({ ADMIN: "Admin", PROJECT_MANAGER: "Project Manager", TEAM_MEMBER: "Team Member", VIEWER: "Viewer", MANAGER: "Manager", MEMBER: "Member" }[role] || role);
const initials = (name = "U") => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("admin@neostats.com");
  const [password, setPassword] = useState("Password@123");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("Overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [assignManagerId, setAssignManagerId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState<Task["priority"]>("MEDIUM");
  const [taskAssignee, setTaskAssignee] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskEditing, setTaskEditing] = useState<Task | null>(null);
  const [taskEditTitle, setTaskEditTitle] = useState("");
  const [taskEditDescription, setTaskEditDescription] = useState("");
  const [taskEditPriority, setTaskEditPriority] = useState<Task["priority"]>("MEDIUM");
  const [taskEditStatus, setTaskEditStatus] = useState<Task["status"]>("TODO");
  const [taskEditAssignee, setTaskEditAssignee] = useState("");
  const [taskEditDue, setTaskEditDue] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectStatusFilter, setProjectStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ALL");
  const [addMemberId, setAddMemberId] = useState("");
  const [addMemberRole, setAddMemberRole] = useState<"MEMBER" | "VIEWER">("MEMBER");
  const [availableMembers, setAvailableMembers] = useState<User[]>([]);
  const [commentsTask, setCommentsTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("Password@123");
  const [newUserRole, setNewUserRole] = useState<Role>("TEAM_MEMBER");
  const [showUserForm, setShowUserForm] = useState(false);

  const flash = (message: string) => { setNotice(message); setError(""); window.setTimeout(() => setNotice(""), 3500); };
  const fail = (err: unknown) => { setError(err instanceof Error ? err.message : "Something went wrong"); setNotice(""); };

  const refresh = useCallback(async () => {
    try {
      const me = await request<{ user: User }>("/auth/me");
      setUser(me.user);
      const result = await request<{ projects: Project[] }>("/projects");
      const detailedProjects = await Promise.all(result.projects.map(async (project) => {
        try { return (await request<{ project: Project }>(`/projects/${project.id}`)).project; }
        catch { return project; }
      }));
      setProjects(detailedProjects);
      if (selectedId && detailedProjects.some((p) => p.id === selectedId)) {
        setSelectedProject(detailedProjects.find((p) => p.id === selectedId) || null);
      }
      if (me.user.role === "ADMIN") {
        const userResult = await request<{ users: User[] }>("/users");
        setUsers(userResult.users);
      }
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseProject = async (id: number) => {
    try { const result = await request<{ project: Project }>(`/projects/${id}`); setSelectedProject(result.project); setSelectedId(id); setPage("Projects"); setShowProjectForm(false); setShowTaskForm(false); setError(""); }
    catch (err) { fail(err); }
  };
  const loadUsers = async () => { try { const result = await request<{ users: User[] }>("/users"); setUsers(result.users); } catch (err) { fail(err); } };
  const loadAvailableMembers = async (id: number) => { try { const result = await request<{ users: User[] }>(`/projects/${id}/available-members`); setAvailableMembers(result.users); } catch { setAvailableMembers([]); } };
  const currentProjectRole = selectedProject?.members?.find((m) => m.user.id === user?.id)?.role;
  const canManageProject = user?.role === "ADMIN" || (user?.role === "PROJECT_MANAGER" && currentProjectRole === "MANAGER");
  const stats = useMemo(() => {
    const tasks = projects.reduce((all, p) => all + (p._count?.tasks || p.tasks?.length || 0), 0);
    const done = projects.reduce((all, p) => all + (p.tasks || []).filter((t) => t.status === "DONE").length, 0);
    return { projects: projects.filter((p) => p.status !== "ARCHIVED").length, tasks, done, progress: tasks ? Math.round((done / tasks) * 100) : 0 };
  }, [projects]);

  const login = async (e: FormEvent) => {
    e.preventDefault(); setLoginBusy(true); setError("");
    try { const result = await request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); setUser(result.user); flash(`Welcome back, ${result.user.name}`); await refresh(); }
    catch (err) { fail(err); }
    finally { setLoginBusy(false); }
  };
  const logout = async () => { try { await request("/auth/logout", { method: "POST", body: JSON.stringify({}) }); } catch { /* local logout still proceeds */ } setUser(null); setSelectedId(null); setSelectedProject(null); setPage("Overview"); };

  const createProject = async (e: FormEvent) => {
    e.preventDefault();
    try { const result = await request<{ project: Project }>("/projects", { method: "POST", body: JSON.stringify({ name: projectName, description: projectDescription }) }); setProjectName(""); setProjectDescription(""); setShowProjectForm(false); await refresh(); await chooseProject(result.project.id); flash("Project created successfully"); }
    catch (err) { fail(err); }
  };
  const updateProject = async (e: FormEvent) => {
    e.preventDefault(); if (!selectedProject) return;
    try { await request(`/projects/${selectedProject.id}`, { method: "PATCH", body: JSON.stringify({ name: projectName, description: projectDescription }) }); setEditingProject(false); setProjectName(""); setProjectDescription(""); await chooseProject(selectedProject.id); await refresh(); flash("Project details updated"); }
    catch (err) { fail(err); }
  };
  const assignManager = async (e: FormEvent) => {
    e.preventDefault(); if (!selectedProject || !assignManagerId) return;
    try { await request(`/projects/${selectedProject.id}/manager`, { method: "PATCH", body: JSON.stringify({ userId: Number(assignManagerId) }) }); setAssignManagerId(""); await chooseProject(selectedProject.id); await refresh(); flash("Project manager assigned"); }
    catch (err) { fail(err); }
  };
  const createTask = async (e: FormEvent) => {
    e.preventDefault(); if (!selectedProject) return;
    try { await request(`/projects/${selectedProject.id}/tasks`, { method: "POST", body: JSON.stringify({ title: taskTitle, description: taskDescription, priority: taskPriority, dueDate: taskDue || null, assigneeId: taskAssignee ? Number(taskAssignee) : null }) }); setTaskTitle(""); setTaskDescription(""); setTaskPriority("MEDIUM"); setTaskAssignee(""); setTaskDue(""); setShowTaskForm(false); await chooseProject(selectedProject.id); await refresh(); flash("Task created successfully"); }
    catch (err) { fail(err); }
  };
  const startTaskEdit = (task: Task) => {
    setTaskEditing(task);
    setTaskEditTitle(task.title);
    setTaskEditDescription(task.description || "");
    setTaskEditPriority(task.priority);
    setTaskEditStatus(task.status);
    setTaskEditAssignee(task.assigneeId ? String(task.assigneeId) : "");
    setTaskEditDue(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : "");
  };
  const saveTaskEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!taskEditing || !selectedProject) return;
    try {
      await request(`/tasks/${taskEditing.id}`, { method: "PATCH", body: JSON.stringify({
        version: taskEditing.version, title: taskEditTitle, description: taskEditDescription,
        priority: taskEditPriority, status: taskEditStatus, dueDate: taskEditDue || null,
        assigneeId: taskEditAssignee ? Number(taskEditAssignee) : null,
      }) });
      setTaskEditing(null);
      await chooseProject(selectedProject.id);
      await refresh();
      flash("Task updated successfully");
    } catch (err) {
      fail(err);
      if (err instanceof Error && err.message.toLowerCase().includes("changed by someone else")) {
        setTaskEditing(null);
        flash("This task changed in another session. The latest version has been loaded; reopen edit to try again.");
        if (selectedProject) await chooseProject(selectedProject.id);
      }
    }
  };
  const updateMemberRole = async (member: Member, role: "MEMBER" | "VIEWER") => {
    if (!selectedProject) return;
    try {
      await request(`/projects/${selectedProject.id}/members/${member.user.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await chooseProject(selectedProject.id);
      flash("Project access updated");
    } catch (err) { fail(err); }
  };
  const deleteComment = async (comment: Comment) => {
    if (!commentsTask || !confirm("Delete this comment?")) return;
    try {
      await request(`/tasks/${commentsTask.id}/comments/${comment.id}`, { method: "DELETE" });
      const result = await request<{ comments: Comment[] }>(`/tasks/${commentsTask.id}/comments`);
      setComments(result.comments);
      flash("Comment deleted");
    } catch (err) { fail(err); }
  };

  const updateTaskStatus = async (task: Task, status: Task["status"]) => {
    try { await request(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ version: task.version, status }) }); if (selectedId) await chooseProject(selectedId); await refresh(); flash("Task status updated"); }
    catch (err) { fail(err); if (selectedId) await chooseProject(selectedId); }
  };
  const deleteTask = async (task: Task) => { if (!confirm(`Delete task “${task.title}”?`)) return; try { await request(`/tasks/${task.id}`, { method: "DELETE" }); if (selectedId) await chooseProject(selectedId); await refresh(); flash("Task deleted"); } catch (err) { fail(err); } };
  const archiveProject = async (project: Project) => { if (!confirm(`Archive “${project.name}”?`)) return; try { await request(`/projects/${project.id}/archive`, { method: "PATCH", body: JSON.stringify({}) }); setSelectedProject(null); setSelectedId(null); await refresh(); flash("Project archived"); } catch (err) { fail(err); } };
  const deleteProject = async (project: Project) => { if (!confirm(`Permanently delete “${project.name}” and its tasks?`)) return; try { await request(`/projects/${project.id}`, { method: "DELETE" }); setSelectedProject(null); setSelectedId(null); await refresh(); flash("Project deleted"); } catch (err) { fail(err); } };
  const addMember = async (e: FormEvent) => { e.preventDefault(); if (!selectedProject || !addMemberId) return; try { await request(`/projects/${selectedProject.id}/members`, { method: "POST", body: JSON.stringify({ userId: Number(addMemberId), role: addMemberRole }) }); setAddMemberId(""); await chooseProject(selectedProject.id); await loadAvailableMembers(selectedProject.id); flash("Team member added"); } catch (err) { fail(err); } };
  const removeMember = async (member: Member) => { if (!selectedProject || !confirm(`Remove ${member.user.name} from this project?`)) return; try { await request(`/projects/${selectedProject.id}/members/${member.user.id}`, { method: "DELETE" }); await chooseProject(selectedProject.id); await loadAvailableMembers(selectedProject.id); flash("Member removed"); } catch (err) { fail(err); } };
  const openComments = async (task: Task) => { setCommentsTask(task); setCommentText(""); try { const result = await request<{ comments: Comment[] }>(`/tasks/${task.id}/comments`); setComments(result.comments); } catch (err) { fail(err); } };
  const addComment = async (e: FormEvent) => { e.preventDefault(); if (!commentsTask) return; try { await request(`/tasks/${commentsTask.id}/comments`, { method: "POST", body: JSON.stringify({ content: commentText }) }); setCommentText(""); const result = await request<{ comments: Comment[] }>(`/tasks/${commentsTask.id}/comments`); setComments(result.comments); flash("Comment added"); } catch (err) { fail(err); } };
  const createUser = async (e: FormEvent) => { e.preventDefault(); try { await request("/users", { method: "POST", body: JSON.stringify({ name: newUserName, email: newUserEmail, password: newUserPassword, role: newUserRole }) }); setShowUserForm(false); setNewUserName(""); setNewUserEmail(""); await loadUsers(); flash("User created successfully"); } catch (err) { fail(err); } };
  const updateUser = async (target: User, patch: Partial<User>) => { try { await request(`/users/${target.id}`, { method: "PATCH", body: JSON.stringify(patch) }); await loadUsers(); flash("User updated"); } catch (err) { fail(err); } };

  if (loading) return <main className="loading-screen"><div className="brand-mark">P</div><p>Preparing your workspace…</p></main>;
  if (!user) return <main className="login-page"><section className="login-art"><div className="brand"><span className="brand-mark">P</span><span>planora</span></div><div className="hero-copy"><span className="eyebrow">WORK BETTER, TOGETHER</span><h1>Bring your team’s<br /><em>best work</em> into focus.</h1><p>One clear space to plan projects, move tasks forward, and keep everyone aligned.</p><div className="hero-stats"><div><strong>01</strong><span>Plan clearly</span></div><div><strong>02</strong><span>Work together</span></div><div><strong>03</strong><span>Deliver better</span></div></div></div><div className="art-note">A calmer way to get things done <span>✳</span></div></section><section className="login-side"><form className="login-card" onSubmit={login}><div className="mobile-brand"><span className="brand-mark">P</span> planora</div><span className="eyebrow">YOUR WORKSPACE AWAITS</span><h2>Welcome back</h2><p className="muted">Sign in to continue to your workspace.</p>{error && <div className="alert error">{error}</div>}<label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></label><button className="primary full" disabled={loginBusy}>{loginBusy ? "Signing in…" : "Sign in to Planora →"}</button><div className="demo-box"><strong>Quick demo account</strong><span>admin@neostats.com</span><span>Password@123</span><button type="button" className="text-button" onClick={() => { setEmail("admin@neostats.com"); setPassword("Password@123"); }}>Use demo credentials</button></div><p className="login-foot">Secure access · Role-based workspace</p></form></section></main>;

  const nav = [{ label: "WORKSPACE", items: [{ name: "Overview", icon: "◫" }, { name: "Projects", icon: "▦" }, { name: "My tasks", icon: "☑" }] }, { label: "MANAGE", items: [{ name: "Team", icon: "♧" }, { name: "Profile", icon: "◎" }, ...(user.role === "ADMIN" ? [{ name: "User management", icon: "♙" }] : [])] }];
  const tasks = selectedProject?.tasks || [];
  const projectManagers = selectedProject?.members?.filter((m) => m.role === "MANAGER") || [];
  const visibleTasks = page === "My tasks" ? projects.flatMap((p) => (p.tasks || []).filter((t) => t.assigneeId === user.id).map((t) => ({ ...t, projectName: p.name }))) : [];

  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">P</span><span>planora</span><span className="workspace-tag">WORKSPACE</span></div><div className="workspace-switch"><div className="workspace-icon">N</div><div><strong>NeoStats Studio</strong><small>Free workspace</small></div><span className="chevron">⌄</span></div>{nav.map((group) => <div className="nav-group" key={group.label}><div className="nav-label">{group.label}</div>{group.items.map((item) => <button key={item.name} className={`nav-item ${page === item.name ? "active" : ""}`} onClick={() => { setPage(item.name); setSelectedProject(null); setSelectedId(null); setError(""); if (item.name === "User management") void loadUsers(); }}><span className="nav-icon">{item.icon}</span>{item.name}{item.name === "Projects" && <span className="nav-count">{projects.length}</span>}</button>)}</div>)}<div className="sidebar-bottom"><div className="help-card"><div className="help-icon">✦</div><strong>Need a hand?</strong><p>Keep your projects moving with a little help.</p><button onClick={() => alert("Tip: create a project, add your team, then create and assign tasks.")}>Quick tips <span>↗</span></button></div><div className="profile-row"><div className="avatar">{initials(user.name)}</div><div className="profile-meta"><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div><button className="icon-button" aria-label="Log out" title="Log out" onClick={logout}>↪</button></div></div></aside>
  <section className="main-area"><header className="topbar"><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{selectedProject && page === "Projects" ? selectedProject.name : page}</strong></div><div className="top-actions"><span className="status-dot" /> <span className="online-label">All changes synced</span><button className="icon-button notification" title="Notifications" onClick={() => flash("You’re all caught up")}>♧</button><div className="avatar small-avatar">{initials(user.name)}</div></div></header><div className="content-area">{notice && <div className="toast success">✓ {notice}</div>}{error && <div className="toast error">! {error}<button onClick={() => setError("")}>×</button></div>}
  {page === "Overview" && <><div className="page-heading"><div><span className="eyebrow">FRIDAY, YOUR WORK AT A GLANCE</span><h1>Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, {user.name.split(" ")[0]} <span className="wave">✳</span></h1><p className="muted">Here’s what’s happening across your workspace today.</p></div><button className="primary" onClick={() => { setPage("Projects"); setShowProjectForm(user.role === "ADMIN"); }}>＋ New project</button></div><div className="stats-grid"><article className="stat-card"><div className="stat-top"><span>Active projects</span><span className="stat-icon violet">▦</span></div><strong>{stats.projects.toString().padStart(2, "0")}</strong><small><span className="positive">↗</span> Projects in motion</small><div className="mini-bars"><i /><i /><i /><i /><i /><i /><i /><i /></div></article><article className="stat-card"><div className="stat-top"><span>Total tasks</span><span className="stat-icon blue">☑</span></div><strong>{stats.tasks.toString().padStart(2, "0")}</strong><small>Across your projects</small><div className="stat-progress"><span style={{ width: `${stats.progress}%` }} /></div></article><article className="stat-card"><div className="stat-top"><span>Completed tasks</span><span className="stat-icon green">✓</span></div><strong>{stats.done.toString().padStart(2, "0")}</strong><small><span className="positive">{stats.progress}%</span> completion rate</small><div className="stat-progress green-progress"><span style={{ width: `${stats.progress}%` }} /></div></article><article className="stat-card"><div className="stat-top"><span>Team members</span><span className="stat-icon orange">♧</span></div><strong>{user.role === "ADMIN" ? users.length.toString().padStart(2, "0") : new Set(projects.flatMap((p) => p.members?.map((m) => m.user.id) || [])).size.toString().padStart(2, "0")}</strong><small>People collaborating</small><div className="avatar-stack"><span>AL</span><span>JM</span><span>RK</span><span>+{Math.max(0, projects.length - 1)}</span></div></article></div><div className="overview-grid"><section className="panel projects-panel"><div className="panel-heading"><div><h2>Projects in motion</h2><p>Keep an eye on the work that matters.</p></div><button className="link-button" onClick={() => { setPage("Projects"); setSelectedProject(null); }}>View all projects <span>→</span></button></div>{projects.filter((p) => p.status !== "ARCHIVED").slice(0, 4).map((p, i) => <button className="project-row" key={p.id} onClick={() => void chooseProject(p.id)}><div className={`project-symbol symbol-${i % 4}`}>{["✳", "◈", "▣", "✦"][i % 4]}</div><div className="project-row-main"><strong>{p.name}</strong><small>{p.description || "No description added"}</small><div className="project-mini-progress"><span style={{ width: `${Math.min(100, ((p.tasks || []).filter((t) => t.status === "DONE").length / Math.max(1, p.tasks?.length || p._count?.tasks || 1)) * 100)}%` }} /></div></div><div className="project-row-meta"><strong>{p._count?.tasks ?? p.tasks?.length ?? 0} tasks</strong><small>{p._count?.members ?? p.members?.length ?? 0} members</small></div><span className="row-arrow">↗</span></button>)}{projects.length === 0 && <div className="empty-state"><span>▦</span><strong>Your first project starts here</strong><p>Create a project to bring your team’s work together.</p>{user.role === "ADMIN" && <button className="primary" onClick={() => { setPage("Projects"); setShowProjectForm(true); }}>Create a project</button>}</div>}</section><section className="panel activity-panel"><div className="panel-heading"><div><h2>Task progress</h2><p>A quick look at your workload.</p></div><span className="round-icon">↗</span></div><div className="progress-ring-wrap"><div className="progress-ring" style={{ background: `conic-gradient(#7162dc ${stats.progress * 3.6}deg, #efedf7 0deg)` }}><div><strong>{stats.progress}%</strong><small>completed</small></div></div></div><div className="progress-legend"><span><i className="legend-purple" />Completed <strong>{stats.done}</strong></span><span><i className="legend-grey" />Remaining <strong>{Math.max(0, stats.tasks - stats.done)}</strong></span></div><div className="gentle-note"><span>✦</span><p><strong>Little by little.</strong> Every completed task is progress worth celebrating.</p></div></section></div><div className="bottom-note"><span>✳</span><p><strong>Make space for good work.</strong> Planora keeps your team on the same page, so you can focus on what comes next.</p><button onClick={() => setPage("My tasks")}>See my tasks →</button></div></>}

  {page === "Projects" && <><div className="page-heading"><div><span className="eyebrow">YOUR TEAM’S WORK, ORGANIZED</span><h1>{selectedProject ? selectedProject.name : "Projects"}</h1><p className="muted">{selectedProject ? selectedProject.description || "A shared space to make progress together." : "Everything your team is working on, all in one place."}</p></div><div className="heading-actions">{selectedProject && <button className="secondary" onClick={() => { setSelectedProject(null); setSelectedId(null); setEditingProject(false); }}>← All projects</button>}{selectedProject && canManageProject && selectedProject.status === "ACTIVE" && <button className="secondary" onClick={() => { setProjectName(selectedProject.name); setProjectDescription(selectedProject.description || ""); setEditingProject(!editingProject); }}>✎ Edit project</button>}{user.role === "ADMIN" && !selectedProject && <button className="primary" onClick={() => setShowProjectForm(!showProjectForm)}>＋ New project</button>}</div></div>
  {showProjectForm && !selectedProject && <form className="form-panel" onSubmit={createProject}><div className="form-title"><h3>Create a project</h3><button type="button" className="icon-button" onClick={() => setShowProjectForm(false)}>×</button></div><div className="form-grid"><label>Project name<input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Website redesign" minLength={2} required /></label><label>Description<input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} placeholder="What is this project about?" /></label></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setShowProjectForm(false)}>Cancel</button><button className="primary">Create project</button></div></form>}
  {!selectedProject && <div className="project-filters"><label>Search projects<input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search by project name…" /></label><label>Status<select value={projectStatusFilter} onChange={(e) => setProjectStatusFilter(e.target.value as "ALL" | "ACTIVE" | "ARCHIVED")}><option value="ALL">All projects</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label></div>}
  {!selectedProject && <div className="project-grid">{projects.filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()) && (projectStatusFilter === "ALL" || p.status === projectStatusFilter)).map((p, i) => <article className="project-card" key={p.id}><div className="project-card-top"><div className={`project-symbol large symbol-${i % 4}`}>{["✳", "◈", "▣", "✦"][i % 4]}</div><span className={`pill ${p.status === "ACTIVE" ? "pill-active" : "pill-muted"}`}>{p.status === "ACTIVE" ? "Active" : "Archived"}</span></div><h3>{p.name}</h3><p>{p.description || "No description added yet."}</p><div className="project-card-stats"><span>☑ {p._count?.tasks ?? p.tasks?.length ?? 0} tasks</span><span>♧ {p._count?.members ?? p.members?.length ?? 0} members</span></div><div className="project-card-footer"><div className="avatar-stack"><span>{initials(p.name)}</span><span>✦</span></div><button className="secondary small-button" onClick={() => void chooseProject(p.id)}>Open project →</button></div></article>)}{projects.length === 0 && <div className="empty-state"><span>▦</span><strong>No projects yet</strong><p>Projects shared with you will appear here.</p></div>}</div>}
  {selectedProject && <>{editingProject && <form className="form-panel" onSubmit={updateProject}><div className="form-title"><h3>Edit project details</h3><button type="button" className="icon-button" onClick={() => setEditingProject(false)}>×</button></div><div className="form-grid"><label>Project name<input value={projectName} onChange={(e) => setProjectName(e.target.value)} minLength={2} required /></label><label>Description<input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} /></label></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setEditingProject(false)}>Cancel</button><button className="primary">Save changes</button></div></form>}<div className="project-detail-metrics"><div><span>Project status</span><strong><i className="status-dot" /> {selectedProject.status === "ACTIVE" ? "Active" : "Archived"}</strong></div><div><span>Tasks</span><strong>{tasks.length}</strong></div><div><span>Completed</span><strong>{tasks.filter((t) => t.status === "DONE").length} / {tasks.length}</strong></div><div><span>Project manager</span><strong>{projectManagers[0]?.user.name || "Not assigned"}</strong></div></div><div className="detail-grid"><section className="panel tasks-panel"><div className="panel-heading"><div><h2>Tasks</h2><p>Move work forward, one step at a time.</p></div>{canManageProject && selectedProject.status === "ACTIVE" && <button className="primary" onClick={() => setShowTaskForm(!showTaskForm)}>＋ Add task</button>}</div>{showTaskForm && <form className="inline-form" onSubmit={createTask}><label>Task title<input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder="What needs to get done?" minLength={2} required /></label><label>Description<textarea value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="Add a little context" rows={2} /></label><div className="form-grid three"><label>Priority<select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as Task["priority"])}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label><label>Assignee<select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)}><option value="">Unassigned</option>{(selectedProject.members || []).filter((m) => m.role !== "VIEWER").map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select></label><label>Due date<input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} /></label></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setShowTaskForm(false)}>Cancel</button><button className="primary">Save task</button></div></form>}{tasks.length ? <div className="task-list">{tasks.map((task) => <article className="task-item" key={task.id}><div className={`task-check ${task.status === "DONE" ? "checked" : ""}`}>{task.status === "DONE" ? "✓" : ""}</div><div className="task-main"><strong>{task.title}</strong><p>{task.description || "No description"}</p><div className="task-meta"><span className={`priority priority-${task.priority.toLowerCase()}`}><i />{task.priority[0] + task.priority.slice(1).toLowerCase()} priority</span>{task.assignee && <span>♙ {task.assignee.name}</span>}{task.dueDate && <span>◷ {new Date(task.dueDate).toLocaleDateString()}</span>}<button className="text-button" onClick={() => void openComments(task)}>Comments</button></div></div><div className="task-actions"><select aria-label={`Status for ${task.title}`} value={task.status} disabled={user.role === "VIEWER" || currentProjectRole === "VIEWER" || selectedProject.status === "ARCHIVED" || (user.role === "TEAM_MEMBER" && task.assigneeId !== user.id)} onChange={(e) => void updateTaskStatus(task, e.target.value as Task["status"])}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select>{canManageProject && selectedProject.status === "ACTIVE" && <button className="secondary small-button" onClick={() => startTaskEdit(task)}>Edit</button>}{canManageProject && selectedProject.status === "ACTIVE" && <button className="icon-button danger-button" title="Delete task" onClick={() => void deleteTask(task)}>×</button>}</div></article>)}</div> : <div className="empty-state compact"><span>☑</span><strong>No tasks in this project</strong><p>Add the first task and give your team a clear next step.</p></div>}</section><section className="panel team-panel"><div className="panel-heading"><div><h2>Team members</h2><p>The people behind the progress.</p></div><span className="member-count">{selectedProject.members?.length || 0}</span></div><div className="member-list">{(selectedProject.members || []).map((m) => <div className="member-row" key={m.id}><div className="avatar">{initials(m.user.name)}</div><div className="member-details"><strong>{m.user.name}</strong><small>{m.user.email}</small></div>{canManageProject && selectedProject.status === "ACTIVE" && m.role !== "MANAGER" ? <select className="member-role-select" aria-label={`Role for ${m.user.name}`} value={m.role} onChange={(e) => void updateMemberRole(m, e.target.value as "MEMBER" | "VIEWER")}><option value="MEMBER">Member</option><option value="VIEWER">Viewer</option></select> : <span className={`role-chip ${m.role.toLowerCase()}`}>{roleLabel(m.role)}</span>}{canManageProject && selectedProject.status === "ACTIVE" && m.role !== "MANAGER" && <button className="icon-button danger-button" title="Remove member" onClick={() => void removeMember(m)}>×</button>}</div>)}{!selectedProject.members?.length && <p className="muted">No members yet.</p>}</div>{user.role === "ADMIN" && selectedProject.status === "ACTIVE" && <form className="add-member-form" onSubmit={assignManager}><h3>Assign project manager</h3><label>Project manager<select value={assignManagerId} onChange={(e) => setAssignManagerId(e.target.value)} required><option value="">Choose a manager…</option>{users.filter((u) => u.role === "PROJECT_MANAGER" && u.isActive !== false).map((manager) => <option key={manager.id} value={manager.id}>{manager.name} · {manager.email}</option>)}</select></label><button className="secondary full">Assign manager</button></form>}{canManageProject && selectedProject.status === "ACTIVE" && <form className="add-member-form" onSubmit={addMember}><h3>Add a teammate</h3><label>Choose person<select value={addMemberId} onFocus={() => void loadAvailableMembers(selectedProject.id)} onChange={(e) => { const value = e.target.value; setAddMemberId(value); if (availableMembers.find((m) => m.id === Number(value))?.role === "VIEWER") setAddMemberRole("VIEWER"); }} required><option value="">Select a user…</option>{availableMembers.map((m) => <option key={m.id} value={m.id}>{m.name} · {roleLabel(m.role)}</option>)}</select></label><label>Project access<select value={addMemberRole} onChange={(e) => setAddMemberRole(e.target.value as "MEMBER" | "VIEWER")}><option value="MEMBER">Team member</option><option value="VIEWER">Viewer (read-only)</option></select></label><button className="secondary full">＋ Add to project</button></form>}{(canManageProject || user.role === "ADMIN") && <div className="project-danger-zone">{selectedProject.status === "ACTIVE" && <button className="text-button" onClick={() => void archiveProject(selectedProject)}>Archive project</button>}{user.role === "ADMIN" && <button className="text-button danger-text" onClick={() => void deleteProject(selectedProject)}>Delete project</button>}</div>}</section></div></>}
  </>}

  {page === "My tasks" && <><div className="page-heading"><div><span className="eyebrow">YOUR NEXT STEPS</span><h1>My tasks</h1><p className="muted">The work assigned to you, all in one place.</p></div></div><section className="panel"><div className="panel-heading"><div><h2>Assigned to me</h2><p>Choose a status as you make progress.</p></div><span className="member-count">{visibleTasks.length}</span></div>{visibleTasks.map((task) => <article className="task-item" key={task.id}><div className={`task-check ${task.status === "DONE" ? "checked" : ""}`}>{task.status === "DONE" ? "✓" : ""}</div><div className="task-main"><strong>{task.title}</strong><p>{task.projectName} · {task.description || "No description"}</p><div className="task-meta"><span className={`priority priority-${task.priority.toLowerCase()}`}><i />{task.priority} priority</span></div></div><select value={task.status} disabled={user.role === "VIEWER"} onChange={(e) => void updateTaskStatus(task, e.target.value as Task["status"])}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select></article>)}{visibleTasks.length === 0 && <div className="empty-state"><span>☑</span><strong>No tasks assigned yet</strong><p>When a task is assigned to you, it will show up here.</p></div>}</section></>}

  {page === "Team" && <><div className="page-heading"><div><span className="eyebrow">GOOD WORK IS A TEAM SPORT</span><h1>Your team</h1><p className="muted">People collaborating across your projects.</p></div></div><div className="project-grid">{Array.from(new Map(projects.flatMap((p) => (p.members || []).map((m) => [m.user.id, { ...m.user, project: p.name, projectRole: m.role }] as const)).values()).map((member) => <article className="project-card team-card" key={member.id}><div className="avatar large-avatar">{initials(member.name)}</div><h3>{member.name}</h3><p>{member.email}</p><span className="role-chip member">{roleLabel(member.role)}</span><div className="project-card-footer"><span className="muted">{member.project}</span><button className="secondary small-button" onClick={() => { const project = projects.find((p) => p.name === member.project); if (project) void chooseProject(project.id); }}>View project →</button></div></article>))}</div></>}

  {page === "Profile" && <><div className="page-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h1>Profile</h1><p className="muted">Your account details and current workspace access.</p></div></div><section className="panel profile-panel"><div className="profile-hero"><div className="avatar profile-avatar">{initials(user.name)}</div><div><h2>{user.name}</h2><p className="muted">{user.email}</p><span className="role-chip manager">{roleLabel(user.role)}</span></div></div><div className="profile-details"><div><span>Full name</span><strong>{user.name}</strong></div><div><span>Email address</span><strong>{user.email}</strong></div><div><span>Workspace role</span><strong>{roleLabel(user.role)}</strong></div><div><span>Session security</span><strong>HTTP-only session cookie</strong></div></div><p className="muted profile-note">Your access is checked by the API on every protected request. Ask an administrator to update account details or permissions.</p><button className="secondary" onClick={() => void logout()}>Sign out of Planora</button></section></>}

  {page === "User management" && user.role === "ADMIN" && <><div className="page-heading"><div><span className="eyebrow">PEOPLE & PERMISSIONS</span><h1>User management</h1><p className="muted">Manage accounts and control access to the workspace.</p></div><button className="primary" onClick={() => setShowUserForm(!showUserForm)}>＋ Add user</button></div>{showUserForm && <form className="form-panel" onSubmit={createUser}><div className="form-title"><h3>Create a user account</h3><button type="button" className="icon-button" onClick={() => setShowUserForm(false)}>×</button></div><div className="form-grid"><label>Full name<input value={newUserName} onChange={(e) => setNewUserName(e.target.value)} minLength={2} required /></label><label>Email<input type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} required /></label><label>Temporary password<input type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} minLength={8} required /></label><label>Role<select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as Role)}><option value="ADMIN">Admin</option><option value="PROJECT_MANAGER">Project Manager</option><option value="TEAM_MEMBER">Team Member</option><option value="VIEWER">Viewer</option></select></label></div><div className="form-actions"><button type="button" className="secondary" onClick={() => setShowUserForm(false)}>Cancel</button><button className="primary">Create account</button></div></form>}<section className="panel user-table-panel"><div className="panel-heading"><div><h2>Workspace users</h2><p>{users.length} accounts in your workspace</p></div><button className="secondary" onClick={() => void loadUsers()}>↻ Refresh</button></div><div className="table-scroll"><table><thead><tr><th>Person</th><th>Role</th><th>Status</th><th>Account actions</th></tr></thead><tbody>{users.map((target) => <tr key={target.id}><td><div className="table-person"><div className="avatar">{initials(target.name)}</div><div><strong>{target.name}</strong><small>{target.email}</small></div></div></td><td><select value={target.role} disabled={target.id === user.id} onChange={(e) => void updateUser(target, { role: e.target.value as Role })}><option value="ADMIN">Admin</option><option value="PROJECT_MANAGER">Project Manager</option><option value="TEAM_MEMBER">Team Member</option><option value="VIEWER">Viewer</option></select></td><td><span className={`pill ${target.isActive ? "pill-active" : "pill-muted"}`}>{target.isActive ? "Active" : "Inactive"}</span></td><td><button className={`secondary small-button ${target.isActive ? "" : "reactivate"}`} disabled={target.id === user.id} onClick={() => void updateUser(target, { isActive: !target.isActive })}>{target.isActive ? "Deactivate" : "Reactivate"}</button></td></tr>)}</tbody></table></div></section></>}
  </div></section>
  {taskEditing && <div className="modal-backdrop" onClick={() => setTaskEditing(null)}><section className="comments-modal task-editor-modal" onClick={(e) => e.stopPropagation()}><div className="form-title"><div><span className="eyebrow">TASK DETAILS</span><h2>Edit task</h2></div><button type="button" className="icon-button" onClick={() => setTaskEditing(null)}>×</button></div><form className="task-edit-form" onSubmit={saveTaskEdit}><label>Task title<input value={taskEditTitle} onChange={(e) => setTaskEditTitle(e.target.value)} minLength={2} maxLength={150} required /></label><label>Description<textarea value={taskEditDescription} onChange={(e) => setTaskEditDescription(e.target.value)} maxLength={2000} rows={3} /></label><div className="form-grid"><label>Priority<select value={taskEditPriority} onChange={(e) => setTaskEditPriority(e.target.value as Task["priority"])}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></select></label><label>Status<select value={taskEditStatus} onChange={(e) => setTaskEditStatus(e.target.value as Task["status"])}><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></select></label><label>Assignee<select value={taskEditAssignee} onChange={(e) => setTaskEditAssignee(e.target.value)}><option value="">Unassigned</option>{(selectedProject?.members || []).filter((m) => m.role !== "VIEWER").map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name}</option>)}</select></label><label>Due date<input type="date" value={taskEditDue} onChange={(e) => setTaskEditDue(e.target.value)} /></label></div><p className="muted concurrency-note">This form submits the task version you opened. If another user saves first, the API returns HTTP 409 instead of overwriting their changes.</p><div className="form-actions"><button type="button" className="secondary" onClick={() => setTaskEditing(null)}>Cancel</button><button className="primary">Save changes</button></div></form></section></div>}

  {commentsTask && <div className="modal-backdrop" onClick={() => setCommentsTask(null)}><section className="comments-modal" onClick={(e) => e.stopPropagation()}><div className="form-title"><div><span className="eyebrow">TASK DISCUSSION</span><h2>{commentsTask.title}</h2></div><button className="icon-button" onClick={() => setCommentsTask(null)}>×</button></div><div className="comments-list">{comments.map((comment) => <article className="comment" key={comment.id}><div className="avatar">{initials(comment.author.name)}</div><div><strong>{comment.author.name}</strong><small>{new Date(comment.createdAt).toLocaleString()}</small><p>{comment.content}</p></div>{(comment.author.id === user.id || canManageProject) && <button className="text-button danger-text" onClick={() => void deleteComment(comment)} aria-label="Delete comment">Delete</button>}</article>)}{comments.length === 0 && <div className="empty-state compact"><span>☷</span><strong>Start the conversation</strong><p>Leave a note or share an update with your team.</p></div>}</div>{user.role !== "VIEWER" && <form className="comment-form" onSubmit={addComment}><textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Write a comment…" rows={3} required /><button className="primary">Send comment →</button></form>}</section></div>}
  </main>;
}
