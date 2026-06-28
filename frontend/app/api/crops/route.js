import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { getCrops, createCrop, getUserByEmail } from "../../lib/db";

export const runtime = "nodejs";

async function resolveSessionUser(session) {
  if (!session?.user?.email) return null;
  if (session.user.id && session.user.role) return session.user;
  const dbUser = await getUserByEmail(session.user.email);
  if (!dbUser) return null;
  return { ...session.user, id: dbUser.id, role: dbUser.role };
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const user = await resolveSessionUser(session);
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const zone = searchParams.get("zone");
    const crops = await getCrops({ zone: zone || undefined });
    return NextResponse.json({ crops });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const user = await resolveSessionUser(session);
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  if (user.role === "Worker") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await request.json();
    const crop = await createCrop({
      name: body.name,
      variety: body.variety,
      zone: body.zone,
      quantity: Number(body.quantity),
      growthStage: body.growthStage,
      healthStatus: body.healthStatus,
      plantedDate: body.plantedDate,
      expectedHarvest: body.expectedHarvest,
      notes: body.notes,
      createdBy: user.id,
      bed: body.bed,
      cost: body.cost != null ? Number(body.cost) : undefined,
      price: body.price != null ? Number(body.price) : undefined,
      batchCode: body.batchCode,
    });
    return NextResponse.json({ crop });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
