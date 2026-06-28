import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <strong>FloriSight</strong>
        <p>Intelligent floriculture monitoring and communication.</p>
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "var(--color-text-dim)" }}>Proprietor: B Srikanth</p>
      </div>
      <Link href="/auth" className="primary-link">
        Open workspace
      </Link>
    </footer>
  );
}
