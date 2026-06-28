import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import {
  createLeaveRequest,
  reviewLeaveRequest,
  getLeaveRequestsForWorker,
  getLeaveRequestsForSupervisor,
  getUserByEmail,
} from "../../lib/db";

export const runtime = "nodejs";

async function resolveSessionUser(session) {
  if (!session?.user?.email) return null;
  if (session.user.id && session.user.role) return session.user;
  const dbUser = await getUserByEmail(session.user.email);
  if (!dbUser) return null;
  return {
    ...session.user,
    id: dbUser.id,
    role: dbUser.role,
    supervisorId: dbUser.role === "Supervisor" ? dbUser.id : null,
    workerId: dbUser.role === "Worker" ? dbUser.id : null,
  };
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const user = await resolveSessionUser(session);
  if (!user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    let requests = [];
    if (user.role === "Worker") {
      requests = await getLeaveRequestsForWorker(user.workerId || user.id);
    } else if (user.role === "Supervisor") {
      requests = await getLeaveRequestsForSupervisor(user.supervisorId || user.id);
    } else {
      requests = await getLeaveRequestsForSupervisor(null);
    }
    return NextResponse.json({ requests });
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
  try {
    const body = await request.json();
    const record = await createLeaveRequest({
      workerId: user.workerId || user.id,
      workerName: user.name || user.email,
      supervisorId: body.supervisorId || null,
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      leaveType: body.leaveType || "Sick",
    });
    return NextResponse.json({ request: record });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
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
    const record = await reviewLeaveRequest({
      requestId: body.requestId,
      status: body.status,
      reviewedBy: user.id,
    });
    return NextResponse.json({ request: record });
  } catch (error) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
