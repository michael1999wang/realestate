import { Alert } from "../core/dto";
import { sseBroadcast } from "../http/sse";

export async function sendDevBrowser(a: Alert) {
  sseBroadcast("alert", a);
}
