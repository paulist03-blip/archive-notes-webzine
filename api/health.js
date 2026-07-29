function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.end(JSON.stringify(payload));
}

module.exports = function handler(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { status: "error", error: "GET or HEAD only." });
    return;
  }

  const payload = {
    status: "ok",
    service: "paul-archive-notes",
    commit: process.env.VERCEL_GIT_COMMIT_SHA || "",
    branch: process.env.VERCEL_GIT_COMMIT_REF || "",
    environment: process.env.VERCEL_ENV || "",
    deployment: process.env.VERCEL_URL || "",
    checkedAt: new Date().toISOString()
  };

  if (request.method === "HEAD") {
    response.statusCode = 200;
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.end();
    return;
  }

  sendJson(response, 200, payload);
};
