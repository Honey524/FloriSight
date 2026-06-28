import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import {
  createTrackingVisitorEvent,
  createVideoAnalysis,
  updateVideoAnalysis,
} from "../../lib/db";

export const runtime = "nodejs";

function getLocalVenvPythonPath() {
  const venvDir = [46, 118, 101, 110, 118]
    .map((code) => String.fromCharCode(code))
    .join("");

  return process.platform === "win32"
    ? path.join(process.cwd(), "..", "backend", venvDir, "Scripts", "python.exe")
    : path.join(process.cwd(), "..", "backend", venvDir, "bin", "python");
}

function executeTracking(pythonPath, videoPath, zone, analysisId) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "..", "backend", "scripts", "process_tracking.py");
    const child = spawn(pythonPath, [scriptPath, videoPath, zone, analysisId], {
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Tracking process exited with code ${code}`));
        return;
      }

      try {
        const jsonStart = stdout.indexOf("{");
        if (jsonStart === -1) {
          throw new Error("No JSON object found in stdout");
        }
        const jsonStr = stdout.substring(jsonStart);
        resolve(JSON.parse(jsonStr));
      } catch (error) {
        reject(new Error(`Failed to parse tracking output: ${error.message}. Raw output: ${stdout}`));
      }
    });
  });
}

async function runTracking(videoPath, zone, analysisId) {
  // If a remote python server is configured, send the video to the /track endpoint
  if (process.env.FLORISIGHT_PYTHON_VISION_URL) {
    const fs = require("fs/promises");
    const videoData = await fs.readFile(videoPath, "base64");
    
    const url = new URL("/track", process.env.FLORISIGHT_PYTHON_VISION_URL).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoDataUrl: videoData,
        zone,
        analysisId
      })
    });
    
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Tracking API failed");
    }
    return data;
  }

  // Fallback to local python spawn
  const candidates = process.env.FLORISIGHT_PYTHON_BIN
    ? [process.env.FLORISIGHT_PYTHON_BIN]
    : [getLocalVenvPythonPath(), "python3"];

  let lastError = null;

  for (const pythonPath of candidates) {
    try {
      return await executeTracking(pythonPath, videoPath, zone, analysisId);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to start the tracking worker.");
}

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let analysis;
  let videoPath = "";

  try {
    const body = await request.json();
    const zone = String(body.zone || "").trim();
    const imageDataUrl = String(body.imageDataUrl || "").trim();
    const videoDataUrl = String(body.videoDataUrl || "").trim();
    const mediaDataUrl = videoDataUrl || imageDataUrl;
    const peakVisitorCount = Number(body.peakVisitorCount || 0);
    const fileName = String(
      body.fileName || (imageDataUrl ? "capture.jpg" : "upload.mp4")
    ).trim();

    if (!zone || !mediaDataUrl) {
      return NextResponse.json(
        { message: "Zone and camera capture are required." },
        { status: 400 }
      );
    }

    analysis = await createVideoAnalysis({
      uploadedBy: session.user.id,
      uploadedByName: session.user.name || session.user.email,
      zone,
      fileName,
    });

    const base64Payload = mediaDataUrl.includes(",") ? mediaDataUrl.split(",")[1] : mediaDataUrl;
    const uploadsDir = path.join(process.cwd(), "tmp", "tracking");
    await fs.mkdir(uploadsDir, { recursive: true });
    const extension = path.extname(fileName) || ".mp4";
    videoPath = path.join(uploadsDir, `${randomUUID()}${extension}`);
    await fs.writeFile(videoPath, Buffer.from(base64Payload, "base64"));

    const summary = await runTracking(videoPath, zone, analysis.id);
    const effectiveVisitorCount = Math.max(
      Number(summary.trackCount || 0),
      Number(summary.rawDetectionCount || 0),
      Number(summary.visitorCount || 0),
      peakVisitorCount
    );
    const updated = await updateVideoAnalysis(analysis.id, {
      status: "completed",
      visitorCount: effectiveVisitorCount,
      uniqueTracks: Number(summary.trackCount || 0),
      summary: {
        ...summary,
        effectiveVisitorCount,
      },
    });

    if (effectiveVisitorCount > 0) {
      await createTrackingVisitorEvent({
        reporterId: session.user.id,
        reporterName: session.user.name || session.user.email,
        zone,
        visitorCount: effectiveVisitorCount,
        analysisId: analysis.id,
        mode: imageDataUrl ? "image" : "video",
      }).catch((error) => {
        console.error("Tracking visitor event ingestion failed", error);
      });
    }

    return NextResponse.json({ analysis: updated }, { status: 201 });
  } catch (error) {
    console.error("Tracking failed", error);

    if (analysis?.id) {
      await updateVideoAnalysis(analysis.id, {
        status: "failed",
        summary: {
          error: error?.message || "Unable to process tracking video.",
        },
      }).catch(() => {});
    }

    if (videoPath) {
      await fs.unlink(videoPath).catch(() => {});
    }

    return NextResponse.json(
      { message: error?.message || "Unable to process tracking video." },
      { status: 500 }
    );
  } finally {
    if (videoPath) {
      await fs.unlink(videoPath).catch(() => {});
    }
  }
}
