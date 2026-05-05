'use client';

/**
 * SVG chart primitives for the downloadable PDF.
 *
 * Built on @react-pdf/renderer's native <Svg> support — every chart is
 * a self-contained SVG component the PDF document can compose without
 * rasterizing anything. Keeps file size compact (~50-150KB) and
 * everything stays text-selectable / searchable.
 *
 * Charts mirror what the live UI renders so the customer sees the same
 * picture they signed off on in the modal.
 */

import React from 'react';
import {
  Svg,
  Path,
  Rect,
  Circle,
  Line,
  Polyline,
  G,
  Text as RawSvgText,
} from '@react-pdf/renderer';

// =========================================================================
// Typed SVG <Text> wrapper
// =========================================================================
//
// @react-pdf/renderer's SVGPresentationAttributes type doesn't declare
// fontSize / fontFamily / fontWeight even though they work fine at
// runtime. This wrapper accepts the full set we need and forwards via
// the style prop (which is what the renderer actually consumes).

interface SvgTextProps {
  x: number;
  y: number;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  textAnchor?: 'start' | 'middle' | 'end';
  transform?: string;
  children: React.ReactNode;
}

function SvgText({
  x,
  y,
  fill,
  fontSize = 8,
  fontFamily,
  textAnchor,
  transform,
  children,
}: SvgTextProps) {
  // The renderer accepts fontSize / fontFamily through `style` even
  // though the TS interface doesn't list them — cast through any to
  // satisfy the compiler without losing runtime behavior.
  const style: Record<string, unknown> = { fontSize };
  if (fill) style.fill = fill;
  if (fontFamily) style.fontFamily = fontFamily;
  if (textAnchor) style.textAnchor = textAnchor;
  if (transform) style.transform = transform;
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <RawSvgText x={x} y={y} style={style as any}>
      {children}
    </RawSvgText>
  );
}

import type { Supersector } from '@/lib/aave/composition';
import type {
  ReportFrontierPoint,
  ReportSamplePath,
  ReportShockResult,
} from '@/lib/report/types';

// =========================================================================
// Shared palette — must match the PDF body palette
// =========================================================================

export const CHART_COLORS = {
  bg: '#0a0a0a',
  card: '#161616',
  border: '#27272a',
  grid: '#1f1f23',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  accent: '#a855f7',
  safe: '#22c55e',
  caution: '#f59e0b',
  risky: '#ef4444',
  blue: '#3b82f6',
};

export function hfColor(hf: number): string {
  if (!Number.isFinite(hf)) return CHART_COLORS.safe;
  if (hf < 1.0) return CHART_COLORS.risky;
  if (hf < 1.2) return CHART_COLORS.risky;
  if (hf < 1.5) return CHART_COLORS.caution;
  return CHART_COLORS.safe;
}

const SUPERSECTOR_COLORS: Record<Supersector, string> = {
  Stablecoins: '#22c55e',
  'Smart Contract Platforms': '#3b82f6',
  Bitcoin: '#f59e0b',
  'Liquid Staking': '#a855f7',
  'Liquid Restaking': '#d946ef',
  DeFi: '#06b6d4',
  Infrastructure: '#0ea5e9',
  Memecoins: '#ec4899',
  Governance: '#84cc16',
  'Aave Receipt Tokens': '#8b5cf6',
  Other: '#71717a',
};

export function supersectorColor(s: Supersector | string): string {
  return SUPERSECTOR_COLORS[s as Supersector] ?? '#71717a';
}

// =========================================================================
// Health-factor gauge (semi-circle dial)
// =========================================================================

