"use client";

import { motion } from "framer-motion";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { fadeUp, roles, staggerGroup } from "../site-data";

export default function RolesPage() {
  return (
    <main className="site-shell inner-page-shell">
      <SiteHeader />

      <section className="roles-band page-section">
        <div className="roles-inner">
          <motion.div
            className="roles-copy"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
            <p className="eyebrow">Roles</p>
            <h1>Clear access for every level of farm operations.</h1>
            <p>
              Role-based access keeps daily work focused while giving each user
              the controls and visibility needed for their responsibility.
            </p>
          </motion.div>

          <motion.div
            className="role-list"
            variants={staggerGroup}
            initial="hidden"
            animate="visible"
          >
            {roles.map(([title, text]) => (
              <motion.article
                className="role-item"
                key={title}
                variants={fadeUp}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <h3>{title}</h3>
                <p>{text}</p>
              </motion.article>
            ))}
          </motion.div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
