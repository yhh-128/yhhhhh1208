// 全部是簡單的線條圖示，裝飾用（aria-hidden）。
type P = { size?: number; class?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true,
} as const);

export const ChatIcon = ({ size = 20, class: c }: P) => (
  <svg {...base(size)} class={c}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
  </svg>
);
export const ChatDotsIcon = ({ size = 20 }: P) => (
  <svg {...base(size)}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
    <path d="M9 11.5h.01M12 11.5h.01M15 11.5h.01" stroke-width="2.6" />
  </svg>
);
export const ChatSmileIcon = ({ size = 20 }: P) => (
  <svg {...base(size)} stroke-width={1.7}>
    <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" />
    <path d="M9 12.5c1 1.2 2 1.8 3 1.8s2-.6 3-1.8" />
  </svg>
);
export const ChevronDownIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} stroke-width={2.2}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const ChevronUpIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} stroke-width={2.2}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);
export const LeaveIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9" />
  </svg>
);
export const SendIcon = ({ size = 22 }: P) => (
  <svg {...base(size)} stroke-width={2.2}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const ArrowDownIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} stroke-width={2.4}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
export const AlertIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5M12 16h.01" />
  </svg>
);
export const SpinnerIcon = ({ size = 18 }: P) => (
  <svg {...base(size)} stroke-width={2.4} class="spin">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);
export const ClockIcon = ({ size = 16 }: P) => (
  <svg {...base(size)} stroke-width={2.2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);
