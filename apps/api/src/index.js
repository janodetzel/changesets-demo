/** The API's health endpoint. */
export function health() {
  return { status: "ok" };
}

/** Which API version is running. */
export function version() {
  return { api: "v1" };
}
