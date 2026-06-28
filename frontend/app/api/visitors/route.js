import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { createVisitorEvent } from "../../lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const event = await createVisitorEvent({
      reporterId: session.user.id,
      reporterName: session.user.name || session.user.email,
      zone: body.zone,
      visitorCount: body.visitorCount,
      note: body.note,
      imageUrl: body.imageUrl,
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Visitor event failed", error);

    return NextResponse.json(
      { message: error?.message || "Unable to log visitor event." },
      { status: 500 }
    );
  }
}
