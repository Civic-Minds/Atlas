// Generated from Metro Transit GTFS-Flex booking_rules.txt. Do not edit by hand.
import type { OnDemandAvailability } from '../../shared/onDemandAvailability';

export const METRO_MICRO_FLEX_METADATA = {
  serviceHours: "Weekdays: 5:30 a.m.–10:30 p.m.; Saturday–Sunday: 7:00 a.m.–10:30 p.m.",
  availability: {
  "Weekday": [
    {
      "startHour": 5.5,
      "endHour": 22.5
    }
  ],
  "Saturday": [
    {
      "startHour": 7,
      "endHour": 22.5
    }
  ],
  "Sunday": [
    {
      "startHour": 7,
      "endHour": 22.5
    }
  ]
},
  routeIds: ["49f73803-272b-47fc-bb6f-bfd57b99deb4","655cc571-6251-442e-b25c-e71e1b42cac5","3788d039-5859-4499-adb8-a4ddecbb8c4e","86da59f1-69f8-480a-ab0b-06b146d2e146","25b4dc51-8972-4641-8ecc-1ead05cd2cc7"],
} satisfies { serviceHours: string; availability: OnDemandAvailability; routeIds: string[] };
