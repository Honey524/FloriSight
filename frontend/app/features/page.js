"use client";

import { motion } from "framer-motion";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { capabilities, fadeUp, staggerGroup } from "../site-data";

export default function FeaturesPage() {
  return (
    <main className="site-shell inner-page-shell">
      <SiteHeader />

      <section className="feature-band page-section">
        <motion.div
          className="section-heading"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <p className="eyebrow">Features</p>
          <h1>Operational tools for intelligent floriculture monitoring.</h1>
          <p>
            FloriSight brings communication, tracking, reporting, and access
            control into a single workspace for farm teams.
          </p>
        </motion.div>

        <motion.div
          className="feature-grid"
          variants={staggerGroup}
          initial="hidden"
          animate="visible"
        >
          {capabilities.map(({ title, text }) => (
            <motion.article
              className="feature-card"
              key={title}
              variants={fadeUp}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
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
