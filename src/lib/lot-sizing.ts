// IDX lot sizing helpers. 1 lot = 100 shares.
export const LOT_SIZE_IDX = 100;

export function isIDXSymbol(symbol: string): boolean {
  return /\.JK$/i.test(symbol.trim());
}

export function calculateLotSize(allocationAmount: number, price: number, lotSize = LOT_SIZE_IDX): number {
  if (!price || price <= 0 || !allocationAmount || allocationAmount <= 0) return 0;
  return Math.floor(allocationAmount / (price * lotSize));
}

export function convertLotToShares(lot: number, lotSize = LOT_SIZE_IDX): number {
  return Math.max(0, Math.floor(lot)) * lotSize;
}

export function convertSharesToLot(shares: number, lotSize = LOT_SIZE_IDX): number {
  return Math.floor((shares || 0) / lotSize);
}

export function calculateEstimatedCost(shares: number, price: number, feeRate = 0.001): number {
  const notional = shares * price;
  return notional + notional * feeRate;
}

export function validateMinimumLot(lot: number): { ok: boolean; reason?: string } {
  if (!lot || lot < 1) return { ok: false, reason: "Saldo tidak cukup untuk minimal 1 lot (100 lembar)." };
  return { ok: true };
}

/** Returns shares to trade given allocation + price. For IDX rounds to lot; non-IDX uses share count. */
export function sizeOrder(opts: { symbol: string; allocationAmount: number; price: number; feeRate?: number }) {
  const { symbol, allocationAmount, price, feeRate = 0.001 } = opts;
  if (isIDXSymbol(symbol)) {
    const lot = calculateLotSize(allocationAmount, price);
    const shares = convertLotToShares(lot);
    return {
      lot, shares,
      estimatedCost: calculateEstimatedCost(shares, price, feeRate),
      minLotOk: validateMinimumLot(lot),
    };
  }
  const shares = Math.max(0, Math.floor(allocationAmount / (price * (1 + feeRate))));
  return {
    lot: shares, shares,
    estimatedCost: calculateEstimatedCost(shares, price, feeRate),
    minLotOk: { ok: shares >= 1, reason: shares < 1 ? "Saldo tidak cukup untuk 1 lembar." : undefined },
  };
}
