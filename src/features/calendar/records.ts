import { marketEvents } from "./data";
import { officialReleases } from "./official-releases";
import { scheduleRelease } from "./release";

/** Confirmed official results replace the matching schedule, without inventing estimates. */
const confirmed = new Map(officialReleases.map(event => [event.id, event]));
export const preparedCalendarRecords = marketEvents.map(event =>
  confirmed.get(event.id) ?? scheduleRelease(event),
);
