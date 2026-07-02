import { cn } from "@/lib/utils";

/**
 * A tiny SVG polyline — no library, no axes, no fuss. Meant to sit inline in
 * a row and hint at shape (spike? steady? empty?) without competing with the
 * numbers next to it.
 */
export function Sparkline({
  data,
  width = 80,
  height = 22,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        aria-hidden
        className={cn("text-muted-foreground/40", className)}
      >
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="1 3" strokeWidth={1} />
      </svg>
    );
  }

  const max = Math.max(...data, 1);
  const pad = 1.5;
  const stepX = data.length > 1 ? (width - pad * 2) / (data.length - 1) : 0;
  const points = data
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - (v / max) * (height - pad * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Area fill: repeat the line, then close it down to the baseline.
  const areaPoints = `${pad.toFixed(2)},${(height - pad).toFixed(2)} ${points} ${(pad + (data.length - 1) * stepX).toFixed(2)},${(height - pad).toFixed(2)}`;

  const hasSignal = data.some((v) => v > 0);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      {hasSignal ? (
        <>
          <polyline points={areaPoints} fill="hsl(var(--moss) / 0.15)" stroke="none" />
          <polyline points={points} fill="none" stroke="hsl(var(--moss))" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <line
          x1={pad}
          y1={height - pad}
          x2={width - pad}
          y2={height - pad}
          stroke="hsl(var(--muted-foreground) / 0.4)"
          strokeDasharray="1 3"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}
