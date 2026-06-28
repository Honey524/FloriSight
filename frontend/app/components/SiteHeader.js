import Link from "next/link";

export function SiteHeader() {
  return (
    <nav className="topbar" aria-label="Primary navigation">
      <Link href="/" className="brand">
        FloriSight
      </Link>
      <div className="nav-actions">
        <Link href="/agrisense" className="secondary-link">
          Agri Sense
        </Link>
        <Link href="/features" className="ghost-link">
          Features
        </Link>
        <Link href="/platform" className="ghost-link">
          Platform
        </Link>
        <Link href="/roles" className="ghost-link">
          Roles
        </Link>
        <Link href="/workflow" className="ghost-link">
          Workflow
        </Link>
        <Link href="/auth" className="ghost-link">
          Sign in
        </Link>
        <Link href="/auth?mode=register" className="primary-link">
          Get started
        </Link>
      </div>
    </nav>
  );
}
