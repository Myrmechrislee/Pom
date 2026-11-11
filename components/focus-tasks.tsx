import { CheckCheck, GripVertical, ListTodo, LoaderCircle, Search } from "lucide-react";
import { searchTasks, sortTasks, taskDueLabel } from "@/lib/tasks";
import type { Task } from "@/lib/types";
import { useTaskReorder } from "./use-task-reorder";
import TaskSearch from "./task-search";

export default function FocusTasks({
  tasks,
  search,
  onSearchChange,
  today,
  selectedTaskId,
  pendingTask,
  onSelect,
  onComplete,
  reordering,
  onReorder,
}: {
  tasks: Task[];
  search: string;
  onSearchChange: (value: string) => void;
  today: string;
  selectedTaskId?: string;
  pendingTask: string | null;
  onSelect: (id: string) => void;
  onComplete: (task: Task) => Promise<void>;
  reordering: boolean;
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const activeTasks = sortTasks(tasks, "manual", today).filter((task) => !task.completed);
  const remaining = activeTasks.length;
  const searching = search.trim().length > 0;
  const shownTasks = searchTasks(activeTasks, search);
  const reorder = useTaskReorder({
    tasks: shownTasks,
    disabled: reordering || pendingTask !== null,
    onReorder,
  });

  return (
    <section className="zen-tasks" aria-label="Tasks to complete">
      <div className="zen-tasks-heading">
        <h2>
          <ListTodo size={17} aria-hidden="true" /> A little to-do
        </h2>
        <span aria-live="polite" aria-atomic="true">
          {searching ? `${shownTasks.length} of ${remaining} remaining` : `${remaining} remaining`}
        </span>
      </div>
      <TaskSearch value={search} onChange={onSearchChange} />
      <span className="sr-only" id={reorder.instructionsId}>
        Drag to reorder. With a handle focused, use the Up and Down arrow keys to move a task.
      </span>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {reorder.announcement}
      </span>
      {shownTasks.length > 0 ? (
        <ul className="zen-task-items" data-reorder-list aria-busy={reordering}>
          {shownTasks.map((task) => (
            <li
              key={task.id}
              className={`zen-task-row ${selectedTaskId === task.id ? "selected" : ""}`}
              {...reorder.rowProps(task.id)}
            >
              <button {...reorder.handleProps(task)}>
                <GripVertical size={16} aria-hidden="true" />
              </button>
              <button
                className="zen-task-check"
                aria-label={`Complete ${task.title}`}
                disabled={pendingTask !== null}
                onClick={() => void onComplete(task)}
              >
                <span>
                  {pendingTask === task.id && (
                    <LoaderCircle size={14} className="spin" aria-hidden="true" />
                  )}
                </span>
              </button>
              <button
                className="zen-task-info"
                aria-label={`Focus on ${task.title}`}
                aria-pressed={selectedTaskId === task.id}
                onClick={() => onSelect(task.id)}
              >
                <span>{task.title}</span>
                <small>
                  {task.source === "todoist" && <span>Todoist · </span>}
                  {task.project || "Personal"} · {taskDueLabel(task, today)}
                  {selectedTaskId === task.id && <span> · Focusing</span>}
                </small>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="zen-tasks-empty" role="status">
          {searching ? (
            <Search size={24} aria-hidden="true" />
          ) : (
            <CheckCheck size={24} aria-hidden="true" />
          )}
          <p>
            {searching
              ? "No matching tasks. Try another search."
              : tasks.length
                ? "All tasks complete. A little room to breathe."
                : "Your list is clear. Add tasks in your workspace when you’re ready."}
          </p>
        </div>
      )}
    </section>
  );
}
