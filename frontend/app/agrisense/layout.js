"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import "./agrisense.css";

export default function AgriSenseLayout({ children }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div className="agri-loading-screen">
        <div className="agri-loading-spinner" />
        <p>Loading AgriSense…</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="agri-experience">
      <div className="agri-ambient" aria-hidden="true">
        <span className="agri-orb agri-orb-one" />
        <span className="agri-orb agri-orb-two" />
        <span className="agri-orb agri-orb-three" />
        <span className="agri-glass-card agri-glass-card-one" />
        <span className="agri-glass-card agri-glass-card-two" />
        <span className="agri-grid-haze" />
      </div>
      <div className="agri-stage">{children}</div>
    </div>
  );
}
