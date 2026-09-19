export type DrawingToolIconName =
  | "undo"
  | "redo"
  | "cursor"
  | "trend"
  | "horizontal"
  | "zone"
  | "fibonacci"
  | "measure"
  | "text"
  | "clear";

export default function DrawingToolIcon({ name }: { name: DrawingToolIconName }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "undo":
      return <svg {...common}><path d="M9 8 4 12l5 4" /><path d="M5 12h8a6 6 0 0 1 6 6" /></svg>;
    case "redo":
      return <svg {...common}><path d="m15 8 5 4-5 4" /><path d="M19 12h-8a6 6 0 0 0-6 6" /></svg>;
    case "cursor":
      return <svg {...common}><path d="m5 4 6.5 15 2.2-5.3L19 11.5 5 4Z" /></svg>;
    case "trend":
      return <svg {...common}><path d="M5 18 19 5" /><circle cx="5" cy="18" r="1.5" /><circle cx="19" cy="5" r="1.5" /></svg>;
    case "horizontal":
      return <svg {...common}><path d="M4 12h16" /><circle cx="6" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></svg>;
    case "zone":
      return <svg {...common}><rect x="4" y="6" width="16" height="12" rx="1.5" /><path d="M4 10h16" /></svg>;
    case "fibonacci":
      return <svg {...common}><path d="M4 5h16M4 9h16M4 13h16M4 17h16" /><path d="M7 3v18" /></svg>;
    case "measure":
      return <svg {...common}><path d="M12 4v16M9 7l3-3 3 3M9 17l3 3 3-3" /><path d="M6 8h3M6 16h3M15 8h3M15 16h3" /></svg>;
    case "text":
      return <svg {...common}><path d="M5 5h14M12 5v14M8 19h8" /></svg>;
    case "clear":
      return <svg {...common}><path d="m5 15 7-7 7 7-4 4H9l-4-4Z" /><path d="M3 21h18" /></svg>;
    default:
      return null;
  }
}
