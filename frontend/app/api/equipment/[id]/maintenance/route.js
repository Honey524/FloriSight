import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../auth/[...nextauth]/route";
import { createMaintenanceLog, getMaintenanceLogs, getUserByEmail } from "../../../../lib/db";

export const runtime = "nodejs";

async function resolveSessionUser(session) {
  if (!session?.user?.email) return null;
  if (session.user.id && session.user.role) return session.user;
  const dbUser = await getUserByEmail(session.user.email);
  if (!dbUser) return null;
  return { ...session.user, id: dbUser.id, role: dbUser.role };
}

export async function GET(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = await resolveSessionUser(session);
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const logs = await getMaintenanceLogs(id);
    return NextResponse.json({ logs });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);
  const user = await resolveSessionUser(session);
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "Worker") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await request.json();
    const log = await createMaintenanceLog({
      equipmentId: id,
      serviceType: body.serviceType,
      description: body.description,
      cost: Number.isFinite(Number(body.cost)) ? Number(body.cost) : null,
      performedBy: body.performedBy || user.name,
      performedDate: body.performedDate,
      nextDueDate: body.nextDueDate,
    });
    return NextResponse.json({ log });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
