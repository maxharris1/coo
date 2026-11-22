import type { ForecastModel } from "@/app/(app)/send/forecast/forecast";
const at = (hour: number) => Date.UTC(2026, 10, 20, hour + 5);

export const MOCK: ForecastModel = {
  route: "Brooklyn to Philadelphia, Friday",
  question: "When should Gerald leave?",
  chips: [
    { at: at(7), label: "7 am", odds: "94%", roosts: false, selected: false },
    { at: at(9), label: "9 am", odds: "92%", roosts: false, selected: false },
    { at: at(11), label: "11 am", odds: "88%", roosts: false, selected: false },
    { at: at(13), label: "1 pm", odds: "81%", roosts: false, selected: true },
    { at: at(15), label: "3 pm", odds: "81%", roosts: true, selected: false },
  ],
  selected: {
    odds: "81%",
    heading: "Arrival odds leaving at 1:00 pm",
    detail: "About 2h 06m. Lands near 3:06 pm.",
  },
  factors: [
    {
      kind: "headwind",
      title: "Headwind",
      text: "14 mph from the southwest",
      effect: "+18 min",
    },
    {
      kind: "rain",
      title: "Rain over Trenton",
      text: "Light, starting around 1 pm",
      effect: "6% off",
    },
    {
      kind: "hawk",
      title: "Hawk advisory",
      text: "Peregrine spotted near Princeton",
      effect: "4% off",
    },
    {
      kind: "fair",
      title: "Street fair in Hoboken",
      text: "Funnel cake. High distraction risk.",
      effect: "3% off",
    },
  ],
  sunset:
    "Sunset is 4:34 pm. Birds still out at dusk roost for the night and finish the trip at sunrise.",
  best: { at: at(7), label: "Schedule for 7 am instead" },
  send: { label: "Send at 1 pm anyway", releaseAt: at(13) },
};
