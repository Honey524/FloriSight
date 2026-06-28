import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { createAlert } from "../../lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (!["Admin", "Supervisor"].includes(session.user.role)) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const alert = await createAlert({
      createdBy: session.user.id,
      zone: String(body.zone || "").trim(),
      severity: String(body.severity || "medium").trim(),
      title: String(body.title || "").trim(),
      detail: String(body.detail || "").trim(),
    });

    return NextResponse.json({ alert }, { status: 201 });
  } catch (error) {
    console.error("Alert creation failed", error);

    return NextResponse.json(
      { message: error?.message || "Unable to create alert." },
      { status: 500 }
    );
  }
}
