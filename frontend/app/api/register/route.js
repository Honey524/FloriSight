import { NextResponse } from "next/server";
import { createUser } from "../../lib/db";

export const runtime = "nodejs";

const roles = new Set(["Admin", "Supervisor", "Worker"]);

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    const role = String(body.role || "");
    const phoneNumber = String(body.phoneNumber || "").trim();

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { message: "Name, email, password, and role are required." },
        { status: 400 }
      );
    }

    if (!roles.has(role)) {
      return NextResponse.json(
        { message: "Choose a valid role." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { message: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const user = await createUser({ name, email, password, role, phoneNumber });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error?.code === "23505") {
      return NextResponse.json(
        { message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    console.error("Registration failed", error);

    return NextResponse.json(
      { message: "Unable to create account. Check the database connection." },
      { status: 500 }
    );
  }
}
