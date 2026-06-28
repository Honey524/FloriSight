"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { farmerAPI } from "../agrisense-api";

const API_BASE = "/api/agrisense";

function Avatar({ name }) {
  const i = name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  return <div className="fr-avatar">{i}</div>;
}

function StatusBadge({ visits }) {
  if (!visits?.length) return (
    <div className="fr-status-badge fr-status-grey">
      <span className="fr-status-dot" /> No visits recorded yet
    </div>
  );
  const last  = visits[0];
  const label = last.category || "General Visit";
  const date  = new Date(last.visit_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const cat   = (last.category || "").toLowerCase();
  let variant = "fr-status-green";
  if (cat.includes("treatment") || cat.includes("pest") || cat.includes("disease")) variant = "fr-status-yellow";
  if (cat.includes("critical") || cat.includes("emergency")) variant = "fr-status-red";
  return (
    <div className={`fr-status-badge ${variant}`}>
      <span className="fr-status-dot" />
      <span>{label} · {date}</span>
    </div>
  );
}

function ActionCenter({ nextSteps, completedTasks, farmId, onToggle }) {
  const [pending, setPending] = useState({});

  const handleToggle = async (taskText) => {
    const nowDone = !completedTasks.includes(taskText);
    setPending(p => ({ ...p, [taskText]: true }));
    try {
      const data = await farmerAPI.toggleTask({ farm_id: farmId, task_text: taskText, is_completed: nowDone });
      onToggle(data.completed_tasks);
    } catch { /* stay optimistic */ }
    finally { setPending(p => ({ ...p, [taskText]: false })); }
  };

  if (!nextSteps?.length) return (
    <div className="fr-empty-state">
      <div className="fr-empty-icon">📋</div>
      <div className="fr-empty-msg">No tasks yet.</div>
      <div className="fr-empty-sub">Your supervisor will assign actions after the next visit.</div>
    </div>
  );

  const doneCount = nextSteps.filter(s => completedTasks.includes(s)).length;

  return (
    <>
      <div className="fr-task-summary">
        <span>{doneCount}/{nextSteps.length} completed</span>
        <div className="fr-task-mini-bar">
          <div className="fr-task-mini-fill" style={{ width: `${Math.round((doneCount / nextSteps.length) * 100)}%` }} />
        </div>
      </div>
      <ul className="fr-checklist">
        {nextSteps.map((step, i) => {
          const done = completedTasks.includes(step);
          const busy = pending[step];
          return (
            <li key={i} className={`fr-check-item${done ? " fr-check-done" : ""}${busy ? " fr-check-pending" : ""}`} onClick={() => !busy && handleToggle(step)}>
              <span className="fr-checkbox">{done ? "✓" : ""}</span>
              <div className="fr-check-body">
                <span className="fr-check-label">{step}</span>
                {done && <span className="fr-check-confirm">✓ Updated for Supervisor</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function VisitTimeline({ visits }) {
  const [expandedId, setExpandedId] = useState(null);
  if (!visits?.length) return (
    <div className="fr-empty-state">
      <div className="fr-empty-icon">📅</div>
      <div className="fr-empty-msg">No visits yet</div>
      <div className="fr-empty-sub">Field visits will appear here after your supervisor records them.</div>
    </div>
  );
  return (
    <ul className="fr-timeline">
      {visits.map(v => {
        const vDate = new Date(v.visit_date);
        const today = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        let label;
        if (vDate.toDateString() === today.toDateString()) label = "Today";
        else if (vDate.toDateString() === yesterday.toDateString()) label = "Yesterday";
        else label = vDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        const fullText = v.transcript || v.notes || "";
        const summary  = fullText.slice(0, 80) || "Visit recorded";
        const isLong   = fullText.length > 80;
        const isExpanded = expandedId === v.id;
        return (
          <li key={v.id} className="fr-timeline-item">
            <div className="fr-timeline-dot" />
            <div className="fr-timeline-content">
              <div className="fr-timeline-label">{label}</div>
              <div className="fr-timeline-title">{v.category || "General Visit"}</div>
              <div className="fr-timeline-summary">{isExpanded ? fullText : summary}{!isExpanded && isLong ? "…" : ""}</div>
              {isLong && (
                <button onClick={() => setExpandedId(isExpanded ? null : v.id)}
                  style={{ background: "none", border: "none", padding: 0, fontSize: ".72rem", fontWeight: 600, color: "#2563eb", cursor: "pointer", marginTop: 4 }}>
                  {isExpanded ? "▲ Collapse" : "▼ Read full transcript"}
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ReportIssueModal({ farmId, onClose, onSubmitted }) {
  const [message, setMessage] = useState("");
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) { setError("Please describe the issue."); return; }
    setSaving(true); setError("");
    try {
      const data = await farmerAPI.reportIssue({ farm_id: farmId, message: message.trim() });
      onSubmitted?.(data.visit);
      onClose();
    } catch (err) { setError(err.message); setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid #f0f0f0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "1.3rem" }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: ".95rem", color: "#1a1a1a" }}>Report an Issue</div>
            <div style={{ fontSize: ".76rem", color: "#888" }}>Your supervisor will see this at their next review</div>
          </div>
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#aaa" }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "18px 22px" }}>
            {error && <div style={{ background: "#fff5f5", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 8, padding: "8px 12px", fontSize: ".8rem", marginBottom: 12 }}>{error}</div>}
            <textarea placeholder="Describe what you're seeing…" value={message} onChange={e => setMessage(e.target.value)} rows={4}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1.5px solid #e5e7eb", fontSize: ".88rem", lineHeight: 1.55, resize: "vertical", fontFamily: "inherit", outline: "none" }}
              onFocus={e => { e.target.style.borderColor = "#f59e0b"; }} onBlur={e => { e.target.style.borderColor = "#e5e7eb"; }} autoFocus />
          </div>
          <div style={{ padding: "12px 22px 18px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", fontSize: ".82rem", fontWeight: 600, cursor: "pointer", color: "#555" }}>Cancel</button>
            <button type="submit" disabled={saving || !message.trim()} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: "#d97706", color: "#fff", fontSize: ".82rem", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving || !message.trim() ? 0.6 : 1 }}>
              {saving ? "Sending…" : "Submit Issue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AgriSenseFarmerPage() {
  const { data: session } = useSession();
  const user = session?.user;

  const [data,           setData]           = useState(null);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [selectedFarmId, setSelectedFarmId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const json = await farmerAPI.myFarm(selectedFarmId);
        setData(json);
        setCompletedTasks(json.master_report?.completed_tasks || []);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [selectedFarmId]);

  const handleTaskToggle = useCallback(updated => setCompletedTasks(updated), []);
  const handleIssueSubmitted = useCallback(newVisit => {
    setData(prev => prev ? { ...prev, visits: [newVisit, ...(prev.visits || [])] } : prev);
  }, []);

  const nextSteps = data?.master_report?.supervisor_instructions ?? data?.master_report?.next_steps ?? [];

  return (
    <div className="fr-shell">
      <header className="fr-header">
        <div className="fr-header-inner">
          <div className="fr-header-left">
            <Avatar name={user?.name} />
            <div>
              <div className="fr-greeting">Welcome, {user?.name?.split(" ")[0] || "Farmer"}!</div>
              <div className="fr-farm-name">{data?.farm?.name || "Your Farm"} · {data?.farm?.location || "AgriSense"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Link href="/dashboard" className="agri-back-to-florisight">← FloriSight</Link>
            <button className="fr-signout" onClick={() => signOut({ callbackUrl: "/" })}>Sign Out</button>
          </div>
        </div>
      </header>

      <main className="fr-main">
        {data?.farms?.length > 1 && (
          <div style={{ display: "flex", gap: 10, marginBottom: 24, borderBottom: "1px solid #e5ede8", paddingBottom: 16, overflowX: "auto" }}>
            {data.farms.map(f => {
              const isActive = f.id === (data?.farm?.id || selectedFarmId);
              return (
                <button key={f.id} onClick={() => setSelectedFarmId(f.id)} style={{
                  padding: "8px 20px", borderRadius: 99, border: isActive ? "1px solid #16a34a" : "1px solid #e5ede8",
                  background: isActive ? "#f0fdf4" : "#fff", color: isActive ? "#166534" : "#4b6b57",
                  fontWeight: isActive ? 700 : 500, fontSize: "0.9rem", cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
                }}>
                  {f.name} <span style={{ opacity: isActive ? 0.8 : 0.5, fontSize: "0.8rem", marginLeft: 4, fontWeight: 500 }}>· {f.location}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <div className="fr-alert fr-alert-error">{error}</div>}

        {loading && !data && (
          <div className="fr-loading">
            <span className="fr-spinner">🌿</span>
            <span>Loading your farm…</span>
          </div>
        )}

        {data && (
          <div className="fr-layout" style={{ opacity: loading ? 0.5 : 1, transition: "opacity 0.2s", pointerEvents: loading ? "none" : "auto" }}>
            <div className="fr-col-left">
              <section className="fr-section">
                <div className="fr-section-title">Last Visit Outcome</div>
                <StatusBadge visits={data?.visits} />
              </section>

              <section className="fr-section">
                <div className="fr-section-title">
                  Your Tasks
                  <span className="fr-section-sub"> · Supervisor Instructions</span>
                </div>
                <ActionCenter nextSteps={nextSteps} completedTasks={completedTasks} farmId={data?.farm?.id} onToggle={handleTaskToggle} />
              </section>
            </div>

            <div className="fr-col-right">
              <section className="fr-section fr-section-sidebar">
                <div className="fr-section-title">Visit History</div>
                <VisitTimeline visits={data?.visits} />
              </section>

              <section className="fr-section fr-section-sidebar" style={{ marginTop: 16 }}>
                <div className="fr-section-title">Farm Health Report</div>
                {data?.master_report ? (
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ fontSize: ".8rem", fontWeight: 700, color: "#166534", marginBottom: 4 }}>Current Live Report</div>
                    <div style={{ fontSize: ".72rem", color: "#6b7280", marginBottom: 10 }}>Generated from recent visits</div>
                    <a href="/dashboard" style={{ display: "block", width: "100%", padding: "8px 0", borderRadius: 8, background: "linear-gradient(135deg, #16a34a, #166534)", color: "#fff", fontSize: ".8rem", fontWeight: 700, textAlign: "center", textDecoration: "none" }}>
                      View Full Report in FloriSight
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: ".8rem", color: "#9ca3af", fontStyle: "italic", padding: "10px 0", lineHeight: 1.5 }}>
                    Your supervisor hasn&apos;t published a report yet. Check back after their next visit.
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </main>

      {data?.farm?.id && (
        <div className="fr-fab-wrap">
          <button className="fr-fab" aria-label="Report an issue" onClick={() => setShowIssueModal(true)} style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", boxShadow: "0 4px 20px rgba(217,119,6,.4)" }}>
            ⚠️
          </button>
        </div>
      )}

      {showIssueModal && data?.farm?.id && (
        <ReportIssueModal farmId={data.farm.id} onClose={() => setShowIssueModal(false)} onSubmitted={handleIssueSubmitted} />
      )}
    </div>
  );
}
