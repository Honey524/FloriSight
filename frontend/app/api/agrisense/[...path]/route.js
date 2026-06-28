/**
 * AgriSense API
 *
 * Serves AgriSense endpoints from the local FloriSight backend/database.
 */
import { getToken } from "next-auth/jwt";
import {
  createFarmerIssue,
  createFarmVisit,
  getAgriSenseActor,
  getFarmerFarmView,
  getFarmDetail,
  getFarmVisits,
  getManagerBriefing,
  getManagerPortfolio,
  getSupervisorFarmerProfile,
  getSupervisorFarmers,
  getSupervisorInviteLink,
  getSupervisorStats,
  getSupervisorVisits,
  searchSupervisorFarmers,
  updateFarmerTasks,
  updateVisitReport,
} from "../../../lib/agrisense-db";

async function transcribeAudioFile(file) {
  const sarvamKey = process.env.SARVAM_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let rawTranscript = null;

  if (sarvamKey) {
    console.log("[transcribe] Using Sarvam AI STT API in translate mode...");
    const sarvamFormData = new FormData();
    const blob = new Blob([buffer], { type: file.type || "audio/webm" });
    sarvamFormData.append("file", blob, file.name || "audio.webm");
    sarvamFormData.append("model", "saaras:v3");
    sarvamFormData.append("mode", "translate");

    try {
      const response = await fetch("https://api.sarvam.ai/speech-to-text", {
        method: "POST",
        headers: {
          "api-subscription-key": sarvamKey,
        },
        body: sarvamFormData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.transcript) {
          rawTranscript = data.transcript;
        }
      } else {
        const errorText = await response.text();
        console.error("[transcribe] Sarvam API returned error:", response.status, errorText);
      }
    } catch (err) {
      console.error("[transcribe] Sarvam API request failed:", err);
    }
  }

  // If we got a transcription, check if it needs translation (contains Indian scripts) and Gemini is available.
  // Since we requested "translate" mode from Sarvam, it should normally be in English.
  // We only call Gemini translation as a fallback if the text contains Indian script characters.
  if (rawTranscript) {
    const containsIndianScript = /[\u0900-\u0DFF]/.test(rawTranscript);
    if (containsIndianScript && geminiKey) {
      console.log("[transcribe] Sarvam transcript contains Indian script. Translating to English via Gemini...");
      try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        const result = await model.generateContent([
          `Translate the following regional Indian language transcript into clear, natural English. Keep any floriculture or farm terms correct. Output ONLY the English translation, no other text or explanation:\n\n${rawTranscript}`
        ]);
        const response = await result.response;
        const text = response.text();
        if (text) {
          return text.trim();
        }
      } catch (err) {
        console.error("[transcribe] Translation via Gemini failed:", err);
      }
    }
    return rawTranscript;
  }

  if (geminiKey) {
    console.log("[transcribe] Fallback/Direct to Gemini AI (transcribing and translating directly)...");
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const base64Data = buffer.toString("base64");
      const mimeType = file.type || "audio/webm";

      const audioPart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      const result = await model.generateContent([
        "Translate and transcribe this audio content into clear, natural English. Output only the English translation/transcription, nothing else.",
        audioPart,
      ]);

      const response = await result.response;
      const text = response.text();
      if (text) {
        return text.trim();
      }
    } catch (err) {
      console.error("[transcribe] Gemini fallback failed:", err);
    }
  }

  console.log("[transcribe] Mock transcription fallback");
  return "Voice update recorded in the field.";
}

