// RLS / authorization checks against the Supabase Data API, using only the
// publishable key — exactly what a user calling the API by hand could do.
//
// Requires local Supabase with seed data: `npm run db:reset && npm run test:rls`

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_* env (run with --env-file=.env.local)");

const PASSWORD = "Password123!";
const ADMIN = "00000000-0000-4000-8000-000000000001";
const AN = "00000000-0000-4000-8000-000000000002";
const BINH = "00000000-0000-4000-8000-000000000003";

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  → ${JSON.stringify(detail)}`}`);
  if (!ok) failed++;
}

function newClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email) {
  const client = newClient();
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

// ---------- anon ----------
{
  const anon = newClient();
  const { data, error } = await anon.from("profiles").select("*");
  check("anon cannot read profiles", (data ?? []).length === 0, { data, error });

  const { error: signUpError } = await anon.auth.signUp({ email: "hacker@evil.test", password: PASSWORD });
  check("public signup is disabled", !!signUpError, signUpError);
}

// ---------- employee ----------
{
  const an = await signIn("an@team.local");

  const { data: all } = await an.from("profiles").select("id");
  check("employee sees only own profile", all?.length === 1 && all[0].id === AN, all);

  const { data: other } = await an.from("profiles").select("*").eq("id", BINH);
  check("employee cannot read another employee by id", other?.length === 0, other);

  const { data: adminRow } = await an.from("profiles").select("*").eq("id", ADMIN);
  check("employee cannot read admin profile", adminRow?.length === 0, adminRow);

  const { data: renamed, error: renameErr } = await an
    .from("profiles").update({ full_name: "An Test" }).eq("id", AN).select("full_name");
  check("employee can update own full_name", renamed?.[0]?.full_name === "An Test", renameErr);
  await an.from("profiles").update({ full_name: "Nguyễn Văn An" }).eq("id", AN);

  const { error: roleErr } = await an.from("profiles").update({ role: "ADMIN" }).eq("id", AN);
  check("employee cannot promote self to ADMIN", !!roleErr, roleErr);

  const { error: activeErr } = await an.from("profiles").update({ active: false }).eq("id", AN);
  check("employee cannot change own active flag", !!activeErr, activeErr);

  const { error: zaloErr } = await an.from("profiles").update({ zalo_connected: true }).eq("id", AN);
  check("employee cannot set zalo_connected", !!zaloErr, zaloErr);

  const { data: hijack } = await an.from("profiles").update({ full_name: "Hacked" }).eq("id", BINH).select();
  check("employee cannot update another employee", (hijack ?? []).length === 0, hijack);

  const { error: insertErr } = await an.from("profiles").insert({ id: crypto.randomUUID(), email: "x@x.x" });
  check("employee cannot insert profiles", !!insertErr, insertErr);

  const { data: deleted } = await an.from("profiles").delete().eq("id", AN).select();
  check("employee cannot delete profiles", (deleted ?? []).length === 0, deleted);

  const { error: rpcErr } = await an.schema("private").rpc("is_admin");
  check("private schema is not exposed via API", !!rpcErr, rpcErr);
}

// ---------- admin ----------
{
  const admin = await signIn("admin@team.local");

  const { data: all } = await admin.from("profiles").select("id");
  check("admin reads all profiles", all?.length === 3, all);

  const { data: promoted, error: promoteErr } = await admin
    .from("profiles").update({ role: "ADMIN" }).eq("id", BINH).select("role");
  check("admin can change another member's role", promoted?.[0]?.role === "ADMIN", promoteErr);
  await admin.from("profiles").update({ role: "EMPLOYEE" }).eq("id", BINH);

  const { error: selfDemoteErr } = await admin.from("profiles").update({ role: "EMPLOYEE" }).eq("id", ADMIN);
  check("admin cannot change own role (lockout guard)", !!selfDemoteErr, selfDemoteErr);

  const { error: adminZaloErr } = await admin.from("profiles").update({ zalo_user_id: "123" }).eq("id", AN);
  check("admin cannot forge zalo_user_id from client", !!adminZaloErr, adminZaloErr);
}

// ---------- fixed task templates & tasks ----------
{
  const service = process.env.SUPABASE_SECRET_KEY
    ? createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })
    : null;
  if (!service) throw new Error("SUPABASE_SECRET_KEY is required for task checks");

  const an = await signIn("an@team.local");
  const admin = await signIn("admin@team.local");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

  const { data: tpl } = await an.from("fixed_task_templates").select("id");
  check("employee cannot read templates", (tpl ?? []).length === 0, tpl);

  const { error: tplInsertErr } = await an.from("fixed_task_templates").insert({ assignee_id: AN, title: "Hack" });
  check("employee cannot create templates", !!tplInsertErr, tplInsertErr);

  const { data: myTasks } = await an
    .from("tasks").select("id, assignee_id, allow_employee_note, title").eq("task_date", today).eq("type", "FIXED");
  check(
    "employee reads only own fixed tasks for today",
    myTasks?.length === 3 && myTasks.every((t) => t.assignee_id === AN),
    myTasks?.map((t) => t.assignee_id),
  );

  const { data: binhTasks } = await admin.from("tasks").select("id").eq("assignee_id", BINH).eq("task_date", today);
  const binhTaskId = binhTasks?.[0]?.id;
  const { data: peek } = await an.from("tasks").select("*").eq("id", binhTaskId);
  check("employee cannot read another employee's task by id", peek?.length === 0, peek);

  const { data: hijack } = await an.from("tasks").update({ completed: true }).eq("id", binhTaskId).select();
  check("employee cannot complete another employee's task", (hijack ?? []).length === 0, hijack);

  const noNoteTask = myTasks.find((t) => !t.allow_employee_note);
  const noteTask = myTasks.find((t) => t.allow_employee_note);

  const { data: completed, error: completeErr } = await an
    .from("tasks").update({ completed: true }).eq("id", noNoteTask.id).select("completed, completed_at, completed_by");
  check(
    "employee completes own task; completion stamped server-side",
    completed?.[0]?.completed === true && completed[0].completed_at && completed[0].completed_by === AN,
    completeErr ?? completed,
  );

  const { data: reopened } = await an
    .from("tasks").update({ completed: false }).eq("id", noNoteTask.id).select("completed, completed_at");
  check("employee can reopen own task", reopened?.[0]?.completed === false && reopened[0].completed_at === null, reopened);

  const { error: forgeErr } = await an
    .from("tasks").update({ completed: true, completed_by: BINH }).eq("id", noNoteTask.id);
  check("employee cannot forge completed_by", !!forgeErr, forgeErr);

  for (const [field, value] of [
    ["deadline_at", new Date(Date.now() + 864e5).toISOString()],
    ["task_date", "2099-01-01"],
    ["title", "Đổi tên"],
    ["assignee_id", BINH],
  ]) {
    const { error } = await an.from("tasks").update({ [field]: value }).eq("id", noNoteTask.id);
    check(`employee cannot change ${field}`, !!error, error);
  }

  const { error: noteDeniedErr } = await an.from("tasks").update({ employee_note: "x" }).eq("id", noNoteTask.id);
  check("employee cannot note a task that disallows notes", !!noteDeniedErr, noteDeniedErr);

  const { data: noted, error: noteErr } = await an
    .from("tasks").update({ employee_note: "Tồn kho: 42" }).eq("id", noteTask.id).select("employee_note");
  check("employee can note a task that allows notes", noted?.[0]?.employee_note === "Tồn kho: 42", noteErr);
  await an.from("tasks").update({ employee_note: null }).eq("id", noteTask.id);

  const { data: deletedTask } = await an.from("tasks").delete().eq("id", noNoteTask.id).select();
  check("employee cannot delete tasks", (deletedTask ?? []).length === 0, deletedTask);

  const { error: taskInsertErr } = await an
    .from("tasks").insert({ type: "FIXED", fixed_template_id: crypto.randomUUID(), title: "Tự thêm việc cố định" });
  check("employee cannot insert FIXED tasks", !!taskInsertErr, taskInsertErr);

  const { error: ensureErr } = await an.rpc("ensure_today_fixed_tasks");
  check("employee cannot trigger generation", !!ensureErr, ensureErr);

  // A past-day task: history is read-only for employees.
  const { data: anTemplate } = await service.from("fixed_task_templates").select("id").eq("assignee_id", AN).limit(1).single();
  const { data: past } = await service
    .from("tasks")
    .insert({ type: "FIXED", assignee_id: AN, fixed_template_id: anTemplate.id, task_date: "2020-01-01", title: "Việc cũ" })
    .select("id")
    .single();
  const { error: pastErr } = await an.from("tasks").update({ completed: true }).eq("id", past.id);
  check("employee cannot change a past day's task", !!pastErr, pastErr);
  await service.from("tasks").delete().eq("id", past.id);

  // ---------- admin ----------
  const { data: allTpl } = await admin.from("fixed_task_templates").select("id");
  check("admin reads all templates", allTpl?.length === 5, allTpl?.length);

  const { data: allTasks } = await admin.from("tasks").select("id").eq("task_date", today);
  check("admin reads all of today's tasks", (allTasks ?? []).length >= 4, allTasks?.length);

  const { error: delErr } = await admin.from("fixed_task_templates").delete().eq("id", anTemplate.id);
  check("admin cannot hard-delete a template with history", delErr?.code === "23503", delErr);

  const { error: adminDueErr } = await admin.from("tasks").update({ deadline_at: null }).eq("id", noNoteTask.id);
  check("generated task snapshot is locked even for admin", !!adminDueErr, adminDueErr);

  const { error: ensureAdminErr } = await admin.rpc("ensure_today_fixed_tasks");
  check("admin can trigger today's generation (idempotent)", !ensureAdminErr, ensureAdminErr);
  const { data: afterEnsure } = await admin.from("tasks").select("id").eq("task_date", today);
  check("re-running generation adds no duplicates", afterEnsure?.length === allTasks?.length, [allTasks?.length, afterEnsure?.length]);
}

