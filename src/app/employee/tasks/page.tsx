"use client";

import { useEffect, useState } from "react";
import { currentProfile } from "@/lib/auth";
import { employeeRepository } from "@/lib/employee-repository";
import { isOverdue } from "@/lib/task-rules";
const labels: Record<string, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  completed: "Completed",
};
const priorityStyle: Record<string, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-amber-50 text-amber-800",
  high: "bg-rose-50 text-rose-800",
};
const statusStyle: Record<string, string> = {
  todo: "bg-slate-100 text-slate-700",
  in_progress: "bg-sky-50 text-sky-800",
  completed: "bg-emerald-50 text-emerald-800",
};
export default function TasksPage() {
  const [profile, setProfile] = useState<any>();
  const [tasks, setTasks] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [updateOpen, setUpdateOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const load = async () => {
    setLoading(true);
    try {
      const p = (await currentProfile()) as any;
      if (!p) throw Error();
      setProfile(p);
      setTasks(await employeeRepository.myTasks(p.id));
      setError("");
    } catch {
      setError("Tasks could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  const update = async (id: string, value: string, comment = "") => {
    setSaving(id);
    setError("");
    try {
      await employeeRepository.updateMyTask(id, value, comment, profile.id);
      setComments((current) => ({ ...current, [id]: "" }));
      setUpdateOpen(null);
      await load();
    } catch {
      setError("Task update could not be saved. Please try again.");
    } finally {
      setSaving(null);
    }
  };
  if (loading)
    return (
      <section className="mx-auto max-w-[1260px] space-y-4">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="text-slate-600">
            Your assigned work and progress updates.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100/70 p-1.5 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div className="card h-20 animate-pulse bg-slate-100" key={item} />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2].map((item) => (
            <div className="card h-44 animate-pulse bg-slate-100" key={item} />
          ))}
        </div>
      </section>
    );
  if (error && !profile)
    return (
      <section>
        <h1 className="text-2xl font-bold">My Tasks</h1>
        <p className="mt-3 text-rose-700">{error}</p>
        <button onClick={() => void load()} className="btn btn-primary mt-3">
          Try again
        </button>
      </section>
    );
  const today = new Date().toISOString().slice(0, 10);
  const metrics = [
    [
      "✓",
      "To Do",
      tasks.filter((item) => item.status === "todo").length,
      "text-slate-700",
    ],
    [
      "↻",
      "In Progress",
      tasks.filter((item) => item.status === "in_progress").length,
      "text-sky-700",
    ],
    [
      "✓",
      "Completed",
      tasks.filter((item) => item.status === "completed").length,
      "text-emerald-700",
    ],
    [
      "!",
      "Overdue",
      tasks.filter((item) => isOverdue(item.tasks, today)).length,
      "text-rose-700",
    ],
  ];
  const shown = tasks.filter((item) => {
    const task = item.tasks;
    return (
      (!query ||
        `${task.title} ${task.description || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!status || item.status === status) &&
      (!priority || task.priority === priority) &&
      (!dueDate || task.due_date === dueDate)
    );
  });
  const clear = () => {
    setQuery("");
    setStatus("");
    setPriority("");
    setDueDate("");
  };
  return (
    <section className="mx-auto max-w-[1260px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Tasks</h1>
          <p className="mt-1 text-sm text-slate-600">
            Stay on top of your assigned work and share progress.
          </p>
        </div>
      </div>
      {error && <p className="rounded bg-rose-50 p-3 text-rose-800">{error}</p>}
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100/70 p-1.5 md:grid-cols-4">
        {metrics.map(([icon, label, count, color]) => (
          <div
            className="card flex items-center gap-3 px-3 py-2.5"
            key={String(label)}
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-lg bg-slate-50 text-sm font-bold ${color}`}
            >
              {icon}
            </span>
            <div>
              <small className="block text-xs text-slate-500">{label}</small>
              <b className="text-lg leading-none">{count}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[minmax(0,1fr)_128px_128px_144px]">
        <input
          className="input col-span-2 h-9 min-w-0 py-1 text-sm sm:col-span-1"
          placeholder="Search tasks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input h-9 w-full py-1 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Status</option>
          {Object.entries(labels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="input h-9 w-full py-1 text-sm"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <input
          aria-label="Due date"
          className="input col-span-2 h-9 w-full py-1 text-sm sm:col-span-1"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
        {(query || status || priority || dueDate) && (
          <button
            className="col-span-2 px-2 text-xs font-medium text-slate-600 sm:col-span-1"
            onClick={clear}
          >
            Clear
          </button>
        )}
      </div>
      {shown.length ? (
        <div className="space-y-3">
          {shown.map((item) => {
            const task = item.tasks;
            const latest = task.task_comments?.at(-1);
            const overdue = isOverdue(task, today);
            return (
              <article className="card p-4" key={item.id}>
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_184px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className="text-left font-bold text-slate-950 hover:text-teal-700"
                        onClick={() => setDetail(item)}
                      >
                        {task.title}
                      </button>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${priorityStyle[task.priority] || priorityStyle.medium}`}
                      >
                        {task.priority}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusStyle[item.status]}`}
                      >
                        {labels[item.status]}
                      </span>
                      {overdue && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                      {task.description || "No description provided."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>
                        Assigned by{" "}
                        {task.created_by_profile?.full_name || "Management"}
                      </span>
                      <span>Due {task.due_date || "No due date"}</span>
                      <span className="hidden sm:inline">
                        Created {new Date(task.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {latest && (
                      <div className="mt-3 rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <b className="text-slate-700">Latest update</b>
                        <span className="ml-2">{latest.body}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:flex-col md:items-stretch md:justify-center">
                    <select
                      aria-label={`Change status for ${task.title}`}
                      style={{ width: "100%" }}
                      className="input h-8 py-0 text-xs"
                      value={item.status}
                      disabled={saving === item.id}
                      onChange={(e) => void update(item.id, e.target.value)}
                    >
                      {Object.entries(labels).map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn border px-2.5 py-1 text-xs md:w-full"
                      onClick={() => setDetail(item)}
                    >
                      Details
                    </button>
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {updateOpen === item.id ? (
                    <div className="max-w-3xl space-y-2">
                      <textarea
                        className="input min-h-16 flex-1 text-sm"
                        autoFocus
                        placeholder="What progress did you make?"
                        value={comments[item.id] || ""}
                        onChange={(e) =>
                          setComments((current) => ({
                            ...current,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <button
                          className="btn btn-primary px-3 py-1.5 text-sm"
                          disabled={
                            saving === item.id ||
                            !(comments[item.id] || "").trim()
                          }
                          onClick={() =>
                            void update(
                              item.id,
                              item.status,
                              comments[item.id] || "",
                            )
                          }
                        >
                          {saving === item.id ? "Saving…" : "Save"}
                        </button>
                        <button
                          className="btn border px-3 py-1.5 text-sm"
                          onClick={() => {
                            setUpdateOpen(null);
                            setComments((current) => ({
                              ...current,
                              [item.id]: "",
                            }));
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="text-sm font-medium text-teal-700"
                      onClick={() => setUpdateOpen(item.id)}
                    >
                      + Add progress update
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="card grid place-items-center gap-2 p-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-teal-50 text-lg text-teal-700">
            ✓
          </span>
          <b>
            {tasks.length
              ? "No tasks match these filters"
              : "No tasks assigned yet"}
          </b>
          <p className="text-sm text-slate-500">
            {tasks.length
              ? "Try clearing or changing your filters."
              : "New work assigned to you will appear here."}
          </p>
        </div>
      )}
      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4">
          <article className="card max-h-[85vh] w-full max-w-xl overflow-auto p-5">
            <button
              className="float-right text-sm text-slate-500 underline"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
            <div className="pr-12">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{detail.tasks.title}</h2>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[detail.status]}`}
                >
                  {labels[detail.status]}
                </span>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
                {detail.tasks.description || "No description provided."}
              </p>
            </div>
            <dl className="mt-5 grid gap-3 rounded bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Assigned by</dt>
                <dd>
                  {detail.tasks.created_by_profile?.full_name || "Management"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Priority</dt>
                <dd className="capitalize">{detail.tasks.priority}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Due date</dt>
                <dd>{detail.tasks.due_date || "No due date"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Created</dt>
                <dd>{new Date(detail.tasks.created_at).toLocaleString()}</dd>
              </div>
            </dl>
            <h3 className="mt-5 font-bold">Progress history</h3>
            <div className="mt-3 space-y-3 border-l-2 border-teal-100 pl-4">
              {detail.tasks.task_comments?.length ? (
                detail.tasks.task_comments.map((comment: any) => (
                  <div className="relative text-sm" key={comment.id}>
                    <span className="absolute -left-[22px] top-1 h-2.5 w-2.5 rounded-full bg-teal-500" />
                    <b>{comment.author_profile?.full_name || "Employee"}</b>
                    <p>{comment.body}</p>
                    <small className="text-slate-500">
                      {new Date(comment.created_at).toLocaleString()}
                    </small>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  No progress comments yet.
                </p>
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
