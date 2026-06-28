"use client";

import { useTheme } from "../ThemeContext";
import { Sun, Moon } from "lucide-react";
import { motion } from "framer-motion";

export default function ThemeToggle({ className = "", compact = false }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      onClick={toggleTheme}
      className={`theme-toggle-btn ${compact ? "compact" : ""} ${className}`}
      type="button"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
    >
      <div className="theme-toggle-icon-wrap">
        <motion.div
          key={theme}
          initial={{ rotate: -60, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="theme-toggle-icon"
        >
          {theme === "dark" ? (
            <Sun size={18} className="sun-icon" />
          ) : (
            <Moon size={18} className="moon-icon" />
          )}
        </motion.div>
      </div>
      {!compact && (
        <span className="theme-toggle-text">
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </span>
      )}
    </motion.button>
  );
}
