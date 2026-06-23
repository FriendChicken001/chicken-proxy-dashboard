export interface FlowSummary {
  id: string;
  time_start: number | null;
  method: string;
  scheme: string;
  host: string;
  port: number;
  path: string;
  url: string;
  status_code: number | null;
  reason: string | null;
  content_type: string | null;
  request_size: number;
  response_size: number;
  duration_ms: number | null;
  error: string | null;
  completed: boolean;
  mocked: boolean;
  mock_name: string | null;
}

export interface MockRule {
  id: string;
  enabled: boolean;
  name: string;
  method: string; // "" = any method
  url_contains: string;
  status_code: number;
  headers: [string, string][];
  body: string;
  hits: number;
}

export interface MessageBody {
  size: number;
  is_text: boolean;
  truncated: boolean;
  text: string | null;
}

export interface FlowDetail extends FlowSummary {
  request_headers: [string, string][];
  response_headers: [string, string][];
  query: [string, string][];
  request_body: MessageBody;
  response_body: MessageBody | null;
  http_version: string;
}

export interface Connection {
  proxy_port: number;
  lan_ip: string;
  loopback: string;
  android_emulator_host: string;
  genymotion_host: string;
  cert_url: string;
}

export interface Stats {
  total: number;
  methods: Record<string, number>;
  status_classes: Record<string, number>;
  top_hosts: { host: string; count: number }[];
  bytes_in: number;
  mocked: number;
  avg_ms: number;
  p95_ms: number;
  timeline: { t: number; count: number }[];
}
