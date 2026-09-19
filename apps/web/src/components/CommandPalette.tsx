import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  rankCommandEntries,
  type CommandPaletteDescriptor,
} from "../lib/commandPalette";

export type CommandPaletteItem =
  CommandPaletteDescriptor & {
    onSelect: () => void;
  };

type Props = {
  open: boolean;
  items: CommandPaletteItem[];
  onClose: () => void;
};

export default function CommandPalette({
  open,
  items,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const results = useMemo(
    () => rankCommandEntries(items, query, 16),
    [items, query],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    if (activeIndex < results.length) return;
    setActiveIndex(Math.max(0, results.length - 1));
  }, [activeIndex, results.length]);

  if (!open) return null;

  const execute = (item: CommandPaletteItem) => {
    item.onSelect();
    onClose();
  };

  return (
    <div
      className="command-palette-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="MarketOS Command Palette"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((value) =>
            results.length === 0
              ? 0
              : (value + 1) % results.length,
          );
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((value) =>
            results.length === 0
              ? 0
              : (value - 1 + results.length) % results.length,
          );
          return;
        }

        if (event.key === "Enter") {
          const item = results[activeIndex];
          if (!item) return;
          event.preventDefault();
          execute(item);
        }
      }}
    >
      <button
        className="command-palette-backdrop"
        aria-label="إغلاق"
        onClick={onClose}
      />

      <section className="command-palette-panel" dir="rtl">
        <header className="command-palette-search">
          <span className="command-palette-search-icon">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="ابحث عن رمز، فريم، أداة أو أمر…"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </header>

        <div className="command-palette-results">
          {results.map((item, index) => (
            <button
              key={item.id}
              className={
                index === activeIndex
                  ? "command-palette-row active"
                  : "command-palette-row"
              }
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => execute(item)}
            >
              <span className="command-palette-main">
                <strong>{item.label}</strong>
                {item.description ? (
                  <small>{item.description}</small>
                ) : null}
              </span>

              <span className="command-palette-meta">
                {item.badge ? <b>{item.badge}</b> : null}
                <em>{item.group}</em>
                {item.shortcut ? <kbd>{item.shortcut}</kbd> : null}
              </span>
            </button>
          ))}

          {results.length === 0 ? (
            <div className="command-palette-empty">
              <span>⌕</span>
              <strong>ما لقينا أمر مطابق</strong>
              <small>
                جرّب اسم رمز، فريم مثل 4H، أو كلمة مثل تنبيهات أو تصدير.
              </small>
            </div>
          ) : null}
        </div>

        <footer className="command-palette-footer">
          <span>↑ ↓ للتنقل</span>
          <span>Enter للتنفيذ</span>
          <span>Ctrl/Cmd + K للفتح</span>
        </footer>
      </section>
    </div>
  );
}
