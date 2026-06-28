"use client";

import { motion } from "framer-motion";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { fadeUp, platformLayers, staggerGroup } from "../site-data";

export default function PlatformPage() {
  return (
    <main className="site-shell inner-page-shell">
      <SiteHeader />

      <section className="platform-band page-section">
        <motion.div
          className="section-heading"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <p className="eyebrow">Platform</p>
          <h1>A layered system for transforming farm updates into intelligence.</h1>
          <p>
            The platform separates inputs, AI processing, storage, and retrieval
            so each part can grow into a production-ready service.
          </p>
        </motion.div>

        <motion.div
          className="layer-grid"
          variants={staggerGroup}
          initial="hidden"
          animate="visible"
        >
          {platformLayers.map(([title, text], index) => (
            <motion.article
              className="layer-card"
              key={title}
              variants={fadeUp}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </motion.article>
          ))}
        </motion.div>
      </section>

      <SiteFooter />
    </main>
  );
}
