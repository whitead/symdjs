// Small line icons drawn on a 16-unit grid with a 1.25 stroke, to match the
// engraved rules of the plates. All are decorative (aria-hidden).

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5v9l7-4.5z" fill="currentColor" stroke="none" />
  </Icon>
);

export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" strokeWidth={1.75} />
  </Icon>
);

export const ShuffleIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
    <circle cx="5.5" cy="5.5" r=".9" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="10.5" r=".9" fill="currentColor" stroke="none" />
    <circle cx="8" cy="8" r=".9" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="5.5" r=".9" fill="currentColor" stroke="none" />
    <circle cx="5.5" cy="10.5" r=".9" fill="currentColor" stroke="none" />
  </Icon>
);

export const RegrowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8a5 5 0 1 1-1.5-3.6" />
    <path d="M13 2.5v3h-3" />
  </Icon>
);

export const FlameIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 14c-2.5 0-4-1.7-4-4 0-2.8 3-4 3-7 2 1 5 3.5 5 7 0 2.3-1.5 4-4 4z" />
    <path d="M8 14c-1 0-1.7-.8-1.7-1.8 0-1.2 1.2-1.8 1.7-3 .6 1.2 1.7 1.8 1.7 3 0 1-.7 1.8-1.7 1.8z" />
  </Icon>
);

export const SnowIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5" />
    <path d="M6.5 2.8 8 4.2l1.5-1.4M6.5 13.2 8 11.8l1.5 1.4" />
  </Icon>
);

export const UnlockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7.5" width="10" height="6.5" rx="1.2" />
    <path d="M5.5 7.5V5a2.5 2.5 0 0 1 4.9-.7" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="7.5" width="10" height="6.5" rx="1.2" />
    <path d="M5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5" />
  </Icon>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 8h11M9 3.5 13.5 8 9 12.5" />
  </Icon>
);

export const CopyIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
    <path d="M10.5 5.5V3.7c0-.7-.5-1.2-1.2-1.2H3.7c-.7 0-1.2.5-1.2 1.2v5.6c0 .7.5 1.2 1.2 1.2h1.8" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3 8.5 3 3 7-7" />
  </Icon>
);

export const HandIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 8.5V3.2a1 1 0 0 1 2 0V7.5M8 7V2.6a1 1 0 0 1 2 0V7.5M10 7.2V3.8a1 1 0 0 1 2 0v5.4c0 2.8-1.8 4.8-4.4 4.8-1.7 0-2.6-.8-3.6-2.2L2.4 9.4a1 1 0 0 1 1.5-1.3L6 10" />
  </Icon>
);

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h8" strokeWidth={1.5} />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h8M8 4v8" strokeWidth={1.5} />
  </Icon>
);

export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
  </Icon>
);

export const MaximizeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10" />
  </Icon>
);

export const MinimizeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.75V6H2.75M13.25 6H10V2.75M10 13.25V10h3.25M2.75 10H6v3.25" />
  </Icon>
);
