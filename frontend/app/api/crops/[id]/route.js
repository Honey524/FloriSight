import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { updateCrop, deleteCrop, getUserByEmail } from "../../../lib/db";

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
    const crop = await updateCrop(id, {
      name: body.name,
      variety: body.variety,
      zone: body.zone,
      quantity: Number.isFinite(Number(body.quantity)) ? Number(body.quantity) : undefined,
      growthStage: body.growthStage,
      healthStatus: body.healthStatus,
      plantedDate: body.plantedDate,
      expectedHarvest: body.expectedHarvest,
      notes: body.notes,
      bed: body.bed,
      cost: body.cost !== undefined ? (body.cost != null ? Number(body.cost) : null) : undefined,
      price: body.price !== undefined ? (body.price != null ? Number(body.price) : null) : undefined,
      batchCode: body.batchCode,
    });
    return NextResponse.json({ crop });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
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
    await deleteCrop(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
