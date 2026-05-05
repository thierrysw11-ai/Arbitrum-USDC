'use client';

/**
 * Branded PDF report — what the customer downloads after the premium
 * Sentinel Elite Analysis. This is the artifact that justifies the
 * price: a multi-page document they can save, email, share, or feed
 * into another AI tool as context.
 *
 * Built with @react-pdf/renderer (client-side; no server cost). All
 * charts are drawn with native <Svg> primitives so the file stays
 * compact (~80–200 KB) and text remains selectable / searchable.
 *
 * Page sequence (each conditional on data being present):
 *   1. Cover         — branding, wallet, date, executive summary, x402 receipt
 *   2. Aave V3 Risk  — HF gauge, key metrics, position table, shock waterfall
 *   3. Monte Carlo   — distribution histogram + 50-path sparklines + verdict
 *   4. Risk-adj.     — Sharpe block + efficient-frontier scatter + recommendation
 *   5. Composition   — concentration, asset-class donut + table, sector + market-cap bars
 *   6. Top Holdings  — ranked table with sector tags
 *   7. Correlation   — color-coded heatmap + plain-English verdict
 *   8. Wallet        — per-chain native + ERC-20 breakdown, spam separated
 *   9. AI Narrative  — the Sentinel agent's structured prose assessment
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';

import type { ReportData } from '@/lib/report/types';
import {
  AssetClassDonut,
  CHART_COLORS,
  CorrelationHeatmap,
  CorrelationLegend,
  DrawdownHistogram,
  EfficientFrontierScatter,
  HfGauge,
  HorizontalBars,
  MonteCarloHistogram,
  PortfolioPathsChart,
  SamplePathsChart,
  ShockWaterfall,
  hfColor,
  supersectorColor,
} from './report/ReportCharts';

// =========================================================================
// Palette + base styles
// =========================================================================

const COLORS = {
  bg: CHART_COLORS.bg,
  card: CHART_COLORS.card,
  border: CHART_COLORS.border,
  text: CHART_COLORS.text,
  textMuted: CHART_COLORS.textMuted,
  textSubtle: CHART_COLORS.textSubtle,
  accent: CHART_COLORS.accent,
  accentLight: '#c084fc',
  safe: CHART_COLORS.safe,
  caution: CHART_COLORS.caution,
  risky: CHART_COLORS.risky,
  collateral: CHART_COLORS.safe,
  debt: CHART_COLORS.risky,
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: COLORS.bg,
    color: COLORS.text,
    fontFamily: 'Helvetica',
    fontSize: 10,
  },
  header: {
    marginBottom: 18,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.accent,
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: 7,
    color: COLORS.textSubtle,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  pageNum: {
    fontSize: 8,
    color: COLORS.textSubtle,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 9,
    color: COLORS.textMuted,
    marginBottom: 14,
  },
  subTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginBottom: 6,
    marginTop: 8,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 8,
  },
  metricLabel: {
    fontSize: 7,
    color: COLORS.textSubtle,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
  },
  metricHint: {
    fontSize: 7,
    color: COLORS.textSubtle,
    marginTop: 2,
  },
  table: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1a1a1a',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textSubtle,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableCell: {
    fontSize: 9,
    color: COLORS.text,
  },
  paragraph: {
    fontSize: 10,
    color: COLORS.text,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom: 3,
    paddingLeft: 4,
  },
  bulletDot: {
    color: COLORS.textSubtle,
    marginRight: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: COLORS.text,
    lineHeight: 1.4,
  },
  recommendBox: {
    backgroundColor: '#1a0f2e',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 6,
    padding: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  recommendLabel: {
    fontSize: 7,
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLORS.textSubtle,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  legendDot: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
});

// =========================================================================
// Format helpers
// =========================================================================

const fmtUsd = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const fmtPct = (n: number, decimals = 2): string => `${n.toFixed(decimals)}%`;

const fmtHf = (n: number): string => {
  if (!Number.isFinite(n)) return '∞';
  if (n > 100) return '100+';
  return n.toFixed(2);
};

const shortAddr = (addr: string): string =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const fmtDate = (d: Date): string =>
  d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const fmtToken = (n: number | null): string => {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
};

// =========================================================================
// Cover page
// =========================================================================

function CoverPage({ data }: { data: ReportData }) {
  const totalCollateral = data.aave?.totalCollateralUsd ?? 0;
  const walletTotal = data.composition?.composition.totalUsd ?? 0;
  const totalAssets = totalCollateral + walletTotal;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>USDC GUARDIAN</Text>
          <Text style={styles.brandTagline}>DeFi Portfolio Reports</Text>
        </View>
        <Text style={styles.pageNum}>1</Text>
      </View>

      <View style={{ marginTop: 50 }}>
        <Text
          style={{
            fontSize: 9,
            color: COLORS.textSubtle,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Sentinel Elite Risk Assessment
        </Text>
        <Text
          style={{
            fontSize: 32,
            fontFamily: 'Helvetica-Bold',
            color: COLORS.text,
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Portfolio Report
        </Text>

        <View
          style={{
            paddingTop: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            marginBottom: 18,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 9, color: COLORS.textSubtle }}>Wallet</Text>
            <Text style={{ fontSize: 11, fontFamily: 'Courier-Bold', color: COLORS.text }}>
              {shortAddr(data.meta.walletAddress)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontSize: 9, color: COLORS.textSubtle }}>Generated</Text>
            <Text style={{ fontSize: 11, color: COLORS.text }}>
              {fmtDate(data.meta.generatedAt)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 9, color: COLORS.textSubtle }}>Total assets analyzed</Text>
            <Text
              style={{
                fontSize: 14,
                fontFamily: 'Helvetica-Bold',
                color: COLORS.accent,
              }}
            >
              {fmtUsd(totalAssets)}
            </Text>
          </View>
        </View>

        <Text style={[styles.metricLabel, { marginBottom: 6 }]}>Executive summary</Text>
        <Text style={styles.paragraph}>
          {buildExecutiveSummary(data)}
        </Text>

        <Text style={[styles.metricLabel, { marginTop: 14, marginBottom: 6 }]}>
          What's in this report
        </Text>
        <View>
          {[
            data.aave && 'Aave V3 risk profile with HF gauge and stress-test waterfall',
            data.monteCarlo && 'Aave-leverage Monte Carlo: HF distribution, sample paths, P(liquidation)',
            data.monteCarlo && 'Aave risk-adjusted return (Sharpe) and efficient-frontier sweep',
            data.portfolioMc && 'Portfolio drawdown simulation: VaR, expected shortfall, P(loss)',
            data.portfolioMc && 'Quant metrics: stddev, variance, Sortino, Beta, Jensen’s Alpha, Treynor',
            data.composition && 'Portfolio composition: asset classes, sectors, market caps, top holdings',
            data.correlation && 'Pairwise asset correlation heatmap',
            data.wallet && 'Per-chain wallet holdings with spam-token separation',
            data.narrative && 'AI-generated structured risk narrative',
          ]
            .filter(Boolean)
            .map((line, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>·</Text>
                <Text style={styles.bulletText}>{line as string}</Text>
              </View>
            ))}
        </View>
      </View>

      {data.meta.settlementTxHash && (
        <View
          style={{
            position: 'absolute',
            left: 36,
            right: 36,
            bottom: 50,
            padding: 8,
            backgroundColor: COLORS.card,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginBottom: 2 }}>
            x402 settlement
          </Text>
          <Text style={{ fontSize: 7, fontFamily: 'Courier', color: COLORS.text }}>
            {data.meta.settlementTxHash}
          </Text>
          <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 2 }}>
            On-chain receipt for the 0.01 USDC payment that unlocked this report
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text>USDC Guardian — DeFi Portfolio Reports</Text>
        <Text>Not investment advice · Generated from on-chain data</Text>
      </View>
    </Page>
  );
}

function buildExecutiveSummary(data: ReportData): string {
  const parts: string[] = [];
  if (data.aave) {
    const hf = fmtHf(data.aave.healthFactor);
    parts.push(
      `Active Aave V3 position on ${data.aave.chainName} with ${fmtUsd(data.aave.totalCollateralUsd)} collateral, ${fmtUsd(data.aave.totalDebtUsd)} debt, health factor ${hf}.`
    );
  }
  if (data.monteCarlo) {
    parts.push(
      `Aave-leverage Monte Carlo (${data.monteCarlo.horizonDays}d): ${fmtPct(data.monteCarlo.pLiquidation * 100)} probability of liquidation.`
    );
  }
  if (data.portfolioMc) {
    const mc = data.portfolioMc;
    parts.push(
      `Portfolio drawdown simulation (${mc.horizonDays}d): Value-at-Risk (95%) of ${fmtPct(mc.var95Pct, 1)}, ${fmtPct(mc.pLossGte.p20 * 100, 1)} probability of losing ≥20%.`
    );
  }
  if (data.composition) {
    const c = data.composition.composition;
    parts.push(
      `Wider portfolio is ${c.concentration?.verdict ?? 'analyzed'} — top-3 share ${fmtPct(c.concentration?.topThreePct ?? 0, 1)}, effective N = ${(c.concentration?.effectiveN ?? 0).toFixed(1)}.`
    );
  }
  if (data.correlation) {
    parts.push(
      `Average pairwise correlation: ${data.correlation.averagePairwise.toFixed(2)}.`
    );
  }
  if (parts.length === 0) {
    return 'Insufficient data for an executive summary.';
  }
  return parts.join(' ');
}

// =========================================================================
// Aave V3 page — gauge + metrics + position table + shock waterfall
// =========================================================================

function AavePage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.aave) return null;
  const a = data.aave;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Aave V3 Risk Profile</Text>
      <Text style={styles.sectionSubtitle}>
        Live position on {a.chainName} · read directly from the Aave V3 Pool contract
      </Text>

      {/* HF gauge alongside the metric grid */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
        <View
          style={{
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 6,
            padding: 8,
            alignItems: 'center',
            justifyContent: 'center',
            width: 170,
          }}
        >
          <Text style={styles.metricLabel}>Health Factor</Text>
          <HfGauge hf={a.healthFactor} width={150} height={90} />
          <Text style={{ fontSize: 7, color: COLORS.textSubtle }}>
            Liquidation at HF &lt; 1.00
          </Text>
        </View>

        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <MetricCard
              label="Total Collateral"
              value={fmtUsd(a.totalCollateralUsd)}
              color={COLORS.collateral}
            />
            <MetricCard
              label="Total Debt"
              value={fmtUsd(a.totalDebtUsd)}
              color={COLORS.debt}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <MetricCard
              label="Liq Threshold"
              value={`${a.liquidationThresholdPct.toFixed(2)}%`}
              color={COLORS.text}
            />
            <MetricCard
              label="Max LTV"
              value={`${a.maxLtvPct.toFixed(2)}%`}
              color={COLORS.text}
            />
            <MetricCard
              label="Net Worth"
              value={fmtUsd(a.totalCollateralUsd - a.totalDebtUsd)}
              color={COLORS.accent}
            />
          </View>
        </View>
      </View>

      {/* Per-asset positions */}
      {a.positions.length > 0 && (
        <View>
          <Text style={[styles.metricLabel, { marginTop: 4, marginBottom: 4 }]}>
            Per-asset positions
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Asset</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Supplied</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Borrowed</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Liq Price</Text>
            </View>
            {a.positions.map((p, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Courier-Bold' }]}>
                  {p.symbol}
                </Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                  {p.suppliedUsd > 0 ? fmtUsd(p.suppliedUsd) : '—'}
                </Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                  {p.borrowedUsd > 0 ? fmtUsd(p.borrowedUsd) : '—'}
                </Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                  {p.liquidationPriceUsd !== null ? fmtUsd(p.liquidationPriceUsd) : '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Shock waterfall — only when there are non-stable assets */}
      {a.shocks.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.metricLabel}>
            Stress test — Health Factor under market-wide non-stable shocks
          </Text>
          <View
            style={{
              backgroundColor: COLORS.card,
              borderWidth: 1,
              borderColor: COLORS.border,
              borderRadius: 6,
              padding: 8,
              marginTop: 4,
            }}
          >
            <ShockWaterfall
              shocks={a.shocks}
              currentHf={a.healthFactor}
              width={510}
              height={120}
            />
            <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 4 }}>
              Multiplicative price shock applied to every non-stable collateral. Stables held
              flat. The dashed red line marks HF = 1 (liquidation).
            </Text>
          </View>
        </View>
      )}

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Monte Carlo page 1 — metrics + histogram + sample paths
// =========================================================================

function MonteCarloDistributionPage({
  data,
  pageNum,
}: {
  data: ReportData;
  pageNum: number;
}) {
  if (!data.monteCarlo) return null;
  const mc = data.monteCarlo;
  const fmtPctSimple = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Monte Carlo Risk Simulation</Text>
      <Text style={styles.sectionSubtitle}>
        {mc.paths} GBM-simulated price paths over {mc.horizonDays} days · daily resolution · realized volatilities per asset
      </Text>

      <View style={styles.metricGrid}>
        <MetricCard
          label="P(Liquidation)"
          value={fmtPctSimple(mc.pLiquidation)}
          color={mc.pLiquidation > 0.05 ? COLORS.risky : mc.pLiquidation > 0.01 ? COLORS.caution : COLORS.safe}
        />
        <MetricCard
          label="5th Percentile HF"
          value={fmtHf(mc.percentiles.p5)}
          color={hfColor(mc.percentiles.p5)}
        />
        <MetricCard
          label="Median HF"
          value={fmtHf(mc.percentiles.p50)}
          color={hfColor(mc.percentiles.p50)}
        />
        <MetricCard
          label="Expected HF"
          value={fmtHf(mc.expectedHf)}
          color={hfColor(mc.expectedHf)}
        />
      </View>

      {/* Histogram */}
      <View style={styles.card}>
        <Text style={styles.metricLabel}>Terminal Health Factor Distribution</Text>
        <MonteCarloHistogram
          bins={mc.histogram.bins}
          counts={mc.histogram.counts}
          width={510}
          height={130}
        />
      </View>

      {/* Sample paths */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.metricLabel}>
            {mc.samplePaths.length} sample paths · {mc.horizonDays}-day horizon
          </Text>
          <Text style={{ fontSize: 7, color: COLORS.risky, fontFamily: 'Helvetica-Bold' }}>
            Liquidation: HF &lt; 1.00
          </Text>
        </View>
        <SamplePathsChart
          paths={mc.samplePaths}
          horizonDays={mc.horizonDays}
          width={510}
          height={150}
        />
      </View>

      <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 4 }}>
        Shocked assets: {mc.shockedAssets.length > 0 ? mc.shockedAssets.join(', ') : 'none (stable-only position)'}
      </Text>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Monte Carlo page 2 — verdict + recommendation + Sharpe + frontier
// =========================================================================

function MonteCarloAnalysisPage({
  data,
  pageNum,
}: {
  data: ReportData;
  pageNum: number;
}) {
  if (!data.monteCarlo) return null;
  const mc = data.monteCarlo;
  const levelColor =
    mc.interpretation.level === 'safe'
      ? COLORS.safe
      : mc.interpretation.level === 'caution'
        ? COLORS.caution
        : COLORS.risky;
  const fmtPctSimple = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Risk Verdict & Frontier</Text>
      <Text style={styles.sectionSubtitle}>
        Plain-English read of the simulation, plus risk-adjusted return and the leverage frontier
      </Text>

      {/* Verdict card */}
      <View style={[styles.card, { borderColor: levelColor }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              backgroundColor: levelColor,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 3,
              marginRight: 8,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: 'Helvetica-Bold',
                color: '#000',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {mc.interpretation.level}
            </Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: levelColor, flex: 1 }}>
            {mc.interpretation.headline}
          </Text>
        </View>
        {mc.interpretation.details.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.recommendBox}>
        <Text style={styles.recommendLabel}>Recommendation</Text>
        <Text style={{ fontSize: 10, color: COLORS.text, lineHeight: 1.5 }}>
          {mc.interpretation.recommendation}
        </Text>
      </View>

      {/* Risk-adjusted return */}
      <Text style={styles.subTitle}>Risk-adjusted return</Text>
      <View style={styles.metricGrid}>
        <MetricCard
          label="Sharpe Ratio"
          value={mc.riskAdjusted.sharpeRatio.toFixed(2)}
          color={mc.riskAdjusted.sharpeRatio >= 1 ? COLORS.safe : mc.riskAdjusted.sharpeRatio >= 0 ? COLORS.caution : COLORS.risky}
        />
        <MetricCard
          label="Annualized Return"
          value={fmtPctSimple(mc.riskAdjusted.annualizedReturnMean)}
          color={mc.riskAdjusted.annualizedReturnMean >= mc.riskAdjusted.riskFreeRateAnnual ? COLORS.safe : COLORS.risky}
        />
        <MetricCard
          label="Annualized Volatility"
          value={fmtPctSimple(mc.riskAdjusted.annualizedReturnVolatility)}
          color={COLORS.accent}
        />
        <MetricCard
          label="Risk-Free Rate"
          value={fmtPctSimple(mc.riskAdjusted.riskFreeRateAnnual)}
          color={COLORS.textMuted}
        />
      </View>

      {/* Efficient frontier */}
      <Text style={styles.subTitle}>Efficient frontier — leverage sweep</Text>
      <View style={styles.card}>
        <EfficientFrontierScatter
          points={mc.efficientFrontier.points}
          width={510}
          height={170}
        />
        <View style={styles.legendRow}>
          <LegendDot color={CHART_COLORS.blue} label="Current position" />
          <LegendDot color={COLORS.safe} label="Optimal Sharpe (feasible)" />
          <LegendDot color={COLORS.textSubtle} label="Other levels" />
          <LegendDot color={COLORS.risky} label="Infeasible (P(liq) > 5% or HF₀ < 1)" />
        </View>
        <Text style={{ fontSize: 9, color: COLORS.text, marginTop: 6, lineHeight: 1.4 }}>
          {mc.efficientFrontier.verdict}
        </Text>
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Portfolio Monte Carlo page — drawdown / VaR for non-Aave wallets
// =========================================================================

function PortfolioMcPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.portfolioMc) return null;
  const mc = data.portfolioMc;
  const lvlColor =
    mc.interpretation.level === 'safe'
      ? COLORS.safe
      : mc.interpretation.level === 'caution'
        ? COLORS.caution
        : COLORS.risky;
  const fmtPctN = (n: number) => `${n.toFixed(2)}%`;
  const fmtPctSimple = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Portfolio Drawdown Simulation</Text>
      <Text style={styles.sectionSubtitle}>
        {mc.paths} correlated GBM paths over {mc.horizonDays} days · daily resolution · realized 14d
        volatilities + correlations from {mc.assetsAnalyzed.length} assets
      </Text>

      {/* Headline metrics — VaR is the headline number for any non-leveraged wallet. */}
      <View style={styles.metricGrid}>
        <MetricCard
          label="Value-at-Risk (95%)"
          value={fmtPctN(mc.var95Pct)}
          color={mc.var95Pct > 25 ? COLORS.risky : mc.var95Pct > 10 ? COLORS.caution : COLORS.safe}
          hint="5%-tile loss over horizon"
        />
        <MetricCard
          label="Expected Shortfall"
          value={fmtPctN(mc.cvar95Pct)}
          color={mc.cvar95Pct > 30 ? COLORS.risky : mc.cvar95Pct > 15 ? COLORS.caution : COLORS.safe}
          hint="Avg loss in worst 5%"
        />
        <MetricCard
          label="P(Loss ≥ 20%)"
          value={fmtPctSimple(mc.pLossGte.p20)}
          color={mc.pLossGte.p20 > 0.1 ? COLORS.risky : mc.pLossGte.p20 > 0.02 ? COLORS.caution : COLORS.safe}
        />
        <MetricCard
          label="Median Max DD"
          value={fmtPctN(mc.maxDrawdown.p50Pct)}
          color={mc.maxDrawdown.p50Pct > 25 ? COLORS.risky : mc.maxDrawdown.p50Pct > 12 ? COLORS.caution : COLORS.safe}
          hint="Peak-to-trough"
        />
      </View>

      {/* Verdict + recommendation */}
      <View style={[styles.card, { borderColor: lvlColor }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
          <View
            style={{
              backgroundColor: lvlColor,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 3,
              marginRight: 8,
            }}
          >
            <Text
              style={{
                fontSize: 7,
                fontFamily: 'Helvetica-Bold',
                color: '#000',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              {mc.interpretation.level}
            </Text>
          </View>
          <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: lvlColor, flex: 1 }}>
            {mc.interpretation.headline}
          </Text>
        </View>
        {mc.interpretation.details.map((d, i) => (
          <View key={i} style={styles.bullet}>
            <Text style={styles.bulletDot}>·</Text>
            <Text style={styles.bulletText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.recommendBox}>
        <Text style={styles.recommendLabel}>Recommendation</Text>
        <Text style={{ fontSize: 10, color: COLORS.text, lineHeight: 1.5 }}>
          {mc.interpretation.recommendation}
        </Text>
      </View>

      {/* Histogram of terminal value */}
      <View style={styles.card}>
        <Text style={styles.metricLabel}>Terminal portfolio value distribution</Text>
        <DrawdownHistogram
          bins={mc.histogram.bins}
          counts={mc.histogram.counts}
          initialUsd={mc.initialPortfolioUsd}
          width={510}
          height={130}
        />
      </View>

      <PageFooter />
    </Page>
  );
}

function PortfolioMcPathsPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.portfolioMc) return null;
  const mc = data.portfolioMc;
  const fmtPctSimple = (n: number) => `${(n * 100).toFixed(2)}%`;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Sample Paths & Risk-Adjusted Return</Text>
      <Text style={styles.sectionSubtitle}>
        {mc.samplePaths.length} of {mc.paths} simulated paths · normalized to 100% at start
      </Text>

      <View style={styles.card}>
        <PortfolioPathsChart
          paths={mc.samplePaths}
          horizonDays={mc.horizonDays}
          initialUsd={mc.initialPortfolioUsd}
          width={510}
          height={170}
        />
        <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 4 }}>
          Red paths breached a 30% drawdown at some point during the simulation. Dashed line marks
          break-even (100%).
        </Text>
      </View>

      <Text style={styles.subTitle}>Risk-adjusted return (annualized)</Text>
      <View style={styles.metricGrid}>
        <MetricCard
          label="Sharpe Ratio"
          value={mc.riskAdjusted.sharpeRatio.toFixed(2)}
          color={
            mc.riskAdjusted.sharpeRatio >= 1
              ? COLORS.safe
              : mc.riskAdjusted.sharpeRatio >= 0
                ? COLORS.caution
                : COLORS.risky
          }
        />
        <MetricCard
          label="Expected Return"
          value={fmtPctSimple(mc.riskAdjusted.annualizedReturnMean)}
          color={
            mc.riskAdjusted.annualizedReturnMean >= mc.riskAdjusted.riskFreeRateAnnual
              ? COLORS.safe
              : COLORS.risky
          }
        />
        <MetricCard
          label="Volatility"
          value={fmtPctSimple(mc.riskAdjusted.annualizedReturnVolatility)}
          color={COLORS.accent}
        />
        <MetricCard
          label="Risk-Free Rate"
          value={fmtPctSimple(mc.riskAdjusted.riskFreeRateAnnual)}
          color={COLORS.textMuted}
        />
      </View>

      {/* Asset coverage transparency */}
      <Text style={styles.subTitle}>Coverage</Text>
      <View style={styles.card}>
        <Text style={{ fontSize: 9, color: COLORS.textMuted, marginBottom: 4 }}>
          Assets simulated:{' '}
          <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>
            {mc.assetsAnalyzed.join(', ') || '—'}
          </Text>
        </Text>
        {mc.assetsSkipped.length > 0 && (
          <Text style={{ fontSize: 9, color: COLORS.caution }}>
            Skipped (no volatility data):{' '}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>
              {mc.assetsSkipped.join(', ')}
            </Text>
            {' — '}
            <Text style={{ color: COLORS.textMuted }}>
              {mc.totalUsdSkipped > 0
                ? `representing $${mc.totalUsdSkipped.toLocaleString(undefined, { maximumFractionDigits: 2 })} of holdings.`
                : 'zero USD impact.'}
            </Text>
          </Text>
        )}
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Quant Metrics page — variance, Sortino, Beta, Jensen's Alpha, etc.
// =========================================================================

function QuantMetricsPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.portfolioMc) return null;
  const q = data.portfolioMc.quant;
  const fmtPctSimple = (n: number) => `${(n * 100).toFixed(2)}%`;
  const fmtNum = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '—');
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Quant Metrics</Text>
      <Text style={styles.sectionSubtitle}>
        Wealth-manager-grade statistics — distribution moments, downside risk, benchmark-relative
        performance vs {q.benchmark?.symbol ?? 'BTC'}
      </Text>

      {/* Distribution moments */}
      <Text style={styles.subTitle}>Distribution moments (annualized)</Text>
      <View style={styles.metricGrid}>
        <MetricCard label="Stddev" value={fmtPctSimple(q.stddevAnnual)} color={COLORS.accent} hint="Annualized vol" />
        <MetricCard label="Variance" value={fmtPctSimple(q.varianceAnnual)} color={COLORS.accent} hint="= Stddev²" />
        <MetricCard
          label="Skewness"
          value={fmtNum(q.skewness)}
          color={q.skewness < -0.5 ? COLORS.risky : q.skewness > 0.5 ? COLORS.safe : COLORS.caution}
          hint={q.skewness < 0 ? 'Left-tailed' : 'Right-tailed'}
        />
        <MetricCard
          label="Excess Kurtosis"
          value={fmtNum(q.excessKurtosis)}
          color={q.excessKurtosis > 1 ? COLORS.risky : COLORS.safe}
          hint={q.excessKurtosis > 1 ? 'Heavy tails' : 'Near-normal'}
        />
      </View>

      {/* Downside metrics */}
      <Text style={styles.subTitle}>Downside risk</Text>
      <View style={styles.metricGrid}>
        <MetricCard
          label="Downside Deviation"
          value={fmtPctSimple(q.downsideDeviationAnnual)}
          color={COLORS.caution}
          hint="Negative-only vol, annualized"
        />
        <MetricCard
          label="Sortino Ratio"
          value={fmtNum(q.sortinoRatio)}
          color={q.sortinoRatio >= 1 ? COLORS.safe : q.sortinoRatio >= 0 ? COLORS.caution : COLORS.risky}
          hint="(R-Rf) / downside dev"
        />
        <MetricCard
          label="VaR (99%)"
          value={`${q.var99Pct.toFixed(2)}%`}
          color={q.var99Pct > 35 ? COLORS.risky : q.var99Pct > 20 ? COLORS.caution : COLORS.safe}
          hint="1%-tile loss"
        />
        <MetricCard
          label="Expected Shortfall (99%)"
          value={`${q.cvar99Pct.toFixed(2)}%`}
          color={q.cvar99Pct > 50 ? COLORS.risky : q.cvar99Pct > 30 ? COLORS.caution : COLORS.safe}
          hint="Avg loss in worst 1%"
        />
      </View>

      {/* Benchmark — Beta / Alpha / Treynor / Information Ratio */}
      <Text style={styles.subTitle}>
        vs {q.benchmark?.symbol ?? 'BTC'} benchmark
      </Text>
      {q.benchmark ? (
        <>
          <View style={styles.metricGrid}>
            <MetricCard
              label="Beta"
              value={fmtNum(q.benchmark.beta)}
              color={
                Math.abs(q.benchmark.beta - 1) < 0.2
                  ? COLORS.safe
                  : q.benchmark.beta > 1.5 || q.benchmark.beta < 0
                    ? COLORS.risky
                    : COLORS.caution
              }
              hint={`Sensitivity to ${q.benchmark.symbol}`}
            />
            <MetricCard
              label="Jensen's Alpha"
              value={fmtPctSimple(q.benchmark.jensenAlphaAnnual)}
              color={q.benchmark.jensenAlphaAnnual > 0 ? COLORS.safe : COLORS.risky}
              hint="vs CAPM-fair return"
            />
            <MetricCard
              label="Treynor Ratio"
              value={fmtNum(q.benchmark.treynorRatio)}
              color={q.benchmark.treynorRatio > 0 ? COLORS.safe : COLORS.risky}
              hint="(R-Rf) / β"
            />
            <MetricCard
              label="Information Ratio"
              value={fmtNum(q.benchmark.informationRatio)}
              color={
                q.benchmark.informationRatio > 0.5
                  ? COLORS.safe
                  : q.benchmark.informationRatio > 0
                    ? COLORS.caution
                    : COLORS.risky
              }
              hint="Active return / TE"
            />
          </View>
          <View style={styles.card}>
            <Text style={{ fontSize: 9, color: COLORS.textMuted, lineHeight: 1.5 }}>
              Portfolio correlates{' '}
              <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>
                {q.benchmark.correlation.toFixed(2)}
              </Text>{' '}
              with {q.benchmark.symbol} (R² ={' '}
              <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>
                {(q.benchmark.rSquared * 100).toFixed(0)}%
              </Text>
              ). β tells you how much the portfolio amplifies benchmark moves; α
              measures the excess return after stripping out that benchmark exposure.
              Positive α means the portfolio outperforms what β alone would predict.
            </Text>
          </View>
        </>
      ) : (
        <Text style={{ fontSize: 9, color: COLORS.textSubtle, marginTop: 4 }}>
          Benchmark unavailable for this run — couldn't fetch BTC price history.
        </Text>
      )}

      <View style={[styles.card, { marginTop: 8 }]}>
        <Text style={{ fontSize: 8, color: COLORS.textSubtle, lineHeight: 1.5 }}>
          <Text style={{ fontFamily: 'Helvetica-Bold', color: COLORS.textMuted }}>How to read these.</Text>{' '}
          Sharpe + Sortino + Treynor are reward/risk ratios — higher is better. Sharpe penalizes all volatility, Sortino
          only downside, Treynor only systematic risk. VaR(95) and VaR(99) are tail risk: "5% (or 1%) of the time you'll
          lose at least this much." Skewness flags asymmetric distributions; excess kurtosis flags fat tails.
          Beta &gt; 1 means the portfolio amplifies benchmark moves. Jensen's Alpha is the excess
          return after accounting for that beta exposure. Information Ratio measures consistency of outperformance.
        </Text>
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Composition page — concentration + donut + asset class table + bars
// =========================================================================

function CompositionPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.composition) return null;
  const comp = data.composition.composition;
  const conc = comp.concentration;

  // Sector bars — top 8 by USD
  const sectorBars = comp.bySector
    .slice(0, 8)
    .map((r) => ({
      label: r.sector,
      pct: r.pct,
      color: supersectorColor(r.supersector),
    }));

  const MC_COLORS: Record<string, string> = {
    large: '#22c55e',
    mid: '#3b82f6',
    small: '#f59e0b',
    micro: '#ef4444',
    unknown: '#71717a',
  };
  const mcBars = comp.byMarketCap.map((r) => ({
    label: r.label,
    pct: r.pct,
    color: MC_COLORS[r.bucket] ?? '#71717a',
  }));

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Portfolio Composition</Text>
      <Text style={styles.sectionSubtitle}>
        {data.composition.xrayApplied
          ? 'X-ray applied — Aave aTokens decomposed to underlying classification'
          : 'aTokens shown as their own supersector (X-ray off)'}
      </Text>

      {conc && (
        <View style={styles.card}>
          <Text style={styles.metricLabel}>Concentration verdict</Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: 'Helvetica-Bold',
              color: COLORS.accent,
              textTransform: 'capitalize',
              marginTop: 4,
              marginBottom: 6,
            }}
          >
            {conc.verdict}
          </Text>
          <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}>
            <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
              Top-3 share: <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{fmtPct(conc.topThreePct, 1)}</Text>
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
              Effective N: <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{conc.effectiveN.toFixed(1)}</Text>
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
              HHI: <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{Math.round(conc.hhi)}</Text>
            </Text>
            <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
              Largest: <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{conc.largestHolding.symbol} ({fmtPct(conc.largestHolding.pct, 1)})</Text>
            </Text>
          </View>
        </View>
      )}

      {/* Donut + asset class table side by side */}
      <Text style={styles.subTitle}>Asset class allocation</Text>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
        <View
          style={{
            backgroundColor: COLORS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 6,
            padding: 6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AssetClassDonut rows={comp.bySupersector} size={130} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { width: 14 }]}> </Text>
              <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Supersector</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>USD</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>%</Text>
            </View>
            {comp.bySupersector.map((row, i) => (
              <View key={i} style={styles.tableRow}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: supersectorColor(row.supersector),
                    borderRadius: 1,
                    marginRight: 6,
                    alignSelf: 'center',
                  }}
                />
                <Text style={[styles.tableCell, { flex: 3 }]}>{row.supersector}</Text>
                <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>{fmtUsd(row.usd)}</Text>
                <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
                  {row.pct.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* Sector + market-cap bar charts side by side */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subTitle}>Sector allocation (top 8)</Text>
          <View style={styles.card}>
            <HorizontalBars rows={sectorBars} width={250} rowHeight={14} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subTitle}>Market cap breakdown</Text>
          <View style={styles.card}>
            <HorizontalBars rows={mcBars} width={250} rowHeight={14} />
          </View>
        </View>
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Top Holdings page
// =========================================================================

function TopHoldingsPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.composition) return null;
  const comp = data.composition.composition;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Top Holdings</Text>
      <Text style={styles.sectionSubtitle}>
        Ranked by USD value · sector tag from the composition registry
      </Text>

      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: 22 }]}>#</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Token</Text>
          <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Sector</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>USD</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>%</Text>
        </View>
        {comp.topHoldings.map((h, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: 22, color: COLORS.textSubtle }]}>{i + 1}</Text>
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center' }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  backgroundColor: supersectorColor(h.supersector),
                  borderRadius: 3,
                  marginRight: 5,
                }}
              />
              <Text style={[styles.tableCell, { fontFamily: 'Courier-Bold' }]}>{h.symbol}</Text>
            </View>
            <Text style={[styles.tableCell, { flex: 3, color: COLORS.textMuted, fontSize: 8 }]}>{h.sector}</Text>
            <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>{fmtUsd(h.usd)}</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
              {h.pct.toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Correlation page — color-coded heatmap
// =========================================================================

function CorrelationPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.correlation) return null;
  const { symbols, matrix, averagePairwise } = data.correlation;
  const avgVerdict =
    averagePairwise > 0.7
      ? { color: COLORS.risky, label: 'Highly correlated portfolio.', detail: 'Your assets move largely together — the diversification you appear to have on paper isn\'t real risk diversification. A market-wide drawdown would hit most positions in lockstep.' }
      : averagePairwise > 0.4
        ? { color: COLORS.caution, label: 'Moderately correlated.', detail: 'Your portfolio has some genuine diversification but tilts toward co-movement during market stress. Adding lower-correlation assets (cross-sector, stables) would improve risk decomposition.' }
        : averagePairwise > 0.1
          ? { color: COLORS.safe, label: 'Reasonably diversified.', detail: 'Your assets show meaningful independent variation — drawdowns in one are not automatically drawdowns in others.' }
          : { color: COLORS.safe, label: 'Strongly diversified.', detail: 'Asset moves are nearly independent or even inversely related — this is the configuration that minimizes portfolio variance.' };

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Asset Correlation</Text>
      <Text style={styles.sectionSubtitle}>
        Pairwise Pearson correlation of 14-day daily log returns
      </Text>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Average pairwise correlation</Text>
        <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: avgVerdict.color, marginTop: 4 }}>
          {averagePairwise.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 10, color: COLORS.text, marginTop: 4, fontFamily: 'Helvetica-Bold' }}>
          {avgVerdict.label}
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.textMuted, marginTop: 2, lineHeight: 1.4 }}>
          {avgVerdict.detail}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: COLORS.card,
          borderWidth: 1,
          borderColor: COLORS.border,
          borderRadius: 6,
          padding: 8,
          alignItems: 'center',
        }}
      >
        <CorrelationHeatmap symbols={symbols} matrix={matrix} width={500} />
        <View style={{ marginTop: 6 }}>
          <CorrelationLegend width={240} />
        </View>
        <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 4 }}>
          Cells colored from −1 (red, anti-correlated) through 0 (dark) to +1 (blue, perfectly correlated).
        </Text>
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Wallet Holdings page
// =========================================================================

