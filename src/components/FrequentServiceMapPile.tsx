import { agencyInSentence } from '../../shared/agencyArticle';

interface MapFrame {
  agency: string;
  image: string;
  source: string;
}

export const publishedMapFrames: MapFrame[] = [
  { agency: 'Toronto Transit Commission', image: '/assets/research/system-maps/toronto.jpg', source: 'https://cdn.ttc.ca/-/media/Project/TTC/DevProto/Images/Home/Routes-and-Schedules/Landing-page-pdfs/TTC_SystemMap.pdf' },
  { agency: 'TransLink Vancouver', image: '/assets/research/system-maps/vancouver.jpg', source: 'https://maps.translink.ca/-/media/translink/documents/schedules-and-maps/transit-system-maps/system-maps/frequent_transit_network_of_metro_vancouver_map.pdf' },
  { agency: 'Edmonton Transit Service', image: '/assets/research/system-maps/edmonton.jpg', source: 'https://www.edmonton.ca/sites/default/files/public-files/ETS-Day-Map-May-2025.pdf' },
  { agency: 'King County Metro', image: '/assets/research/system-maps/seattle.jpg', source: 'https://kingcounty.gov/en/-/media/king-county/depts/metro/maps/system/09142024/metro-system-map-central' },
  { agency: 'OC Transpo', image: '/assets/research/system-maps/ottawa.jpg', source: 'https://www.octranspo.com/images/files/maps/network_maps/NWTB_System_Map_2025_%28MASTER%29_BRT_27April2025_V1.pdf' },
  { agency: 'SEPTA Philadelphia', image: '/assets/research/system-maps/septa.jpg', source: 'https://www.septa.org/wp-content/uploads/page/communication/SEPTA_System-Map_v3-0.pdf' },
  { agency: 'TriMet', image: '/assets/research/system-maps/portland.jpg', source: 'https://www.trimet.org/maps/pdf/frequentservice.pdf' },
  { agency: 'Washington Metropolitan Area Transit Authority', image: '/assets/research/system-maps/washington.jpg', source: 'https://www.wmata.com/schedules/maps/upload/system-map-bus-DC-high-frequency.pdf' },
  { agency: 'Société de transport de Montréal', image: '/assets/research/system-maps/montreal.jpg', source: 'https://www.stm.info/sites/default/files/media/Stminfo/images/plan_reseau.pdf' },
  { agency: 'Los Angeles Metro', image: '/assets/research/system-maps/los-angeles.jpg', source: 'https://cdn.beta.metro.net/wp-content/uploads/2026/05/04165451/26-1718_SysOverview_HiFreq_online_DCR.pdf' },
  { agency: 'Valley Transportation Authority', image: '/assets/research/system-maps/san-jose.jpg', source: 'https://www.vta.org/sites/default/files/2026-01/ADA-VTA-SystemMap-011226.pdf' },
  { agency: 'Miami-Dade Transit', image: '/assets/research/system-maps/miami.jpg', source: 'https://www.miamidade.gov/resources/transportation_publicworks/documents/system-maps-web.pdf' },
];

/**
 * CIV-1875: one still pile of paper maps in place of the flicking montage. Every map is placed by hand so nothing lines up:
 * different sizes and shapes, angles up to about 20° with no two alike, heavy overlaps, and several running off the edges.
 * Left, top and width are percentages of the frame; ratio is width over height; Toronto lies on top.
 */
const pileSpots: Record<string, { left: number; top: number; width: number; ratio: number; turn: number }> = {
  vancouver: { left: -7, top: 7, width: 27, ratio: 0.78, turn: -14 },
  montreal: { left: 15, top: -12, width: 22, ratio: 1.3, turn: 7 },
  ottawa: { left: 36, top: 5, width: 17, ratio: 0.72, turn: -3 },
  edmonton: { left: 55, top: -8, width: 24, ratio: 1.1, turn: 18 },
  seattle: { left: 4, top: 52, width: 21, ratio: 0.9, turn: 4 },
  portland: { left: 22, top: 40, width: 25, ratio: 1.4, turn: -9 },
  'san-jose': { left: 49, top: 54, width: 19, ratio: 0.8, turn: 12 },
  'los-angeles': { left: 70, top: 22, width: 33, ratio: 0.95, turn: -19 },
  miami: { left: 84, top: 63, width: 20, ratio: 1.2, turn: 6 },
  washington: { left: 9, top: 24, width: 16, ratio: 0.7, turn: 16 },
  septa: { left: 63, top: 49, width: 27, ratio: 1.35, turn: -6 },
  toronto: { left: 28, top: 14, width: 38, ratio: 1.05, turn: -1.5 },
};

const pileOrder = Object.keys(pileSpots);
const slugOf = (frame: MapFrame) => frame.image.split('/').pop()!.replace('.jpg', '');

export default function FrequentServiceMapPile() {
  // Paint order is the pile order (Toronto last, so on top); the frame list stays the source of the agencies and sources.
  const frames = [...publishedMapFrames].sort((a, b) => pileOrder.indexOf(slugOf(a)) - pileOrder.indexOf(slugOf(b)));
  return (
    <figure className="mt-10 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border-primary)] bg-[#e9e6df]">
      <div className="relative aspect-[12/7]">
        {frames.map((frame, index) => {
          const spot = pileSpots[slugOf(frame)];
          return (
            <img
              key={frame.image}
              src={frame.image}
              alt={`Published system map from ${agencyInSentence(frame.agency)}.`}
              loading="lazy"
              className="absolute rounded-[2px] border-[5px] border-white object-cover shadow-[0_2px_6px_rgba(0,0,0,0.2)]"
              style={{ left: `${spot.left}%`, top: `${spot.top}%`, width: `${spot.width}%`, aspectRatio: spot.ratio, transform: `rotate(${spot.turn}deg)`, zIndex: index + 1 }}
            />
          );
        })}
      </div>
      <figcaption className="px-4 py-3 text-xs text-[var(--text-muted)] sm:px-6">
        {/* The count is the frames shown, so it can't drift from the list above. */}
        System maps from {publishedMapFrames.length} agencies in Canada and the United States, each as the agency publishes it.
      </figcaption>
    </figure>
  );
}
