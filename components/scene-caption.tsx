"use client";
import { useEffect, useState } from "react";
import { Leaf } from "lucide-react";

export default function SceneCaption({ name, onChange }: { name: string; onChange: () => void }) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const show = () => {
      setIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => setIdle(true), 15_000);
    };
    show();
    window.addEventListener("pointermove", show, { passive: true });
    window.addEventListener("pointerdown", show, { passive: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("pointermove", show);
      window.removeEventListener("pointerdown", show);
    };
  }, []);

  return (
    <span className="location-label" data-idle={idle}>
      <Leaf size={14} />
      <span className="location-name" title={name}>
        {name}
      </span>
      <span className="location-dot">·</span>
      <button onClick={onChange}>Change scenery</button>
    </span>
  );
}