export function HfGauge({
  hf,
  width = 160,
  height = 100,
}: {
  hf: number;
  width?: number;
  height?: number;
}) {
  const cx = width / 2;
  const cy = height - 10;
  const r = Math.min(width / 2 - 8, height - 20);
  // Map HF [0..3] onto angle [180°..0°]. Anything >3 saturates at right.
  const clamped = Math.max(0, Math.min(3, hf));
  const t = clamped / 3;
  const angle = Math.PI - Math.PI * t;

  // Build colored arcs: red 0..1, amber 1..1.5, yellow 1.5..1.8, green 1.8..3
  const stops: Array<{ from: number; to: number; color: string }> = [
    { from: 0.0, to: 1.0, color: CHART_COLORS.risky },
    { from: 1.0, to: 1.5, color: CHART_COLORS.caution },
    { from: 1.5, to: 1.8, color: '#84cc16' },
    { from: 1.8, to: 3.0, color: CHART_COLORS.safe },
  ];

  const arcPath = (fromVal: number, toVal: number) => {
    const a0 = Math.PI - Math.PI * (fromVal / 3);
    const a1 = Math.PI - Math.PI * (toVal / 3);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy - r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy - r * Math.sin(a1);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };

  // Needle endpoint
  const needleX = cx + (r - 4) * Math.cos(angle);
  const needleY = cy - (r - 4) * Math.sin(angle);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Track outline */}
      <Path
        d={arcPath(0, 3)}
        stroke={CHART_COLORS.border}
        strokeWidth={10}
        fill="none"
      />
      {/* Colored zones */}
      {stops.map((s, i) => (
        <Path
          key={i}
          d={arcPath(s.from, s.to)}
          stroke={s.color}
          strokeWidth={8}
          fill="none"
          strokeOpacity={0.85}
        />
      ))}
      {/* Center hub */}
      <Circle cx={cx} cy={cy} r={4} fill={CHART_COLORS.text} />
      {/* Needle */}
      <Line
        x1={cx}
        y1={cy}
        x2={needleX}
        y2={needleY}
        stroke={CHART_COLORS.text}
        strokeWidth={2}
      />
      {/* Tick labels at 0, 1, 1.5, 3 */}
      {[0, 1, 1.5, 3].map((v, i) => {
        const a = Math.PI - Math.PI * (v / 3);
        const tx = cx + (r + 8) * Math.cos(a);
        const ty = cy - (r + 8) * Math.sin(a) + 3;
        return (
          <SvgText
            key={i}
            x={tx}
            y={ty}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="middle"
          >
            {v === 3 ? '3+' : v.toString()}
          </SvgText>
        );
      })}
      {/* HF value below */}
      <SvgText
        x={cx}
        y={cy - r / 2 - 2}
        fill={hfColor(hf)}
        fontSize={18}
        textAnchor="middle"
      >
        {Number.isFinite(hf) ? (hf > 100 ? '100+' : hf.toFixed(2)) : '∞'}
      </SvgText>
    </Svg>
  );
}

// =========================================================================
// Shock waterfall (3 horizontal bars: -10/-30/-50% scenarios)
// =========================================================================

