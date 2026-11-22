import { createRoot } from "react-dom/client";
import "@/../public/assets/tokens.css";
import "@/../public/assets/motion.css";
import "@/components/flight.css";
import "@/app/globals.css";
import { ForecastView } from "@/app/(app)/send/forecast/ForecastView";
import { MOCK } from "./mock";
const noop = () => {};
createRoot(document.getElementById("root")!).render(
  <ForecastView model={MOCK} backHref="/send/write?to=u2" sending={false} onPick={noop} onSchedule={noop} onSend={noop} />,
);
