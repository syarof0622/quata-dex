// Tiny inline SVG sparkline. No external dep, fully fluid to container width.
// Used by the Dashboard / Market heatmap & indices to render a live mini-chart.
import { memo } from "react";

type Props = {
  values: number[];
  positive?: boolean;
  width?: number;        // viewBox width (logical units, not px)
  height?: number;       // rendered px height
  strokeWidth?: number;
  className?: string;
};

function SparklineImpl({
  values,
  positive,
  width = 200,
  height = 28,
  strokeWidth = 1.4,
  className,
}: Props) {
  if (!values || values.length < 2) {
    return (
      <div
        className={className}
        style={{ height, width: "100%" }}
        aria-hidden
      />
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 2) - 1;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const isUp = positive ?? values[values.length - 1] >= values[0];
  const stroke = isUp ? "rgb(16,185,129)" : "rgb(239,68,68)";
  const fill = isUp ? "rgba(16,185,129,0.18)" : "rgba(239,68,68,0.18)";
  const linePath = `M${points.join(" L")}`;
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;
  const last = points[points.length - 1].split(",").map(Number);
  const gradId = `sg-${isUp ? "u" : "d"}-${values.length}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      className={`block w-full ${className ?? ""}`}
      style={{ height, display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r={1.6} fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const Sparkline = memo(SparklineImpl);
