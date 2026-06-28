import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import {
  getWorkerRecord,
  updateWorkerTask,
  dismissTaskNotification,
  getUserByEmail,
} from "../../lib/db";

export const runtime = "nodejs";

const FARM_ALLOWED_ZONES = [
  { name: "Greenhouse A", lat: 13.0827, lng: 77.5797 },
  { name: "Packing Unit", lat: 13.1377, lng: 77.4875 },
  { name: "Visitor Gate", lat: 12.9507, lng: 77.5848 },
  { name: "Nursery Bay", lat: 12.8008, lng: 77.5773 },
];

const ATTENDANCE_RADIUS_METERS = 500;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinFarmZone(lat, lng) {
  for (const zone of FARM_ALLOWED_ZONES) {
    const distance = haversineDistance(lat, lng, zone.lat, zone.lng);
    if (distance <= ATTENDANCE_RADIUS_METERS) {
      return { allowed: true, zone: zone.name, distance: Math.round(distance) };
    }
  }
  return { allowed: false };
}

async function resolveSessionUser(session) {
  if (!session?.user?.email) {
    return null;
  }

  if (session.user.id && session.user.role) {
    return session.user;
  }

  const dbUser = await getUserByEmail(session.user.email);

  if (!dbUser) {
    return null;
  }

  return {
    ...session.user,
    id: dbUser.id,
    role: dbUser.role,
    supervisorId:
      session.user.supervisorId ||
      dbUser.supervisorId ||
      (dbUser.role === "Supervisor" ? dbUser.id : null),
    workerId: session.user.workerId || (dbUser.role === "Worker" ? dbUser.id : null),
  };
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const sessionUser = await resolveSessionUser(session);

  if (!sessionUser?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const workerId = String(body.workerId || "").trim();

    if (!workerId) {
      return NextResponse.json({ message: "Worker is required." }, { status: 400 });
    }

    const workerRecord = await getWorkerRecord(workerId);

    if (!workerRecord) {
      return NextResponse.json({ message: "Worker not found." }, { status: 404 });
    }

    if (sessionUser.role === "Worker" && workerId !== sessionUser.workerId) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    if (
      sessionUser.role === "Supervisor" &&
      workerRecord.supervisor_id !== (sessionUser.supervisorId || sessionUser.id)
    ) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    // Server-side location validation for attendance marking
    if (body.attendance && body.attendance !== "Absent" && body.attendance !== workerRecord.attendance) {
      const lat = Number(body.locationLat);
      const lng = Number(body.locationLng);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json(
          { message: "Location coordinates are required to mark attendance. Please enable location access." },
          { status: 400 }
        );
      }

      const check = isWithinFarmZone(lat, lng);
      if (!check.allowed) {
        return NextResponse.json(
          { message: "Attendance denied — you are not within the allowed farm zone radius (500m)." },
          { status: 403 }
        );
      }
    }

    const update = await updateWorkerTask({
      workerId,
      task: sessionUser.role === "Worker" ? null : body.task,
      status: body.status,
      progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : null,
      zone: sessionUser.role === "Worker" ? null : body.zone,
      attendance: body.attendance,
      salaryStatus: sessionUser.role === "Worker" ? null : body.salaryStatus,
      dailyWage:
        sessionUser.role === "Worker" || !Number.isFinite(Number(body.dailyWage))
          ? null
          : Number(body.dailyWage),
      paymentMode: sessionUser.role === "Worker" ? null : body.paymentMode,
      paymentAmount:
        sessionUser.role === "Worker" || !Number.isFinite(Number(body.paymentAmount))
          ? null
          : Number(body.paymentAmount),
      paymentTxnId:
        sessionUser.role === "Worker" ? null : String(body.paymentTxnId || "").trim() || null,
      paymentDate:
        sessionUser.role === "Worker" ? null : String(body.paymentDate || "").trim() || null,
      actorName: sessionUser.name || sessionUser.email,
      actorRole: sessionUser.role,
      previousAttendance: workerRecord.attendance,
    });

    return NextResponse.json({ worker: update }, { status: 200 });
  } catch (error) {
    console.error("Task update failed", error);

    return NextResponse.json(
      { message: error?.message || "Unable to update task." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const sessionUser = await resolveSessionUser(session);

  if (!sessionUser?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const notificationId = String(body.notificationId || "").trim();

    if (!notificationId) {
      return NextResponse.json({ message: "Notification ID is required." }, { status: 400 });
    }

    const workerId = sessionUser.workerId || sessionUser.id;
    await dismissTaskNotification(notificationId, workerId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: error?.message || "Unable to dismiss notification." },
      { status: 500 }
    );
  }
}
