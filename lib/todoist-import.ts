// Plan writes using provider-owned records so callers cannot import arbitrary task content.
export function planTodoistImport<T extends Record<string, unknown>>(
  active: T[],
  completed: T[],
  selectedIds: string[],
  importedIds: string[],
) {
  const selected = new Set(selectedIds);
  const imported = new Set(importedIds);
  const activeIds = new Set(active.map((task) => String(task.id)));
  const availableIds = new Set([...activeIds, ...completed.map((task) => String(task.id))]);
  const completions = completed.filter(
    (task) => selected.has(String(task.id)) || imported.has(String(task.id)),
  );
  return {
    active: active.filter((task) => selected.has(String(task.id))),
    completions,
    completedTaskIds: new Set(
      completions
        .filter((task) => !activeIds.has(String(task.id)) || selected.has(String(task.id)))
        .map((task) => String(task.id)),
    ),
    missingIds: [...selected].filter((id) => !availableIds.has(id)),
  };
}
