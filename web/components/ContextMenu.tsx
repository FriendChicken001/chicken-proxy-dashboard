"use client";

import { useEffect } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - 220);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - items.length * 36 - 12);

  return (
    <div
      className="fixed z-[40] min-w-[200px] bg-[var(--panel)] border border-[var(--border)] rounded-[9px] p-[5px] shadow-[0_16px_44px_rgba(0,0,0,0.5)]"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="h-px bg-[var(--border)] my-[5px] mx-[6px]" />
        ) : (
          <button
            key={i}
            className={`block w-full text-left bg-transparent border-none text-[var(--text)] px-3 py-2 rounded-[6px] text-[13px] cursor-pointer hover:bg-[var(--panel-2)] ${it.danger ? "hover:bg-[#361a1a] hover:text-[var(--red)]" : ""}`}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.label}
          </button>
        )
      )}
    </div>
  );
}
