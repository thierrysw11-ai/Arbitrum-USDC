'use client';

/**
 * Branded PDF report — what the customer downloads after the premium
 * Sentinel Elite Analysis. This is the artifact that justifies the
 * price: a multi-page document they can save, email, share, or feed
 * into another AI tool as context.
 *
 * Built with @react-pdf/renderer (client-side; no server cost). Uses
 * a small palette + minimal layout vocabulary so the file size stays
 * compact (~50–100 KB) and rendering is fast.
 *
 * Sections (each conditional on data being present):
 *   1. Cover         — logo, wallet, date, executive summary
 *   2. Aave V3       — HF, collateral, debt, per-asset breakdown
 *   3. Monte Carlo   — P(liq), percentiles, Sharpe, recommendation
 *   4. Composition   — sector allocation, market cap, top holdings
 *   5. Correlation   — pairwise matrix as table
 *   6. Footer        — disclaimer + branding
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';

import type { ReportData } from '@/lib/report/types';

// =========================================================================
// Palette + base styles
// =========================================================================

const COLORS = {
  bg: '#0a0a0a',
  card: '#161616',
  border: '#27272a',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  accent: '#a855f7',
  accentLight: '#c084fc',
  safe: '#22c55e',
  caution: '#f59e0b',
  risky: '#ef4444',
  collateral: '#22c55e',
  debt: '#ef4444',
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
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    fontSize: 16,
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
    marginBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 10,
  },
  metricLabel: {
    fontSize: 7,
    color: COLORS.textSubtle,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
  },
  metricHint: {
    fontSize: 7,
    color: COLORS.textSubtle,
    marginTop: 3,
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
    paddingVertical: 6,
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
    paddingVertical: 5,
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
    marginBottom: 4,
    paddingLeft: 8,
  },
  bulletDot: {
    color: COLORS.textSubtle,
    marginRight: 6,
  },
  bulletText: {
    flex: 1,
    fontSize: 9,
    color: COLORS.text,
    lineHeight: 1.5,
  },
  recommendBox: {
    backgroundColor: '#1a0f2e',
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 6,
    padding: 12,
    marginTop: 8,
  },
  recommendLabel: {
    fontSize: 7,
    color: COLORS.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: COLORS.textSubtle,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
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

const hfColor = (hf: number): string => {
  if (hf < 1.2) return COLORS.risky;
  if (hf < 1.5) return COLORS.caution;
  return COLORS.safe;
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

      <View style={{ marginTop: 60 }}>
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
            paddingTop: 16,
            paddingBottom: 16,
            borderTopWidth: 1,
            borderTopColor: COLORS.border,
            borderBottomWidth: 1,
            borderBottomColor: COLORS.border,
            marginBottom: 24,
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

        <Text style={[styles.metricLabel, { marginBottom: 8 }]}>Executive summary</Text>
        <Text style={styles.paragraph}>
          {buildExecutiveSummary(data)}
        </Text>
      </View>

      {data.meta.settlementTxHash && (
        <View
          style={{
            marginTop: 'auto',
            padding: 10,
            backgroundColor: COLORS.card,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: COLORS.border,
          }}
        >
          <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginBottom: 3 }}>
            x402 settlement
          </Text>
          <Text style={{ fontSize: 8, fontFamily: 'Courier', color: COLORS.text }}>
            {data.meta.settlementTxHash}
          </Text>
          <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 3 }}>
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
      `Over a ${data.monteCarlo.horizonDays}-day horizon, ${fmtPct(data.monteCarlo.pLiquidation * 100)} probability of liquidation.`
    );
  }
  if (data.composition) {
    const c = data.composition.composition;
    parts.push(
      `Wider portfolio is ${c.concentration?.verdict ?? 'analyzed'} — top-3 share ${fmtPct(c.concentration?.topThreePct ?? 0, 1)}, effective N = ${(c.concentration?.effectiveN ?? 0).toFixed(1)}.`
    );
  }
  if (parts.length === 0) {
    return 'Insufficient data for an executive summary.';
  }
  return parts.join(' ');
}

// =========================================================================
// Aave V3 page
// =========================================================================

function AavePage({ data }: { data: ReportData }) {
  if (!data.aave) return null;
  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={2} />
      <Text style={styles.sectionTitle}>Aave V3 Risk Profile</Text>
      <Text style={styles.sectionSubtitle}>
        Live position on {data.aave.chainName} · read directly from the Aave V3 Pool contract
      </Text>

      <View style={styles.metricGrid}>
        <MetricCard
          label="Health Factor"
          value={fmtHf(data.aave.healthFactor)}
          color={hfColor(data.aave.healthFactor)}
          hint="Liquidation at HF < 1.0"
        />
        <MetricCard
          label="Total Collateral"
          value={fmtUsd(data.aave.totalCollateralUsd)}
          color={COLORS.collateral}
        />
        <MetricCard
          label="Total Debt"
          value={fmtUsd(data.aave.totalDebtUsd)}
          color={COLORS.debt}
        />
      </View>

      <View style={styles.metricGrid}>
        <MetricCard
          label="Liq Threshold"
          value={`${data.aave.liquidationThresholdPct.toFixed(2)}%`}
          color={COLORS.text}
        />
        <MetricCard
          label="Max LTV"
          value={`${data.aave.maxLtvPct.toFixed(2)}%`}
          color={COLORS.text}
        />
        <MetricCard
          label="Net Worth"
          value={fmtUsd(data.aave.totalCollateralUsd - data.aave.totalDebtUsd)}
          color={COLORS.accent}
        />
      </View>

      {data.aave.positions.length > 0 && (
        <View>
          <Text style={[styles.metricLabel, { marginTop: 14, marginBottom: 6 }]}>
            Per-asset positions
          </Text>
          <View style={styles.table}>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Asset</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Supplied</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Borrowed</Text>
              <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>Liq Price</Text>
            </View>
            {data.aave.positions.map((p, i) => (
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

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Monte Carlo page
// =========================================================================

function MonteCarloPage({ data }: { data: ReportData }) {
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
      <PageHeader pageNum={3} />
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

      <Text style={[styles.metricLabel, { marginTop: 14, marginBottom: 6 }]}>
        Risk-adjusted return
      </Text>
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

      <Text style={{ fontSize: 7, color: COLORS.textSubtle, marginTop: 14 }}>
        Shocked assets: {mc.shockedAssets.length > 0 ? mc.shockedAssets.join(', ') : 'none (stable-only position)'}
      </Text>

      <PageFooter />
    </Page>
  );
}

// =========================================================================
// Composition page
// =========================================================================

function CompositionPage({ data }: { data: ReportData }) {
  if (!data.composition) return null;
  const comp = data.composition.composition;
  const conc = comp.concentration;

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={4} />
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
              marginBottom: 8,
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

      <Text style={[styles.metricLabel, { marginTop: 12, marginBottom: 6 }]}>
        Asset class allocation
      </Text>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { flex: 4 }]}>Supersector</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>USD</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>%</Text>
        </View>
        {comp.bySupersector.map((row, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 4 }]}>{row.supersector}</Text>
            <Text style={[styles.tableCell, { flex: 2, textAlign: 'right' }]}>{fmtUsd(row.usd)}</Text>
            <Text style={[styles.tableCell, { flex: 1, textAlign: 'right', fontFamily: 'Helvetica-Bold' }]}>
              {row.pct.toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.metricLabel, { marginTop: 12, marginBottom: 6 }]}>
        Top holdings
      </Text>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: 22 }]}>#</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Token</Text>
          <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Sector</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2, textAlign: 'right' }]}>USD</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>%</Text>
        </View>
        {comp.topHoldings.slice(0, 10).map((h, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: 22, color: COLORS.textSubtle }]}>{i + 1}</Text>
            <Text style={[styles.tableCell, { flex: 2, fontFamily: 'Courier-Bold' }]}>{h.symbol}</Text>
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
// Correlation page
// =========================================================================

function CorrelationPage({ data }: { data: ReportData }) {
  if (!data.correlation) return null;
  const { symbols, matrix, averagePairwise } = data.correlation;
  const avgVerdict =
    averagePairwise > 0.7
      ? { color: COLORS.risky, label: 'Highly correlated portfolio.' }
      : averagePairwise > 0.4
        ? { color: COLORS.caution, label: 'Moderately correlated.' }
        : averagePairwise > 0.1
          ? { color: COLORS.safe, label: 'Reasonably diversified.' }
          : { color: COLORS.safe, label: 'Strongly diversified — near-independent moves.' };

  return (
    <Page size="A4" style={styles.page}>
      <PageHeader pageNum={5} />
      <Text style={styles.sectionTitle}>Asset Correlation</Text>
      <Text style={styles.sectionSubtitle}>
        Pairwise Pearson correlation of 14-day daily log returns
      </Text>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>Average pairwise correlation</Text>
        <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: avgVerdict.color, marginTop: 4 }}>
          {averagePairwise.toFixed(2)}
        </Text>
        <Text style={{ fontSize: 9, color: COLORS.text, marginTop: 6 }}>{avgVerdict.label}</Text>
      </View>

      {/* Correlation table — render as grid */}
      <View style={[styles.table, { marginTop: 8 }]}>
        <View style={styles.tableHeaderRow}>
          <Text style={[styles.tableHeaderCell, { width: 50 }]}> </Text>
          {symbols.map((sym, j) => (
            <Text
              key={j}
              style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}
            >
              {sym.length > 6 ? sym.slice(0, 5) + '…' : sym}
            </Text>
          ))}
        </View>
        {matrix.map((row, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { width: 50, fontFamily: 'Helvetica-Bold' }]}>
              {symbols[i].length > 6 ? symbols[i].slice(0, 5) + '…' : symbols[i]}
            </Text>
            {row.map((rho, j) => {
              const cellColor =
                rho === null || !Number.isFinite(rho)
                  ? COLORS.textSubtle
                  : rho > 0.7
                    ? COLORS.risky
                    : rho > 0.3
                      ? COLORS.caution
                      : rho < -0.3
                        ? COLORS.collateral
                        : COLORS.text;
              return (
                <Text
                  key={j}
                  style={[
                    styles.tableCell,
                    { flex: 1, textAlign: 'center', color: cellColor, fontFamily: 'Courier-Bold' },
                  ]}
                >
                  {i === j ? '1.00' : rho === null || !Number.isFinite(rho) ? '—' : rho.toFixed(2)}
                </Text>
              );
            })}
          </View>
        ))}
      </View>

      <Text style={{ fontSize: 8, color: COLORS.textSubtle, marginTop: 10 }}>
        Red ≥ 0.7 (high co-movement) · Yellow 0.3–0.7 · Green ≤ −0.3 (anti-correlated)
      </Text>

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

// =========================================================================
// The full document
// =========================================================================

export function ReportPDF({ data }: { data: ReportData }) {
  return (
    <Document
      title={`USDC Guardian Report — ${shortAddr(data.meta.walletAddress)}`}
      author="USDC Guardian"
      subject="DeFi Portfolio Report"
      creator="usdc-guardian"
      producer="usdc-guardian"
    >
      <CoverPage data={data} />
      {data.aave && <AavePage data={data} />}
      {data.monteCarlo && <MonteCarloPage data={data} />}
      {data.composition && <CompositionPage data={data} />}
      {data.correlation && <CorrelationPage data={data} />}
    </Document>
  );
}