export function ShockWaterfall({
  shocks,
  currentHf,
  width = 520,
  height = 130,
}: {
  shocks: ReportShockResult[];
  currentHf: number;
  width?: number;
  height?: number;
}) {
  const padLeft = 90;
  const padRight = 50;
  const chartW = width - padLeft - padRight;
  const rowH = (height - 10) / (shocks.length + 1);
  // Scale to max HF on the chart (current HF + a bit of headroom).
  const maxHf = Math.max(currentHf, ...shocks.map((s) => s.hf), 1.5) * 1.05;

  const rows: Array<{ label: string; hf: number; liquidatable: boolean }> = [
    { label: 'Today', hf: currentHf, liquidatable: false },
    ...shocks.map((s) => ({
      label: `${s.pctChange}% market`,
      hf: s.hf,
      liquidatable: s.liquidatable,
    })),
  ];

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Grid lines + axis labels at 0, 1, 1.5, 2 */}
      {[0, 1, 1.5, 2, Math.max(2.5, Math.ceil(maxHf))].map((v, i) => {
        const x = padLeft + (Math.min(v, maxHf) / maxHf) * chartW;
        return (
          <G key={i}>
            <Line
              x1={x}
              y1={4}
              x2={x}
              y2={height - 8}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <SvgText
              x={x}
              y={height - 1}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="middle"
            >
              {v.toFixed(v >= 1 ? 1 : 0)}
            </SvgText>
          </G>
        );
      })}
      {/* Liquidation reference line at HF=1 */}
      <Line
        x1={padLeft + (1 / maxHf) * chartW}
        y1={4}
        x2={padLeft + (1 / maxHf) * chartW}
        y2={height - 8}
        stroke={CHART_COLORS.risky}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <SvgText
        x={padLeft + (1 / maxHf) * chartW + 3}
        y={9}
        fill={CHART_COLORS.risky}
        fontSize={6}
      >
        LIQ
      </SvgText>

      {/* Rows */}
      {rows.map((r, i) => {
        const y = 14 + i * rowH;
        const w = Math.max(2, (Math.min(r.hf, maxHf) / maxHf) * chartW);
        return (
          <G key={i}>
            <SvgText
              x={padLeft - 4}
              y={y + 9}
              fill={CHART_COLORS.textMuted}
              fontSize={8}
              textAnchor="end"
            >
              {r.label}
            </SvgText>
            <Rect
              x={padLeft}
              y={y}
              width={w}
              height={12}
              fill={hfColor(r.hf)}
              rx={2}
            />
            <SvgText
              x={padLeft + w + 4}
              y={y + 9}
              fill={CHART_COLORS.text}
              fontSize={8}
            >
              {Number.isFinite(r.hf) ? r.hf.toFixed(2) : '∞'}
              {r.liquidatable ? '  LIQUIDATED' : ''}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Histogram of terminal HF distribution
// =========================================================================

export function MonteCarloHistogram({
  bins,
  counts,
  width = 520,
  height = 140,
}: {
  bins: number[];
  counts: number[];
  width?: number;
  height?: number;
}) {
  const padLeft = 28;
  const padRight = 6;
  const padTop = 6;
  const padBottom = 16;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const maxCount = Math.max(1, ...counts);
  const barW = chartW / bins.length;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = padTop + (1 - t) * chartH;
        return (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <SvgText
              x={padLeft - 3}
              y={y + 2}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="end"
            >
              {Math.round(maxCount * t)}
            </SvgText>
          </G>
        );
      })}
      {/* Bars */}
      {bins.map((upper, i) => {
        const c = counts[i] ?? 0;
        const h = (c / maxCount) * chartH;
        const x = padLeft + i * barW;
        const y = padTop + chartH - h;
        return (
          <Rect
            key={i}
            x={x + 0.5}
            y={y}
            width={Math.max(1, barW - 1)}
            height={h}
            fill={hfColor(upper)}
            rx={1}
          />
        );
      })}
      {/* X-axis labels — show every Nth bin to avoid crowding */}
      {bins.map((upper, i) => {
        if (i % Math.max(1, Math.floor(bins.length / 8)) !== 0 && i !== bins.length - 1) {
          return null;
        }
        const x = padLeft + i * barW + barW / 2;
        return (
          <SvgText
            key={i}
            x={x}
            y={height - 4}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="middle"
          >
            {upper.toFixed(1)}
          </SvgText>
        );
      })}
      {/* X-axis label */}
      <SvgText
        x={padLeft + chartW / 2}
        y={padTop - 1}
        fill={CHART_COLORS.textSubtle}
        fontSize={6}
        textAnchor="middle"
      >
        Terminal Health Factor (count of paths per bucket)
      </SvgText>
    </Svg>
  );
}

// =========================================================================
// Sample-paths line chart
// =========================================================================

