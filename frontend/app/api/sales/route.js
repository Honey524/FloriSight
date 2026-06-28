import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { getSales, createSale, getUserByEmail } from "../../lib/db";

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
    const sales = await getSales();
    return NextResponse.json({ sales });
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
    const sale = await createSale({
      plantName: body.plantName,
      customerName: body.customerName,
      quantity: Number(body.quantity),
      unitPrice: Number(body.unitPrice),
      totalAmount: body.totalAmount != null ? Number(body.totalAmount) : undefined,
      status: body.status,
      saleDate: body.saleDate,
    });
    return NextResponse.json({ sale });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
