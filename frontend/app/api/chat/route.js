import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { createChatMessage, processChatMessageIntelligence } from "../../lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user?.email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const text = String(body.text || "").trim();
    const imageUrl = String(body.imageUrl || "").trim();
    const tag = String(body.tag || "Update").trim() || "Update";

    if (!text && !imageUrl) {
      return NextResponse.json(
        { message: "Add a message or photo before sending." },
        { status: 400 }
      );
    }

    const targetSupervisorId = String(body.targetSupervisorId || "").trim() || null;
    const groupId = String(body.groupId || "").trim() || null;

    const message = await createChatMessage({
      senderId: session.user.id,
      senderName: session.user.name || session.user.email,
      senderRole: session.user.role || "Worker",
      supervisorId: targetSupervisorId || session.user.supervisorId || null,
      workerId: session.user.workerId || null,
      groupId,
      text,
      imageUrl,
      tag,
    });

    const extracted = await processChatMessageIntelligence(session.user, message);

    return NextResponse.json({ message, extracted }, { status: 201 });
  } catch (error) {
    console.error("Chat message failed", error);

    return NextResponse.json(
      { message: error?.message || "Unable to send the update right now." },
      { status: 500 }
    );
  }
}
