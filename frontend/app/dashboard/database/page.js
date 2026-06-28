import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Database, Shield, Users, Activity, Siren, Video } from "lucide-react";
import { authOptions } from "../../api/auth/[...nextauth]/route";
import { getDatabaseViewerData } from "../../lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatValue(value) {
  if (value == null || value === "") {
    return "—";
  }

  if (value instanceof Date) {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(value);
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function PreviewTable({ title, icon: Icon, rows, columns }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "18px 22px",
          borderBottom: "1px solid var(--line)",
          background: "linear-gradient(180deg, rgba(123,146,116,0.12), rgba(255,253,248,0.9))",
        }}
      >
        <Icon size={18} />
        <div>
          <strong style={{ display: "block", fontSize: 18 }}>{title}</strong>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Latest {rows.length} rows
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  style={{
                    textAlign: "left",
                    padding: "12px 16px",
                    fontSize: 13,
                    color: "var(--muted)",
                    borderBottom: "1px solid var(--line)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={row.id || `${title}-${index}`}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid rgba(221, 209, 182, 0.65)",
                        verticalAlign: "top",
                        fontSize: 14,
                      }}
                    >
                      {formatValue(row[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: "18px 16px", color: "var(--muted)" }}
                >
                  No rows yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function DatabaseViewerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/auth");
  }

  if (session.user.role !== "Admin") {
    redirect("/dashboard");
  }

  const data = await getDatabaseViewerData();

  return (
    <main
      className="inner-page-shell"
      style={{
        padding: "28px clamp(18px, 4vw, 42px) 48px",
        background:
          "radial-gradient(circle at top left, rgba(233,215,175,0.26), transparent 22%), var(--bg)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "grid",
          gap: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 720 }}>
            <p
              style={{
                margin: "0 0 8px",
                color: "var(--green-dark)",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontSize: 12,
              }}
            >
              Admin Database Viewer
            </p>
            <h1 style={{ margin: 0, fontSize: "clamp(2rem, 4vw, 3rem)" }}>
              Live data previews from PostgreSQL
            </h1>
            <p style={{ margin: "10px 0 0", color: "var(--muted)", maxWidth: 620 }}>
              This page reads the current application database directly and shows table counts plus
              recent rows for the most useful operational tables.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/dashboard" className="secondary-link">
              Back to dashboard
            </Link>
          </div>
        </div>

        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow)",
            padding: 22,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <Shield size={18} />
            <div>
              <strong style={{ display: "block" }}>Access note</strong>
              <span style={{ color: "var(--muted)", fontSize: 14 }}>
                Only admin sessions can open this page.
              </span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 14,
            }}
          >
            {data.tableStats.map((table) => (
              <article
                key={table.name}
                style={{
                  padding: "16px 18px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-strong)",
                  border: "1px solid rgba(169, 128, 56, 0.18)",
                }}
              >
                <span
                  style={{
                    display: "block",
                    color: "var(--muted)",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {table.name}
                </span>
                <strong style={{ display: "block", marginTop: 6, fontSize: 28 }}>
                  {table.count}
                </strong>
              </article>
            ))}
          </div>
        </section>

        <div style={{ display: "grid", gap: 24 }}>
          <PreviewTable
            title="Users"
            icon={Users}
            rows={data.previews.users}
            columns={[
              { key: "name", label: "Name" },
              { key: "email", label: "Email" },
              { key: "role", label: "Role" },
              { key: "supervisor_id", label: "Supervisor" },
              { key: "phone_number", label: "Phone" },
              { key: "created_at", label: "Created" },
            ]}
          />

          <PreviewTable
            title="Visitor Events"
            icon={Activity}
            rows={data.previews.visitorEvents}
            columns={[
              { key: "zone", label: "Zone" },
              { key: "visitor_count", label: "Visitors" },
              { key: "reporter_name", label: "Reporter" },
              { key: "note", label: "Note" },
              { key: "created_at", label: "Created" },
            ]}
          />

          <PreviewTable
            title="Video Analyses"
            icon={Video}
            rows={data.previews.videoAnalyses}
            columns={[
              { key: "zone", label: "Zone" },
              { key: "status", label: "Status" },
              { key: "visitor_count", label: "Visitors" },
              { key: "unique_tracks", label: "Tracks" },
              { key: "uploaded_by_name", label: "Uploaded By" },
              { key: "created_at", label: "Created" },
            ]}
          />

          <PreviewTable
            title="Alerts"
            icon={Siren}
            rows={data.previews.alerts}
            columns={[
              { key: "zone", label: "Zone" },
              { key: "severity", label: "Severity" },
              { key: "title", label: "Title" },
              { key: "detail", label: "Detail" },
              { key: "resolved_at", label: "Resolved" },
              { key: "created_at", label: "Created" },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
