const BACKEND_ORIGIN = "https://ai-financial-analyst-api-kmvj.onrender.com";

interface WorkerEnv {
  BACKEND_ORIGIN: string;
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  BACKEND_API_KEY: string;
}

function isApiRequest(url: URL): boolean {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

async function proxyApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const backendUrl = new URL(
    incomingUrl.pathname + incomingUrl.search,
    env.BACKEND_ORIGIN || BACKEND_ORIGIN,
  );

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("X-API-Key", env.BACKEND_API_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const backendResponse = await fetch(
      new Request(backendUrl, {
        method: request.method,
        headers,
        body: request.method === "GET" || request.method === "HEAD"
          ? undefined
          : request.body,
        redirect: "manual",
        signal: controller.signal,
      }),
    );

    const responseHeaders = new Headers(backendResponse.headers);
    responseHeaders.delete("access-control-allow-origin");
    responseHeaders.delete("access-control-allow-credentials");

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "upstream request failed";
    const isTimeout = error instanceof DOMException && error.name === "AbortError";

    return Response.json(
      {
        status: "error",
        error: isTimeout ? "backend timeout" : "backend unavailable",
        code: isTimeout ? "BACKEND_TIMEOUT" : "BACKEND_UNAVAILABLE",
        message,
      },
      { status: isTimeout ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (isApiRequest(url)) {
      if (!env.BACKEND_API_KEY) {
        return Response.json(
          {
            status: "error",
            error: "backend proxy is not configured",
            code: "BACKEND_PROXY_NOT_CONFIGURED",
          },
          { status: 503 },
        );
      }

      return proxyApiRequest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
