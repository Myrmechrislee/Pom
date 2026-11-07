import { CheckCheck, ListTodo, LoaderCircle } from "lucide-react";
import { groupTasks } from "@/lib/tasks";
import type { Task } from "@/lib/types";

export default function FocusTasks({
  tasks,
  today,
  selectedTaskId,
  pendingTask,
  onSelect,
  onComplete,
}: {
  tasks: Task[];
  today: string;
  selectedTaskId?: string;
  pendingTask: string | null;
  onSelect: (id: string) => void;
  onComplete: (task: Task) => Promise<void>;
}) {
  const groups = groupTasks(
    tasks.filter((task) => !task.completed),
    today,
  );
  const remaining = groups.reduce((count, group) => count + group.count, 0);

  return (
    <section className="zen-tasks" aria-label="Tasks to complete">
      <div className="zen-tasks-heading">
        <h2>
          <ListTodo size={17} aria-hidden="true" /> A little to-do
        </h2>
        <span aria-live="polite">{remaining} remaining</span>
      </div>
      {remaining > 0 ? (
        <ul className="zen-task-items">
          {groups.flatMap((group) =>
            group.categories.flatMap((category) =>
              category.tasks.map((task) => (
                <li
                  key={task.id}
                  className={`zen-task-row ${selectedTaskId === task.id ? "selected" : ""}`}
                >
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
                      {category.name} · {group.label}
                      {selectedTaskId === task.id && <span> · Focusing</span>}
                    </small>
                  </button>
                </li>
              )),
            ),
          )}
        </ul>
      ) : (
        <div className="zen-tasks-empty" role="status">
          <CheckCheck size={24} aria-hidden="true" />
          <p>
            {tasks.length
              ? "All tasks complete. A little room to breathe."
              : "Your list is clear. Add tasks in your workspace when you’re ready."}
          </p>
        </div>
      )}
    </section>
  );
}
