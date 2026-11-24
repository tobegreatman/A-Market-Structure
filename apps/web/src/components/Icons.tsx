import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: IconProps, children: ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const OverviewIcon = (p: IconProps) =>
  base(p, <><rect x="3.5" y="3.5" width="7" height="9" /><rect x="13.5" y="3.5" width="7" height="5" /><rect x="13.5" y="11.5" width="7" height="9" /><rect x="3.5" y="15.5" width="7" height="5" /></>);

export const FlowIcon = (p: IconProps) =>
  base(p, <><path d="M3.5 6h5.2c2.4 0 3.6 1.4 4.6 3.4l1.2 2.6c1 2 2.2 3.4 4.6 3.4h1.4" /><path d="M3.5 12h3.8c1.8 0 2.8.8 3.6 2.2" /><path d="M3.5 18h2.4" /><path d="M17.5 13l3 2.5-3 2.5" /></>);

export const MainlineIcon = (p: IconProps) =>
  base(p, <><path d="M3.5 17.5l5-4.2 4 2.4 7.5-7.2" /><circle cx="3.5" cy="17.5" r="1.3" /><circle cx="8.5" cy="13.3" r="1.3" /><circle cx="12.5" cy="15.7" r="1.3" /><circle cx="20" cy="8.5" r="1.6" /><path d="M20 13v3.5" opacity=".5" /></>);

export const StockIcon = (p: IconProps) =>
  base(p, <><path d="M7 4v3.2M7 15.4V20" /><rect x="4.8" y="7.2" width="4.4" height="8.2" rx=".5" /><path d="M16.5 3.5v2.4M16.5 16.8v3.7" /><rect x="14.3" y="5.9" width="4.4" height="10.9" rx=".5" /></>);

export const CycleIcon = (p: IconProps) =>
  base(p, <><path d="M20 12a8 8 0 1 1-2.7-6" /><path d="M20 4v4.2h-4.2" /><circle cx="12" cy="12" r="2.2" /></>);

export const UniverseIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="5" r="1.8" /><circle cx="5" cy="16" r="1.8" /><circle cx="19" cy="15.5" r="1.8" /><circle cx="12.5" cy="12" r="1.1" /><path d="M11 6.6l1 4.3M6.4 14.9l5-2.1M13.2 12.9l4.5 1.9M6.8 16.3l3.6-8.3" opacity=".65" /></>);

export const SearchIcon = (p: IconProps) =>
  base(p, <><circle cx="10.5" cy="10.5" r="6" /><path d="M15.2 15.2L20.5 20.5" /></>);

export const CloseIcon = (p: IconProps) =>
  base(p, <><path d="M6 6l12 12M18 6L6 18" /></>);

export const ResetIcon = (p: IconProps) =>
  base(p, <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4.5V10h-5.5" /></>);

export const PlusIcon = (p: IconProps) =>
  base(p, <><path d="M12 5v14M5 12h14" /></>);

export const MinusIcon = (p: IconProps) =>
  base(p, <><path d="M5 12h14" /></>);

export const ArrowUpRight = (p: IconProps) =>
  base(p, <><path d="M7 17L17 7" /><path d="M8.5 7H17v8.5" /></>);

export const ChevronRight = (p: IconProps) =>
  base(p, <><path d="M9 5l7 7-7 7" /></>);

export const RefreshIcon = (p: IconProps) =>
  base(p, <><path d="M20 11a8 8 0 0 0-13.6-5.2L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 13.6 5.2L20 16" /><path d="M20 20v-4h-4" /></>);

export const InfoIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".7" fill="currentColor" stroke="none" /></>);

export const SunIcon = (p: IconProps) =>
  base(p, <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" /></>);

export const MoonIcon = (p: IconProps) =>
  base(p, <><path d="M20 13.4A8.2 8.2 0 0 1 10.6 4a8.4 8.4 0 1 0 9.4 9.4z" /></>);

export const BrandMark = ({ size = 30, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" {...rest}>
    <path d="M4 11V4h7" stroke="currentColor" strokeWidth="1.2" />
    <path d="M28 21v7h-7" stroke="currentColor" strokeWidth="1.2" />
    <path d="M21 4h7v7" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
    <path d="M11 28H4v-7" stroke="currentColor" strokeWidth="1.2" opacity=".45" />
    <path d="M16 8.6l5.4 7.4L16 23.4 10.6 16z" stroke="currentColor" strokeWidth="1.1" opacity=".8" />
    <circle cx="16" cy="16" r="1.6" fill="currentColor" />
  </svg>
);
