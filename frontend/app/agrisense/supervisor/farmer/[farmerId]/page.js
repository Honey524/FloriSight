"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

function formatDate(date) {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SupervisorFarmerProfilePage({ params }) {
  const resolvedParams = use(params);
  const farmerId = resolvedParams.farmerId;

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/agrisense/supervisor/farmers/${farmerId}`);
        const json = await response.json();
        if (!response.ok) {
          throw new Error(json.error || "Unable to load farmer profile");
        }
        setData(json);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [farmerId]);

  return (
    <div className="sup-shell">
      <main className="sup-page">
        <div className="sup-page-header">
          <div>
            <p className="sup-page-date">
              <Link href="/agrisense/supervisor" className="agri-back-to-florisight">← Back to Supervisor Dashboard</Link>
            </p>
            <h1 className="sup-page-title">{data?.farmer?.name || "Farmer Profile"}</h1>
            <p className="sup-page-date">
              {data?.farmer?.village || "Village unavailable"} · {data?.farmer?.farm_count || 0} farm{data?.farmer?.farm_count === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {loading && (
          <div className="sup-section-block">
            <div className="sup-empty-title">Loading farmer profile…</div>
          </div>
        )}

        {error && !loading && <div className="sup-alert sup-alert-error">{error}</div>}

        {data && !loading && (
          <>
            <div className="sup-section-block">
              <div className="sup-section-header">
                <div>
                  <div className="sup-section-title-text">Assigned Farms</div>
                  <div className="sup-section-subtitle">Open any farm to review visit history and current instructions</div>
                </div>
              </div>

              <div className="mg-farm-grid">
                {data.farms.map((farm) => (
                  <div
                     key={farm.id}
                    className={`mg-farm-card mg-farm-${farm.health_tier}`}
                  >
                    <div className="mg-farm-header">
                      <div className="mg-farm-name">{farm.name}</div>
                      <span className={`mg-tier-badge mg-tier-${farm.health_tier || "grey"}`}>
                        <span className="mg-tier-dot" /> {(farm.health_tier || "grey").toUpperCase()}
                      </span>
                    </div>
                    <div className="mg-farm-meta">
                      <span className="mg-farm-meta-row">{farm.location}</span>
                      <span className="mg-farm-meta-row">{farm.risk_count || 0} active risk{farm.risk_count === 1 ? "" : "s"}</span>
                    </div>
                    <div className="mg-farm-footer">
                      <Link
                        href={`/agrisense/supervisor/farmer/${farmerId}/farm/${farm.id}`}
                        className="lp-nav-cta"
                      >
                        Open Farm
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sup-section-block">
              <div className="sup-section-header">
                <div>
                  <div className="sup-section-title-text">Recent Activity</div>
                  <div className="sup-section-subtitle">Latest visits and recorded notes for this farmer</div>
                </div>
              </div>

              {data.visits.length === 0 ? (
                <div className="sup-empty">
                  <div className="sup-empty-title">No visits recorded yet</div>
                </div>
              ) : (
                <div className="sup-my-visits-list">
                  {data.visits.map((visit) => (
                    <div key={visit.id} className="sup-my-visit-card">
                      <div className="sup-my-visit-left">
                        <div className="sup-my-visit-date">{formatDate(visit.created_at)}</div>
                        <div className="sup-my-visit-names">
                          <span className="sup-my-visit-farm">{visit.farm_name}</span>
                        </div>
                        <div className="sup-my-visit-snippet">{visit.notes}</div>
                      </div>
                      <div className="sup-my-visit-right">
                        <span className="sup-badge sup-badge-general">{visit.category}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
