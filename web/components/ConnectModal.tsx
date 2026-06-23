"use client";

import { useEffect, useState } from "react";
import { fetchConnection } from "@/lib/api";
import type { Connection } from "@/lib/types";

type Plat = "ios" | "android" | "device" | "flutter";

const PLATFORMS: { key: Plat; label: string; sub: string }[] = [
  { key: "ios",     label: "iOS",      sub: "Simulator"   },
  { key: "android", label: "Android",  sub: "Emulator"    },
  { key: "device",  label: "Physical", sub: "Device"      },
  { key: "flutter", label: "Flutter",  sub: "Dart / HTTP" },
];

export default function ConnectModal({ onClose, port }: { onClose: () => void; port: number }) {
  const [conn, setConn] = useState<Connection | null>(null);
  const [err,  setErr]  = useState<string | null>(null);
  const [plat, setPlat] = useState<Plat>("ios");

  useEffect(() => {
    fetchConnection().then(setConn).catch((e) => setErr(String(e)));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const host =
    plat === "ios"
      ? conn?.loopback ?? "127.0.0.1"
      : plat === "android" || plat === "flutter"
      ? conn?.android_emulator_host ?? "10.0.2.2"
      : conn?.lan_ip ?? "—";

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal cm-modal">
        {/* header */}
        <div className="cm-header">
          <button className="cm-close" onClick={onClose}>✕</button>
          <div className="cm-title">Connect a device</div>
          <div className="cm-subtitle">Route traffic through the proxy to inspect it</div>
        </div>

        {err && <div className="modal-body err">⚠ Start the proxy service first — run <strong>🐔 Start ChickenProxy</strong> then reopen this.</div>}

        {conn && (
          <>
            {/* platform picker */}
            <div className="cm-platforms">
              {PLATFORMS.map(({ key, label, sub }) => (
                <button
                  key={key}
                  className={`cm-plat-card${plat === key ? " active" : ""}`}
                  onClick={() => setPlat(key)}
                >
                  <span className="cm-plat-label">{label}</span>
                  <span className="cm-plat-sub">{sub}</span>
                </button>
              ))}
            </div>

            {/* proxy address */}
            <div className="cm-addr-bar">
              <div className="cm-addr-hint">Set your proxy to</div>
              <CopyBlock text={`${host}:${port}`} large />
            </div>

            {/* steps */}
            <div className="cm-steps-wrap">
              {plat === "ios"     && <IosSteps     port={port} certUrl={conn.cert_url} />}
              {plat === "android" && <AndroidSteps host={host} port={port} certUrl={conn.cert_url} />}
              {plat === "device"  && <DeviceSteps  ip={conn.lan_ip} port={port} certUrl={conn.cert_url} />}
              {plat === "flutter" && <FlutterSteps host={host} port={port} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── shared pieces ─────────────────────────────────────────────── */

function CopyBlock({ text, large }: { text: string; large?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }
    catch { /* blocked */ }
  };
  return (
    <button className={`cm-copy-block${large ? " large" : ""}`} onClick={copy}>
      <span className="cm-copy-text mono">{text}</span>
      <span className="cm-copy-ico">{done ? "✓ Copied" : "⧉ Copy"}</span>
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="cm-step">
      <div className="cm-step-num">{n}</div>
      <div className="cm-step-body">{children}</div>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setDone(true); setTimeout(() => setDone(false), 1400); }
    catch { /* blocked */ }
  };
  return (
    <div className="cm-code-wrap">
      <button className="cm-code-copy" onClick={copy}>{done ? "✓" : "⧉"}</button>
      <pre className="cm-code">{code}</pre>
    </div>
  );
}

/* ─── platform steps ─────────────────────────────────────────────── */

function IosSteps({ port, certUrl }: { port: number; certUrl: string }) {
  return (
    <div className="cm-steps">
      <Step n={1}>
        The iOS Simulator shares your Mac's network — set the <strong>macOS</strong> system proxy:<br />
        System Settings → Network → your interface → Details → Proxies<br />
        Enable <strong>Web Proxy (HTTP)</strong> and <strong>Secure Web Proxy (HTTPS)</strong> →
        host <code>127.0.0.1</code>, port <code>{port}</code>
      </Step>
      <Step n={2}>
        Open this URL in the Simulator's Safari to install the mitmproxy CA certificate:
        <CopyBlock text={certUrl} />
      </Step>
      <Step n={3}>
        Settings → General → VPN &amp; Device Management → install the profile<br />
        Then Settings → General → About → Certificate Trust Settings →
        enable <strong>full trust</strong> for mitmproxy
      </Step>
    </div>
  );
}

function AndroidSteps({ host, port, certUrl }: { host: string; port: number; certUrl: string }) {
  return (
    <div className="cm-steps">
      <Step n={1}>
        <strong>{host}</strong> is the emulator alias for your host machine.<br />
        Launch the AVD with the proxy pre-set:
        <CodeBlock code={`emulator -avd <name> -http-proxy http://${host}:${port}`} />
        Or apply it live via adb:
        <CodeBlock code={`adb shell settings put global http_proxy ${host}:${port}`} />
      </Step>
      <Step n={2}>
        Open the CA URL in the emulator browser to install the certificate:
        <CopyBlock text={certUrl} />
        Then → Settings → Security → Encryption &amp; credentials → Install a certificate → CA certificate
      </Step>
      <Step n={3}>
        Android only trusts <strong>user</strong> CAs for apps that opt in.
        Add <code>network_security_config.xml</code> to your app or use the Flutter tab override.
      </Step>
    </div>
  );
}

function DeviceSteps({ ip, port, certUrl }: { ip: string; port: number; certUrl: string }) {
  return (
    <div className="cm-steps">
      <Step n={1}>
        Connect the device to the <strong>same Wi-Fi</strong> network as this machine.
      </Step>
      <Step n={2}>
        On the device: Wi-Fi settings → tap the network → Configure Proxy → Manual<br />
        <div className="cm-kv">
          <span className="cm-kv-k">Server</span><CopyBlock text={ip} />
          <span className="cm-kv-k">Port</span><CopyBlock text={String(port)} />
        </div>
      </Step>
      <Step n={3}>
        Open the CA URL on the device to install and trust the mitmproxy certificate:
        <CopyBlock text={certUrl} />
        See the iOS / Android tabs for the exact trust steps per platform.
      </Step>
    </div>
  );
}

function FlutterSteps({ host, port }: { host: string; port: number }) {
  return (
    <div className="cm-steps">
      <Step n={1}>
        Add <strong>HttpOverrides</strong> in <code>main.dart</code> to route all Dart HTTP
        traffic through the proxy and trust the mitmproxy certificate:
        <CodeBlock code={`import 'dart:io';

class MitmHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..findProxy = (uri) => 'PROXY ${host}:${port}'
      ..badCertificateCallback =
          (X509Certificate cert, String host, int port) => true;
  }
}

void main() {
  HttpOverrides.global = MitmHttpOverrides();
  runApp(const MyApp());
}`} />
      </Step>
      <Step n={2}>
        Using <strong>Dio</strong>? Override the adapter instead:
        <CodeBlock code={`import 'package:dio/io.dart';

(dio.httpClientAdapter as IOHttpClientAdapter).createHttpClient = () {
  final client = HttpClient();
  client.findProxy = (uri) => 'PROXY ${host}:${port}';
  client.badCertificateCallback = (cert, host, port) => true;
  return client;
};`} />
      </Step>
      <Step n={3}>
        Using the <strong>http</strong> package? Wrap with <code>IOClient</code>:
        <CodeBlock code={`import 'dart:io';
import 'package:http/io_client.dart';

final client = IOClient(
  HttpClient()
    ..findProxy = (uri) => 'PROXY ${host}:${port}'
    ..badCertificateCallback = (cert, host, port) => true,
);`} />
      </Step>
      <Step n={4}>
        ⚠️ <strong>Debug only</strong> — these overrides bypass certificate validation.
        Gate with <code>kDebugMode</code> so they never ship in release builds.
      </Step>
    </div>
  );
}
