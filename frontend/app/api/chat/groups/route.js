import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getPool } from "../../../lib/db";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const members = Array.isArray(body.members) ? body.members : [];

    if (!name) {
      return NextResponse.json(
        { message: "Group name is required." },
        { status: 400 }
      );
    }

    // Include the creator in the members list if not already present
    const allMembers = new Set([session.user.id, ...members]);
    
    const groupId = crypto.randomUUID();
    const client = await getPool().connect();
    
    try {
      await client.query("BEGIN");
      
      // Create group
      await client.query(
        "INSERT INTO chat_groups (id, name, created_by) VALUES ($1, $2, $3)",
        [groupId, name, session.user.id]
      );
      
      // Add members
      for (const memberId of allMembers) {
        await client.query(
          "INSERT INTO chat_group_members (group_id, user_id) VALUES ($1, $2)",
          [groupId, memberId]
        );
      }
      
      await client.query("COMMIT");
      
      return NextResponse.json({ 
        message: "Group created successfully",
        group: {
          id: groupId,
          name,
          createdBy: session.user.id,
          members: Array.from(allMembers).map(id => ({ id }))
        }
      }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Create group failed", error);
    return NextResponse.json(
      { message: error?.message || "Unable to create group." },
      { status: 500 }
    );
  }
}
