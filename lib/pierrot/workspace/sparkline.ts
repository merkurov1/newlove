/**
 * Pure SVG sparkline geometry. No chart library, no artificial points.
 * Input must be the real daily series returned by the server loader.
 */

export type SparklinePoint = {
  x: number;
  y: number;
};

export type SparklineGeometry = {
  width: number;
  height: number;
  line: string;
  area: string;
  points: SparklinePoint[];
  max: number;
};

export function buildSparklineGeometry(
  series: number[],
  width = 160,
  height = 42,
  padding = 3
): SparklineGeometry | null {
  if (!Array.isArray(series) || series.length < 2) return null;

  const values = series.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0));
  const max = Math.max(...values);
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);

  const points = values.map((value, index) => {
    const x = padding + (usableWidth * index) / (values.length - 1);
    const ratio = max === 0 ? 0 : value / max;
    const y = padding + usableHeight - ratio * usableHeight;
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  });

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');

  const baseline = padding + usableHeight;
  const area = `${line} L${points[points.length - 1].x} ${baseline} L${points[0].x} ${baseline} Z`;

  return { width, height, line, area, points, max };
}
