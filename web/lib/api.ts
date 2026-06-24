import type {
  BreakpointRule,
  Connection,
  FlowDetail,
  FlowSummary,
  MockGroup,
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

export async function fetchMocks(): Promise<{ rules: MockRule[]; groups: MockGroup[] }> {
  const res = await fetch(`${API_BASE}/api/mocks`, { cache: "no-store" });
  if (!res.ok) throw new Error(`mocks: ${res.status}`);
  const data = await res.json();
  // Handle both old format ({ mocks: [] }) and new format ({ mocks: [], groups: [] })
  const rules = (Array.isArray(data) ? data : (data.mocks ?? [])) as MockRule[];
  const groups = (data.groups ?? []) as MockGroup[];
  return { rules, groups };
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

export async function saveGroup(group: Partial<MockGroup>): Promise<MockGroup> {
  const res = await fetch(`${API_BASE}/api/groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(group),
  });
  if (!res.ok) throw new Error(`save group: ${res.status}`);
  return (await res.json()) as MockGroup;
}

export async function deleteGroup(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/groups/${id}`, { method: "DELETE" });
}

export async function fetchBreakpoints(): Promise<BreakpointRule[]> {
  const res = await fetch(`${API_BASE}/api/breakpoints`, { cache: "no-store" });
  if (!res.ok) throw new Error(`breakpoints: ${res.status}`);
  return (await res.json()).breakpoints as BreakpointRule[];
}

export async function saveBreakpoint(bp: Partial<BreakpointRule>): Promise<BreakpointRule> {
  const res = await fetch(`${API_BASE}/api/breakpoints`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bp),
  });
  if (!res.ok) throw new Error(`save breakpoint: ${res.status}`);
  return (await res.json()) as BreakpointRule;
}

export async function deleteBreakpoint(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/breakpoints/${id}`, { method: "DELETE" });
}

export async function resendFlow(
  id: string,
  edits: { method: string; url: string; headers: Record<string, string>; body: string }
): Promise<{ status: number }> {
  const res = await fetch(`${API_BASE}/api/flows/${id}/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edits),
  });
  if (!res.ok) throw new Error(`resend: ${res.status}`);
  return res.json();
}

export async function resumeFlow(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/flows/${id}/resume`, { method: "POST" });
}

export async function abortFlow(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/flows/${id}/abort`, { method: "POST" });
}

export async function editResumeFlow(
  id: string,
  data: {
    request?: { method?: string; path?: string; headers?: Record<string, string>; body?: string };
    response?: { status_code?: number; headers?: Record<string, string>; body?: string };
  }
): Promise<void> {
  await fetch(`${API_BASE}/api/flows/${id}/edit-resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function reorderMocks(
  items: Array<{ id: string; group_id?: string | null; order: number }>
): Promise<void> {
  await fetch(`${API_BASE}/api/mocks/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
}
