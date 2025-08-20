import { Alert, PropertyScoredEvt, UnderwriteCompletedEvt } from "./dto";
import { matchSearches } from "./match";
import { AlertsRepo, BusPort, Dispatcher, ReadPort } from "./ports";

export function createHandlers(deps: {
  bus: BusPort;
  read: ReadPort;
  repo: AlertsRepo;
  dispatch: Dispatcher;
}) {
  async function onUnderwriteCompleted(evt: UnderwriteCompletedEvt) {
    const snap = await deps.read.getListingSnapshot(evt.id);
    if (!snap) return;

    const metricsResult = evt.resultId
      ? await deps.read.getUnderwriteMetrics(evt.resultId)
      : undefined;
    const metrics = metricsResult || undefined;
    const candidates = await deps.repo.listCandidatesForListing(snap);

    const winners = matchSearches(snap, candidates, metrics, evt.score);
    for (const { search, matched } of winners) {
      const alert: Alert = {
        id: cryptoRandomId(),
        userId: search.userId,
        savedSearchId: search.id,
        listingId: snap.id,
        resultId: evt.resultId,
        triggeredAt: new Date().toISOString(),
        payload: { snapshot: snap, metrics, score: evt.score, matched },
        delivery: {
          channels: search.notify.channel,
          statusByChannel: {} as any,
        },
      };
      const saved = await deps.repo.insertAlert(alert);
      // devbrowser first
      if (search.notify.channel.includes("devbrowser"))
        await deps.dispatch.sendDevBrowser(saved);
      if (search.notify.channel.includes("email"))
        await deps.dispatch.sendEmail(saved);
      if (search.notify.channel.includes("sms"))
        await deps.dispatch.sendSMS(saved);
      if (search.notify.channel.includes("slack"))
        await deps.dispatch.sendSlack(saved);
      if (search.notify.channel.includes("webhook"))
        await deps.dispatch.sendWebhook(saved);
    }
  }

  async function onPropertyScored(evt: PropertyScoredEvt) {
    const snap = await deps.read.getListingSnapshot(evt.id);
    if (!snap) return;

    const candidates = await deps.repo.listCandidatesForListing(snap);
    const winners = matchSearches(snap, candidates, undefined, evt.score);

    for (const { search, matched } of winners) {
      const alert: Alert = {
        id: cryptoRandomId(),
        userId: search.userId,
        savedSearchId: search.id,
        listingId: snap.id,
        triggeredAt: new Date().toISOString(),
        payload: { snapshot: snap, score: evt.score, matched },
        delivery: {
          channels: search.notify.channel,
          statusByChannel: {} as any,
        },
      };
      const saved = await deps.repo.insertAlert(alert);
      // dispatch to all channels
      if (search.notify.channel.includes("devbrowser"))
        await deps.dispatch.sendDevBrowser(saved);
      if (search.notify.channel.includes("email"))
        await deps.dispatch.sendEmail(saved);
      if (search.notify.channel.includes("sms"))
        await deps.dispatch.sendSMS(saved);
      if (search.notify.channel.includes("slack"))
        await deps.dispatch.sendSlack(saved);
      if (search.notify.channel.includes("webhook"))
        await deps.dispatch.sendWebhook(saved);
    }
  }

  return { onUnderwriteCompleted, onPropertyScored };
}

function cryptoRandomId() {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}
