import app from "../../config/app.json";
import badges from "../../config/badges.json";
import breeds from "../../config/breeds.json";
import flightLog from "../../config/copy/flight-log.json";
import legal from "../../config/copy/legal.json";
import notifications from "../../config/copy/notifications.json";
import sms from "../../config/copy/sms.json";
import foundObjects from "../../config/found-objects.json";
import game from "../../config/game.json";
import gear from "../../config/gear.json";
import jobs from "../../config/jobs.json";
import loft from "../../config/loft.json";
import quirks from "../../config/quirks.json";

export const config = {
  app,
  badges,
  breeds,
  foundObjects,
  game,
  gear,
  jobs,
  loft,
  quirks,
  copy: { flightLog, legal, notifications, sms },
} as const;

export type Config = typeof config;

export const manifestNames = {
  name: app.name,
  short_name: app.shortName,
} as const;
