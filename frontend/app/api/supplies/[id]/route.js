import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { updateSupply, getUserByEmail } from "../../../lib/db";

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
    const supply = await updateSupply(id, {
      quantity: body.quantity !== undefined ? Number(body.quantity) : undefined,
      reorderLevel: body.reorderLevel !== undefined ? Number(body.reorderLevel) : undefined,
      cost: body.cost !== undefined ? Number(body.cost) : undefined,
    });
    return NextResponse.json({ supply });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
