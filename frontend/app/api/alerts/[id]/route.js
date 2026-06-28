import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { acknowledgeAlert, resolveAlert, getUserByEmail } from "../../../lib/db";

export const runtime = "nodejs";

async function resolveSessionUser(session) {
  if (!session?.user?.email) return null;
  if (session.user.id && session.user.role) return session.user;
  const dbUser = await getUserByEmail(session.user.email);
  if (!dbUser) return null;
  return { ...session.user, id: dbUser.id, role: dbUser.role };
}

export async function PATCH(request, { params }) {
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
    let alert;
    if (body.action === "acknowledge") {
      alert = await acknowledgeAlert(id);
    } else if (body.action === "resolve") {
      alert = await resolveAlert(id);
    } else {
      return NextResponse.json({ message: "Invalid action. Use 'acknowledge' or 'resolve'." }, { status: 400 });
    }
    return NextResponse.json({ alert });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
