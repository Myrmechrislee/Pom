import { useRef } from "react";
import { Search, X } from "lucide-react";

export default function TaskSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="task-search">
      <Search size={15} aria-hidden="true" />
      <input
        ref={input}
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks or projects…"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear task search"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
