import type { createJsonRoute } from "@/server/http";
import { SETTINGS_BODY, updateSettings } from "@/server/services/settings";

export function settingsPatch(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: SETTINGS_BODY },
    ({ deps, caller, input }) => updateSettings(deps, caller.userId, input),
  );
}
