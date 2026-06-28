import { GoogleGenerativeAI } from "@google/generative-ai";

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenerativeAI(apiKey);
}

export function getLocalLlmStatus() {
  const client = getGeminiClient();

  return {
    enabled: Boolean(client),
    provider: client ? "Google Gemini" : "Built-in",
    model: client ? "gemini-2.5-flash" : null,
    baseUrl: "https://generativelanguage.googleapis.com",
  };
}

export async function generateCopilotAnswerWithGemini(question, answer) {
  const client = getGeminiClient();

  if (!client) {
    return answer;
  }

  const hasEvidence = Array.isArray(answer.evidence) && answer.evidence.length > 0;
  const isGeneralKnowledge = answer.isGeneralKnowledge === true;

  const prompt = isGeneralKnowledge || !hasEvidence
    ? [
        "You are AgriSage, an intelligent agriculture operations copilot for FloriSight — a floriculture and farm workforce management platform.",
        "The user asked a general question that does not relate to any specific live data record.",
        "Answer it using your own knowledge. Keep answers concise, accurate, and helpful.",
        "Cover topics like agriculture, farming, floriculture, payroll, attendance, greenhouse operations, workforce management, and general knowledge.",
        "If the question is completely unrelated to any useful topic, politely say you are optimized for farm and workforce queries but still try to help briefly.",
        `Question: ${question}`,
        "Respond in plain text without markdown formatting.",
      ].join("\n")
    : [
        "You are AgriSage, an intelligent agriculture operations copilot for FloriSight.",
        "Using the provided evidence below, concisely and accurately answer the user's question.",
        "Stick to the evidence but explain it naturally. Do not invent data that is not present in the evidence.",
        "Your response should be natural, helpful, and sound like an assistant rather than a robotic summary.",
        `Question: ${question}`,
        answer.summary ? `Pre-calculated Summary: ${answer.summary}` : "",
        `Retrieved Context: ${JSON.stringify(answer.evidence)}`,
        "Respond in plain text without markdown formatting.",
      ].filter(Boolean).join("\n");

  try {
    const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    if (!text) {
      return answer;
    }

    return {
      ...answer,
      summary: text.trim(),
    };
  } catch (_error) {
    return answer;
  }
}
