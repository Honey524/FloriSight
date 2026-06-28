import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { setNotificationsEnabled } from "../../../lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const state = await setNotificationsEnabled(session.user.id, body.enabled);
    return NextResponse.json({ state });
  } catch (error) {
    console.error("Notification preference failed", error);

    return NextResponse.json(
      { message: "Unable to save notification preference." },
      { status: 500 }
    );
  }
}
