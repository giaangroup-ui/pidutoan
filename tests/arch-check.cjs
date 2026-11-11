// Kiểm thử Node: bóc DXF v3.7 + BKL gốc và BKL đã sửa (+10% một dòng, xóa một dòng).
const fs = require("fs"), path = require("path");
const XLSX = require("xlsx"); global.XLSX = XLSX;
global.PiFormula = require("../js/xlsx-formula.js");
require("../js/excel-io.js");
global.PiArch = require("../js/arch-standard.js");
const T = require("../js/dxf-takeoff.js"), P = require("dxf-parser");
const AT = require("../js/arch-takeoff.js"), CK = require("../js/checks.js");
const DXF = process.env.DXF || "/workspace/picad/job1/v3/BV_PHA_DO_v3.7.dxf";
const BKL = process.env.BKL || "/workspace/picad/job1/v3/BANG_KHOI_LUONG_v3.7.xlsx";
const ALT = path.join(__dirname, "fixtures/BKL_v3.7_altered.xlsx");
const floors = { B1: { H: 3600 }, T1: { H: 3600 }, T2: { H: 3600 }, T3: { H: 3600 } };
const dxf = T.parseText(fs.readFileSync(DXF, "utf8"), P);
const ax = AT.analyze(dxf, { floors });
function check(file) {
  const wb = XLSX.readFile(file, { cellFormula: true, sheetStubs: true });
  const pr = PiExcel.parseWorkbook(wb, () => 0);
  return CK.run({ analysis: ax, rows: pr.rows, formulaErrors: pr.formulaErrors, formulaWarnings: pr.formulaWarnings, floors });
}
const base = check(BKL), alt = check(ALT);
const find = (res, item) => res.issues.filter((i) => i.item === item || i.code === item);
const out = {
  takeoff: { frames: ax.frames.length, walls: ax.walls.length, tags: ax.tagStats, openings: ax.openings.length, freeEnds: ax.freeEnds.length, unmapped: ax.audit.unmappedLayers.length, uncoded: ax.audit.uncodedBlocks.map((b) => b.name) },
  base: base.counts, alt: alt.counts,
  base_B1TU01: find(base, "B1-TU-01").map((i) => i.level + " " + i.reason),
  alt_B1TU01: find(alt, "B1-TU-01").map((i) => i.level + " " + i.reason),
  base_T1TU05: find(base, "T1-TU-05").map((i) => i.level + " " + i.reason),
  alt_T1TU05: find(alt, "T1-TU-05").map((i) => i.level + " " + i.reason),
  groups: base.issues.filter((i) => i.group === "Khối lượng nhóm").map((i) => i.level + " " + i.item + ": " + i.reason),
  doors: base.issues.filter((i) => i.group === "Cửa").map((i) => i.level + " " + i.item + ": " + i.reason),
};
const ok = out.alt_B1TU01.some((s) => s.startsWith("red")) && out.alt_T1TU05.some((s) => s.startsWith("red")) && !out.base_B1TU01.some((s) => s.startsWith("red")) && !out.base_T1TU05.some((s) => s.startsWith("red"));
out.PASS = ok;
fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "out/arch-check.json"), JSON.stringify(Object.assign({}, out, { baseIssues: base.issues, altIssues: alt.issues }), null, 2));
console.log(JSON.stringify(out, null, 1));
process.exit(ok ? 0 : 1);
