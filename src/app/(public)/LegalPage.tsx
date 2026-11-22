import type { ReactNode } from "react";
import { config } from "@/lib/config";
import { fill } from "@/lib/format";
import styles from "./auth.module.css";
import legal from "./legal.module.css";

export type LegalDoc = {
  title: string;
  effective: string;
  intro: string;
  sections: readonly { heading: string; paragraphs: readonly string[] }[];
};

export function contactLine(supportEmail: string): string {
  return supportEmail.endsWith(".example")
    ? config.copy.legal.contact.withoutEmail
    : fill(config.copy.legal.contact.withEmail, { email: supportEmail });
}

export function LegalPage({
  doc,
  footer,
}: {
  doc: LegalDoc;
  footer?: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <div className={styles.brand}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <p className={styles.tagline}>{config.app.tagline}</p>
      </div>
      <h1 className={styles.title}>{doc.title}</h1>
      <p className={legal.effective}>{`Effective ${doc.effective}`}</p>
      <p className={legal.text}>{doc.intro}</p>
      {doc.sections.map((section) => (
        <section key={section.heading} className={legal.section}>
          <h2 className={legal.heading}>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className={legal.text}>
              {paragraph === "{contact}"
                ? contactLine(config.app.supportEmail)
                : paragraph}
            </p>
          ))}
        </section>
      ))}
      {footer}
    </main>
  );
}
