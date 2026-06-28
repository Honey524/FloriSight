import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "../../auth/[...nextauth]/route";
import Razorpay from "razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { amount, workerId } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
    }

    const keyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    // Ensure Razorpay keys are configured
    if (!keyId || !keySecret || keyId === "rzp_test_yourKeyIdHere" || keySecret === "yourKeySecretHere") {
      throw new Error("Razorpay environment variables are missing or invalid.");
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    // Amount in Razorpay is in paise (1 INR = 100 paise)
    const amountInPaise = Math.round(Number(amount) * 100);

    const shortId = String(workerId || "worker").replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: `rcpt_${shortId}_${Date.now()}`,
      notes: {
        workerId: workerId || "unknown",
        paidBy: session.user.id,
      },
    });

    return NextResponse.json({
      orderId: order.id,
      amount: amount,
      currency: order.currency,
      keyId: keyId,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error);
    return NextResponse.json(
      { 
        message: error?.message || "Failed to create payment order.",
        error: error,
        details: error?.error || null
      },
      { status: 500 }
    );
  }
}
