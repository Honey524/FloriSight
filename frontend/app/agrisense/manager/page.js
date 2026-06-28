"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { managerAPI } from "../agrisense-api";

const TIER_CONFIG = {
  red:   { label: "At Risk",  cssClass: "mg-tier-red"   },
  green: { label: "Healthy",  cssClass: "mg-tier-green" },
  grey:  { label: "No Data",  cssClass: "mg-tier-grey"  },
};

function daysAgoLabel(days) {
  if (days === null || days === undefined) return "Never visited";
  if (days === 0) return "Visited today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function ManagerNav({ session }) {
  const initials = session?.user?.name?.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase() || "M";
  return (
    <header className="mg-header">
      <div className="mg-header-inner">
        <div className="mg-header-left">
          <div className="mg-logo-mark">
            <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
              <path d="M3 21h18M9 21V11l3-3 3 3v10M5 21V13l-2 2M19 21V13l2 2" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <div className="mg-logo-text">AgriSense</div>
            <div className="mg-portal-badge">Manager Portal</div>
          </div>
        </div>
        <div className="mg-header-right">
          <div className="mg-user-chip">
            <div className="mg-user-avatar">{initials}</div>
            <span className="mg-user-name">{session?.user?.name}</span>
          </div>
          <Link href="/dashboard" className="agri-back-to-florisight">← FloriSight</Link>
          <button className="mg-signout" onClick={() => signOut({ callbackUrl: "/" })}>Sign Out</button>
        </div>
      </div>
    </header>
  );
}

function KpiCard({ label, count, tier, active, onClick }) {
  return (
    <button
      className={`mg-kpi-card ${tier ? `mg-kpi-${tier}` : "mg-kpi-total"} ${active ? "mg-kpi-active" : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <div className="mg-kpi-count">{count ?? "—"}</div>
      <div className="mg-kpi-label">{label}</div>
      {tier && <div className="mg-kpi-hint">Click to filter</div>}
    </button>
  );
}

function TierBadge({ tier }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.grey;
  return (
    <span className={`mg-tier-badge ${cfg.cssClass}`}>
      <span className="mg-tier-dot" /> {cfg.label}
    </span>
  );
}

function FarmCard({ farm, onClick }) {
  return (
    <div
      className={`mg-farm-card mg-farm-${farm.health_tier}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === "Enter" && onClick()}
    >
      <div className="mg-farm-header">
        <div className="mg-farm-name">{farm.name}</div>
        <TierBadge tier={farm.health_tier} />
      </div>

      <div className="mg-farm-meta">
        <span className="mg-farm-meta-row">
          <span className="mg-meta-icon">
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><path d="M12 21s-6-4.35-6-10a6 6 0 1 1 12 0c0 5.65-6 10-6 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><circle cx="12" cy="11" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>
          </span>
          {farm.location}
        </span>
        <span className="mg-farm-meta-row">
          <span className="mg-meta-icon">
            <svg viewBox="0 0 24 24" fill="none" width="14" height="14"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.5"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
          Supervisor:
          {farm.supervisor_name ? farm.supervisor_name : <em className="mg-meta-muted">Unassigned</em>}
        </span>
      </div>

      <div className="mg-farm-footer">
        <span className="mg-visit-label">{daysAgoLabel(farm.days_since_visit)}</span>
        {farm.risk_count > 0 && <span className="mg-risk-chip">{farm.risk_count} risk{farm.risk_count > 1 ? "s" : ""}</span>}
        {farm.task_count > 0 && farm.risk_count === 0 && (
          <span className="mg-task-chip">{farm.completed_count}/{farm.task_count} tasks</span>
        )}
      </div>
    </div>
  );
}

function AuditCard({ audit, followed, onFollowUp }) {
  const tier = audit.status?.toLowerCase() === "red" ? "red" : "yellow";
  const daysLabel = audit.days_since_visit === null || audit.days_since_visit === undefined
    ? "Never visited" : audit.days_since_visit === 0 ? "Visited today" : audit.days_since_visit === 1 ? "Visited yesterday" : `Visited ${audit.days_since_visit} days ago`;

  return (
    <div className={`mg-audit-card mg-audit-${tier}`}>
      <div className="mg-audit-header">
        <span className={`mg-audit-dot mg-audit-dot-${tier}`} />
        <span className="mg-audit-farm-name">{audit.farm_name}</span>
        <span className={`mg-audit-badge mg-audit-badge-${tier}`}>{audit.status}</span>
      </div>
      <div className="mg-audit-people">
        <span className="mg-audit-person mg-audit-farmer">Supervisor Review</span>
        <button className="mg-audit-person mg-audit-supervisor" onClick={() => onFollowUp(audit)} title="Mark follow-up reminder">
          {audit.supervisor_name}<span className="mg-sup-arrow">↗</span>
        </button>
        {followed && <span className="mg-follow-toast">Noted</span>}
      </div>
      <div className="mg-audit-days">
        <span>{daysLabel}</span>
      </div>
      {audit.situation && (
        <div className="mg-audit-situation"><span className="mg-situation-icon">!</span><span>{audit.situation}</span></div>
      )}
      {audit.action && (
        <div className="mg-audit-action"><span className="mg-action-arrow">→</span><span>{audit.action}</span></div>
      )}
    </div>
  );
}