export function SamplePathsChart({
  paths,
  horizonDays,
  width = 520,
  height = 160,
}: {
  paths: ReportSamplePath[];
  horizonDays: number;
  width?: number;
  height?: number;
}) {
  const padLeft = 24;
  const padRight = 6;
  const padTop = 6;
  const padBottom = 16;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const yMax = 5; // capped at 5 like the live chart

  const xFor = (day: number) => padLeft + (day / horizonDays) * chartW;
  const yFor = (hf: number) => padTop + (1 - Math.min(hf, yMax) / yMax) * chartH;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y gridlines (every HF unit) */}
      {[0, 1, 2, 3, 4, 5].map((v, i) => {
        const y = yFor(v);
        return (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <SvgText
              x={padLeft - 3}
              y={y + 2}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="end"
            >
              {v}
            </SvgText>
          </G>
        );
      })}
      {/* Liquidation line at HF=1 */}
      <Line
        x1={padLeft}
        y1={yFor(1)}
        x2={width - padRight}
        y2={yFor(1)}
        stroke={CHART_COLORS.risky}
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      <SvgText
        x={width - padRight - 1}
        y={yFor(1) - 2}
        fill={CHART_COLORS.risky}
        fontSize={6}
        textAnchor="end"
      >
        LIQ
      </SvgText>
      {/* Paths */}
      {paths.map((p, i) => {
        const points = p.daily
          .map((hf, day) => `${xFor(day).toFixed(2)},${yFor(hf).toFixed(2)}`)
          .join(' ');
        return (
          <Polyline
            key={i}
            points={points}
            stroke={p.liquidated ? CHART_COLORS.risky : '#a1a1aa'}
            strokeWidth={p.liquidated ? 0.7 : 0.4}
            strokeOpacity={p.liquidated ? 0.7 : 0.35}
            fill="none"
          />
        );
      })}
      {/* X-axis ticks */}
      {[0, Math.floor(horizonDays / 4), Math.floor(horizonDays / 2), Math.floor((3 * horizonDays) / 4), horizonDays].map((d, i) => {
        const x = xFor(d);
        return (
          <SvgText
            key={i}
            x={x}
            y={height - 4}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="middle"
          >
            {`d${d}`}
          </SvgText>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Efficient frontier scatter
// =========================================================================

export function EfficientFrontierScatter({
  points,
  width = 520,
  height = 200,
}: {
  points: ReportFrontierPoint[];
  width?: number;
  height?: number;
}) {
  const padLeft = 36;
  const padRight = 12;
  const padTop = 10;
  const padBottom = 24;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const xs = points.map((p) => p.annualizedVolatility * 100);
  const ys = points.map((p) => p.annualizedReturn * 100);
  const xMin = 0;
  const xMax = Math.max(1, ...xs) * 1.1;
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(1, ...ys) * 1.1;

  const xFor = (v: number) => padLeft + ((v - xMin) / (xMax - xMin)) * chartW;
  const yFor = (v: number) => padTop + (1 - (v - yMin) / (yMax - yMin)) * chartH;

  // Color per point — same logic as the live panel.
  const colorFor = (p: ReportFrontierPoint): string => {
    if (!p.feasible) return CHART_COLORS.risky;
    if (p.isCurrent) return CHART_COLORS.blue;
    if (p.isOptimal) return CHART_COLORS.safe;
    return CHART_COLORS.textSubtle;
  };

  // X-axis ticks (4 evenly spaced)
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => xMin + t * (xMax - xMin));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin));

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Grid */}
      {xTicks.map((v, i) => (
        <G key={`x${i}`}>
          <Line
            x1={xFor(v)}
            y1={padTop}
            x2={xFor(v)}
            y2={padTop + chartH}
            stroke={CHART_COLORS.grid}
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
          <SvgText
            x={xFor(v)}
            y={padTop + chartH + 9}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="middle"
          >
            {`${v.toFixed(0)}%`}
          </SvgText>
        </G>
      ))}
      {yTicks.map((v, i) => (
        <G key={`y${i}`}>
          <Line
            x1={padLeft}
            y1={yFor(v)}
            x2={padLeft + chartW}
            y2={yFor(v)}
            stroke={CHART_COLORS.grid}
            strokeWidth={0.5}
            strokeDasharray="2 2"
          />
          <SvgText
            x={padLeft - 3}
            y={yFor(v) + 2}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="end"
          >
            {`${v.toFixed(0)}%`}
          </SvgText>
        </G>
      ))}

      {/* Axis labels */}
      <SvgText
        x={padLeft + chartW / 2}
        y={height - 4}
        fill={CHART_COLORS.textMuted}
        fontSize={7}
        textAnchor="middle"
      >
        Annualized Volatility
      </SvgText>
      <SvgText
        x={8}
        y={padTop + chartH / 2}
        fill={CHART_COLORS.textMuted}
        fontSize={7}
        textAnchor="middle"
        transform={`rotate(-90 8 ${padTop + chartH / 2})`}
      >
        Expected Return (ann.)
      </SvgText>

      {/* Points */}
      {points.map((p, i) => {
        const cx = xFor(p.annualizedVolatility * 100);
        const cy = yFor(p.annualizedReturn * 100);
        const r = p.isCurrent || p.isOptimal ? 5 : 3;
        return (
          <G key={i}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              fill={colorFor(p)}
              stroke={p.isCurrent || p.isOptimal ? CHART_COLORS.text : 'none'}
              strokeWidth={p.isCurrent || p.isOptimal ? 1 : 0}
              opacity={p.feasible ? 1 : 0.5}
            />
            {(p.isCurrent || p.isOptimal) && (
              <SvgText
                x={cx + 7}
                y={cy + 2}
                fill={CHART_COLORS.text}
                fontSize={6}
              >
                {p.isCurrent ? 'current' : 'optimal'}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Drawdown histogram — terminal portfolio value bucketed as % loss/gain
// =========================================================================

export function DrawdownHistogram({
  bins,
  counts,
  initialUsd,
  width = 520,
  height = 140,
}: {
  /** Upper-edge USD value of each bucket. */
  bins: number[];
  counts: number[];
  initialUsd: number;
  width?: number;
  height?: number;
}) {
  const padLeft = 28;
  const padRight = 6;
  const padTop = 12;
  const padBottom = 26;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const maxCount = Math.max(1, ...counts);
  const barW = bins.length > 0 ? chartW / bins.length : chartW;

  // Color by % loss from initial: green (gain), yellow (mild loss), red (deep loss).
  const colorFor = (upperUsd: number): string => {
    const lossPct = ((initialUsd - upperUsd) / initialUsd) * 100;
    if (lossPct >= 30) return CHART_COLORS.risky;
    if (lossPct >= 10) return CHART_COLORS.caution;
    return CHART_COLORS.safe;
  };

  // Find x position of the "initial value" reference line.
  const findX = (usd: number) => {
    if (bins.length === 0) return padLeft;
    const lo = Math.min(...bins) - (bins[1] - bins[0] || 0);
    const hi = bins[bins.length - 1];
    const t = Math.max(0, Math.min(1, (usd - lo) / (hi - lo || 1)));
    return padLeft + t * chartW;
  };
  const breakEvenX = findX(initialUsd);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const y = padTop + (1 - t) * chartH;
        return (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <SvgText
              x={padLeft - 3}
              y={y + 2}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="end"
            >
              {Math.round(maxCount * t)}
            </SvgText>
          </G>
        );
      })}
      {/* Break-even reference line at initial portfolio value */}
      <Line
        x1={breakEvenX}
        y1={padTop}
        x2={breakEvenX}
        y2={padTop + chartH}
        stroke={CHART_COLORS.text}
        strokeWidth={0.7}
        strokeDasharray="3 3"
      />
      <SvgText
        x={breakEvenX + 3}
        y={padTop + 8}
        fill={CHART_COLORS.text}
        fontSize={6}
      >
        Break-even
      </SvgText>
      {/* Bars */}
      {bins.map((upper, i) => {
        const c = counts[i] ?? 0;
        const h = (c / maxCount) * chartH;
        const x = padLeft + i * barW;
        const y = padTop + chartH - h;
        return (
          <Rect
            key={i}
            x={x + 0.5}
            y={y}
            width={Math.max(1, barW - 1)}
            height={h}
            fill={colorFor(upper)}
            rx={1}
          />
        );
      })}
      {/* X-axis labels — show every Nth bin as % loss */}
      {bins.map((upper, i) => {
        if (i % Math.max(1, Math.floor(bins.length / 8)) !== 0 && i !== bins.length - 1) {
          return null;
        }
        const x = padLeft + i * barW + barW / 2;
        const lossPct = ((initialUsd - upper) / initialUsd) * 100;
        const label = lossPct >= 0 ? `−${lossPct.toFixed(0)}%` : `+${Math.abs(lossPct).toFixed(0)}%`;
        return (
          <SvgText
            key={i}
            x={x}
            y={height - 12}
            fill={CHART_COLORS.textSubtle}
            fontSize={6}
            textAnchor="middle"
          >
            {label}
          </SvgText>
        );
      })}
      <SvgText
        x={padLeft + chartW / 2}
        y={height - 2}
        fill={CHART_COLORS.textSubtle}
        fontSize={6}
        textAnchor="middle"
      >
        Terminal portfolio value (vs. start) · count of paths
      </SvgText>
    </Svg>
  );
}

// =========================================================================
// Portfolio sample-paths chart — % of initial value with drawdown lines
// =========================================================================

export function PortfolioPathsChart({
  paths,
  horizonDays,
  initialUsd,
  width = 520,
  height = 160,
}: {
  paths: Array<{ daily: number[]; breachedDrawdown: boolean }>;
  horizonDays: number;
  initialUsd: number;
  width?: number;
  height?: number;
}) {
  const padLeft = 28;
  const padRight = 8;
  const padTop = 6;
  const padBottom = 18;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // Y axis is % of initial. Cap at 200% upper, 0% lower (loss can't exceed 100%
  // for a long-only portfolio but room for paths that gain).
  const yMin = 0;
  const yMax = 200;

  const xFor = (day: number) => padLeft + (day / horizonDays) * chartW;
  const yFor = (pct: number) =>
    padTop + (1 - Math.max(yMin, Math.min(yMax, pct)) / yMax) * chartH;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {/* Y gridlines at 0/50/100/150/200 */}
      {[0, 50, 100, 150, 200].map((v, i) => {
        const y = yFor(v);
        return (
          <G key={i}>
            <Line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={CHART_COLORS.grid}
              strokeWidth={0.5}
              strokeDasharray="2 2"
            />
            <SvgText
              x={padLeft - 3}
              y={y + 2}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="end"
            >
              {`${v}%`}
            </SvgText>
          </G>
        );
      })}
      {/* Break-even at 100% */}
      <Line
        x1={padLeft}
        y1={yFor(100)}
        x2={width - padRight}
        y2={yFor(100)}
        stroke={CHART_COLORS.textSubtle}
        strokeWidth={0.8}
        strokeDasharray="3 3"
      />
      {/* -30% drawdown line */}
      <Line
        x1={padLeft}
        y1={yFor(70)}
        x2={width - padRight}
        y2={yFor(70)}
        stroke={CHART_COLORS.risky}
        strokeWidth={0.8}
        strokeDasharray="3 3"
      />
      <SvgText
        x={width - padRight - 1}
        y={yFor(70) - 2}
        fill={CHART_COLORS.risky}
        fontSize={6}
        textAnchor="end"
      >
        −30%
      </SvgText>
      {/* Paths */}
      {paths.map((p, i) => {
        const points = p.daily
          .map((usd, day) => {
            const pct = (usd / initialUsd) * 100;
            return `${xFor(day).toFixed(2)},${yFor(pct).toFixed(2)}`;
          })
          .join(' ');
        return (
          <Polyline
            key={i}
            points={points}
            stroke={p.breachedDrawdown ? CHART_COLORS.risky : '#a1a1aa'}
            strokeWidth={p.breachedDrawdown ? 0.8 : 0.4}
            strokeOpacity={p.breachedDrawdown ? 0.7 : 0.3}
            fill="none"
          />
        );
      })}
      {/* X-axis ticks */}
      {[0, Math.floor(horizonDays / 4), Math.floor(horizonDays / 2), Math.floor((3 * horizonDays) / 4), horizonDays].map(
        (d, i) => {
          const x = xFor(d);
          return (
            <SvgText
              key={i}
              x={x}
              y={height - 4}
              fill={CHART_COLORS.textSubtle}
              fontSize={6}
              textAnchor="middle"
            >
              {`d${d}`}
            </SvgText>
          );
        }
      )}
    </Svg>
  );
}

// =========================================================================
// Asset class donut + legend dots
// =========================================================================

export function AssetClassDonut({
  rows,
  size = 130,
}: {
  rows: Array<{ supersector: string; usd: number; pct: number }>;
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 2;
  const rInner = size / 2 - 22;

  // Build pie slices using SVG arcs
  const total = rows.reduce((acc, r) => acc + r.usd, 0);
  let acc = 0;

  const slicePath = (startFrac: number, endFrac: number) => {
    if (endFrac - startFrac >= 0.9999) {
      // Full circle — render as two halves to avoid degenerate arc
      return `M ${cx + rOuter} ${cy}
              A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy}
              A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy}
              M ${cx + rInner} ${cy}
              A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}
              A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy} Z`;
    }
    const a0 = -Math.PI / 2 + 2 * Math.PI * startFrac;
    const a1 = -Math.PI / 2 + 2 * Math.PI * endFrac;
    const x0 = cx + rOuter * Math.cos(a0);
    const y0 = cy + rOuter * Math.sin(a0);
    const x1 = cx + rOuter * Math.cos(a1);
    const y1 = cy + rOuter * Math.sin(a1);
    const x2 = cx + rInner * Math.cos(a1);
    const y2 = cy + rInner * Math.sin(a1);
    const x3 = cx + rInner * Math.cos(a0);
    const y3 = cy + rInner * Math.sin(a0);
    const large = endFrac - startFrac > 0.5 ? 1 : 0;
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)}
            A ${rOuter} ${rOuter} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}
            L ${x2.toFixed(2)} ${y2.toFixed(2)}
            A ${rInner} ${rInner} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)} Z`;
  };

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rows.map((r, i) => {
        const startFrac = acc / total;
        acc += r.usd;
        const endFrac = acc / total;
        return (
          <Path
            key={i}
            d={slicePath(startFrac, endFrac)}
            fill={supersectorColor(r.supersector)}
            stroke={CHART_COLORS.bg}
            strokeWidth={1}
          />
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Horizontal bar chart (used for sector + market cap)
// =========================================================================

export function HorizontalBars({
  rows,
  width = 260,
  rowHeight = 14,
}: {
  rows: Array<{ label: string; pct: number; color: string }>;
  width?: number;
  rowHeight?: number;
}) {
  const padLeft = 90;
  const labelW = 84;
  const valueW = 28;
  const chartW = width - padLeft - valueW - 2;
  const height = rows.length * rowHeight + 4;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {rows.map((r, i) => {
        const y = i * rowHeight + 2;
        const w = Math.max(1, (r.pct / 100) * chartW);
        const truncated = r.label.length > 18 ? r.label.slice(0, 17) + '…' : r.label;
        return (
          <G key={i}>
            <SvgText
              x={padLeft - 4}
              y={y + rowHeight / 2 + 3}
              fill={CHART_COLORS.textMuted}
              fontSize={7}
              textAnchor="end"
            >
              {truncated}
            </SvgText>
            <Rect
              x={padLeft}
              y={y + 2}
              width={w}
              height={rowHeight - 4}
              fill={r.color}
              rx={1.5}
            />
            <SvgText
              x={padLeft + chartW + 2}
              y={y + rowHeight / 2 + 3}
              fill={CHART_COLORS.text}
              fontSize={7}
            >
              {`${r.pct.toFixed(1)}%`}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Color-coded correlation heatmap
// =========================================================================

export function CorrelationHeatmap({
  symbols,
  matrix,
  width = 520,
}: {
  symbols: string[];
  matrix: number[][];
  width?: number;
}) {
  const labelW = 56;
  const cellSize = Math.min(48, (width - labelW) / symbols.length);
  const totalSize = labelW + cellSize * symbols.length;
  const headerH = 18;
  const height = headerH + cellSize * symbols.length;

  const cellColor = (rho: number): string => {
    if (!Number.isFinite(rho)) return CHART_COLORS.card;
    const clamped = Math.max(-1, Math.min(1, rho));
    if (clamped >= 0) {
      // 0 → dark, +1 → cyan/blue
      const t = clamped;
      const r = Math.round(50 - t * 30);
      const g = Math.round(100 + t * 60);
      const b = Math.round(150 + t * 100);
      return `rgb(${r},${g},${b})`;
    } else {
      // 0 → dark, -1 → red
      const t = -clamped;
      const r = Math.round(150 + t * 100);
      const g = Math.round(60 + t * 10);
      const b = Math.round(60 + t * 10);
      return `rgb(${r},${g},${b})`;
    }
  };

  const truncate = (s: string) => (s.length > 6 ? s.slice(0, 5) + '…' : s);

  return (
    <Svg width={totalSize} height={height} viewBox={`0 0 ${totalSize} ${height}`}>
      {/* Column headers */}
      {symbols.map((s, j) => (
        <SvgText
          key={`h${j}`}
          x={labelW + j * cellSize + cellSize / 2}
          y={headerH - 4}
          fill={CHART_COLORS.textMuted}
          fontSize={7}
          textAnchor="middle"
        >
          {truncate(s)}
        </SvgText>
      ))}
      {/* Rows */}
      {matrix.map((row, i) => {
        const y = headerH + i * cellSize;
        return (
          <G key={`r${i}`}>
            {/* Row label */}
            <SvgText
              x={labelW - 4}
              y={y + cellSize / 2 + 3}
              fill={CHART_COLORS.textMuted}
              fontSize={7}
              textAnchor="end"
            >
              {truncate(symbols[i])}
            </SvgText>
            {/* Cells */}
            {row.map((rho, j) => {
              const x = labelW + j * cellSize;
              const isDiag = i === j;
              return (
                <G key={`c${i}-${j}`}>
                  <Rect
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    fill={cellColor(rho)}
                    stroke={CHART_COLORS.bg}
                    strokeWidth={0.5}
                  />
                  <SvgText
                    x={x + cellSize / 2}
                    y={y + cellSize / 2 + 3}
                    fill={
                      Math.abs(rho) > 0.3 || isDiag
                        ? CHART_COLORS.text
                        : CHART_COLORS.textMuted
                    }
                    fontSize={7}
                    textAnchor="middle"
                  >
                    {isDiag ? '1.00' : rho.toFixed(2)}
                  </SvgText>
                </G>
              );
            })}
          </G>
        );
      })}
    </Svg>
  );
}

// =========================================================================
// Color-scale legend (small, shown under heatmap)
// =========================================================================

export function CorrelationLegend({ width = 200 }: { width?: number }) {
  const height = 14;
  const stops = 21;
  const swatch = (width - 60) / stops;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <SvgText x={0} y={10} fill={CHART_COLORS.textSubtle} fontSize={6}>
        −1
      </SvgText>
      {Array.from({ length: stops }, (_, i) => {
        const v = -1 + (i / (stops - 1)) * 2;
        const r = v >= 0 ? 50 - v * 30 : 150 - v * 100;
        const g = v >= 0 ? 100 + v * 60 : 60 - v * 10;
        const b = v >= 0 ? 150 + v * 100 : 60 - v * 10;
        return (
          <Rect
            key={i}
            x={20 + i * swatch}
            y={3}
            width={swatch}
            height={8}
            fill={`rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`}
          />
        );
      })}
      <SvgText x={width - 18} y={10} fill={CHART_COLORS.textSubtle} fontSize={6}>
        +1
      </SvgText>
    </Svg>
  );
}
