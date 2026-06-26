"use client";

import { useEffect, useState } from "react";
import { fetchConnection } from "@/lib/api";
import type { Connection } from "@/lib/types";

type Plat = "ios" | "android" | "device" | "flutter" | "web";

const PLATFORMS: { key: Plat; label: string; sub: string }[] = [
  { key: "ios",     label: "iOS",      sub: "Simulator"   },
  { key: "android", label: "Android",  sub: "Emulator"    },
  { key: "device",  label: "Physical", sub: "Device"      },
  { key: "flutter", label: "Flutter",  sub: "Dart / HTTP" },
  { key: "web",     label: "Web",      sub: "Browser"     },
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
      : plat === "android"
      ? conn?.android_emulator_host ?? "10.0.2.2"
      : plat === "web"
      ? "127.0.0.1"
      : conn?.lan_ip ?? "—";

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[30]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(680px,96vw)] max-h-[90vh] overflow-hidden bg-[var(--bg-2)] border border-[var(--border)] rounded-[14px] z-[31] flex flex-col shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="px-6 pt-[22px] pb-[18px] border-b border-[var(--border)] flex-shrink-0">
          <button
            className="float-right bg-none border-none text-[var(--muted)] text-[16px] cursor-pointer px-[6px] py-[2px] rounded-[5px] hover:text-[var(--text)] hover:bg-[var(--panel-2)] transition-colors"
            onClick={onClose}
          >✕</button>
          <div className="text-[17px] font-semibold text-[var(--text)]">Connect a device</div>
          <div className="text-xs text-[var(--muted)] mt-[3px]">Route traffic through the proxy to inspect it</div>
        </div>

        {err && (
          <div className="px-5 py-[18px] overflow-auto text-[var(--red)]">
            ⚠ Start the proxy service first — run <strong>🐔 Start ChickenProxy</strong> then reopen this.
          </div>
        )}

        {conn && (
          <>
            <div className="grid gap-2 px-6 py-4 border-b border-[var(--border)] flex-shrink-0" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
              {PLATFORMS.map(({ key, label, sub }) => (
                <button
                  key={key}
                  className={`flex flex-col items-center gap-1 px-2 py-3 rounded-[10px] border cursor-pointer transition-colors ${
                    plat === key
                      ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
                      : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)] hover:bg-[var(--panel-2)]"
                  }`}
                  onClick={() => setPlat(key)}
                >
                  <span className={`text-xs font-semibold ${plat === key ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{label}</span>
                  <span className="text-[10px] text-[var(--muted)]">{sub}</span>
                </button>
              ))}
            </div>

            <div className="px-6 py-4 bg-[var(--bg)] border-b border-[var(--border)] flex-shrink-0">
              <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--faint)] mb-2">Set your proxy to</div>
              <CopyBlock text={`${host}:${port}`} large />
            </div>

            <div className="px-6 py-5 overflow-auto flex-1">
              {plat === "ios"     && <IosSteps     port={port} certUrl={conn.cert_url_loopback ?? conn.cert_url} />}
              {plat === "android" && <AndroidSteps host={host} port={port} certUrl={conn.cert_url_android ?? conn.cert_url} />}
              {plat === "device"  && <DeviceSteps  ip={conn.lan_ip} port={port} certUrl={conn.cert_url} />}
              {plat === "flutter" && <FlutterSteps host={host} port={port} />}
              {plat === "web"     && <WebSteps     port={port} certUrl={conn.cert_url_loopback ?? conn.cert_url} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function CopyBlock({ text, large }: { text: string; large?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); }
    catch { /* blocked */ }
  };
  return (
    <button
      className="flex items-center justify-between gap-3 w-full bg-[var(--panel)] border border-[var(--border)] rounded-[10px] px-4 py-3 cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--panel-2)] transition-colors"
      onClick={copy}
    >
      <span className={`font-mono text-[var(--text)] text-[13px] ${large ? "text-[18px] font-bold text-[var(--accent)]" : ""}`}>{text}</span>
      <span className="text-[11px] text-[var(--muted)] whitespace-nowrap bg-[var(--panel-2)] border border-[var(--border)] rounded-[5px] px-2 py-[2px]">{done ? "✓ Copied" : "⧉ Copy"}</span>
    </button>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-[14px]">
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] text-[var(--accent)] text-[11px] font-bold flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1 text-[13px] text-[var(--text)] leading-[1.6] pt-[2px] [&_code]:bg-[var(--panel-2)] [&_code]:border [&_code]:border-[var(--border)] [&_code]:px-[6px] [&_code]:py-[1px] [&_code]:rounded [&_code]:font-mono [&_code]:text-xs [&_strong]:text-[var(--text)]">
        {children}
      </div>
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
    <div className="relative mt-[10px] mb-1 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
      <button
        className="absolute top-2 right-2 bg-[var(--panel)] border border-[var(--border)] rounded-[5px] text-[var(--muted)] text-xs px-2 py-[2px] cursor-pointer hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
        onClick={copy}
      >{done ? "✓" : "⧉"}</button>
      <pre className="m-0 py-3 pl-[14px] pr-10 font-mono text-xs text-[#cdd6e6] whitespace-pre overflow-x-auto leading-[1.5]">{code}</pre>
    </div>
  );
}

function IosSteps({ port, certUrl }: { port: number; certUrl: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Step n={1}>
        The iOS Simulator shares your Mac&apos;s network — set the <strong>macOS</strong> system proxy:<br />
        System Settings → Network → your interface → Details → Proxies<br />
        Enable <strong>Web Proxy (HTTP)</strong> and <strong>Secure Web Proxy (HTTPS)</strong> →
        host <code>127.0.0.1</code>, port <code>{port}</code>
      </Step>
      <Step n={2}>
        Open this URL in the Simulator&apos;s Safari to install the mitmproxy CA certificate:
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
    <div className="flex flex-col gap-5">
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
    <div className="flex flex-col gap-5">
      <Step n={1}>
        Connect the device to the <strong>same Wi-Fi</strong> network as this machine.
      </Step>
      <Step n={2}>
        On the device: Wi-Fi settings → tap the network → Configure Proxy → Manual<br />
        <div className="grid mt-[10px]" style={{ gridTemplateColumns: "60px 1fr", gap: "6px 8px", alignItems: "center" }}>
          <span className="text-[11px] text-[var(--muted)] uppercase tracking-[0.04em]">Server</span><CopyBlock text={ip} />
          <span className="text-[11px] text-[var(--muted)] uppercase tracking-[0.04em]">Port</span><CopyBlock text={String(port)} />
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

function WebSteps({ port, certUrl }: { port: number; certUrl: string }) {
  return (
    <div className="flex flex-col gap-5">
      <Step n={1}>
        <strong>Chrome / Safari</strong> — set the <strong>macOS system proxy</strong>:<br />
        System Settings → Network → your interface → Details → Proxies<br />
        Enable <strong>Web Proxy (HTTP)</strong> and <strong>Secure Web Proxy (HTTPS)</strong> →
        host <code>127.0.0.1</code>, port <code>{port}</code>
      </Step>
      <Step n={2}>
        <strong>Firefox</strong> — has its own proxy settings:<br />
        Preferences → General → Network Settings → Manual proxy configuration<br />
        HTTP Proxy <code>127.0.0.1</code> port <code>{port}</code> → check <strong>Also use this proxy for HTTPS</strong>
      </Step>
      <Step n={3}>
        Install the mitmproxy CA certificate so HTTPS traffic decrypts without warnings.<br />
        Open this URL in the browser you want to inspect:
        <CopyBlock text={certUrl} />
        Then trust/install the downloaded <code>.pem</code> file:<br />
        <strong>macOS:</strong> double-click → Keychain Access → set to <em>Always Trust</em><br />
        <strong>Firefox:</strong> Preferences → Privacy → Certificates → View Certificates → Authorities → Import
      </Step>
      <Step n={4}>
        Or launch Chrome with the proxy pre-set (no system-level change needed):
        <CodeBlock code={`open -a "Google Chrome" --args --proxy-server="127.0.0.1:${port}"`} />
      </Step>
    </div>
  );
}

function FlutterSteps({ host, port }: { host: string; port: number }) {
  return (
    <div className="flex flex-col gap-5">
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
