"use client";
import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { Task } from "@/lib/types";
import { groupTasks, isDueToday } from "@/lib/tasks";
import { localDateKey } from "@/lib/stats";
import { request } from "./use-workspace";
import Modal from "./modal";

export default function TaskImportDialog({
  onClose,
  onImport,
  importedIds,
}: {
  onClose: () => void;
  onImport: (taskIds: string[]) => Promise<void>;
  importedIds: string[];
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const today = localDateKey(new Date());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void request<{ tasks: Task[] }>("/api/todoist/sync")
      .then(({ tasks }) => {
        if (cancelled) return;
        setTasks(tasks);
        setSelected(
          new Set(tasks.filter((task) => isDueToday(task, today)).map((task) => task.id)),
        );
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setError(error instanceof Error ? error.message : "Couldn’t load Todoist tasks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry, today]);

  return (
    <Modal
      title="Choose tasks to import."
      subtitle="Tasks due today are selected. Choose what you want to bring into Pom."
      onClose={() => {
        if (!saving) onClose();
      }}
      wide
    >
      {loading ? (
        <p className="import-loading" role="status">
          <LoaderCircle size={18} className="spin" /> Loading your Todoist tasks…
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selected.size || saving) return;
            setSaving(true);
            setError("");
            try {
              await onImport([...selected]);
              onClose();
            } catch (error) {
              setError(
                error instanceof Error ? error.message : "Couldn’t import your tasks. Try again.",
              );
            } finally {
              setSaving(false);
            }
          }}
        >
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          {!!tasks.length && (
            <>
              <div className="import-selection-actions">
                <button
                  type="button"
                  className="text-link"
                  disabled={saving}
                  onClick={() =>
                    setSelected(new Set(tasks.filter((t) => isDueToday(t, today)).map((t) => t.id)))
                  }
                >
                  Select due today
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={saving}
                  onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-link"
                  disabled={saving}
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </div>
              <div className="import-task-list">
                {groupTasks(tasks, today).map((group) => (
                  <section className="task-group" key={group.id} aria-label={group.label}>
                    <h3 className="task-group-title">
                      {group.label} <span>{group.count}</span>
                    </h3>
                    {group.categories.map((category) => (
                      <div className="task-category" key={category.name}>
                        <h4 className="task-category-title">{category.name}</h4>
                        {category.tasks.map((task) => (
                          <label className="import-task-row" key={task.id}>
                            <input
                              type="checkbox"
                              checked={selected.has(task.id)}
                              disabled={saving}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setSelected((current) => {
                                  const next = new Set(current);
                                  if (checked) next.add(task.id);
                                  else next.delete(task.id);
                                  return next;
                                });
                              }}
                            />
                            <span>
                              <strong>{task.title}</strong>
                              <small>
                                {task.due
                                  ? new Date(
                                      `${task.due.slice(0, 10)}T12:00:00`,
                                    ).toLocaleDateString("en", { month: "short", day: "numeric" })
                                  : "No due date"}
                                {importedIds.includes(task.id) ? " · Already in Pom" : ""}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}
          {!tasks.length && !error && (
            <p className="import-loading">No active Todoist tasks to import.</p>
          )}
          {!tasks.length && error && (
            <button
              className="button secondary"
              type="button"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          )}
          <div className="import-footer">
            <span role="status">
              {selected.size} of {tasks.length} selected
            </span>
            <button className="button secondary" type="button" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" type="submit" disabled={saving || !selected.size}>
              {saving && <LoaderCircle size={16} className="spin" />}
              {saving
                ? "Importing…"
                : `Import ${selected.size} ${selected.size === 1 ? "task" : "tasks"}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