// ---------- ad-hoc tasks ----------
{
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const an = await signIn("an@team.local");
  const binh = await signIn("binh@team.local");
  const admin = await signIn("admin@team.local");
  const created = [];

  const { data: mine, error: createErr } = await an
    .from("tasks").insert({ type: "ADHOC", title: "RLS quick create" }).select("id, assignee_id, created_by, completed").single();
  check(
    "employee creates ad-hoc without sending assignee_id; it is set to self",
    mine?.assignee_id === AN && mine.created_by === AN && mine.completed === false,
    createErr ?? mine,
  );
  if (mine) created.push(mine.id);

  const { error: forOtherErr } = await an.from("tasks").insert({ type: "ADHOC", title: "Cho Bình", assignee_id: BINH });
  check("employee cannot create an ad-hoc task for someone else", !!forOtherErr, forOtherErr);

  const { error: doneErr } = await an.from("tasks").insert({ type: "ADHOC", title: "Đã xong sẵn", completed: true, completed_at: new Date().toISOString() });
  check("employee cannot create an already-completed task", !!doneErr, doneErr);

  const due = new Date(Date.now() + 3 * 864e5).toISOString();
  const { data: edited, error: editErr } = await an
    .from("tasks").update({ title: "RLS renamed", note: "ghi chú", deadline_at: due }).eq("id", mine.id).select("title, deadline_at");
  check("employee can edit and reschedule own ad-hoc", edited?.[0]?.title === "RLS renamed" && edited[0].deadline_at, editErr);

  const { error: adhocNoteErr } = await an.from("tasks").update({ employee_note: "x" }).eq("id", mine.id);
  check("ad-hoc tasks use `note`, not employee_note", !!adhocNoteErr, adhocNoteErr);

  const { data: binhTask } = await binh.from("tasks").insert({ type: "ADHOC", title: "Việc của Bình" }).select("id").single();
  created.push(binhTask.id);
  const { data: peek } = await an.from("tasks").select("id").eq("id", binhTask.id);
  check("employee cannot read another employee's ad-hoc", peek?.length === 0, peek);
  const { data: hijack } = await an.from("tasks").update({ title: "hacked", deadline_at: null }).eq("id", binhTask.id).select();
  check("employee cannot edit another employee's ad-hoc", (hijack ?? []).length === 0, hijack);

  const { data: del } = await an.from("tasks").delete().eq("id", mine.id).select();
  check("employee cannot delete ad-hoc tasks", (del ?? []).length === 0, del);

  // Carry-over: a task created long ago stays open and workable.
  const { data: old } = await service
    .from("tasks")
    .insert({ type: "ADHOC", assignee_id: AN, created_at: "2020-01-01T00:00:00Z", title: "Việc tồn từ 2020", created_by: AN })
    .select("id")
    .single();
  created.push(old.id);
  const { data: oldRow } = await an.from("tasks").select("id, display_status").eq("id", old.id).single();
  check("carried-over ad-hoc without deadline is visible and not overdue", oldRow?.display_status === "TODAY", oldRow);
  const { data: oldDone, error: oldDoneErr } = await an.from("tasks").update({ completed: true }).eq("id", old.id).select("completed");
  check("employee can complete a carried-over ad-hoc task", oldDone?.[0]?.completed === true, oldDoneErr);

  const { data: overdue } = await service
    .from("tasks")
    .insert({ type: "ADHOC", assignee_id: AN, title: "Trễ hạn", deadline_at: new Date(Date.now() - 6e4).toISOString(), created_by: AN })
    .select("id")
    .single();
  created.push(overdue.id);
  const { data: overdueRow } = await an.from("tasks").select("display_status").eq("id", overdue.id).single();
  check("display_status is OVERDUE once the deadline passes", overdueRow?.display_status === "OVERDUE", overdueRow);

  const { data: adminSees } = await admin.from("tasks").select("id").eq("id", mine.id);
  check("admin can read employees' ad-hoc tasks", adminSees?.length === 1, adminSees);
  const { error: adminEditErr } = await admin.from("tasks").update({ title: "admin đổi" }).eq("id", mine.id);
  check("admin cannot rewrite an employee's ad-hoc content", !!adminEditErr, adminEditErr);

  await service.from("tasks").delete().in("id", created);
}

