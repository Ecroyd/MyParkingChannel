export const GATE_STATUS = {
  NONE: "none",
  RESERVED: "reserved",
  ARRIVED: "arrived",
  NO_SHOW: "no_show",
  CANCELLED: "cancelled",
  TAKE_KEY: "take_key",
  ARRIVED_KEY_TAKEN: "arrived_key_taken",
  DEPARTED: "departed",
} as const;

export type GateStatusValue = (typeof GATE_STATUS)[keyof typeof GATE_STATUS];

export const GATE_STATUS_OPTIONS: { value: GateStatusValue; label: string }[] = [
  { value: GATE_STATUS.RESERVED, label: "Reserved" },
  { value: GATE_STATUS.ARRIVED, label: "Arrived" },
  { value: GATE_STATUS.TAKE_KEY, label: "Take Key" },
  { value: GATE_STATUS.ARRIVED_KEY_TAKEN, label: "Arrived & Key Taken" },
  { value: GATE_STATUS.DEPARTED, label: "Departed" },
  { value: GATE_STATUS.NO_SHOW, label: "No Show" },
  { value: GATE_STATUS.CANCELLED, label: "Cancelled" },
];

export function gateStatusLabel(v?: string | null) {
  const opt = GATE_STATUS_OPTIONS.find((o) => o.value === (v ?? GATE_STATUS.RESERVED));
  return opt?.label ?? String(v);
}

export function gateStatusPillClass(v?: string | null) {
  switch (v) {
    case GATE_STATUS.RESERVED:
      return "bg-slate-100 text-slate-800 border border-slate-200";
    case GATE_STATUS.ARRIVED:
      return "bg-green-100 text-green-900 border border-green-200";
    case GATE_STATUS.NO_SHOW:
      return "bg-red-200 text-black border border-red-300";
    case GATE_STATUS.CANCELLED:
      return "bg-red-200 text-black border border-red-300";
    case GATE_STATUS.TAKE_KEY:
      return "bg-yellow-200 text-black border border-yellow-300";
    case GATE_STATUS.ARRIVED_KEY_TAKEN:
      return "bg-yellow-200 text-black border border-yellow-300";
    case GATE_STATUS.DEPARTED:
      return "bg-slate-200 text-slate-900 border border-slate-300";
    default:
      return "bg-slate-100 text-slate-700 border border-slate-200";
  }
}

export function isKeyGateStatus(v?: string | null) {
  return v === GATE_STATUS.TAKE_KEY || v === GATE_STATUS.ARRIVED_KEY_TAKEN;
}
