"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight, Leaf, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import type { FocusSession, Task } from "@/lib/types";
import { formatMinutes } from "@/lib/stats";
import { sessionSchema } from "@/lib/validation";
import Modal from "./modal";

const PAGE_SIZE = 10;
function localDateTime(value: string) {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function EditSession({
  session,
  tasks,
  onSave,
  onClose,
}: {
  session: FocusSession;
  tasks: Task[];
  onSave: (session: FocusSession) => Promise<void>;
  onClose: () => void;
}) {
  const [start, setStart] = useState(localDateTime(session.startedAt));
  const [end, setEnd] = useState(localDateTime(session.endedAt));
  const [minutes, setMinutes] = useState(Math.floor(session.seconds / 60));
  const [seconds, setSeconds] = useState(session.seconds % 60);
  const [completed, setCompleted] = useState(session.completed);
  const [taskId, setTaskId] = useState(session.taskId || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title="Edit focus session"
      subtitle="Correct the log and your stats will update automatically."
      onClose={onClose}
    >
      <form
        className="session-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const startedAt = new Date(start),
            endedAt = new Date(end);
          if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime())) {
            setError("Enter a valid start and end time.");
            return;
          }
          const result = sessionSchema.safeParse({
            ...session,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
            seconds: minutes * 60 + seconds,
            completed,
            taskId: taskId || undefined,
            status: "finished",
          });
          if (!result.success) {
            setError(result.error.issues[0]?.message || "Check your session details.");
            return;
          }
          setSaving(true);
          try {
            await onSave(result.data);
            onClose();
          } catch (error) {
            setError(
              error instanceof Error ? error.message : "That didn’t save. Please try again.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Started at
          <input
            type="datetime-local"
            step="1"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          Ended at
          <input
            type="datetime-local"
            step="1"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <div className="session-duration-fields">
          <label>
            Focused minutes
            <input
              type="number"
              min="0"
              max="240"
              step="1"
              required
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
            />
          </label>
          <label>
            Focused seconds
            <input
              type="number"
              min="0"
              max="59"
              step="1"
              required
              value={seconds}
              onChange={(event) => setSeconds(Number(event.target.value))}
            />
          </label>
        </div>
        <p className="session-form-help">
          Include only focused time, excluding pauses. Dates and times use your local timezone.
        </p>
        <label>
          Task
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">No task</option>
            {taskId && !tasks.some((task) => task.id === taskId) && (
              <option value={taskId}>Previous task (removed)</option>
            )}
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </label>
        <label className="session-completed-field">
          <input
            type="checkbox"
            checked={completed}
            onChange={(event) => setCompleted(event.target.checked)}
          />
          Completed full session
        </label>
        {error && (
          <p className="session-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="session-dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving && <LoaderCircle size={15} className="spin" />}Save session
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function SessionHistory({
  sessions,
  tasks,
  currentSessionId,
  onEdit,
  onDelete,
}: {
  sessions: FocusSession[];
  tasks: Task[];
  currentSessionId?: string;
  onEdit: (session: FocusSession) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<FocusSession | null>(null);
  const [deleting, setDeleting] = useState<FocusSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sorted = [...sessions].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  return (
    <section className="recent-sessions panel" aria-label="Focus history">
      <div className="card-heading">
        <h2>Your focus history</h2>
        <span className="eyebrow">
          {sessions.length} {sessions.length === 1 ? "SESSION" : "SESSIONS"}
        </span>
      </div>
      {sorted.length ? (
        sorted.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((session) => {
          const current = session.id === currentSessionId;
          return (
            <div key={session.id} className="session-row">
              <span className="session-row-icon">
                <Leaf size={16} />
              </span>
              <div className="session-details">
                <strong>
                  {tasks.find((task) => task.id === session.taskId)?.title ||
                    "A little focused time"}
                </strong>
                <small>
                  {new Date(session.startedAt).toLocaleDateString("en", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
              <span
                className="session-duration"
                title={`${Math.floor(session.seconds / 60)}m ${session.seconds % 60}s focused`}
              >
                {session.seconds < 60 ? `${session.seconds}s` : formatMinutes(session.seconds / 60)}
              </span>
              <span className="session-state">
                {session.status === "active"
                  ? current
                    ? "In progress"
                    : "Unfinished"
                  : session.completed
                    ? "A full session"
                    : "A little progress"}
              </span>
              <div
                className="session-actions"
                title={current ? "Finish or reset this session to edit its log." : undefined}
              >
                <button
                  className="icon-button small"
                  aria-label="Edit focus session"
                  disabled={current}
                  onClick={() => setEditing(session)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button small"
                  aria-label="Delete focus session"
                  disabled={current}
                  onClick={() => {
                    setError("");
                    setDeleting(session);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <p className="history-empty">
          A fresh page. Start a focus session and make a little history.
        </p>
      )}
      {sorted.length > PAGE_SIZE && (
        <nav className="session-pagination" aria-label="Session history pages">
          <span>
            {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)}{" "}
            of {sorted.length} sessions
          </span>
          <button
            className="icon-button small"
            aria-label="Previous sessions"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button small"
            aria-label="Older sessions"
            disabled={currentPage === pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </nav>
      )}
      {editing && (
        <EditSession
          session={editing}
          tasks={tasks}
          onSave={onEdit}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <Modal
          title="Delete focus session?"
          subtitle="Removing this log also removes its focus time and completed session from your stats."
          onClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <p className="session-form-help">
            {formatMinutes(deleting.seconds / 60)} of focus on{" "}
            {new Date(deleting.startedAt).toLocaleString()}.
          </p>
          {error && (
            <p className="session-form-error" role="alert">
              {error}
            </p>
          )}
          <div className="session-dialog-actions">
            <button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>
              Keep session
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete(deleting.id);
                  setDeleting(null);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "That didn’t save. Please try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <LoaderCircle size={15} className="spin" /> : <Trash2 size={15} />}Delete
              session
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
