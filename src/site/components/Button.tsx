// Buttons: primary (ink), secondary (paper with a fine rule), quiet (text),
// and toggle buttons (aria-pressed) with an optional "alarm" tone for
// destructive-feeling actions like releasing the symmetry.

import type { ButtonHTMLAttributes, ReactNode } from "react";
import "../styles/components/button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "quiet";
  size?: "s" | "m";
  icon?: ReactNode;
  /** toggle state; renders aria-pressed */
  pressed?: boolean;
  /** colour when pressed */
  tone?: "ink" | "alarm";
}

export function Button({
  variant = "secondary",
  size = "m",
  icon,
  pressed,
  tone = "ink",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={["btn", `btn--${variant}`, `btn--${size}`, `btn--tone-${tone}`, className].filter(Boolean).join(" ")}
      aria-pressed={pressed}
      {...rest}
    >
      {icon && <span className="btn__icon">{icon}</span>}
      {children && <span className="btn__label">{children}</span>}
    </button>
  );
}
