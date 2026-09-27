import type { NextRequest } from "next/server";

/**
 * Server-side proxy to the backend. The backend requires an x-api-key on every route; adding it
 * here keeps BACKEND_API_KEY out of the browser bundle. Only the routes the UI uses are
 * forwarded — POST /images/:id/assess (the classifier's write hook) is deliberately not exposed.
 */
const ALLOWED: Record<string, RegExp> = {
  GET: /^(incidents|incidents\/[^/]+|incidents\/[^/]+\/(decisions|comments)|order|crews|support-requests|images\/[^/]+|images\/[^/]+\/preview)$/,
  POST: /^(ingest|incidents\/[^/]+\/(comments|assignments|support-requests|merge)|images\/[^/]+\/split)$/,
  PATCH: /^(images\/[^/]+\/decision|(assignments|support-requests)\/[^/]+)$/,
  PUT: /^incidents\/[^/]+\/dispatch$/,
};

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const joined = path.join("/");
  if (!ALLOWED[req.method]?.test(joined)) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  const { BACKEND_URL, BACKEND_API_KEY } = process.env;
  if (!BACKEND_URL || !BACKEND_API_KEY) {
    return Response.json({ error: "BACKEND_URL / BACKEND_API_KEY not configured" }, { status: 500 });
  }

  const headers: Record<string, string> = { "x-api-key": BACKEND_API_KEY };
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType; // keeps the multipart boundary intact
  // Backend rate-limits per caller + client IP; without this every user would share one budget.
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (clientIp) headers["x-forwarded-for"] = clientIp;

  let upstream: Response;
  try {
    upstream = await fetch(`${BACKEND_URL.replace(/\/+$/, "")}/${joined}${req.nextUrl.search}`, {
      method: req.method,
      headers,
      body: req.method === "GET" ? undefined : req.body,
      // @ts-expect-error -- required by Node's fetch when streaming a request body
      duplex: "half",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The incident service is unreachable." }, { status: 502 });
  }
  const responseHeaders: Record<string, string> = { "content-type": upstream.headers.get("content-type") ?? "application/json" };
  const cacheControl = upstream.headers.get("cache-control"); // image previews are cacheable for good
  if (cacheControl) responseHeaders["cache-control"] = cacheControl;
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  return forward(req, (await params).path);
}
