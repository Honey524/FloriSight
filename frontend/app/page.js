"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Leaf,
  ScanSearch,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "./components/ThemeToggle";

const navSections = [
  { id: "home", label: "Home" },
  { id: "features", label: "Features" },
  { id: "platform", label: "Platform" },
  { id: "workflow", label: "Workflow" },
];

const sectionContent = {
  home: {
    heading: "Intelligent Farm Operations",
    desc: "Smart monitoring transforms how farm teams coordinate, track operations, and make decisions in harmony with nature.",
    image: "https://images.unsplash.com/photo-1574943320219-553eb213f72d?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Farmer with fresh harvest",
  },
  features: {
    heading: "Core Capabilities",
    desc: "Every tool your farm team needs — from AI-powered logging to real-time zone tracking.",
    image: "https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Greenhouse operations",
    cards: [
      { icon: BrainCircuit, title: "Smart Logging", text: "AI extracts structured records from daily field updates." },
      { icon: ScanSearch, title: "Visitor Tracking", text: "Zone-level density, movement, and real-time alerts." },
      { icon: Bot, title: "AI Copilot", text: "Ask questions, get grounded answers from your farm data." },
      { icon: ShieldCheck, title: "Role Control", text: "Clean separation of admin, supervisor, and worker flows." },
    ],
  },
  platform: {
    heading: "Platform Architecture",
    desc: "Four connected layers — input, processing, storage, and retrieval.",
    image: "https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Farm cultivation environment",
    layers: [
      { num: "01", title: "Input Layer", text: "Text, images, and combined field reports." },
      { num: "02", title: "Processing", text: "NLP extraction, computer vision, multimodal validation." },
      { num: "03", title: "Storage", text: "Worker data, visitor logs, and searchable context." },
      { num: "04", title: "Retrieval", text: "Text-to-SQL, semantic search, copilot answers." },
    ],
  },
  workflow: {
    heading: "How It Works",
    desc: "From a simple field update to an operational insight in four steps.",
    image: "https://images.unsplash.com/photo-1500595046743-cd271d694d30?auto=format&fit=crop&w=800&q=80",
    imageAlt: "Farm field operations",
    steps: [
      "Text and image updates from the field",
      "AI extraction and validation pipeline",
      "PostgreSQL-ready operational records",
      "Copilot answers with SQL and RAG context",
    ],
  },
};

function generateHeliosSparkles() {
  return Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 6,
    duration: 8 + Math.random() * 8,
    driftX: -30 + Math.random() * 60,
    driftY: -100 - Math.random() * 100,
  }));
}

export default function LandingPage() {
  const [activeSection, setActiveSection] = useState("home");
  const [sparkles, setSparkles] = useState([]);
  const content = sectionContent[activeSection];

  useEffect(() => {
    setSparkles(generateHeliosSparkles());
  }, []);

  return (
    <main className="site-shell landing-spa">
      {/* Helios atmospheric dust/sparkles background */}
      <div className="helios-container" aria-hidden="true">
        {sparkles.map((s) => (
          <motion.div
            key={s.id}
            className="helios-sparkle"
            style={{
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
            }}
            animate={{
              y: [0, s.driftY],
              x: [0, s.driftX, 0],
              opacity: [0, 0.8, 0.8, 0],
              scale: [0.8, 1.3, 0.8],
            }}
            transition={{
              duration: s.duration,
              repeat: Infinity,
              delay: s.delay,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Top nav bar */}
      <nav className="spa-topbar">
        <Link href="/" className="spa-brand">FloriSight</Link>
        <div className="spa-nav-links">
          {navSections.map((section) => (
            section.href ? (
              <Link
                key={section.id}
                href={section.href}
                className="spa-nav-btn"
              >
                {section.label}
              </Link>
            ) : (
              <button
                key={section.id}
                className={`spa-nav-btn ${activeSection === section.id ? "active" : ""}`}
                onClick={() => setActiveSection(section.id)}
                type="button"
              >
                {section.label}
              </button>
            )
          ))}
        </div>
        <div className="spa-nav-actions">
          <ThemeToggle compact={true} />
          <Link href="/auth" className="spa-signin">Sign in</Link>
          <Link href="/auth?mode=register" className="spa-get-started">
            Get started
            <ArrowRight size={16} />
          </Link>
        </div>
      </nav>

      {/* Main content area — single viewport, changes with navigation */}
      <section className="spa-content">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            className="spa-panel"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="spa-panel-grid">
              {/* Left copy */}
              <div className="spa-panel-left">
                <motion.h1
                  className="spa-heading"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                >
                  {content.heading}
                </motion.h1>

                <motion.p
                  className="spa-desc"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.18 }}
                >
                  {content.desc}
                </motion.p>

                {/* Home: CTA */}
                {activeSection === "home" && (
                  <>
                    <motion.div
                      className="spa-actions"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.26 }}
                    >
                      <Link href="/auth" className="spa-cta-primary">
                        Open workspace
                        <ArrowRight size={18} />
                      </Link>
                      <Link href="/dashboard" className="spa-cta-secondary">
                        Live dashboard
                      </Link>
                    </motion.div>
                  </>
                )}

                {/* Features: card grid */}
                {activeSection === "features" && content.cards && (
                  <motion.div
                    className="spa-cards"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.22 }}
                  >
                    {content.cards.map((card, i) => {
                      const Icon = card.icon;
                      return (
                        <motion.div
                          className="spa-card"
                          key={card.title}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: 0.25 + i * 0.08 }}
                          whileHover={{ y: -4, scale: 1.02 }}
                        >
                          <div className="spa-card-icon"><Icon size={20} /></div>
                          <div>
                            <strong>{card.title}</strong>
                            <p>{card.text}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                )}

                {/* Platform: layers */}
                {activeSection === "platform" && content.layers && (
                  <motion.div
                    className="spa-layers"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.22 }}
                  >
                    {content.layers.map((layer, i) => (
                      <motion.div
                        className="spa-layer"
                        key={layer.num}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.25 + i * 0.08 }}
                      >
                        <span className="spa-layer-num">{layer.num}</span>
                        <div>
                          <strong>{layer.title}</strong>
                          <p>{layer.text}</p>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}

                {/* Workflow: steps */}
                {activeSection === "workflow" && content.steps && (
                  <motion.div
                    className="spa-steps"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.22 }}
                  >
                    {content.steps.map((step, i) => (
                      <motion.div
                        className="spa-step"
                        key={step}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.35, delay: 0.25 + i * 0.1 }}
                      >
                        <div className="spa-step-dot">{i + 1}</div>
                        <span>{step}</span>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>

              {/* Right: image */}
              <motion.div
                className="spa-panel-right"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="spa-image-frame">
                  <motion.img
                    key={content.image}
                    src={content.image}
                    alt={content.imageAlt}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                  />
                  <div className="spa-image-ring spa-image-ring-1" />
                  <div className="spa-image-ring spa-image-ring-2" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </section>

      {/* Bottom bar */}
      <footer className="spa-footer">
        <span>FloriSight</span>
        <p>Intelligent floriculture monitoring and communication.</p>
        <p style={{ marginTop: "0.5rem", fontSize: "0.85rem", opacity: 0.8 }}>Proprietor: B Srikanth</p>
      </footer>
    </main>
  );
}