function WalletPage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.wallet) return null;
  const w = data.wallet;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>Wallet Holdings</Text>
      <Text style={styles.sectionSubtitle}>
        Per-chain native + ERC-20 breakdown · spam tokens flagged separately
      </Text>

      <View style={styles.metricGrid}>
        <MetricCard label="Total (legitimate)" value={fmtUsd(w.legitimateUsd)} color={COLORS.safe} />
        <MetricCard label="Spam value" value={fmtUsd(w.spamUsd)} color={COLORS.risky} />
        <MetricCard label="Chains scanned" value={`${w.chains.length}`} color={COLORS.text} />
      </View>

      {w.chains.map((c, ci) => {
        const nonSpam = c.erc20.filter((t) => !t.isSpam);
        const spam = c.erc20.filter((t) => t.isSpam);
        return (
          <View key={ci} style={[styles.card, { marginBottom: 8 }]} wrap={false}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 11, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>
                {c.chainName}
              </Text>
              <Text style={{ fontSize: 9, color: COLORS.textMuted }}>
                {fmtUsd(c.totalUsd)}
                {c.spamUsd > 0 ? ` (${fmtUsd(c.spamUsd)} spam)` : ''}
              </Text>
            </View>

            {c.error && (
              <Text style={{ fontSize: 8, color: COLORS.risky, marginBottom: 4 }}>
                ⚠ {c.error}
              </Text>
            )}

            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Asset</Text>
                <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Name</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Balance</Text>
                <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>USD</Text>
              </View>
              {/* Native row */}
              {c.native.balance > 0 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Courier-Bold' }]}>
                    {c.native.symbol}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 3, color: COLORS.textMuted, fontSize: 8 }]}>
                    Native
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                    {fmtToken(c.native.balance)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                    {c.native.usdValue !== null ? fmtUsd(c.native.usdValue) : '—'}
                  </Text>
                </View>
              )}
              {nonSpam.slice(0, 12).map((t, i) => (
                <View key={`n${i}`} style={styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Courier-Bold' }]}>
                    {t.symbol}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 3, color: COLORS.textMuted, fontSize: 8 }]}>
                    {t.name ?? '—'}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                    {fmtToken(t.balance)}
                  </Text>
                  <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>
                    {t.usdValue !== null ? fmtUsd(t.usdValue) : '—'}
                  </Text>
                </View>
              ))}
              {nonSpam.length > 12 && (
                <View style={styles.tableRow}>
                  <Text style={[styles.tableCell, { color: COLORS.textSubtle, fontStyle: 'italic' }]}>
                    + {nonSpam.length - 12} more
                  </Text>
                </View>
              )}
              {spam.length > 0 && (
                <View style={[styles.tableRow, { backgroundColor: 'rgba(239,68,68,0.05)' }]}>
                  <Text style={[styles.tableCell, { color: COLORS.risky, fontFamily: 'Helvetica-Bold' }]}>
                    {spam.length} spam token{spam.length === 1 ? '' : 's'} suppressed
                  </Text>
                </View>
              )}
            </View>
          </View>
        );
      })}

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// AI narrative page
// =========================================================================

