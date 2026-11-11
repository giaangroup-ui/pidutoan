"""Đặt phiên bản app ở index.html (?v=, meta app-version) và version.json. Chạy trước mỗi lần commit phát hành."""
import re, sys, json, datetime
v = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime("%Y.%m.%d-%H%M")
p = "index.html"; s = open(p, encoding="utf-8").read()
s = re.sub(r'\?v=[^"\']+', "?v=" + v, s)
s = re.sub(r'(<meta name="app-version" content=")[^"]*(")', r"\g<1>" + v + r"\2", s)
open(p, "w", encoding="utf-8").write(s)
json.dump({"v": v, "built": datetime.datetime.now().isoformat(timespec="seconds")}, open("version.json", "w"))
print("version", v)
