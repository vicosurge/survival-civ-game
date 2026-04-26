export interface Env {
  DB: D1Database;
  DASHBOARD_KEY: string;
}

const ALLOWED_ORIGINS = ["https://cambrera.digimente.xyz", "http://localhost:5173"];

function corsHeaders(origin: string): Record<string, string> {
  return ALLOWED_ORIGINS.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      }
    : {};
}

function jsonResp(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function handleSubmit(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400, cors);
  }

  if (typeof body !== "object" || body === null) {
    return jsonResp({ error: "Invalid body" }, 400, cors);
  }

  const { tester_name, rating, feedback, version } = body as Record<string, unknown>;

  if (typeof tester_name !== "string" || tester_name.trim().length < 1 || tester_name.trim().length > 80) {
    return jsonResp({ error: "tester_name must be 1–80 chars" }, 400, cors);
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return jsonResp({ error: "rating must be integer 1–5" }, 400, cors);
  }
  if (typeof feedback !== "string" || feedback.trim().length < 1 || feedback.trim().length > 1000) {
    return jsonResp({ error: "feedback must be 1–1000 chars" }, 400, cors);
  }
  if (typeof version !== "string" || version.length < 1 || version.length > 20) {
    return jsonResp({ error: "version invalid" }, 400, cors);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO feedback (submitted_at, tester_name, rating, feedback, version) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(new Date().toISOString(), tester_name.trim(), rating, feedback.trim(), version)
      .run();
  } catch {
    return jsonResp({ error: "Database error" }, 500, cors);
  }

  return jsonResp({ ok: true }, 201, cors);
}

type FeedbackRow = {
  id: number;
  submitted_at: string;
  tester_name: string;
  rating: number;
  feedback: string;
  version: string;
};

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!env.DASHBOARD_KEY || key !== env.DASHBOARD_KEY) {
    return new Response("Unauthorized", { status: 401, headers: { "Content-Type": "text/plain" } });
  }

  const { results } = await env.DB.prepare(
    "SELECT id, submitted_at, tester_name, rating, feedback, version FROM feedback ORDER BY submitted_at DESC"
  ).all<FeedbackRow>();

  const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
  const rows = results
    .map(
      (r) =>
        `<tr>
      <td>${r.id}</td>
      <td style="white-space:nowrap">${r.submitted_at.replace("T", " ").slice(0, 19)}</td>
      <td>${escapeHtml(r.tester_name)}</td>
      <td style="color:#d4a94a;letter-spacing:0.1em">${stars(r.rating)}</td>
      <td style="max-width:420px;white-space:pre-wrap">${escapeHtml(r.feedback)}</td>
      <td>${escapeHtml(r.version)}</td>
    </tr>`
    )
    .join("");

  const avg =
    results.length > 0 ? (results.reduce((s, r) => s + r.rating, 0) / results.length).toFixed(1) : "—";

  const html = `<!doctype html><html lang="en"><head>
<meta charset="UTF-8">
<title>Cambrera — Feedback</title>
<style>
body{font-family:"Courier New",monospace;background:#1a1410;color:#e8d9b8;padding:2rem;margin:0}
h1{color:#d4a94a;margin:0 0 .25rem}
.meta{color:#a89877;font-size:.9rem;margin-bottom:1.5rem}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #4a3a28;padding:.5rem .75rem;text-align:left;vertical-align:top;font-size:.88rem}
th{background:#2b2117;color:#d4a94a;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em}
tr:hover td{background:#2b2117}
</style>
</head><body>
<h1>Isle of Cambrera — Feedback</h1>
<div class="meta">${results.length} response${results.length !== 1 ? "s" : ""} &nbsp;·&nbsp; avg ${avg} / 5</div>
<table>
<thead><tr><th>#</th><th>Date (UTC)</th><th>Name</th><th>Rating</th><th>Feedback</th><th>Version</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" style="color:#a89877;text-align:center;padding:1rem">No feedback yet.</td></tr>'}</tbody>
</table>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=utf-8" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { method } = request;
    const path = new URL(request.url).pathname;
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin);

    if (method === "OPTIONS" && path === "/feedback") {
      return new Response(null, { status: 204, headers: cors });
    }
    if (method === "POST" && path === "/feedback") {
      return handleSubmit(request, env, cors);
    }
    if (method === "GET" && path === "/feedback/dashboard") {
      return handleDashboard(request, env);
    }

    return new Response("Not found", { status: 404 });
  },
};
