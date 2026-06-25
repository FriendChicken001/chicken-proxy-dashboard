import { spawn } from "child_process";
import path from "path";
import { NextResponse } from "next/server";

const projectDir = path.resolve(process.cwd(), "..");

export async function POST() {
  const child = spawn("bash", [path.join(projectDir, "stop.sh")], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return NextResponse.json({ ok: true });
}
