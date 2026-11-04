import { buildSparklineGeometry } from '@/lib/pierrot/workspace/sparkline';

export default function Sparkline({
  series,
  label,
}: {
  series: number[] | null;
  label: string;
}) {
  const geometry = series ? buildSparklineGeometry(series) : null;

  if (!geometry) {
    return <div className="pw-spark-empty">нет ряда</div>;
  }

  return (
    <div className="pw-spark">
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        role="img"
        aria-label={`${label}: динамика за период`}
        preserveAspectRatio="none"
      >
        <path className="pw-spark-area" d={geometry.area} />
        <path className="pw-spark-line" d={geometry.line} />
      </svg>
    </div>
  );
}
