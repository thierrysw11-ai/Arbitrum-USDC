import { NextRequest, NextResponse } from 'next/server';
import { generateEliteReport } from '@/lib/agent/generateEliteReport';
import { getServerPortfolio } from '@/lib/aave/server';   // ← Your real server function

export async function POST(request: NextRequest) {
  try {
    const { address } = await request.json();

    if (!address) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    // Fetch REAL Aave V3 position
    const portfolio = await getServerPortfolio(address as `0x${string}`);

    if (!portfolio || portfolio.positions.length === 0) {
      return NextResponse.json({ 
        error: "No Aave V3 positions found for this address." 
      }, { status: 400 });
    }

    // Convert to report format
    const totalCollateral = Number(portfolio.account.totalCollateralBase) / 1e8;
    const totalDebt = Number(portfolio.account.totalDebtBase) / 1e8;

    const reportData = {
      healthFactor: (Number(portfolio.account.healthFactor) / 1e18).toFixed(2),
      totalCollateralUSD: totalCollateral.toFixed(0),
      totalDebtUSD: totalDebt.toFixed(0),
      availableBorrowsUSD: (Number(portfolio.account.availableBorrowsBase) / 1e8).toFixed(0),
      ltv: (Number(portfolio.account.ltv) / 100).toFixed(1),
      liquidationThreshold: (Number(portfolio.account.currentLiquidationThreshold) / 100).toFixed(1),
      assetBreakdown: portfolio.positions
        .map(p => `${p.symbol}: $${((Number(p.aTokenBalance) * Number(p.priceBase)) / (10 ** p.decimals * 1e8)).toFixed(0)}`)
        .join(", "),
      aaveUsdcApy: "4.66",
      morphoYields: "Gauntlet: 7.2%, Steakhouse: 6.8%",
    };

    const report = generateEliteReport(reportData);

    return NextResponse.json({
      success: true,
      report: report,
    });

  } catch (error: any) {
    console.error("Premium Analysis Error:", error);
    return NextResponse.json({ 
      error: error.message || "Failed to generate analysis" 
    }, { status: 500 });
  }
}