"use client";

import { motion } from "framer-motion";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { fadeUp, staggerGroup, workflowSteps } from "../site-data";

export default function WorkflowPage() {
  return (
    <main className="site-shell inner-page-shell">
      <SiteHeader />

      <section className="workflow-band page-section">
        <motion.div
          className="section-heading workflow-heading"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <p className="eyebrow">Workflow</p>
          <h1>From daily update to structured decision support.</h1>
          <p>
            FloriSight is designed to replace fragmented messaging with a
            repeatable intelligence workflow for farm operations.
          </p>
        </motion.div>

        <motion.div
          className="workflow-list"
          variants={staggerGroup}
          initial="hidden"
          animate="visible"
        >
          {workflowSteps.map((item) => (
            <motion.div
              className="workflow-item"
              key={item}
              variants={fadeUp}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <span>{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <SiteFooter />
    </main>
  );
}
