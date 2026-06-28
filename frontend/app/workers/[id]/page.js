"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export default function WorkerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;
  const [worker, setWorker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        // Prefer a dedicated worker endpoint if available
        let workerData = null;
        const workerRes = await fetch(`/api/workers/${id}`, { cache: "no-store" }).catch(() => null);
        if (workerRes && workerRes.ok) {
          workerData = await workerRes.json();
        } else {
          const res = await fetch("/api/dashboard", { cache: "no-store" });
          if (!res.ok) throw new Error("Failed to load dashboard");
          const data = await res.json();
          if (cancelled) return;
          setDashboard(data);
          workerData = (data.workers || []).find((w) => String(w.id) === String(id));
        }

        if (cancelled) return;
        setWorker(workerData || null);
      } catch (e) {
        console.error(e);
        setWorker(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (id) load();

    function onWorkerAttendance(e) {
      const detail = e?.detail || {};
      if (!detail || String(detail.workerId) !== String(id)) return;
      setWorker((prev) => (prev ? { ...prev, attendance: detail.attendance } : prev));
    }

    if (typeof window !== "undefined") {
      window.addEventListener("workerAttendanceUpdated", onWorkerAttendance);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("workerAttendanceUpdated", onWorkerAttendance);
      }
    };
  }, [id]);

  if (loading) return <div className="loading-card">Loading worker...</div>;

  if (!worker) {
    return (
      <main className="center-page">
        <div className="loading-card">Worker not found.</div>
        <div className="worker-detail-actions">
          <Link href="/dashboard" className="inline-link">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const wages = worker.wages || worker.payments || worker.wageHistory || [];
  const wageLabels = wages.map((w) => w.date || w.month || "-");
  const wageValues = wages.map((w) => Number(w.amount || w.value || w.earned || 0));

  const wageChartData = {
    labels: wageLabels,
    datasets: [
      {
        label: "Wages",
        data: wageValues,
        backgroundColor: "rgba(76, 161, 113, 0.9)",
      },
    ],
  };

  const assigned = worker.assignedTasks || worker.tasks || (dashboard?.tasks || []).filter((t) => String(t.workerId) === String(worker.id)) || [];

  return (
    <main className="page-section">
      <div className="worker-detail-shell">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Worker</p>
            <h1>{worker.name}</h1>
            <p className="worker-detail-subtitle">{worker.zone || worker.email || ""}</p>
          </div>
          <div>
            <button className="secondary-link" onClick={() => router.back()} type="button">
              Back
            </button>
          </div>
        </div>

        <section className="feature-grid worker-detail-grid">
          <div className="feature-card worker-detail-chart-card">
            <h3>Wage history</h3>
            {wages && wages.length ? (
              <div className="worker-detail-chart">
                <Bar data={wageChartData} options={{ maintainAspectRatio: false }} />
              </div>
            ) : (
              <div className="empty-state">No wage history available for this worker.</div>
            )}
            {wages && wages.length ? (
              <div className="worker-detail-total">
                <strong>Total paid:</strong> {wageValues.reduce((a, b) => a + b, 0)}
              </div>
            ) : null}
          </div>

          <div className="feature-card">
            <h3>Assigned work</h3>
            {assigned && assigned.length ? (
              <div className="detail-list">
                {assigned.map((t) => (
                  <div key={t.id || `${t.title}-${t.zone}`}> 
                    <strong>{t.title || t.task || t.name}</strong>
                    <span>{t.zone || t.location || ""}</span>
                    <em>{t.status || t.status_label || ""}</em>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No assigned work found.</div>
            )}
          </div>

          <div className="feature-card">
            <h3>Analytics snapshot</h3>
            <div className="detail-list">
              <span>Progress: {worker.progress || worker.progressValue || "0%"}</span>
              <span>Logs today: {worker.logsToday ?? 0}</span>
              <span>Attendance: {worker.attendance || "Not marked"}</span>
              <span>Daily wage: {worker.dailyWage ? `${worker.dailyWage}` : "-"}</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
