// Local-only paper trading account. No auth, no server. Persists in localStorage.
import { getQuote } from "./market.functions";

const KEY = "quanta:paper";

type Order = {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  side: "buy" | "sell";
  type: string;
  qty: number;
  price: number | null;
  filled_price: number | null;
  status: "filled" | "pending" | "cancelled" | "rejected";
  filled_at: string | null;
  created_at: string;
  limit_price?: number | null;
  stop_price?: number | null;
  trailing_pct?: number | null;
  trail_anchor?: number | null;
  take_profit?: number | null;
  stop_loss?: number | null;
};
type Position = {
  id: string;
  account_id: string;
  user_id: string;
  symbol: string;
  qty: number;
  avg_price: number;
  opened_at: string;
};
type Account = { id: string; user_id: string; cash: number; equity: number };

type Store = { account: Account; positions: Position[]; orders: Order[] };

const USER_ID = "00000000-0000-0000-0000-000000000001";

function defaultStore(cash = 100000): Store {
  return {
    account: { id: "local-1", user_id: USER_ID, cash, equity: cash },
    positions: [],
    orders: [],
  };
}

function read(): Store {
  if (typeof window === "undefined") return defaultStore();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultStore();
    return JSON.parse(raw);
  } catch {
    return defaultStore();
  }
}
function write(s: Store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}
function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function getPaperAccount() {
  const s = read();
  const filled = s.orders.filter(o => o.status === "filled")
    .sort((a, b) => (b.filled_at || "").localeCompare(a.filled_at || ""))
    .slice(0, 50);
  const pending = s.orders.filter(o => o.status === "pending")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { account: s.account, positions: s.positions, orders: filled, pending };
}

function applyFill(s: Store, params: {
  symbol: string; side: "buy" | "sell"; qty: number; price: number;
  type?: string; takeProfit?: number | null; stopLoss?: number | null;
  pendingOrderId?: string;
}) {
  const { symbol, side, qty, price } = params;
  const slip = 0.0005 * (side === "buy" ? 1 : -1);
  const fillPrice = price * (1 + slip);
  const notional = fillPrice * qty;
  const fee = notional * 0.001;

  if (side === "buy" && s.account.cash < notional + fee) throw new Error("Insufficient cash");
  const existing = s.positions.find(p => p.symbol === symbol);

  if (side === "buy") {
    if (existing) {
      const newQty = existing.qty + qty;
      existing.avg_price = (existing.avg_price * existing.qty + fillPrice * qty) / newQty;
      existing.qty = newQty;
    } else {
      s.positions.push({
        id: uuid(), account_id: s.account.id, user_id: USER_ID,
        symbol, qty, avg_price: fillPrice, opened_at: new Date().toISOString(),
      });
    }
    s.account.cash -= notional + fee;
  } else {
    if (!existing || existing.qty < qty) throw new Error("Insufficient position to sell");
    existing.qty -= qty;
    if (existing.qty === 0) s.positions = s.positions.filter(p => p.id !== existing.id);
    s.account.cash += notional - fee;
  }

  if (params.pendingOrderId) {
    const o = s.orders.find(o => o.id === params.pendingOrderId);
    if (o) {
      o.status = "filled";
      o.filled_price = fillPrice;
      o.filled_at = new Date().toISOString();
    }
  } else {
    s.orders.push({
      id: uuid(), account_id: s.account.id, user_id: USER_ID,
      symbol, side, type: params.type ?? "market", qty, price,
      filled_price: fillPrice, status: "filled",
      filled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      take_profit: params.takeProfit ?? null,
      stop_loss: params.stopLoss ?? null,
    });
  }
  return { fillPrice, fee };
}

export async function placeOrder(args: { data: {
  symbol: string; side: "buy" | "sell"; qty: number;
  takeProfit?: number; stopLoss?: number;
}}) {
  const d = args.data;
  const symbol = d.symbol.trim().toUpperCase();
  const quote: any = await getQuote({ data: { symbol } });
  if (!quote?.price) throw new Error("Could not get price for " + symbol);
  const s = read();
  const r = applyFill(s, {
    symbol, side: d.side, qty: d.qty, price: quote.price,
    takeProfit: d.takeProfit, stopLoss: d.stopLoss,
  });
  write(s);
  return { ok: true, ...r };
}

export async function placeAdvancedOrder(args: { data: {
  symbol: string; side: "buy" | "sell"; qty: number;
  type: "limit" | "stop" | "stop_limit" | "trailing_stop";
  limitPrice?: number; stopPrice?: number; trailingPct?: number;
  takeProfit?: number; stopLoss?: number;
}}) {
  const d = args.data;
  const symbol = d.symbol.trim().toUpperCase();
  if (d.type === "limit" && !d.limitPrice) throw new Error("limit price required");
  if ((d.type === "stop" || d.type === "stop_limit") && !d.stopPrice) throw new Error("stop price required");
  if (d.type === "stop_limit" && !d.limitPrice) throw new Error("limit price required");
  if (d.type === "trailing_stop" && !d.trailingPct) throw new Error("trailing % required");
  const quote: any = await getQuote({ data: { symbol } }).catch(() => null);
  const s = read();
  const order: Order = {
    id: uuid(), account_id: s.account.id, user_id: USER_ID,
    symbol, side: d.side, type: d.type, qty: d.qty,
    price: quote?.price ?? null, filled_price: null,
    limit_price: d.limitPrice ?? null,
    stop_price: d.stopPrice ?? null,
    trailing_pct: d.trailingPct ?? null,
    trail_anchor: d.type === "trailing_stop" ? quote?.price ?? null : null,
    take_profit: d.takeProfit ?? null,
    stop_loss: d.stopLoss ?? null,
    status: "pending",
    filled_at: null,
    created_at: new Date().toISOString(),
  };
  s.orders.push(order);
  write(s);
  return order;
}

export async function cancelOrder(args: { data: { id: string } }) {
  const s = read();
  const o = s.orders.find(o => o.id === args.data.id);
  if (o && o.status === "pending") o.status = "cancelled";
  write(s);
  return { ok: true };
}

export async function resetPaperAccount(args?: { data?: { cash?: number } }) {
  const cash = Math.max(0, Number(args?.data?.cash ?? 100000)) || 100000;
  write(defaultStore(cash));
  return { ok: true, cash };
}
