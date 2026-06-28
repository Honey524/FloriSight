import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import { getDashboardData } from "../../../lib/db";

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

export async function GET(_request, { params }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return jsonNoStore({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const data = await getDashboardData(session.user);
    const workerId = String(id || "");
    const worker = (data.workers || []).find((item) => String(item.id) === workerId);

    if (!worker) {
      return jsonNoStore({ message: "Worker not found." }, { status: 404 });
    }

    const workerTasks = (data.tasks || []).filter((task) => String(task.workerId) === workerId);
    const workerPayments = (data.salaryRecords || []).filter(
      (record) => String(record.workerId) === workerId
    );

    return jsonNoStore({
      ...worker,
      assignedTasks: workerTasks,
      payments: workerPayments,
      wages: workerPayments,
    });
  } catch (error) {
    console.error("Worker detail failed", error);

    return jsonNoStore(
      { message: error?.message || "Unable to load worker details." },
      { status: 500 }
    );
  }
}
