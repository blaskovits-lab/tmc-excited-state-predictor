import { API_BASE_URL } from "./config.js";

export async function predictMolecule(payload, onStatus = () => {}, timeoutMs = 180000) {
  const base = API_BASE_URL.replace(/\/$/, "");
  if (!base) throw new Error("The prediction service has not been configured yet.");
  const deadline = Date.now() + timeoutMs;
  // Repeating GET during startup is safe; a failed POST may already have run.
  while (true) {
    if (Date.now() >= deadline) throw new Error("Prediction server did not become ready in time.");
    try {
      const health = await fetch(`${base}/health`, {
        signal: AbortSignal.timeout(Math.min(8000, deadline - Date.now())),
      });
      if ([401, 403, 404].includes(health.status)) {
        throw new Error(`Check the API address and access settings (${health.status}).`);
      }
      if (health.ok && (await health.json()).model_loaded === true) break;
    } catch (error) {
      if (error.message.startsWith("Check the API")) throw error;
      // Startup responses from the hosting proxy may not contain CORS headers.
      // Retry readiness GETs, then stop at the deadline if startup/network fails.
    }
    onStatus("The prediction service may be waking from sleep. Waiting for it to become ready…");
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  while (Date.now() < deadline) {
    onStatus("Running the five-model ensemble…");
    let response;
    try {
      response = await fetch(`${base}/v1/science/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(Math.min(30000, deadline - Date.now())),
      });
    } catch (error) {
      // A timeout can happen after inference starts. Avoid resubmitting it automatically.
      throw new Error("API unreachable or request timed out. Check connectivity, CORS and service status.", { cause: error });
    }
    if (response.ok) return response.json();
    if (response.status !== 503 && response.status !== 429) {
      let message = "Prediction failed (" + response.status + ").";
      try {
        const body = await response.json();
        if (body.detail?.message) message = body.detail.message;
        else if (Array.isArray(body.detail)) message = body.detail.map(item => item.msg).join("; ");
      } catch { /* A gateway may return HTML instead of JSON. */ }
      throw new Error(message);
    }
    onStatus(response.status === 503 ? "Server starting or unavailable…" : "Server busy…");
    const raw = Number(response.headers.get("Retry-After"));
    const seconds = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 10) : 3;
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
  throw new Error("Prediction service did not become available within the waiting period.");
}
