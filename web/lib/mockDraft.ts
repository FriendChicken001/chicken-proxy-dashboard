import type { FlowDetail, FlowSummary, MockRule } from "./types";

/** Build a mock-rule draft from a full flow detail (includes the response body). */
export function draftFromDetail(d: FlowDetail): Partial<MockRule> {
  const pathOnly = d.path.split("?")[0];
  const ct = d.response_headers.find(
    ([k]) => k.toLowerCase() === "content-type"
  );
  return {
    name: `Mock ${d.method} ${pathOnly}`,
    enabled: true,
    method: d.method,
    url_contains: `${d.host}${pathOnly}`,
    status_code: d.status_code ?? 200,
    headers: ct ? [[ct[0], ct[1]]] : [["content-type", "application/json"]],
    body: d.response_body?.text ?? "",
  };
}

/** Fallback draft from a summary only (no body), used if detail can't be fetched. */
export function draftFromSummary(f: FlowSummary): Partial<MockRule> {
  const pathOnly = f.path.split("?")[0];
  return {
    name: `Mock ${f.method} ${pathOnly}`,
    enabled: true,
    method: f.method,
    url_contains: `${f.host}${pathOnly}`,
    status_code: f.status_code ?? 200,
    headers: [["content-type", "application/json"]],
    body: "",
  };
}

/** Reconstruct an approximate cURL command from a flow detail. */
export function toCurl(d: FlowDetail): string {
  const esc = (s: string) => s.replace(/'/g, "'\\''");
  const parts = [`curl -X ${d.method} '${d.url}'`];
  for (const [k, v] of d.request_headers) {
    if (["content-length", "host"].includes(k.toLowerCase())) continue;
    parts.push(`-H '${k}: ${esc(v)}'`);
  }
  if (d.request_body?.text) parts.push(`--data '${esc(d.request_body.text)}'`);
  return parts.join(" \\\n  ");
}
