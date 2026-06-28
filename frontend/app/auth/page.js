"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import ThemeToggle from "../components/ThemeToggle";

function generateSubtleHeliosSparkles() {
  return Array.from({ length: 20 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 3,
    delay: Math.random() * 5,
    duration: 12 + Math.random() * 10,
    driftX: -20 + Math.random() * 40,
    driftY: -60 - Math.random() * 60,
  }));
}

function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const initialMode = searchParams.get("mode") === "register" ? "register" : "login";
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Worker",
    phoneNumber: "",
  });

  const title = useMemo(
    () => (mode === "register" ? "Create your workspace access" : "Welcome back"),
    [mode]
  );

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((response) => response.json())
      .then((providers) => setGoogleReady(Boolean(providers?.google)))
      .catch(() => setGoogleReady(false));
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (mode === "register") {
      setIsSubmitting(true);

      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await response.json().catch(() => ({}));
      setIsSubmitting(false);

      if (!response.ok) {
        setMessage(data.message || "Unable to create account.");
        return;
      }

      setMessage("Account created. You can now log in with these credentials.");
      setMode("login");
      setForm((current) => ({ ...current, name: "", password: "", phoneNumber: "" }));
      return;
    }
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setIsSubmitting(false);

    if (result?.error) {
      setMessage("Invalid email or password. Please use an approved FloriSight account.");
      return;
    }

    router.push("/dashboard");
  }
  return (
    <main className="auth-page">
      <Link href="/" className="back-link">
        FloriSight
      </Link>

      <div style={{ position: "fixed", top: "24px", right: "24px", zIndex: 100 }}>
        <ThemeToggle compact={true} />
      </div>

      <section className="auth-panel" aria-label="Authentication">
        <div className="auth-intro">
          <p className="eyebrow">Secure farm access</p>
          <h1>{title}</h1>
          <p>
            Sign in to manage logs, workers, visitor tracking, alerts, and the
            AI copilot workspace.
          </p>
        </div>

        <div className="mode-switch" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setMessage("");
            }}
            type="button"
          >
            Login
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            onClick={() => {
              setMode("register");
              setMessage("");
            }}
            type="button"
          >
            Register
          </button>
        </div>

        <button
          className="google-button"
          type="button"
          disabled={!googleReady}
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          title={
            googleReady
              ? "Continue with Google"
              : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local"
          }
        >
          <span className="google-mark">G</span>
          Continue with Google
        </button>

        {!googleReady && (
          <p className="auth-note">
            Google OAuth is wired in. Add credentials in root .env.local to
            activate this button.
          </p>
        )}

        <div className="divider">
          <span>or use email</span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <label>
                Full name
                <span className="input-wrap">
                  <input
                    required
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Your full name"
                  />
                </span>
              </label>

              <label>
                Role
                <select
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option>Worker</option>
                  <option>Supervisor</option>
                  <option>Admin</option>
                </select>
              </label>

              {form.role === "Admin" && (
                <label>
                  Phone number
                  <span className="input-wrap">
                    <input
                      required
                      value={form.phoneNumber}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, phoneNumber: event.target.value }))
                      }
                      placeholder="+91 98765 43210"
                    />
                  </span>
                </label>
              )}
            </>
          )}

          <label>
            Email
            <span className="input-wrap">
              <input
                type="email"
                required
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="name@farm.com"
              />
            </span>
          </label>

          <label>
            Password
            <span className="input-wrap">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                placeholder="Minimum 6 characters"
              />
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {message && <p className="form-message">{message}</p>}

          <button className="primary-link submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 size={18} className="spin" />}
            {mode === "register" ? "Create account" : "Login"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthScreen />
    </Suspense>
  );
}
