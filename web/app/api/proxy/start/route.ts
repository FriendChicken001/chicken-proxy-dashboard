import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

const projectDir = path.resolve(process.cwd(), "..");

export async function POST() {
  const mitm =
    process.env.MITMDUMP_BIN ||
    path.join(projectDir, "venv", "bin", "mitmdump");
  const addon = path.join(projectDir, "addon", "mitm_dashboard.py");
  spawn(mitm, ["-s", addon, "-p", "8888"], {
    detached: true,
    stdio: "ignore",
  }).unref();
  return NextResponse.json({ ok: true });
}