// ---------- Phase 3 tables: history, notifications, settings ----------
{
  const anon = newClient();
  const an = await signIn("an@team.local");
  const admin = await signIn("admin@team.local");

  for (const table of ["task_history", "notification_settings", "notification_logs", "system_settings"]) {
    const { data } = await anon.from(table).select("*");
    check(`anon cannot read ${table}`, (data ?? []).length === 0, data);
  }

  const { data: myHistory } = await an.from("task_history").select("task_id, tasks!inner(assignee_id)");
  check(
    "employee reads history of own tasks only",
    myHistory?.length > 0 && myHistory.every((h) => h.tasks.assignee_id === AN),
    myHistory?.length,
  );
  const { data: allHistory } = await admin.from("task_history").select("id");
  check("admin reads all history", (allHistory ?? []).length > (myHistory ?? []).length, allHistory?.length);

  const { error: historyWriteErr } = await an.from("task_history").insert({ task_id: myHistory?.[0]?.task_id, action: "UPDATED" });
  check("employee cannot write history", !!historyWriteErr, historyWriteErr);
  const { data: historyDel } = await admin.from("task_history").delete().gt("id", 0).select();
  check("even admin cannot delete history", (historyDel ?? []).length === 0, historyDel?.length);

  const { data: mySettings } = await an.from("notification_settings").select("user_id");
  check("employee sees only own notification settings", mySettings?.length === 1 && mySettings[0].user_id === AN, mySettings);
  const { data: otherSettings } = await an
    .from("notification_settings").update({ daily_summary_enabled: false }).eq("user_id", BINH).select();
  check("employee cannot change another member's notification settings", (otherSettings ?? []).length === 0, otherSettings);
  const { data: ownSettings, error: ownSettingsErr } = await an
    .from("notification_settings").update({ remind_before_minutes: 45 }).eq("user_id", AN).select("remind_before_minutes");
  check("employee updates own notification settings", ownSettings?.[0]?.remind_before_minutes === 45, ownSettingsErr);
  await an.from("notification_settings").update({ remind_before_minutes: 30 }).eq("user_id", AN);
  const { data: allSettings } = await admin.from("notification_settings").select("user_id");
  check("admin reads all notification settings", allSettings?.length === 3, allSettings?.length);

  const { error: logWriteErr } = await an.from("notification_logs").insert({ user_id: AN, channel: "ZALO", kind: "TEST" });
  check("employee cannot write notification logs", !!logWriteErr, logWriteErr);

  const { data: settingsRead } = await an.from("system_settings").select("key");
  check("members read system settings", (settingsRead ?? []).some((r) => r.key === "team_name"), settingsRead);
  const { data: settingsHack } = await an.from("system_settings").update({ value: "Hacked" }).eq("key", "team_name").select();
  check("employee cannot change system settings", (settingsHack ?? []).length === 0, settingsHack);
  const { data: settingsAdmin, error: settingsAdminErr } = await admin
    .from("system_settings").update({ value: "Team Todo" }).eq("key", "team_name").select("updated_by");
  check("admin can change system settings (updated_by stamped)", settingsAdmin?.[0]?.updated_by === ADMIN, settingsAdminErr);
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll RLS checks passed");
process.exit(failed ? 1 : 0);
