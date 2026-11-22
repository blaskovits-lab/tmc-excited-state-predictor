// Set this to the deployed HTTPS API base URL, without /v1/science/predict.
// Later, replace it with the compatible Vulcan API base URL.
const DEPLOYED_API_URL = "https://6af51bf341f8531cf602e704.endpoints.huggingface.cloud";
export const API_BASE_URL = DEPLOYED_API_URL ||
  (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname) ? "http://127.0.0.1:8000" : "");