async function proxyRequest(request, { params }) {
  const { path } = await params;
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const pathStr = Array.isArray(path) ? path.join("/") : path;
  const segments = pathStr.split("/").filter(Boolean);
  const method = request.method;

  if (!token) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await getAgriSenseActor(token);
  const url = new URL(request.url);

  let body = {};
  if (!["GET", "HEAD"].includes(method)) {
    const contentType = request.headers.get("content-type") || "";
    body = contentType.includes("application/json") ? await request.json().catch(() => ({})) : {};
  }

  try {
    if (method === "GET" && pathStr === "supervisor/stats") {
      return Response.json(await getSupervisorStats(actor));
    }
    if (method === "GET" && pathStr === "supervisor/farmers") {
      return Response.json(await getSupervisorFarmers(actor));
    }
    if (method === "GET" && segments[0] === "supervisor" && segments[1] === "farmers" && segments[2]) {
      const profile = await getSupervisorFarmerProfile(actor, segments[2]);
      return profile
        ? Response.json(profile)
        : Response.json({ error: "Farmer not found" }, { status: 404 });
    }
    if (method === "GET" && pathStr === "supervisor/my-visits") {
      return Response.json(await getSupervisorVisits(actor));
    }
    if (method === "GET" && pathStr === "supervisor/my-invite-link") {
      return Response.json(await getSupervisorInviteLink(url.origin, actor));
    }
    if (method === "GET" && pathStr === "farmers/search") {
      return Response.json(await searchSupervisorFarmers(actor, url.searchParams.get("q") || ""));
    }
    if (method === "GET" && pathStr === "manager/portfolio") {
      return Response.json(await getManagerPortfolio());
    }
    if (method === "POST" && pathStr === "manager/briefing") {
      return Response.json(await getManagerBriefing());
    }
    if (method === "GET" && pathStr === "farmer/my-farm") {
      const farmView = await getFarmerFarmView(actor, url.searchParams.get("farm_id"));
      return farmView
        ? Response.json(farmView)
        : Response.json({ error: "Farm not found" }, { status: 404 });
    }
    if (method === "PATCH" && pathStr === "farmer/tasks") {
      const result = await updateFarmerTasks(actor, body.farm_id, body.task_text, body.is_completed);
      return result
        ? Response.json(result)
        : Response.json({ error: "Unable to update tasks" }, { status: 404 });
    }
    if (method === "POST" && pathStr === "farmer/report-issue") {
      const visit = await createFarmerIssue(actor, body.farm_id, body.message);
      return visit
        ? Response.json({ visit })
        : Response.json({ error: "Unable to report issue" }, { status: 404 });
    }
    if (method === "GET" && segments[0] === "farms" && segments[1] && !segments[2]) {
      const farm = await getFarmDetail(segments[1]);
      return farm
        ? Response.json({ farm })
        : Response.json({ error: "Farm not found" }, { status: 404 });
    }
    if (segments[0] === "farms" && segments[1] && segments[2] === "visits" && method === "GET") {
      return Response.json(await getFarmVisits(segments[1]));
    }
    if (segments[0] === "farms" && segments[1] && segments[2] === "visits" && method === "POST") {
      console.log("[AgriSense API] POST visits handler. segments:", segments, "body:", body);
      const visit = await createFarmVisit(actor, segments[1], body);
      console.log("[AgriSense API] POST visits handler result:", visit);
      return visit
        ? Response.json({ visit })
        : Response.json({ error: "Unable to create visit" }, { status: 404 });
    }
    if (segments[0] === "visits" && segments[1] && segments[2] === "report" && method === "PUT") {
      const visit = await updateVisitReport(segments[1], body);
      return visit
        ? Response.json({ visit })
        : Response.json({ error: "Visit not found" }, { status: 404 });
    }
    if (pathStr === "sarvam/transcribe") {
      if (method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }
      const contentType = request.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return Response.json({ error: "Invalid content type" }, { status: 400 });
      }

      const formData = await request.formData();
      const file = formData.get("file");
      if (!file) {
        return Response.json({ error: "No audio file provided" }, { status: 400 });
      }

      const transcript = await transcribeAudioFile(file);
      return Response.json({ transcript });
    }
    if (pathStr === "chat/ask") {
      if (method !== "POST") {
        return Response.json({ error: "Method not allowed" }, { status: 405 });
      }

      const contentType = request.headers.get("content-type") || "";
      let question = "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file");
        if (file) {
          question = await transcribeAudioFile(file);
        } else {
          question = formData.get("question") || "";
        }
      } else {
        question = body.question || "";
      }

      question = String(question || "").trim();
      if (!question) {
        return Response.json({ error: "Ask a question first." }, { status: 400 });
      }

      const { answerCopilotQuestion } = await import("../../../lib/db");
      const { generateCopilotAnswerWithGemini } = await import("../../../lib/local-llm");

      const answer = await answerCopilotQuestion(actor, question);
      const refinedAnswer = await generateCopilotAnswerWithGemini(question, answer);

      return Response.json({
        question,
        answer: refinedAnswer,
      });
    }

    return Response.json({ error: "AgriSense endpoint not found" }, { status: 404 });
  } catch (err) {
    console.error("[AgriSense API] Error:", err);
    return Response.json(
      { error: err?.message || "AgriSense request failed" },
      { status: 500 }
    );
  }
}

export const GET     = (req, ctx) => proxyRequest(req, ctx);
export const POST    = (req, ctx) => proxyRequest(req, ctx);
export const PUT     = (req, ctx) => proxyRequest(req, ctx);
export const PATCH   = (req, ctx) => proxyRequest(req, ctx);
export const DELETE  = (req, ctx) => proxyRequest(req, ctx);
export const OPTIONS = () => new Response(null, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  },
});
