import path from "path";
import { spawn } from "child_process";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";

export const runtime = "nodejs";

/* ──────────────────────────────────────────────────────────────
 * Persistent detection server management
 *
 * Instead of spawning a new Python process per frame (slow – loads
 * the YOLO model every time), we start a long-lived Python HTTP
 * server that loads the model once and handles frames via HTTP.
 * ────────────────────────────────────────────────────────────── */

let serverProcess = null;
let serverPort = null;
let serverReady = false;
let serverStarting = false;

function getLocalVenvPythonPath() {
  const venvDir = [46, 118, 101, 110, 118]
    .map((code) => String.fromCharCode(code))
    .join("");

  return process.platform === "win32"
    ? path.join(process.cwd(), "..", "backend", venvDir, "Scripts", "python.exe")
    : path.join(process.cwd(), "..", "backend", venvDir, "bin", "python");
}

function findPythonPath() {
  if (process.env.FLORISIGHT_PYTHON_BIN) {
    return process.env.FLORISIGHT_PYTHON_BIN;
  }
  return getLocalVenvPythonPath();
}

async function ensureDetectionServer() {
  if (serverReady && serverProcess && !serverProcess.killed) {
    return serverPort;
  }

  if (serverStarting) {
    // Wait for the already-in-progress startup
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (serverReady) return serverPort;
    }
    throw new Error("Detection server startup timed out.");
  }

  serverStarting = true;

  try {
    const pythonPath = findPythonPath();
    const scriptPath = path.join(
      process.cwd(),
      "..",
      "backend",
      "scripts",
      "detect_server.py"
    );
    const port = 5555;

    const child = spawn(pythonPath, [scriptPath, String(port)], {
      cwd: path.join(process.cwd(), "..", "backend"),
      stdio: ["ignore", "pipe", "pipe"],
    });

    serverProcess = child;

    // Collect stderr for debugging
    let stderrBuf = "";
    child.stderr.on("data", (chunk) => {
      stderrBuf += String(chunk);
      // Log model loading progress
      if (stderrBuf.includes("Detection server listening")) {
        console.log("[detect-server]", stderrBuf.trim());
        stderrBuf = "";
      }
    });

    child.on("exit", (code) => {
      console.error(`[detect-server] exited with code ${code}`);
      if (stderrBuf) console.error("[detect-server]", stderrBuf);
      serverProcess = null;
      serverPort = null;
      serverReady = false;
      serverStarting = false;
    });

    // Wait for the ready signal on stdout
    const readyPort = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Detection server failed to start within 30s.\n" + stderrBuf));
      }, 30000);

      let stdoutBuf = "";
      child.stdout.on("data", (chunk) => {
        stdoutBuf += String(chunk);
        try {
          const msg = JSON.parse(stdoutBuf);
          if (msg.ready) {
            clearTimeout(timeout);
            resolve(msg.port);
          }
        } catch {
          // Not complete JSON yet
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    serverPort = readyPort;
    serverReady = true;
    return readyPort;
  } finally {
    serverStarting = false;
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const frameDataUrl = String(body.frame || "").trim();
    const confidence = Number(body.confidence) || 0.25;

    if (!frameDataUrl) {
      return NextResponse.json(
        { message: "Frame data is required." },
        { status: 400 }
      );
    }

    let apiUrl = "";
    if (process.env.FLORISIGHT_PYTHON_VISION_URL) {
      apiUrl = new URL("/", process.env.FLORISIGHT_PYTHON_VISION_URL).toString();
      
      // Instead of proxying the fetch and hitting Vercel's 10s serverless timeout,
      // return a 307 Temporary Redirect. The browser will automatically re-issue 
      // the exact same POST request (with the body) directly to the Render backend!
      return NextResponse.redirect(apiUrl, { status: 307 });
    } else {
      // Ensure the local detection server is running
      const port = await ensureDetectionServer();
      apiUrl = `http://127.0.0.1:${port}/`;
    }

    // Forward the frame to the persistent Python server (only happens locally)
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: frameDataUrl, confidence }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error("Frame detection failed", error);

    // Reset server state so next request tries to restart
    serverReady = false;

    return NextResponse.json(
      {
        message: error?.message || "Unable to process frame.",
        detections: [],
        count: 0,
      },
      { status: 500 }
    );
  }
}
