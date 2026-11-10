import { spawn } from "child_process";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = 8765;

const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
  cwd: root,
  stdio: "inherit",
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      http.get({ hostname: "127.0.0.1", port, path: "/", timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode);
      }).on("error", () => {
        if (Date.now() - t0 > 10000) reject(new Error("server timeout"));
        else setTimeout(tick, 200);
      });
    };
    tick();
  });
}

const errors = [];
try {
  await waitForServer();
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome-stable",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle", timeout: 60000 });
  const title = await page.title();
  const h1 = await page.locator("h1").first().innerText();
  await page.screenshot({ path: path.join(root, "screenshot.png"), fullPage: true });
  await page.getByRole("button", { name: "Tạo công trình" }).click();
  await page.getByRole("button", { name: "Khối lượng" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, "screenshot-qty.png"), fullPage: true });
  await page.getByRole("button", { name: "Đơn giá" }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(root, "screenshot-prices.png"), fullPage: true });
  console.log(JSON.stringify({ title, h1, errors }, null, 2));
  if (!title.includes("PiDự toán")) throw new Error("bad title: " + title);
  if (errors.length) {
    console.warn("JS errors:", errors);
  }
  await browser.close();
} finally {
  server.kill();
}
