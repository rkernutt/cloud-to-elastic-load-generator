const http = require("http");
const https = require("https");
const crypto = require("crypto");

const PORT = Number(process.env.PROXY_PORT) || 3001;
/** Bind address. Default `127.0.0.1` limits exposure on shared machines. Use `0.0.0.0` only if you must accept remote TCP (e.g. published container port). */
const HOST = process.env.PROXY_HOST || "127.0.0.1";

/** Request timeout in ms (e.g. 120s for large bulk requests). */
const REQUEST_TIMEOUT_MS = Number(process.env.PROXY_REQUEST_TIMEOUT_MS) || 120000;

/** Max incoming body size (bytes) before rejecting with 413. */
const MAX_BODY_BYTES = Number(process.env.PROXY_MAX_BODY_BYTES) || 50 * 1024 * 1024;

/** Max retries for transient failures (5xx, ECONNRESET, timeouts). */
const MAX_RETRIES = 3;

/** Base delay in ms for exponential backoff. */
const BACKOFF_BASE_MS = 1000;

/** Max jitter added to backoff delay to prevent thundering-herd retries. */
const BACKOFF_JITTER_MS = 500;

/** Set `PROXY_QUIET=1` to disable stderr access logs (metadata only; never logs API keys or bodies). */
const QUIET = process.env.PROXY_QUIET === "1";

/**
 * Kibana /api/* expects Elastic-Api-Version as YYYY-MM-DD. The legacy value "1" is rejected on 8.13+ / 9.x.
 * Override when your stack requires a different contract date (see Kibana release notes).
 */
const KIBANA_ELASTIC_API_VERSION = process.env.ELASTIC_KIBANA_API_VERSION || "2023-10-31";

/** Compute exponential backoff with random jitter to avoid thundering-herd retries. */
function backoffDelay(retryCount) {
  return BACKOFF_BASE_MS * Math.pow(2, retryCount) + Math.random() * BACKOFF_JITTER_MS;
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function proxyRequest(transport, options, body, retryCount, res, requestId) {
  const req = transport.request(options, (proxyRes) => {
    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      const data = Buffer.concat(chunks);
      const ok = proxyRes.statusCode >= 200 && proxyRes.statusCode < 300;
      const retryable = proxyRes.statusCode >= 500 && retryCount < MAX_RETRIES;
      if (ok) {
        res.writeHead(proxyRes.statusCode, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "X-Request-Id": requestId,
        });
        res.end(data);
        return;
      }
      if (retryable) {
        if (!QUIET)
          console.error(
            JSON.stringify({
              t: new Date().toISOString(),
              event: "proxy_retry",
              requestId,
              retry: retryCount + 1,
              status: proxyRes.statusCode,
            })
          );
        setTimeout(() => {
          proxyRequest(transport, options, body, retryCount + 1, res, requestId);
        }, backoffDelay(retryCount));
        return;
      }
      res.writeHead(proxyRes.statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "X-Request-Id": requestId,
      });
      res.end(data);
    });
  });

  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    req.destroy();
    if (retryCount < MAX_RETRIES) {
      if (!QUIET)
        console.error(
          JSON.stringify({
            t: new Date().toISOString(),
            event: "proxy_timeout_retry",
            requestId,
            retry: retryCount + 1,
          })
        );
      setTimeout(() => {
        proxyRequest(transport, options, body, retryCount + 1, res, requestId);
      }, backoffDelay(retryCount));
    } else {
      sendJson(res, 504, {
        error: "Proxy request timeout after " + REQUEST_TIMEOUT_MS / 1000 + "s",
        requestId,
      });
    }
  });

  req.on("error", (err) => {
    const retryable =
      (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ECONNREFUSED") &&
      retryCount < MAX_RETRIES;
    if (retryable) {
      if (!QUIET)
        console.error(
          JSON.stringify({
            t: new Date().toISOString(),
            event: "proxy_error_retry",
            requestId,
            retry: retryCount + 1,
            code: err.code,
          })
        );
      setTimeout(() => {
        proxyRequest(transport, options, body, retryCount + 1, res, requestId);
      }, backoffDelay(retryCount));
    } else {
      sendJson(res, 502, { error: "Proxy error: " + err.message, requestId });
    }
  });

  req.write(body);
  req.end();
}

