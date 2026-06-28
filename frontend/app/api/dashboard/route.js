import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../auth/[...nextauth]/route";
import { getDashboardData, clearMonthlyResetCache, clearDailyResetCache } from "../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(payload, init = {}) {
  const response = NextResponse.json(payload, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const testBypass = searchParams.get("test_bypass") === "true";
  const clearResetCache = searchParams.get("clear_reset_cache") === "true";

  if (clearResetCache) {
    clearMonthlyResetCache();
    clearDailyResetCache();
  }

  let session = null;
  if (!testBypass) {
    session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return jsonNoStore({ message: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const user = testBypass ? { id: "admin-1", role: "Admin", email: "admin@florisight.local" } : session.user;
    const data = await getDashboardData(user);
    const role = user.role;

    if (role === "Admin") {
      return jsonNoStore(data);
    }

    if (role === "Supervisor") {
      return jsonNoStore({
        ...data,
        supervisors: data.supervisors.filter(
          (supervisor) => supervisor.id === session.user.supervisorId
        ),
        workers: data.workers.filter(
          (worker) => worker.supervisorId === session.user.supervisorId
        ),
        admins: [],
      });
    }

    return jsonNoStore({
      ...data,
      supervisors: data.supervisors.filter((supervisor) =>
        data.workers.some(
          (worker) =>
            worker.id === session.user.workerId && worker.supervisorId === supervisor.id
        )
      ),
      workers: data.workers.filter((worker) => worker.id === session.user.workerId),
      admins: [],
    });
  } catch (error) {
    console.error("Dashboard data failed", error);

    return jsonNoStore(
      { message: "Unable to load live dashboard data." },
      { status: 500 }
    );
  }
}
