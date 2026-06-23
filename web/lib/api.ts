import type {
  Connection,
  FlowDetail,
  FlowSummary,
  MockRule,
  Stats,
} from "./types";

// Where the mitmproxy addon's Tornado server is listening.
// Override with NEXT_PUBLIC_DASHBOARD_API when building/running.
export const API_BASE =
  process.env.NEXT_PUBLIC_DASHBOARD_API ?? "http://127.0.0.1:8081";

export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

export async function fetchFlows(): Promise<FlowSummary[]> {
  const res = await fetch(`${API_BASE}/api/flows`, { cache: "no-store" });
  if (!res.ok) throw new Error(`flows: ${res.status}`);
  const data = await res.json();
  return data.flows as FlowSummary[];
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${API_BASE}/api/stats`, { cache: "no-store" });
  if (!res.ok) throw new Error(`stats: ${res.status}`);
  return (await res.json()) as Stats;
}

export async function fetchFlowDetail(id: string): Promise<FlowDetail> {
  const res = await fetch(`${API_BASE}/api/flows/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`detail: ${res.status}`);
  return (await res.json()) as FlowDetail;
}

export async function clearFlows(): Promise<void> {
  await fetch(`${API_BASE}/api/clear`, { cache: "no-store" });
}

export async function fetchConnection(): Promise<Connection> {
  const res = await fetch(`${API_BASE}/api/connection`, { cache: "no-store" });
  if (!res.ok) throw new Error(`connection: ${res.status}`);
  return (await res.json()) as Connection;
}

export async function fetchMocks(): Promise<MockRule[]> {
  const res = await fetch(`${API_BASE}/api/mocks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`mocks: ${res.status}`);
  return (await res.json()).mocks as MockRule[];
}

export async function saveMock(rule: Partial<MockRule>): Promise<MockRule> {
  const res = await fetch(`${API_BASE}/api/mocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error(`save mock: ${res.status}`);
  return (await res.json()) as MockRule;
}

export async function deleteMock(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/mocks/${id}`, { method: "DELETE" });
}