function NarrativePage({ data, pageNum }: { data: ReportData; pageNum: number }) {
  if (!data.narrative) return null;
  const n = data.narrative;

  // Split on double newlines into paragraphs to preserve structure.
  const paragraphs = n.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={pageNum} />
      <Text style={styles.sectionTitle}>AI Risk Narrative</Text>
      <Text style={styles.sectionSubtitle}>
        Multi-section assessment generated by the Sentinel agent (Claude) using live tool calls
      </Text>

      <View style={styles.card}>
        {paragraphs.map((p, i) => {
          // Headings appear as **bold** lines or "## " prefixes. Render the
          // markdown bullets and bolds at a basic level — keep prose-first.
          const isHeading = /^\*\*.+\*\*$/.test(p) || /^#+\s/.test(p);
          const cleaned = p.replace(/^#+\s*/, '').replace(/\*\*/g, '');
          return (
            <Text
              key={i}
              style={
                isHeading
                  ? {
                      fontSize: 10,
                      fontFamily: 'Helvetica-Bold',
                      color: COLORS.accent,
                      marginTop: i === 0 ? 0 : 8,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: 1,
                    }
                  : {
                      fontSize: 9,
                      color: COLORS.text,
                      lineHeight: 1.5,
                      marginBottom: 6,
                    }
              }
            >
              {cleaned}
            </Text>
          );
        })}
      </View>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Shared sub-components
// =========================================================================

function PageHeader({ pageNum }: { pageNum: number }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.brand}>USDC GUARDIAN</Text>
        <Text style={styles.brandTagline}>DeFi Portfolio Reports</Text>
      </View>
      <Text style={styles.pageNum}>{pageNum}</Text>
    </View>
  );
}

