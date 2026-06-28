import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { markChatMessagesRead } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await markChatMessagesRead(session.user);
    return NextResponse.json({ state });
  } catch (error) {
    console.error("Mark read failed", error);

    return NextResponse.json(
      { message: "Unable to update message status." },
      { status: 500 }
    );
  }
}
