// Staff PDF upload (multipart). Not built yet: the rest of the service comes first.
import type { IncomingMessage } from "node:http";
import type { App } from "./app.ts";
import { HttpError } from "./http.ts";

export async function handleUpload(_app: App, _req: IncomingMessage): Promise<{ decisionId: string; reviewer: string }> {
  throw new HttpError(501, "PDF upload isn't available yet. Pick a decision instead.");
}
