import type { Assumptions } from "@/app/api/route-types";
import { create } from "zustand";

export const useAssumptions = create<{
  a: Assumptions;
  set: (p: Partial<Assumptions>) => void;
}>((setState) => ({
  a: {
    downPct: 0.2,
    rateBps: 500,
    amortMonths: 360,
    rentScenario: "P50",
  },
  set: (p) => setState((s) => ({ a: { ...s.a, ...p } })),
}));

export const setAssumptions = (p: Partial<Assumptions>) =>
  useAssumptions.setState((s) => ({ a: { ...s.a, ...p } }));
