import type { JSX } from "preact";

type P = { size?: number; class?: string; title?: string };

function Svg({ size = 20, class: cls, title, children, fill }: P & { children: JSX.Element | JSX.Element[]; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      stroke-width="1.9"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cls}
      aria-hidden={title ? undefined : "true"}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : <></>}
      {children}
    </svg>
  );
}

export const Check = (p: P) => <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const CheckCircle = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.3l2.8 2.8L16.2 9.6" />
  </Svg>
);
export const Cross = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const Alert = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l9.5 16.5h-19z" />
    <path d="M12 10v4.5M12 17.4v.1" />
  </Svg>
);
export const Doc = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </Svg>
);
export const Calendar = (p: P) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);
export const Mic = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" />
  </Svg>
);
export const Pen = (p: P) => (
  <Svg {...p}>
    <path d="M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19z" />
    <path d="M13.5 7l3.5 3.5" />
  </Svg>
);
export const Clipboard = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="4.5" width="14" height="16.5" rx="3" />
    <path d="M9 4.5h6v3H9zM8.5 12l2 2 4-4M8.5 17.5h7" />
  </Svg>
);
export const People = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3 19.5c.6-3.4 3-5.3 6-5.3s5.4 1.9 6 5.3" />
    <circle cx="17" cy="9.5" r="2.4" />
    <path d="M16.5 14.4c2.4.2 4 1.8 4.5 4.6" />
  </Svg>
);
export const Play = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="3.5" />
    <path d="M10.2 9.2v5.6l4.6-2.8z" />
  </Svg>
);
export const Person = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c.8-4 3.6-6.2 7-6.2s6.2 2.2 7 6.2" />
  </Svg>
);
export const Sun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);
export const Moon = (p: P) => <Svg {...p}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></Svg>;
export const Globe = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
  </Svg>
);
export const Search = (p: P) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20.5 20.5" />
  </Svg>
);
export const ChevronDown = (p: P) => <Svg {...p}><path d="M6 9.5l6 6 6-6" /></Svg>;
export const ChevronLeft = (p: P) => <Svg {...p}><path d="M14.5 6l-6 6 6 6" /></Svg>;
export const ChevronRight = (p: P) => <Svg {...p}><path d="M9.5 6l6 6-6 6" /></Svg>;
export const ArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>;
export const ArrowUp = (p: P) => <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>;
export const External = (p: P) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v4.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6H10" />
  </Svg>
);
export const MapPin = (p: P) => (
  <Svg {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </Svg>
);
export const Bus = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="14" rx="3" />
    <path d="M5 11h14M8 17.5V20M16 17.5V20M8.5 14.3h.1M15.5 14.3h.1" />
  </Svg>
);
export const Coins = (p: P) => (
  <Svg {...p}>
    <ellipse cx="9" cy="7" rx="5.5" ry="2.5" />
    <path d="M3.5 7v4.5c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7" />
    <path d="M9.5 16.5c.6 1.1 2.8 2 5.5 2 3 0 5.5-1.1 5.5-2.5V11.5c0-1.2-1.8-2.2-4.3-2.4" />
  </Svg>
);
export const Flag = (p: P) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4.5h11l-2 4 2 4H5" />
  </Svg>
);
export const House = (p: P) => (
  <Svg {...p}>
    <path d="M4 11l8-6.5 8 6.5M6 9.5V20h12V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </Svg>
);
export const Layers = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5l9 5-9 5-9-5z" />
    <path d="M3 13l9 5 9-5" />
  </Svg>
);
export const Github = (p: P) => (
  <Svg {...p} fill>
    <path d="M12 2.5a9.5 9.5 0 00-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.2-1.2-3.2-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1.1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 014.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0012 2.5z" />
  </Svg>
);
export const Spark = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
  </Svg>
);
export const Lock = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" />
  </Svg>
);
export const Link = (p: P) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
  </Svg>
);
export const Tunnel = (p: P) => (
  <Svg {...p}>
    <path d="M3 20V12a9 9 0 0118 0v8" />
    <path d="M7 20v-7a5 5 0 0110 0v7M3 20h18" />
  </Svg>
);
export const Sliders = (p: P) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);
export const Ledger = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Svg>
);
export const Bell = (p: P) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 004 0" />
  </Svg>
);
export const Expand = (p: P) => <Svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>;
export const Calc = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="3.5" width="14" height="17" rx="3" />
    <path d="M8.5 8h7M8.5 12.5h.1M12 12.5h.1M15.5 12.5h.1M8.5 16h.1M12 16h.1M15.5 16h.1" />
  </Svg>
);
export const Replay = (p: P) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 102.3-5.6M4 4.5v4h4" />
    <path d="M10.5 9.2v5.6l4.4-2.8z" />
  </Svg>
);
export const Access = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="4.8" r="1.8" />
    <path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3.5 6M12 14.5l3.5 6" />
  </Svg>
);
