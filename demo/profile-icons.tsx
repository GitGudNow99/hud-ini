// Vehicle glyphs adapted from Tabler Icons (MIT); see public/licenses/tabler-icons.txt.
import { createIcon } from '@react-spectrum/s2/Icon';

export const profileIcons = {
  multirotor: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 10h4v4h-4l0 -4" />
        <path d="M10 10l-3.5 -3.5" />
        <path d="M9.96 6a3.5 3.5 0 1 0 -3.96 3.96" />
        <path d="M14 10l3.5 -3.5" />
        <path d="M18 9.96a3.5 3.5 0 1 0 -3.96 -3.96" />
        <path d="M14 14l3.5 3.5" />
        <path d="M14.04 18a3.5 3.5 0 1 0 3.96 -3.96" />
        <path d="M10 14l-3.5 3.5" />
        <path d="M6 14.04a3.5 3.5 0 1 0 3.96 3.96" />
      </g>
    </svg>
  )),
  helicopter: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 10l1 2h6" />
        <path d="M12 9a2 2 0 0 0 -2 2v3c0 1.1 .9 2 2 2h7a2 2 0 0 0 2 -2c0 -3.31 -3.13 -5 -7 -5h-2" />
        <path d="M13 9l0 -3" />
        <path d="M5 6l15 0" />
        <path d="M15 9.1v3.9h5.5" />
        <path d="M15 19l0 -3" />
        <path d="M19 19l-8 0" />
      </g>
    </svg>
  )),
  plane: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3l4 7" />
      </g>
    </svg>
  )),
  vtol: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 6.5l3 -2.9a2.05 2.05 0 0 1 2.9 2.9l-2.9 3l2.5 7.5l-2.5 2.55l-3.5 -6.55l-3 3v3l-2 2l-1.5 -4.5l-4.5 -1.5l2 -2h3l3 -3l-6.5 -3.5l2.5 -2.5l7.5 2.5" />
      </g>
    </svg>
  )),
  rover: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 5a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2l0 -2" />
        <path d="M5 17a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2l0 -2" />
        <path d="M15 5a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2l0 -2" />
        <path d="M15 17a2 2 0 0 1 2 -2a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2a2 2 0 0 1 -2 -2l0 -2" />
        <path d="M9 18h6" />
        <path d="M9 6h6" />
        <path d="M12 6.5v-.5v12" />
      </g>
    </svg>
  )),
  boat: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1" />
        <path d="M4 18l-1 -5h18l-2 4" />
        <path d="M5 13v-6h8l4 6" />
        <path d="M7 7v-4h-1" />
      </g>
    </svg>
  )),
  submarine: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 11v6h2l1 -1.5l3 1.5h10a3 3 0 0 0 0 -6h-10l-3 1.5l-1 -1.5h-2" />
        <path d="M17 11l-1 -3h-5l-1 3" />
        <path d="M13 8v-2a1 1 0 0 1 1 -1h1" />
      </g>
    </svg>
  )),
  tracker: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.707 6.293l2.586 -2.586a1 1 0 0 1 1.414 0l5.586 5.586a1 1 0 0 1 0 1.414l-2.586 2.586a1 1 0 0 1 -1.414 0l-5.586 -5.586a1 1 0 0 1 0 -1.414" />
        <path d="M6 10l-3 3l3 3l3 -3" />
        <path d="M10 6l3 -3l3 3l-3 3" />
        <path d="M12 12l1.5 1.5" />
        <path d="M14.5 17a2.5 2.5 0 0 0 2.5 -2.5" />
        <path d="M15 21a6 6 0 0 0 6 -6" />
      </g>
    </svg>
  )),
  blimp: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M13.5 4c4.694 0 8.5 2.686 8.5 6s-3.806 6 -8.5 6c-2.13 0 -4.584 -.926 -7.364 -2.777l-2.136 1.777v-3.33a46.07 46.07 0 0 1 -2 -1.67a46.07 46.07 0 0 1 2 -1.67v-3.33l2.135 1.778c2.78 -1.852 5.235 -2.778 7.365 -2.778" />
        <path d="M10 15.5v4.5h6v-4" />
      </g>
    </svg>
  )),
  ptz: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 4a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1l0 -2" />
        <path d="M8 14a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
        <path d="M19 7v7a7 7 0 0 1 -14 0v-7" />
        <path d="M12 14l.01 0" />
      </g>
    </svg>
  )),
  generic: createIcon((props) => (
    <svg viewBox="0 0 24 24" {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
        <path d="M12 12l8 -4.5" />
        <path d="M12 12l0 9" />
        <path d="M12 12l-8 -4.5" />
      </g>
    </svg>
  )),
};