const server = http.createServer((req, res) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  let bytesIn = 0;

  res.on("finish", () => {
    if (QUIET) return;
    const line = {
      t: new Date().toISOString(),
      event: "proxy_access",
      requestId,
      method: req.method,
      path: req.url || "",
      status: res.statusCode,
      ms: Date.now() - started,
      bytesIn,
    };
    if (req.proxyTargetHost) line.targetHost = req.proxyTargetHost;
    console.error(JSON.stringify(line));
  });

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, x-elastic-url, x-elastic-key, x-elastic-path, x-elastic-method",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed", requestId });
    return;
  }

  const targetUrl = req.headers["x-elastic-url"];
  const apiKey = req.headers["x-elastic-key"];

  if (!targetUrl || !apiKey) {
    sendJson(res, 400, { error: "Missing x-elastic-url or x-elastic-key header", requestId });
    return;
  }

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    sendJson(res, 400, { error: "Invalid x-elastic-url: " + e.message, requestId });
    return;
  }

  const chunks = [];
  let tooLarge = false;
  req.on("data", (chunk) => {
    if (tooLarge) return;
    bytesIn += chunk.length;
    if (bytesIn > MAX_BODY_BYTES) {
      tooLarge = true;
      req.destroy();
      sendJson(res, 413, {
        error: "Request body too large (max " + MAX_BODY_BYTES + " bytes)",
        requestId,
      });
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    if (tooLarge) return;
    req.proxyTargetHost = parsed.hostname;
    const body = Buffer.concat(chunks);

    // If x-elastic-path is provided, this is a setup/API call (not bulk indexing).
    const targetPath = req.headers["x-elastic-path"] || "/_bulk";
    const isBulk = !req.headers["x-elastic-path"];
    const targetMethod = req.headers["x-elastic-method"] || (isBulk ? "POST" : "PUT");
    const upperMethod = targetMethod.toUpperCase();
    const isGet = upperMethod === "GET";
    const omitUpstreamBody =
      upperMethod === "GET" || upperMethod === "DELETE" || upperMethod === "HEAD";

    let forwardBody = body;
    let requestContentType = isBulk ? "application/x-ndjson" : "application/json";

    if (!isBulk && !omitUpstreamBody) {
      try {
        const parsedBody = JSON.parse(body.toString("utf8"));
        if (
          parsedBody &&
          parsedBody.__proxyMultipart === "kibana_saved_objects_import" &&
          typeof parsedBody.ndjson === "string"
        ) {
          const boundary = `----FormBoundary${crypto.randomBytes(16).toString("hex")}`;
          const crlf = "\r\n";
          const encoded = Buffer.from(parsedBody.ndjson, "utf8");
          forwardBody = Buffer.concat([
            Buffer.from(
              `--${boundary}${crlf}` +
                `Content-Disposition: form-data; name="file"; filename="import.ndjson"${crlf}` +
                `Content-Type: application/ndjson${crlf}${crlf}`
            ),
            encoded,
            Buffer.from(`${crlf}--${boundary}--${crlf}`),
          ]);
          requestContentType = `multipart/form-data; boundary=${boundary}`;
        }
      } catch {
        /* normal JSON body */
      }
    }

    const outHeaders = {
      Authorization: "ApiKey " + apiKey,
    };
    if (!omitUpstreamBody) {
      outHeaders["Content-Type"] = requestContentType;
      outHeaders["Content-Length"] = String(forwardBody.length);
    }
    const pathStr = String(targetPath);
    const isKibanaApi = pathStr.startsWith("/api/");
    // Elasticsearch rejects Elastic-Api-Version: 1 — only send dated version to Kibana /api/*.
    if (!isBulk && isKibanaApi) {
      outHeaders["Elastic-Api-Version"] = KIBANA_ELASTIC_API_VERSION;
      if (!isGet) {
        outHeaders["kbn-xsrf"] = "true";
      }
      // Kibana on Elastic Cloud Serverless treats most legacy /api/saved_objects/* and
      // a few other endpoints as "internal" and rejects external clients with
      //   400 "uri [...] exists but is not available with the current configuration".
      // Sending `x-elastic-internal-origin: kibana` opts us back in. Stateful Kibana
      // accepts the header too (it is ignored when not in serverless mode), so we
      // can add it unconditionally for all Kibana API requests.
      outHeaders["x-elastic-internal-origin"] = "kibana";
    }

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path: targetPath,
      method: targetMethod.toUpperCase(),
      headers: outHeaders,
    };

    const transport = parsed.protocol === "https:" ? https : http;
    proxyRequest(
      transport,
      options,
      omitUpstreamBody ? Buffer.alloc(0) : forwardBody,
      0,
      res,
      requestId
    );
  });
});

server.listen(PORT, HOST, () => {
  if (!QUIET) {
    console.error(
      "[proxy] Kibana API version header: " +
        KIBANA_ELASTIC_API_VERSION +
        " (set ELASTIC_KIBANA_API_VERSION to override)"
    );
  }
  console.log(
    "Elastic proxy listening on " +
      HOST +
      ":" +
      PORT +
      " (timeout " +
      REQUEST_TIMEOUT_MS +
      "ms, max body " +
      MAX_BODY_BYTES +
      " bytes, max retries " +
      MAX_RETRIES +
      ")"
  );
});
