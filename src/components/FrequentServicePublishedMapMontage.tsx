import { useEffect, useState } from 'react';

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

export default function FrequentServicePublishedMapMontage() {
  const [activeFrame, setActiveFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.('change', update);
    return () => mediaQuery.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    if (reducedMotion || !isPlaying) return;
    const timer = window.setInterval(() => setActiveFrame(frame => (frame + 1) % publishedMapFrames.length), 180);
    return () => window.clearInterval(timer);
  }, [isPlaying, reducedMotion]);

  const current = publishedMapFrames[activeFrame];

  return (
    <figure className="mt-10 w-full overflow-hidden rounded-[1.5rem] border border-[var(--border-primary)] bg-[#f4f3ef] shadow-sm">
      <div className="relative aspect-[12/7]">
        {publishedMapFrames.map((frame, index) => (
          <img
            key={frame.image}
            src={frame.image}
            alt={index === activeFrame ? `Published system map from ${frame.agency}.` : ''}
            aria-hidden={index !== activeFrame}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: index === activeFrame ? 1 : 0 }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-12 text-white sm:px-6 sm:pb-5">
          <a href={current.source} target="_blank" rel="noreferrer" className="text-sm font-bold underline decoration-white/60 underline-offset-4">
            {current.agency}
          </a>
          <button
            type="button"
            onClick={() => setIsPlaying(playing => !playing)}
            className="rounded-full border border-white/70 bg-black/30 px-3 py-1.5 text-xs font-bold backdrop-blur-sm"
            aria-label={isPlaying ? 'Pause published map montage' : 'Play published map montage'}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
      <figcaption className="px-4 py-3 text-xs text-[var(--text-muted)] sm:px-6">
        Quick cuts from real system-map pages published by agencies in this audit.
      </figcaption>
    </figure>
  );
}
