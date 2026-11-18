/**
 * CIV-1828: Studio's Live page body, inside Studio's shell (the shell owns the page menu, the agency menu, ?agency= and
 * the route; this owns its measure, direction, time of day and the picked stop or stretch). It portals its route menu,
 * measure pills, direction pill, data date and time-of-day menu into the slots the shell gives it.
 */
export interface StudioLiveSlots { route: HTMLElement | null; measure: HTMLElement | null; direction: HTMLElement | null; data: HTMLElement | null }
export interface StudioLiveBodyProps { agency: string; route: string | null; setRoute: (r: string | null) => void; slots: StudioLiveSlots }

export default function StudioLiveBody(_props: StudioLiveBodyProps) {
  return null;
}
