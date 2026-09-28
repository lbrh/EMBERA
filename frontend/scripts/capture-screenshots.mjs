// Captures the product screenshots on the overview page (public/product/*-{light,dark}.webp) from a
// running dev server with mock data, over the Chrome DevTools Protocol. No dependencies: Node 22+
// (built-in WebSocket) and a local Chrome.
//
//   NEXT_PUBLIC_USE_MOCK_API=true pnpm dev      # in one terminal
//   pnpm screenshots                            # in another
//
// Env: BASE_URL (default http://localhost:3000), CHROME (path to the Chrome binary).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = new URL("../public/product/", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = mkdtempSync(join(tmpdir(), "embera-shots-"));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${PROFILE}`,
  "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "about:blank",
], { stdio: "ignore" });

let targets;
for (let i = 0; i < 150 && !targets; i++) {
  // port 0 = any free port (a leftover Chrome can't block it); Chrome writes the one it picked here
  const portFile = join(PROFILE, "DevToolsActivePort");
  if (!existsSync(portFile)) { await sleep(200); continue; }
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch { await sleep(200); }
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

const sizes = {};
const save = (name, scheme, data, size) => {
  const file = `${OUT}${name}-${scheme}.webp`;
  writeFileSync(file, Buffer.from(data, "base64"));
  sizes[name] = size;
  console.log(file);
};
async function viewport(width, height, scheme, mobile = width < 600) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
}
async function open(path, ready) {
  await send("Page.navigate", { url: BASE + path });
  await waitFor(ready);
}
// The whole viewport.
async function full(name, scheme, settle = 1500) {
  await sleep(settle);
  const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 88 });
  const [w, h] = await evaluate(`[innerWidth, innerHeight]`);
  save(name, scheme, data, [w, h]);
}
// Just the elements `expr` returns (their bounding box plus padding). Phone flows use a tall
// viewport so every section is on screen without scrolling.
async function section(name, scheme, expr, pad = 16) {
  await sleep(800);
  const rect = await evaluate(`(() => {
    const els = [].concat(${expr}).filter(Boolean);
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const x = Math.max(0, Math.min(...rs.map((r) => r.left)) - ${pad});
    const y = Math.max(0, Math.min(...rs.map((r) => r.top)) - ${pad});
    return { x, y, width: Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + ${pad}) - x, height: Math.max(...rs.map((r) => r.bottom)) + ${pad} - y };
  })()`);
  if (!rect) throw new Error(`${name}: nothing matched`);
  const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 88, clip: { ...rect, scale: 1 } });
  save(name, scheme, data, [Math.round(rect.width), Math.round(rect.height)]);
}
const byText = (sel, text) => `[...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.textContent.includes(${JSON.stringify(text)}))`;
const setInput = (id, value) =>
  evaluate(`(() => { const el = document.getElementById(${JSON.stringify(id)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); })()`);

// Dispatch the top fire's first free crew from the dispatch order. The mock data lives in page
// memory, so callers carry on with client-side navigation (window.next.router), never a reload.
async function dispatchFirstCrew() {
  await click("button", "Dispatch crew");
  await waitFor(`document.querySelector('dialog input[type="checkbox"]')`);
  await click('dialog input[type="checkbox"]');
  await sleep(300);
}

await send("Page.enable");
await send("Runtime.enable");
for (const scheme of ["light", "dark"]) {
  // Coordinator: the map (the hero) and the dispatch order.
  await viewport(1440, 900, scheme);
  await open("/coordinator", `${notLoading} && document.querySelectorAll(".leaflet-tile-loaded").length > 12`);
  await full("coordinator-map", scheme, 3000);
  await open("/coordinator/dispatch", `${notLoading} && ${byText("button", "Dispatch crew")}`);
  await full("coordinator-dispatch", scheme);

  // Civilian: the report form on a phone, filled in and ready to send: the fields and the send
  // button, without the app header or the progress steps above them.
  await viewport(390, 1800, scheme);
  await open("/civilian", `document.getElementById("submit-file")`);
  await evaluate(`(async () => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 48;
    const g = c.getContext("2d"); g.fillStyle = "#b45309"; g.fillRect(0, 0, 64, 48);
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg"));
    const dt = new DataTransfer(); dt.items.add(new File([blob], "smoke-over-ridge.jpg", { type: "image/jpeg" }));
    const input = document.getElementById("submit-file"); input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  })()`);
  await setInput("submit-lat", "-37.5268");
  await setInput("submit-lng", "145.2710");
  await click("button", "Use current time");
  await sleep(800);
  const formRect = await evaluate(`(() => {
    const card = document.querySelector("form.card").getBoundingClientRect();
    const top = document.getElementById("submit-file").closest("label").parentElement.getBoundingClientRect().top - 12;
    return { x: card.left, y: top, width: card.width, height: card.bottom - top };
  })()`);
  const civ = await send("Page.captureScreenshot", { format: "webp", quality: 88, clip: { ...formRect, scale: 1 } });
  save("civilian", scheme, civ.data, [Math.round(formRect.width), Math.round(formRect.height)]);

  // Crew: dispatched from the coordinator's order, then on scene on the crew's own screen.
  await viewport(390, 2400, scheme);
  await open("/coordinator/dispatch", `${notLoading} && ${byText("button", "Dispatch crew")}`);
  await dispatchFirstCrew();
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
  await waitFor(`${byText("button", "en route")}`);
  await click("button", "en route");
  await waitFor(`${byText("button", "on scene")}`);
  await click("button", "on scene");
  await waitFor(`${byText("h2", "On scene")}`);
  await click("button.sev-option", "Extreme");
  await section("crew-on-scene", scheme, `${byText("h2", "On scene")}.closest("section")`);
}
// Dimensions for the overview page, so each image reserves its space before it loads.
writeFileSync(new URL("../src/lib/constants/product-shots.json", import.meta.url), JSON.stringify(sizes, null, 2) + "\n");

ws.close();
// wait for Chrome to let go of its profile before deleting it
const exited = new Promise((r) => chrome.once("exit", r));
chrome.kill();
await exited;
rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
