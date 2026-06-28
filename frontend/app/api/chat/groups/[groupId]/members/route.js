import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../../../auth/[...nextauth]/route";
import { getPool } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { groupId } = await params;

  try {
    const body = await request.json();
    const memberId = String(body.userId || "").trim();

    if (!memberId) {
      return NextResponse.json(
        { message: "User ID is required." },
        { status: 400 }
      );
    }

    // Verify group exists
    const groupCheck = await getPool().query(
      "SELECT id FROM chat_groups WHERE id = $1",
      [groupId]
    );

    if (groupCheck.rows.length === 0) {
      return NextResponse.json(
        { message: "Group not found." },
        { status: 404 }
      );
    }

    // Add member (ON CONFLICT DO NOTHING implies we don't error if already a member)
    await getPool().query(
      "INSERT INTO chat_group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT (group_id, user_id) DO NOTHING",
      [groupId, memberId]
    );

    return NextResponse.json({ 
      message: "Member added successfully",
      memberId
    }, { status: 201 });
  } catch (error) {
    console.error("Add member failed", error);
    return NextResponse.json(
      { message: error?.message || "Unable to add member." },
      { status: 500 }
    );
  }
}
