"""Tạo BKL đã sửa để kiểm thử: B1-TU-01 L +10% (công thức giữ nguyên → KL +10%), xóa dòng T1-TU-05 (cập nhật công thức như Excel)."""
import openpyxl, re, sys
src = sys.argv[1] if len(sys.argv) > 1 else '/workspace/picad/job1/v3/BANG_KHOI_LUONG_v3.7.xlsx'
dst = sys.argv[2] if len(sys.argv) > 2 else 'tests/fixtures/BKL_v3.7_altered.xlsx'
wb = openpyxl.load_workbook(src)
ws = wb['PD-01']
for r in range(6, ws.max_row + 1):
    if ws.cell(r, 1).value == 'B1-TU-01':
        old = ws.cell(r, 4).value; ws.cell(r, 4).value = round(old * 1.1, 1); print('B1-TU-01 L', old, '->', ws.cell(r, 4).value)
ws = wb['PD-02']
dr = next(r for r in range(6, ws.max_row + 1) if ws.cell(r, 1).value == 'T1-TU-05')
ws.delete_rows(dr, 1); print('xóa T1-TU-05 ở dòng', dr)
def shift(f):
    return re.sub(r'(\$?[A-Z]{1,3}\$?)(\d+)', lambda m: m.group(1) + str(int(m.group(2)) - 1 if int(m.group(2)) > dr else int(m.group(2))), f)
for row in ws.iter_rows(min_row=dr):
    for c in row:
        if isinstance(c.value, str) and c.value.startswith('='): c.value = shift(c.value)
th = wb['Tổng hợp']
for row in th.iter_rows():
    for c in row:
        if isinstance(c.value, str) and "'PD-02'!" in c.value:
            c.value = re.sub(r"'PD-02'!([A-Z]+)(\d+)", lambda m: "'PD-02'!" + m.group(1) + str(int(m.group(2)) - 1 if int(m.group(2)) > dr else int(m.group(2))), c.value)
wb.save(dst); print('saved', dst)
