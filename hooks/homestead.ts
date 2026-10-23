import type { Landmark } from './haven'
import { settlementOf } from './haven'

// Original pixel scenery, built from a small palette and hard-edged shapes.
// The homestead is a persistent backdrop; the rooms below remain the live map.
export function homestead(width: number, landmarks: readonly Landmark[], hero: number) {
  const built = new Set(landmarks.map(l => l.id))
  const scale = Math.min(1, width / 240)
  const height = 88 * scale
  const x = (width - 240 * scale) / 2
  const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
  const tree = (x: number, y: number) => rect(x + 7, y + 15, 4, 12, '#504134') + rect(x + 2, y + 4, 15, 13, '#25483e') + rect(x, y + 10, 19, 10, '#2e5946') + rect(x + 5, y, 9, 9, '#3b6951')
  const lit = (x: number, y: number) => rect(x - 2, y - 2, 8, 9, '#deb45a22') + rect(x, y, 4, 5, '#dfb864')
  const foundation = (x: number, y: number, w: number) => rect(x, y, w, 3, '#536356') + rect(x + 3, y - 2, 3, 2, '#73836b')
  const garden = built.has('garden')
    ? [0, 1, 2].map(i => rect(111, 64 + i * 5, 23, 3, '#70543d') + [0, 1, 2, 3].map(j => rect(113 + j * 5, 61 + i * 5, 2, 4, '#84ab6b') + rect(112 + j * 5, 61 + i * 5, 3, 2, i % 2 ? '#cab583' : '#c88d8a')).join('')).join('')
    : foundation(112, 76, 23)
  const tower = built.has('tower')
    ? rect(164, 29, 12, 35, '#727f80') + rect(162, 25, 16, 5, '#9a9b87') + rect(167, 16, 6, 10, '#7bc5bc') + rect(169, 13, 2, 3, '#cfdfc2') + rect(166, 36, 3, 5, '#263e46') + rect(170, 50, 3, 5, '#263e46') + `<path d="M170 14v-5m-7 8h-4m18 0h4" stroke="#7bc5bc" stroke-width="1"/>`
    : foundation(163, 63, 15)
  const board = built.has('board')
    ? rect(142, 44, 2, 19, '#6a503c') + rect(152, 44, 2, 19, '#6a503c') + rect(139, 40, 18, 14, '#765e43') + rect(141, 42, 14, 9, '#d7c6a1') + rect(143, 44, 8, 1, '#7c725d') + rect(143, 47, 6, 1, '#7c725d')
    : foundation(140, 63, 17)
  const camp = built.has('camp')
    ? `<path d="M191 64l15-22l17 22z" fill="#9eab8b" stroke="#2b4039" stroke-width="2"/><path d="M204 47l-5 17h13z" fill="#384b43"/>` + rect(195, 66, 23, 2, '#4d5948') + lit(220, 61)
    : foundation(193, 66, 26)
  const banner = built.has('banner')
    ? rect(94, 18, 2, 28, '#c0ab78') + `<path d="M96 20h14v12l-7-3l-7 3z" fill="#b68c56"/><path d="M100 23l3 3l4-5" fill="none" stroke="#eee0b6" stroke-width="1.4"/>`
    : ''
  const upgraded = built.has('workshop')
  return {
    height,
    svg: `<g aria-label="Patchhaven homestead"><rect width="${width}" height="${height}" fill="#152b2b"/><g transform="translate(${x} 0) scale(${scale})" shape-rendering="crispEdges">` +
      rect(0, 0, 240, 88, '#192c32') + rect(0, 34, 240, 54, '#2c483b') + rect(0, 65, 240, 23, '#365440') +
      `<path d="M0 35l18-14l19 11l21-14l25 17l26-14l27 14l21-21l26 20l24-15l33 16v10H0z" fill="#243e3d"/>` +
      tree(-7, 30) + tree(224, 27) + tree(181, 32) +
      `<path d="M30 88V73h47V65h40v-3h47v5h56" fill="none" stroke="#697060" stroke-width="9"/><path d="M30 88V73h47V65h40v-3h47v5h56" fill="none" stroke="#a08c6b" stroke-width="5"/>` +
      rect(53, 36, 49, 30, '#9e8160') + rect(55, 39, 45, 26, '#b29a73') + rect(53, 63, 49, 4, '#65553e') +
      `<path d="M47 37l31-22l31 22z" fill="${upgraded ? '#547c78' : '#6a6563'}"/><path d="M51 37l27-18l27 18" fill="none" stroke="${upgraded ? '#84a799' : '#96847b'}" stroke-width="2"/>` +
      rect(60, 27, 6, 11, '#857966') + rect(70, 48, 13, 18, '#3b4540') + lit(58, 47) + lit(89, 47) +
      (upgraded ? rect(72, 29, 12, 6, '#8ab8aa') + rect(77, 29, 2, 6, '#345551') : '') + banner + garden + board + tower + camp +
      `<use href="#c${hero}f0" x="15" y="26" width="27" height="49"/>` +
      `<text x="8" y="12" font-size="8" font-weight="700" fill="#dfc68b">${settlementOf(landmarks).stage.toUpperCase()}</text>` +
      `<text x="232" y="82" text-anchor="end" font-size="6.5" fill="#c1c9ae">${landmarks.length}/6 landmarks</text>` +
      `</g></g>`,
  }
}
