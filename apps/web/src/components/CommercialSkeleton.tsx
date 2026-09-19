type Props = {
  rows?: number;
  compact?: boolean;
  label?: string;
};

export default function CommercialSkeleton({
  rows = 5,
  compact = false,
  label = "جاري التحميل",
}: Props) {
  return (
    <div className={compact ? "commercial-skeleton compact" : "commercial-skeleton"} aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="commercial-skeleton-row" key={index}>
          <span className="commercial-skeleton-avatar" />
          <span className="commercial-skeleton-lines">
            <i />
            <i />
          </span>
          <span className="commercial-skeleton-value" />
        </div>
      ))}
    </div>
  );
}
