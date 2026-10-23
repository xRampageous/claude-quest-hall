import type { Landmark } from './haven'
import { settlementOf } from './haven'

// A compact, original pixel-art home for the live work map: a shared timber
// workshop in a wooded hollow, with landmarks earned through real work.
export function homestead(width: number, landmarks: readonly Landmark[], hero: number) {
  const built = new Set(landmarks.map(l => l.id))
  const scale = Math.min(1, width / 240)
  const height = 88 * scale
  const x = (width - 240 * scale) / 2
  const box = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`
  const tree = (x: number, y: number, leaf = '#315d4a') =>
    box(x + 7, y + 12, 4, 13, '#514133') + box(x + 2, y + 5, 14, 12, '#213f37') +
    box(x, y + 9, 18, 10, leaf) + box(x + 4, y + 1, 10, 10, '#477556') + box(x + 6, y + 3, 3, 3, '#679064')
  const light = (x: number, y: number) =>
    box(x - 2, y - 2, 9, 9, '#f3c975', 'opacity=".13"') + box(x, y, 5, 5, '#f0c76b') + box(x + 1, y + 1, 2, 3, '#fff0a8')
  const base = (x: number, y: number, w: number) =>
    box(x, y, w, 3, '#45594a') + box(x + 3, y - 2, w - 6, 2, '#69715a')

  const garden = built.has('garden')
    ? [0, 1, 2].map(i =>
        box(130, 65 + i * 5, 24, 3, '#76583d') + box(131, 65 + i * 5, 22, 1, '#a88659') +
        [0, 1, 2, 3].map(j =>
          box(133 + j * 5, 62 + i * 5, 2, 4, '#55794d') + box(132 + j * 5, 61 + i * 5, 4, 2, i % 2 ? '#bb9562' : '#d18a78'),
        ).join(''),
      ).join('')
    : base(132, 78, 22)
  const tower = built.has('tower')
    ? box(176, 37, 10, 35, '#647a73') + box(173, 34, 16, 4, '#9a9a78') +
      box(179, 27, 4, 8, '#7fc8bc') + box(180, 23, 2, 4, '#e6d69b') +
      box(179, 45, 2, 5, '#253b3b') + box(181, 58, 2, 5, '#253b3b') +
      `<path d="M181 24v-5m-7 8h-4m18 0h4" stroke="#7fc8bc" stroke-width="1"/>`
    : base(174, 74, 14)
  const board = built.has('board')
    ? box(157, 50, 2, 20, '#654b37') + box(169, 50, 2, 20, '#654b37') +
      box(155, 45, 18, 15, '#785d40', 'stroke="#392c25" stroke-width="1"') +
      box(158, 48, 12, 9, '#d4c49c') + box(160, 50, 7, 1, '#8f7858') + box(160, 53, 5, 1, '#8f7858') +
      box(157, 47, 2, 2, '#d97862') + box(169, 47, 2, 2, '#79b8ad')
    : base(156, 74, 15)
  const camp = built.has('camp')
    ? `<path d="M196 71l12-19l15 19z" fill="#a4ad8d" stroke="#354b3f" stroke-width="2"/>` +
      `<path d="M208 56l-4 15h11z" fill="#40574c"/>` + box(197, 73, 23, 2, '#53604a') + light(219, 67)
    : base(195, 75, 25)
  const banner = built.has('banner')
    ? box(124, 22, 2, 16, '#c2aa72') + `<path d="M126 24h11v9l-5-2l-6 2z" fill="#b97958" stroke="#452f2d" stroke-width=".7"/>` +
      `<path d="M129 27l2 2l3-3" fill="none" stroke="#f0d6a0" stroke-width="1.2"/>`
    : ''
  const upgraded = built.has('workshop')

  return {
    height,
    svg:
      `<g aria-label="Patchhaven settlement"><rect width="${width}" height="${height}" fill="#14272e"/>` +
      `<g transform="translate(${x} 0) scale(${scale})" shape-rendering="crispEdges">` +
      box(0, 0, 240, 88, '#172b34') + box(0, 39, 240, 49, '#294538') + box(0, 65, 240, 23, '#34523e') +
      `<path d="M0 39l20-18l18 12l20-15l21 19l18-13l25 14l20-22l21 18l23-15l25 19l29-13v18H0z" fill="#223c3c"/>` +
      `<path d="M0 52l28-7l24 5l22-8l26 10l24-8l25 9l24-7l27 8l40-9v18H0z" fill="#2c4a3d"/>` +
      `<circle cx="205" cy="17" r="5" fill="#d9d8b0"/><circle cx="207" cy="15" r="5" fill="#172b34"/>` +
      `<path d="M30 88V77h31V72h26V67h56v5h25v6h46" fill="none" stroke="#5a604c" stroke-width="8"/>` +
      `<path d="M30 88V77h31V72h26V67h56v5h25v6h46" fill="none" stroke="#9a835f" stroke-width="4"/>` +
      `<path d="M4 78q16-5 31 2t34 2" fill="none" stroke="#536f68" stroke-width="3"/><path d="M4 80q16-5 31 2t34 2" fill="none" stroke="#79a69a" stroke-width="1.2"/>` +
      tree(-5, 37, '#37674e') + tree(219, 31, '#315c48') + tree(43, 47, '#315541') + tree(228, 47, '#3c684e') +
      // The shared repair shop: warm windows, cedar trim and a small stitched roof.
      box(76, 37, 55, 31, '#705d49', 'stroke="#1c2b2d" stroke-width="2"') +
      box(80, 40, 47, 27, '#a58a65') + box(80, 63, 47, 5, '#5b4b3c') +
      `<path d="M69 39l34-24l36 24z" fill="#3b514b" stroke="#17272c" stroke-width="2"/>` +
      `<path d="M75 37l28-19l30 19" fill="none" stroke="#829178" stroke-width="2"/><path d="M82 35l20-13l22 13" fill="none" stroke="#bd9a65" stroke-width="1"/>` +
      box(87, 46, 13, 12, '#304b49', 'stroke="#493e36" stroke-width="2"') + light(91, 49) +
      box(108, 45, 13, 13, '#304b49', 'stroke="#493e36" stroke-width="2"') + light(112, 48) +
      box(101, 49, 8, 19, '#413b34') + box(103, 51, 4, 15, '#70583f') + box(106, 58, 1, 1, '#e0bf72') +
      box(94, 31, 19, 4, '#283e3e', 'stroke="#18282b" stroke-width="1"') +
      `<text x="103.5" y="34" font-size="3.6" text-anchor="middle" font-weight="700" fill="#d7c491">PATCHHAVEN</text>` +
      box(119, 22, 6, 14, '#7c6c57') + box(118, 20, 8, 3, '#596158') +
      (upgraded ? box(129, 43, 8, 24, '#927a59') + box(131, 48, 4, 8, '#75b4a6') : '') +
      banner + garden + board + tower + camp +
      `<use href="#c${hero}f0" x="17" y="37" width="23" height="43"/>` +
      `<path d="M8 85h3m16-5h3m51-5h3m68 1h3m40-2h3" stroke="#92a773" stroke-width="1"/>` +
      `<circle cx="58" cy="62" r="1" fill="#d3ba73"/><circle cx="65" cy="56" r="1" fill="#a5c18b"/>` +
      `<text x="8" y="12" font-size="7.5" font-weight="700" letter-spacing=".35" fill="#d7c491">${settlementOf(landmarks).stage.toUpperCase()}</text>` +
      `<text x="232" y="82" text-anchor="end" font-size="6" fill="#c1c9ae">${landmarks.length}/6 landmarks</text></g></g>`,
  }
}
