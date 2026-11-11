"""E2E headless: quy trình 9 bước (chặn bước), Kiểm tra (BKL gốc / BKL sửa), xuất BKL Excel, PWA.
Chạy: python3 tests/flow_e2e.py [base_url]"""
import json, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "out"; OUT.mkdir(exist_ok=True)
DXF = "/workspace/picad/job1/v3/BV_PHA_DO_v3.7.dxf"
BKL = "/workspace/picad/job1/v3/BANG_KHOI_LUONG_v3.7.xlsx"
ALT = str(ROOT / "tests" / "fixtures" / "BKL_v3.7_altered.xlsx")
R, errors = {}, []

def status(page):
    return page.evaluate("(() => { const p = PiApp.currentProject(); const s = PiFlow.stepStatus(p); return Object.fromEntries(Object.entries(s).map(([k,v]) => [k, v])) })()")
def next_disabled(page):
    return page.eval_on_selector("#wNext", "b => b.disabled")
def shot(page, name):
    p = OUT / name; page.screenshot(path=str(p), full_page=False); R.setdefault("screens", []).append(str(p))

def main(base):
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome-stable", args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = br.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("dialog", lambda d: d.accept())
        page.goto(base, wait_until="networkidle")
        # PWA
        R["manifest_link"] = page.eval_on_selector('link[rel="manifest"]', "l => l.href")
        R["manifest_status"] = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.status)")
        R["manifest"] = page.evaluate("fetch(document.querySelector('link[rel=manifest]').href).then(r => r.json()).then(j => ({name:j.name, short:j.short_name, start:j.start_url, scope:j.scope, id:j.id, display:j.display, icons:j.icons.map(i=>i.sizes+':'+i.purpose)}))")
        page.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.getRegistration().then(r => !!r)", timeout=15000)
        page.wait_for_function("navigator.serviceWorker.ready.then(r => !!r.active)", timeout=15000)
        R["sw"] = page.evaluate("navigator.serviceWorker.getRegistration().then(r => ({scope: r.scope, script: (r.active||r.installing||r.waiting).scriptURL}))")
        R["sw_caches"] = page.evaluate("caches.keys()")
        R["apple_touch_status"] = page.evaluate("fetch('icons/apple-touch-icon.png').then(r => r.status)")
        for ic in ["icon-192", "icon-512", "maskable-192", "maskable-512"]:
            R["icon_" + ic] = page.evaluate(f"fetch('icons/{ic}.png').then(r => r.status)")
        R["install_btn_present"] = page.locator("#installBtn").count() == 1

        # Tạo công trình → Quy trình
        page.fill("#npName", "MW+GG Phú Quốc — thử quy trình"); page.fill("#npLoc", "34-36 Trần Hưng Đạo, Phú Quốc"); page.click("#npCreate")
        page.click('nav.tabs button[data-view="workflow"]'); page.wait_for_selector(".wizard")
        R["step1_next_disabled_initially"] = next_disabled(page)
        R["step2_locked_initially"] = page.eval_on_selector('[data-wstep="2"]', "b => b.disabled")
        page.select_option("#w1Cap", "III"); page.select_option("#w1Loai", "Công trình dân dụng"); page.click("#w1Sug"); page.click("#w1Save")
        page.wait_for_timeout(200)
        R["step1_missing_after"] = status(page)["1"]
        page.click("#wNext"); page.wait_for_selector("#w2Dxf", state="attached")
        shot(page, "wizard_step2_before.png")
        page.set_input_files("#w2Dxf", DXF); page.wait_for_function("PiApp.currentProject().dxfMeta && PiApp.currentProject().dxfMeta.walls > 0", timeout=30000)
        page.wait_for_selector("#w2Xlsx", state="attached")
        page.set_input_files("#w2Xlsx", BKL); page.wait_for_function("PiApp.currentProject().bklMeta", timeout=30000)
        page.wait_for_timeout(300)
        R["step2_missing_before_checklist"] = status(page)["2"]
        R["step2_next_disabled"] = next_disabled(page)
        for sel in page.locator("select[data-bm]").all():
            sel.select_option("co"); page.wait_for_timeout(120)
        # điền H các tầng
        for inp in page.locator('input[data-fl][data-k="H"]').all(): inp.fill("3600")
        page.click("#flSave"); page.wait_for_timeout(200)
        R["step2_missing_before_ack"] = status(page)["2"]
        page.check("#w2Ack"); page.wait_for_timeout(200)
        R["step2_missing_after"] = status(page)["2"]
        shot(page, "wizard_step2_done.png")
        page.click("#wNext"); page.wait_for_selector("#w3Auto")
        R["step3_missing_before"] = status(page)["3"]
        page.click("#w3Auto"); page.wait_for_timeout(300)
        R["step3_missing_after"] = status(page)["3"]
        R["step3_first_types"] = page.evaluate("PiApp.currentProject().qtyRows.slice(0,3).map(r => r.loaiCongTac + ':' + r.ma)")
        page.click("#wNext"); page.wait_for_selector("#w4Save")
        R["step4_missing_before"] = status(page)["4"]
        R["step4_dxf_rows"] = page.evaluate("PiFlow.session.analysis ? PiFlow.session.analysis.rows.length : 0")
        # dòng thiếu diễn giải: gõ qua giao diện
        miss = page.locator("tr.lv-yellow input[data-dg], tr.lv-red input[data-dg]")
        R["step4_rows_missing_dg"] = miss.count()
        for i in range(miss.count()):
            if not miss.nth(i).input_value().strip(): miss.nth(i).fill("Theo BKL PiCAD v3.7 (kích thước ghi trên tờ)")
        # ô KL lỗi #VALUE!: nhập số cửa đếm trên bản vẽ PD (từ phân tích DXF)
        fixes = page.evaluate("""(() => { const a = PiFlow.session.analysis; return PiApp.currentProject().qtyRows.filter(r => r.klError).map(r => [r.id, r.ma, a.openings.filter(o => o.code === r.ma && !(a.frames[o.frame] && a.frames[o.frame].kind !== 'PD')).length]) })()""")
        R["step4_klfix"] = fixes
        for rid, ma, n in fixes: page.fill(f'input[data-klfix="{rid}"]', str(n))
        page.click("#w4Save"); page.wait_for_timeout(200)
        R["step4_missing_after"] = status(page)["4"]
        if R["step4_missing_after"]:
            R["step4_debug"] = page.evaluate("PiApp.currentProject().qtyRows.filter(r => !(r.dienGiai||'').trim() && (+r.kl||0) !== 0).slice(0,8).map(r => [r.ma, r.ten, r.kl, r.origin])")
            print(json.dumps(R, ensure_ascii=False, indent=1)); raise SystemExit(2)
        shot(page, "wizard_step4.png")
        page.click("#wNext"); page.wait_for_selector("#ckRun")
        page.click("#ckRun"); page.wait_for_timeout(1500)
        R["check_base_counts"] = page.evaluate("PiApp.currentProject().lastCheck.counts")
        R["step5_next_disabled_with_red"] = next_disabled(page)
        shot(page, "wizard_step5_check.png")
        page.fill("#w5Ack", "Đã xem: lỗi công thức TK_CUA của PiCAD, XM T1/T3 lệch do cắt giao tường; sẽ sửa BKL."); page.click("#w5AckSave"); page.wait_for_timeout(200)
        R["step5_missing_after_ack"] = status(page)["5"]
        page.click("#wNext"); page.wait_for_selector("#w6Sample")
        R["step6_missing_before"] = status(page)["6"]
        page.click("#w6Sample"); page.wait_for_timeout(300)
        R["step6_missing_after_sample"] = status(page)["6"]
        R["step6_flash"] = page.evaluate("(document.querySelector('.callout.info')||{}).textContent || ''")
        R["step6_next_disabled"] = next_disabled(page)
        R["step7_locked"] = page.eval_on_selector('[data-wstep="7"]', "b => b.disabled")
        shot(page, "wizard_step6_gated.png")

        # Tab Kiểm tra: BKL gốc
        page.click('nav.tabs button[data-view="checks"]'); page.wait_for_selector("#ckRun")
        page.click("#ckRun"); page.wait_for_timeout(1500)
        base_issues = page.evaluate("PiApp.currentProject().lastCheck.issues")
        R["checks_tab_base"] = page.evaluate("PiApp.currentProject().lastCheck.counts")
        pick = lambda iss, code: [i["level"] + " | " + i["reason"] for i in iss if i["item"] == code or i.get("code") == code]
        R["base_B1-TU-01"] = pick(base_issues, "B1-TU-01"); R["base_T1-TU-05"] = pick(base_issues, "T1-TU-05")
        shot(page, "checks_base.png")
        with page.expect_download() as d: page.click("#ckXlsx")
        dl = d.value; pth = OUT / "kiemtra_base.xlsx"; dl.save_as(str(pth)); R["check_xlsx"] = str(pth)
        # BKL đã sửa: tab Khối lượng → nhập lại (thay BKL cũ)
        page.click('nav.tabs button[data-view="qty"]'); page.wait_for_selector("#xlsxFile", state="attached")
        page.set_input_files("#xlsxFile", ALT); page.wait_for_function("PiApp.currentProject().bklMeta.name.includes('altered')", timeout=30000)
        page.click('nav.tabs button[data-view="checks"]'); page.wait_for_selector("#ckRun")
        page.click("#ckRun"); page.wait_for_timeout(1500)
        alt_issues = page.evaluate("PiApp.currentProject().lastCheck.issues")
        R["checks_tab_alt"] = page.evaluate("PiApp.currentProject().lastCheck.counts")
        R["alt_B1-TU-01"] = pick(alt_issues, "B1-TU-01"); R["alt_T1-TU-05"] = pick(alt_issues, "T1-TU-05")
        R["ALTERED_BOTH_RED"] = any(x.startswith("red") for x in R["alt_B1-TU-01"]) and any(x.startswith("red") for x in R["alt_T1-TU-05"])
        page.click('[data-ifilter="red"]'); page.wait_for_timeout(200)
        shot(page, "checks_altered_red.png")
        page.click('[data-ifilter="all"]')
        # Chuẩn layer
        page.click('nav.tabs button[data-view="layers"]'); page.wait_for_selector("#lySave")
        R["layers_rows"] = page.locator("[data-lp][data-k=pattern]").count()
        shot(page, "layers.png")
        # Xuất BKL Excel
        page.click('nav.tabs button[data-view="export"]'); page.wait_for_selector("#expBkl")
        with page.expect_download() as d: page.click("#expBkl")
        pth = OUT / "bkl_export.xlsx"; d.value.save_as(str(pth))
        ws = openpyxl.load_workbook(pth).worksheets[0]
        R["bkl_export_header"] = [c.value for c in ws[5]]
        R["bkl_export_sample"] = [[c.value for c in ws[r]] for r in range(6, 9)]
        with page.expect_download() as d: page.click("#expXlsx")
        pth = OUT / "dutoan_export.xlsx"; d.value.save_as(str(pth))
        # Dự toán tab
        page.click('nav.tabs button[data-view="estimate"]'); page.wait_for_selector("#saveRates"); shot(page, "estimate.png")
        # Reload: dữ liệu còn, DXF đọc lại từ IndexedDB
        page.reload(wait_until="networkidle")
        page.click('nav.tabs button[data-view="workflow"]'); page.wait_for_selector(".wizard")
        page.wait_for_function("PiFlow.session && PiFlow.session.analysis", timeout=30000)
        R["after_reload_dxf_restored"] = page.evaluate("PiFlow.session.analysis.walls.length")
        # Mobile
        m = br.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mp = m.new_page(); mp.goto(base, wait_until="networkidle"); mp.screenshot(path=str(OUT / "mobile_home.png")); R["screens"].append(str(OUT / "mobile_home.png"))
        br.close()
    R["errors"] = errors
    json.dump(R, open(OUT / "flow_e2e.json", "w"), ensure_ascii=False, indent=1)
    print(json.dumps(R, ensure_ascii=False, indent=1))
    return 0 if (R.get("ALTERED_BOTH_RED") and not errors) else 1

if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765/"))
