import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { answerCopilotQuestion } from "../../lib/db";
import { generateCopilotAnswerWithGemini } from "../../lib/local-llm";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const question = String(body.question || "").trim();

    if (!question) {
      return NextResponse.json({ message: "Ask a question first." }, { status: 400 });
    }

    const answer = await answerCopilotQuestion(session.user, question);
    const refinedAnswer = await generateCopilotAnswerWithGemini(question, answer);
    return NextResponse.json({ answer: refinedAnswer });
  } catch (error) {
    console.error("Copilot query failed", error);

    return NextResponse.json(
      { message: error?.message || "Unable to answer from chat right now." },
      { status: 500 }
    );
  }
}
