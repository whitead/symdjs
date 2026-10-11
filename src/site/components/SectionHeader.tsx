// Chapter opener: roman numeral, small-caps kicker on a fine rule, display
// title, optional lede and an optional action (e.g. Shuffle).

import type { ReactNode } from "react";
import "../styles/components/section-header.css";

export interface SectionHeaderProps {
  numeral: string;
  kicker: string;
  title: ReactNode;
  id?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function SectionHeader({ numeral, kicker, title, id, action, children, className }: SectionHeaderProps) {
  return (
    <header className={["section-header", className].filter(Boolean).join(" ")}>
      <p className="section-header__kicker">
        <span className="section-header__numeral">{numeral}.</span>
        <span className="section-header__rule" aria-hidden="true" />
        <span className="section-header__label">{kicker}</span>
      </p>
      <div className="section-header__row">
        <h2 id={id} className="section-header__title">
          {title}
        </h2>
        {action && <div className="section-header__action">{action}</div>}
      </div>
      {children && <div className="section-header__lede lede">{children}</div>}
    </header>
  );
}
