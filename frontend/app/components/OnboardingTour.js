"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TOUR_STORAGE_KEY = "florisight_tour_completed";

function getTourSteps(role) {
  const common = [
    {
      target: ".weather-widget",
      title: "Live Weather",
      description: "This panel displays real-time weather conditions for your farm location — temperature, humidity, and sky conditions updated every 10 minutes.",
      position: "bottom",
    },
    {
      target: ".side-nav",
      title: "Navigation",
      description: "Use the sidebar to switch between sections — Overview, Messages, Workforce, Tracking, Reports, and the AI assistant AgriSage.",
      position: "right",
    },
    {
      target: ".dashboard-header",
      title: "Dashboard Header",
      description: "Your welcome bar shows your name, role, live data timestamp, and quick actions like sign-out and database viewer.",
      position: "bottom",
    },
  ];

  if (role === "Admin") {
    return [
      ...common,
      {
        target: ".panel.large-panel",
        title: "Farm Map & Zones",
        description: "The live farm map shows zone activity in real time — visitor counts, worker positions, and alert hotspots across your entire facility.",
        position: "top",
      },
      {
        target: ".role-card",
        title: "Your Role",
        description: "As an Admin, you have complete visibility across all supervisors, workers, zones, and operations. You can manage tasks, review reports, and configure the system.",
        position: "right",
      },
    ];
  }

  if (role === "Supervisor") {
    return [
      ...common,
      {
        target: ".panel.large-panel",
        title: "Team Overview",
        description: "Monitor your assigned workers, their progress, attendance, and zone activity — all in one glance.",
        position: "top",
      },
      {
        target: ".role-card",
        title: "Your Role",
        description: "As a Supervisor, you manage your team's tasks, review attendance, track worker progress, and communicate via the messaging system.",
        position: "right",
      },
    ];
  }

  // Worker
  return [
    ...common,
    {
      target: ".worker-overview-metrics, .panel",
      title: "Your Metrics",
      description: "Track your current zone, task status, earnings today, and submitted logs — all updated live.",
      position: "top",
    },
    {
      target: ".role-card",
      title: "Your Role",
      description: "As a Worker, you can view your assignments, mark attendance, submit task updates, and chat with your team.",
      position: "right",
    },
  ];
}

function getHighlightRect(selector) {
  if (typeof document === "undefined") return null;
  const selectors = selector.split(",").map((s) => s.trim());
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const rect = el.getBoundingClientRect();
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }
  }
  return null;
}

export default function OnboardingTour({ role, isActive, onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [highlightRect, setHighlightRect] = useState(null);

  const steps = useMemo(() => getTourSteps(role), [role]);
  const step = steps[currentStep];

  const updateHighlight = useCallback(() => {
    if (!step) return;
    const rect = getHighlightRect(step.target);
    setHighlightRect(rect);
  }, [step]);

  useEffect(() => {
    if (!isActive) return;
    updateHighlight();
    window.addEventListener("resize", updateHighlight);
    window.addEventListener("scroll", updateHighlight, true);
    return () => {
      window.removeEventListener("resize", updateHighlight);
      window.removeEventListener("scroll", updateHighlight, true);
    };
  }, [isActive, updateHighlight]);

  useEffect(() => {
    if (!isActive || !step) return;
    const selectors = step.target.split(",").map((s) => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        break;
      }
    }
    const timer = setTimeout(updateHighlight, 400);
    return () => clearTimeout(timer);
  }, [currentStep, isActive, step, updateHighlight]);

  function handleNext() {
    if (currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleFinish();
    }
  }

  function handlePrev() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }

  function handleFinish() {
    if (typeof window !== "undefined") {
      localStorage.setItem(TOUR_STORAGE_KEY, "true");
    }
    onComplete?.();
  }

  function handleSkip() {
    handleFinish();
  }

  if (!isActive || !step) return null;

  const popupStyle = {};
  if (highlightRect) {
    switch (step.position) {
      case "bottom":
        popupStyle.top = highlightRect.top + highlightRect.height + 20;
        popupStyle.left = Math.max(16, highlightRect.left + highlightRect.width / 2 - 180);
        break;
      case "top":
        popupStyle.top = Math.max(16, highlightRect.top - 220);
        popupStyle.left = Math.max(16, highlightRect.left + highlightRect.width / 2 - 180);
        break;
      case "right":
        popupStyle.top = Math.max(16, highlightRect.top + highlightRect.height / 2 - 80);
        popupStyle.left = highlightRect.left + highlightRect.width + 20;
        break;
      case "left":
        popupStyle.top = Math.max(16, highlightRect.top + highlightRect.height / 2 - 80);
        popupStyle.left = Math.max(16, highlightRect.left - 380);
        break;
      default:
        popupStyle.top = highlightRect.top + highlightRect.height + 20;
        popupStyle.left = highlightRect.left;
    }
  } else {
    popupStyle.top = "50%";
    popupStyle.left = "50%";
    popupStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <div className="onboarding-tour-overlay">
      {/* Dark backdrop with cutout */}
      <svg className="onboarding-backdrop" width="100%" height="100%">
        <defs>
          <mask id="tour-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {highlightRect && (
              <rect
                x={highlightRect.left - 8}
                y={highlightRect.top - 8}
                width={highlightRect.width + 16}
                height={highlightRect.height + 16}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)" />
      </svg>

      {/* Highlight border */}
      {highlightRect && (
        <motion.div
          className="onboarding-highlight-ring"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            top: highlightRect.top - 8,
            left: highlightRect.left - 8,
            width: highlightRect.width + 16,
            height: highlightRect.height + 16,
          }}
        />
      )}

      {/* Cloud popup */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          className="onboarding-cloud-popup"
          style={popupStyle}
          initial={{ opacity: 0, y: 20, scale: 0.85, rotateX: -10 }}
          animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
          exit={{ opacity: 0, y: -10, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
        >
          <div className="cloud-bubble-tail" />
          <div className="cloud-popup-content">
            <div className="cloud-popup-header">
              <span className="cloud-step-badge">{currentStep + 1} / {steps.length}</span>
              <button className="cloud-skip-btn" onClick={handleSkip} type="button">Skip tour</button>
            </div>
            <h3 className="cloud-popup-title">{step.title}</h3>
            <p className="cloud-popup-desc">{step.description}</p>
            <div className="cloud-popup-actions">
              {currentStep > 0 && (
                <motion.button
                  className="tour-btn tour-btn-prev"
                  onClick={handlePrev}
                  type="button"
                  whileHover={{ scale: 1.08, rotateY: -5 }}
                  whileTap={{ scale: 0.92, rotateY: 5 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                >
                  Back
                </motion.button>
              )}
              <motion.button
                className="tour-btn tour-btn-next"
                onClick={handleNext}
                type="button"
                whileHover={{ scale: 1.1, rotateY: 5, boxShadow: "0 8px 25px rgba(47, 124, 246, 0.4)" }}
                whileTap={{ scale: 0.9, rotateY: -5 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
                style={{ perspective: "600px" }}
              >
                {currentStep === steps.length - 1 ? "Finish" : "Next"}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function useShouldShowTour(sessionStatus, userId) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !userId) return;
    if (typeof window === "undefined") return;
    const key = `${TOUR_STORAGE_KEY}_${userId}`;
    const completed = localStorage.getItem(key);
    if (!completed) {
      setShow(true);
    }
  }, [sessionStatus, userId]);

  function completeTour() {
    if (typeof window !== "undefined" && userId) {
      localStorage.setItem(`${TOUR_STORAGE_KEY}_${userId}`, "true");
    }
    setShow(false);
  }

  return [show, completeTour];
}