function PageFooter() {
  return (
    <View style={styles.footer}>
      <Text>USDC Guardian — DeFi Portfolio Reports</Text>
      <Text>Not investment advice · Generated from on-chain data</Text>
    </View>
  );
}

function MetricCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color: string;
  hint?: string;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {hint && <Text style={styles.metricHint}>{hint}</Text>}
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendDot}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 3.5,
          backgroundColor: color,
          marginRight: 4,
        }}
      />
      <Text style={{ fontSize: 7, color: COLORS.textMuted }}>{label}</Text>
    </View>
  );
}

// =========================================================================
// The full document
// =========================================================================

export function ReportPDF({ data }: { data: ReportData }) {
  // Track running page number so each section gets the right number even
  // when earlier sections are null.
  let pageNum = 1; // cover is always page 1

  const pages: React.ReactNode[] = [
    <CoverPage key="cover" data={data} />,
  ];

  if (data.aave) {
    pageNum++;
    pages.push(<AavePage key="aave" data={data} pageNum={pageNum} />);
  }
  if (data.monteCarlo) {
    pageNum++;
    pages.push(<MonteCarloDistributionPage key="mc1" data={data} pageNum={pageNum} />);
    pageNum++;
    pages.push(<MonteCarloAnalysisPage key="mc2" data={data} pageNum={pageNum} />);
  }
  if (data.portfolioMc) {
    pageNum++;
    pages.push(<PortfolioMcPage key="pmc1" data={data} pageNum={pageNum} />);
    pageNum++;
    pages.push(<PortfolioMcPathsPage key="pmc2" data={data} pageNum={pageNum} />);
    pageNum++;
    pages.push(<QuantMetricsPage key="quant" data={data} pageNum={pageNum} />);
  }
  if (data.composition) {
    pageNum++;
    pages.push(<CompositionPage key="comp" data={data} pageNum={pageNum} />);
    pageNum++;
    pages.push(<TopHoldingsPage key="top" data={data} pageNum={pageNum} />);
  }
  if (data.correlation) {
    pageNum++;
    pages.push(<CorrelationPage key="corr" data={data} pageNum={pageNum} />);
  }
  if (data.wallet) {
    pageNum++;
    pages.push(<WalletPage key="wallet" data={data} pageNum={pageNum} />);
  }
  if (data.narrative) {
    pageNum++;
    pages.push(<NarrativePage key="narr" data={data} pageNum={pageNum} />);
  }

  return (
    <Document
      title={`USDC Guardian Report — ${shortAddr(data.meta.walletAddress)}`}
      author="USDC Guardian"
      subject="DeFi Portfolio Report"
      creator="usdc-guardian"
      producer="usdc-guardian"
    >
      {pages}
    </Document>
  );
}
