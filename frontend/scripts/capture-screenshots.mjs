// Captures the product screenshots on the overview page (public/product/*-{light,dark}.webp) from a
// running dev server with mock data, over the Chrome DevTools Protocol. No dependencies: Node 22+
// (built-in WebSocket) and a local Chrome.
//
//   NEXT_PUBLIC_USE_MOCK_API=true pnpm dev      # in one terminal
//   pnpm screenshots                            # in another
//
// Env: BASE_URL (default http://localhost:3000), CHROME (path to the Chrome binary).
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../public/product/", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = mkdtempSync(join(tmpdir(), "embera-shots-"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${PROFILE}`,
  "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

let targets;
for (let i = 0; i < 150 && !targets; i++) {
  try { targets = await (await fetch("http://127.0.0.1:9333/json")).json(); } catch { await sleep(200); }
}
const page = targets?.find((t) => t.type === "page");
if (!page) throw new Error("Chrome did not start");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.value;

async function waitFor(expr, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(`!!(${expr})`)) return;
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${expr}`);
}
const click = (selector, text) =>
  evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : "true"}); el?.click(); return !!el; })()`);
const notLoading = `!document.querySelector('[aria-busy="true"]')`;

async function shot(name, path, { width, height, scale = 1, mobile = false, ready, setup, settle = 1500 }) {
  for (const scheme of ["light", "dark"]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: scale, mobile });
    await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
    await send("Page.navigate", { url: BASE + path });
    await waitFor(ready);
    if (setup) await setup();
    await sleep(settle);
    const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 88 });
    const file = `${OUT}${name}-${scheme}.webp`;
    writeFileSync(file, Buffer.from(data, "base64"));
    console.log(file);
  }
}

await send("Page.enable");
await send("Runtime.enable");
await shot("coordinator-map", "/coordinator", { width: 1440, height: 900, settle: 3000, ready: `${notLoading} && document.querySelectorAll(".leaflet-tile-loaded").length > 12` });
await shot("coordinator-dispatch", "/coordinator/dispatch", { width: 1440, height: 900, ready: `${notLoading} && document.querySelector("h1")?.textContent === "Dispatch order"` });
await shot("civilian", "/civilian", { width: 390, height: 844, scale: 2, mobile: true, ready: `document.getElementById("submit-file")` });
// The mock data lives in page memory, so dispatch a crew here and move to /crew without a reload.
await shot("crew", "/coordinator/dispatch", {
  width: 390, height: 844, scale: 2, mobile: true, settle: 2500,
  ready: `${notLoading} && [...document.querySelectorAll("button")].some((b) => b.textContent === "Dispatch crew")`,
  setup: async () => {
    await click("button", "Dispatch crew");
    await waitFor(`document.querySelector('dialog input[type="checkbox"]')`);
    await click('dialog input[type="checkbox"]');
    await sleep(300);
    await click('dialog button[type="submit"]');
    await sleep(800);
    await evaluate(`window.next.router.push("/crew")`);
    await waitFor(`[...document.querySelectorAll("select option")].some((o) => /Dispatched/.test(o.textContent))`);
    await evaluate(`(() => {
      const select = document.querySelector("select");
      const option = [...select.options].find((o) => /Dispatched/.test(o.textContent));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    })()`);
    await waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("en route"))`);
    await click("button", "en route");
    await waitFor(`[...document.querySelectorAll("button")].some((b) => b.textContent.includes("on scene"))`);
    await click("button", "on scene");
    await waitFor(`[...document.querySelectorAll("h2")].some((h) => h.textContent.includes("On scene"))`);
    await evaluate(`(() => { const main = document.getElementById("main"); const h = [...document.querySelectorAll("h2")].find((h) => h.textContent.includes("On scene")); main.scrollTo(0, h.getBoundingClientRect().top + main.scrollTop - 470); })()`);
  },
});

ws.close();
// wait for Chrome to let go of its profile before deleting it
const exited = new Promise((r) => chrome.once("exit", r));
chrome.kill();
await exited;
rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