function BriefingPanel() {
  const [loading,     setLoading]     = useState(false);
  const [briefing,    setBriefing]    = useState(null);
  const [error,       setError]       = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [followedUp,  setFollowedUp]  = useState(new Set());

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const data = await managerAPI.briefing();
      setBriefing(data.briefing);
      setGeneratedAt(new Date());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleFollowUp = (audit) => {
    const key = audit.farm_name;
    setFollowedUp(prev => new Set([...prev, key]));
    setTimeout(() => setFollowedUp(prev => { const n = new Set(prev); n.delete(key); return n; }), 2500);
  };

  const timeLabel = generatedAt
    ? `Generated at ${generatedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
    : "Supervisor & farmer accountability breakdown";

  const redAudits = briefing?.audits?.filter(a => a.status?.toLowerCase() === "red") || [];

  return (
    <div className="mg-report-section">
      <div className="mg-report-header">
        <div className="mg-report-title-block">
          <span className="mg-report-icon">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
          <div>
            <div className="mg-report-title">Operations Audit</div>
            <div className="mg-report-sub">{timeLabel}</div>
          </div>
        </div>
        <button className={`mg-report-btn${loading ? "" : " mg-report-btn-active"}`} onClick={handleGenerate} disabled={loading}>
          {loading ? <><span className="mg-btn-spinner" />Analyzing…</> : briefing ? "Regenerate Report" : "Generate AI Report"}
        </button>
      </div>

      {loading && (
        <div className="mg-report-loading">
          <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "agriSpin .7s linear infinite" }} />
          <span>Analyzing supervisor & farmer activity across all farms…</span>
        </div>
      )}

      {error && !loading && <div className="mg-report-error">{error}</div>}

      {!loading && !briefing && !error && (
        <div className="mg-report-placeholder">
          <div className="mg-placeholder-icon">
            <svg viewBox="0 0 24 24" fill="none" width="18" height="18"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <p>Generate the audit to see a structured accountability breakdown — who visited, what was flagged, and what action each farm needs.</p>
        </div>
      )}

      {!loading && briefing && (
        <div className="mg-report-body">
          {briefing.audits?.length === 0 ? (
            <div className="mg-report-all-clear">✅ <span>No farms need immediate attention. Portfolio is healthy.</span></div>
          ) : (
            <>
              <div className="mg-report-summary">
                <span className="mg-summary-total">{briefing.audits.length} farms flagged</span>
                {redAudits.length > 0 && <span className="mg-summary-chip mg-summary-red">{redAudits.length} Critical</span>}
              </div>
              {redAudits.length > 0 && (
                <div className="mg-report-group">
                  <div className="mg-group-label mg-group-red">Critical — Immediate Action Required</div>
                  <div className="mg-audit-grid">
                    {redAudits.map((audit, i) => (
                      <AuditCard key={i} audit={audit} followed={followedUp.has(audit.farm_name)} onFollowUp={handleFollowUp} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {briefing.regional_outlook && (
            <div className="mg-report-outlook">
              <span className="mg-outlook-label">Regional Outlook</span>
              <p className="mg-outlook-text">{briefing.regional_outlook}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgriSenseManagerPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [portfolio, setPortfolio] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [filter,    setFilter]    = useState("all");
  const [expandedSupervisorId, setExpandedSupervisorId] = useState(null);

  useEffect(() => {
    managerAPI.portfolio().then(setPortfolio).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  const toggleFilter = (tier) => setFilter(prev => prev === tier ? "all" : tier);
  const visibleFarms = portfolio?.farms.filter(f => filter === "all" || f.health_tier === filter) || [];

  const groupedBySupervisor = visibleFarms.reduce((groups, farm) => {
    const supId = farm.supervisor_id || "unassigned";
    const supName = farm.supervisor_name || "Unassigned";
    if (!groups[supId]) {
      groups[supId] = {
        id: supId,
        name: supName,
        farms: [],
      };
    }
    groups[supId].farms.push(farm);
    return groups;
  }, {});

  const supervisorsList = Object.values(groupedBySupervisor);

  return (
    <div className="mg-shell">
      <ManagerNav session={session} />

      <main className="mg-main">
        {loading && (
          <div className="mg-loading">
            <span style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "agriSpin .7s linear infinite" }} />
            <span>Loading portfolio…</span>
          </div>
        )}

        {error && !loading && <div className="mg-alert mg-alert-error">{error}</div>}

        {portfolio && !loading && (
          <>
            {/* KPI Strip */}
            <div className="mg-kpi-strip">
              <KpiCard label="Total Farms" count={portfolio.summary.total} active={filter === "all"} onClick={() => setFilter("all")} />
              <KpiCard label="At Risk" count={portfolio.summary.red} tier="red" active={filter === "red"} onClick={() => toggleFilter("red")} />
              <KpiCard label="Healthy" count={portfolio.summary.green} tier="green" active={filter === "green"} onClick={() => toggleFilter("green")} />
            </div>

            {/* Supervisor Network & Farms */}
            <div className="mg-farm-section">
              <div className="mg-grid-header">
                <span className="mg-grid-title">
                  Supervisor Network & Farms
                  <span className="mg-grid-count">
                    {filter === "all" ? `${portfolio.summary.total} farms` : `${visibleFarms.length} of ${portfolio.summary.total} shown`}
                  </span>
                </span>
                {filter !== "all" && (
                  <button className="mg-clear-filter" onClick={() => setFilter("all")}>Clear filter</button>
                )}
              </div>

              {supervisorsList.length === 0 ? (
                <div className="mg-empty">
                  <div className="mg-empty-icon">🌿</div>
                  <div className="mg-empty-msg">No supervisor activity matching this filter</div>
                </div>
              ) : (
                <div className="mg-supervisors-list">
                  {supervisorsList.map(sup => {
                    const isExpanded = expandedSupervisorId === sup.id;
                    const totalFarms = sup.farms.length;
                    const atRiskFarms = sup.farms.filter(f => f.health_tier === "red").length;
                    const healthyFarms = sup.farms.filter(f => f.health_tier === "green").length;

                    return (
                      <div
                        key={sup.id}
                        className={`mg-supervisor-group-card ${isExpanded ? "expanded" : ""}`}
                      >
                        <div
                          className="mg-supervisor-header"
                          onClick={() => setExpandedSupervisorId(isExpanded ? null : sup.id)}
                        >
                          <div className="mg-supervisor-info-block">
                            <div className={`mg-supervisor-avatar-wrap ${sup.id === "unassigned" ? "unassigned" : ""}`}>
                              <svg viewBox="0 0 24 24" fill="none" width="18" height="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </div>
                            <div>
                              <h3 className="mg-supervisor-name-text">
                                {sup.id === "unassigned" ? "Unassigned Supervisors" : sup.name}
                              </h3>
                              <span className="mg-supervisor-sub-text">
                                {totalFarms} farm{totalFarms !== 1 ? "s" : ""} under supervision
                              </span>
                            </div>
                          </div>

                          <div className="mg-supervisor-right-block">
                            <div style={{ display: "flex", gap: "6px" }}>
                              {atRiskFarms > 0 && (
                                <span className="mg-tier-badge mg-tier-red">
                                  <span className="mg-tier-dot" /> {atRiskFarms} At Risk
                                </span>
                              )}
                              {healthyFarms > 0 && (
                                <span className="mg-tier-badge mg-tier-green">
                                  <span className="mg-tier-dot" /> {healthyFarms} Healthy
                                </span>
                              )}
                            </div>
                            <span className={`mg-supervisor-chevron ${isExpanded ? "expanded" : ""}`}>
                              <svg viewBox="0 0 24 24" fill="none" width="16" height="16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mg-supervisor-farms-section">
                            <h4 className="mg-supervisor-farms-title">
                              Farmers & Plots under {sup.name}
                            </h4>
                            <div className="mg-farm-grid">
                              {sup.farms.map(farm => (
                                <FarmCard
                                  key={farm.id}
                                  farm={farm}
                                  onClick={() => router.push(`/agrisense/supervisor/farmer/${farm.farmer_id}/farm/${farm.id}`)}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Operations Audit */}
            <BriefingPanel />
          </>
        )}
      </main>
    </div>
  );
}
