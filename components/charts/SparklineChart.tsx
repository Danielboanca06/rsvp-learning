export function SparklineChart({ data, color = "var(--color-accent)" }: { data: number[]; color?: string }) {
  if (data.length === 0) {
    return <div className="flex h-20 items-center justify-center text-xs text-muted">No data yet</div>;
  }

  const width = 300;
  const height = 80;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data.map((value, index) => {
    const x = index * stepX;
    const y = height - ((value - min) / range) * (height - 8) - 4;
    return { x, y };
  });

  const linePath = `M${points.map((point) => `${point.x},${point.y}`).join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full overflow-visible" preserveAspectRatio="none">
      <path d={areaPath} fill={color} fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </svg>
  );
}
