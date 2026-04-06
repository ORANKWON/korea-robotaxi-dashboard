import { REGIONS, type RegionKey } from "@/lib/map-constants";

interface RegionTabsProps {
  activeRegion: RegionKey;
  onSelect: (region: RegionKey) => void;
}

const regionKeys = Object.keys(REGIONS) as RegionKey[];

export default function RegionTabs({
  activeRegion,
  onSelect,
}: RegionTabsProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
      <div className="bg-zinc-900/80 backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 shadow-lg flex gap-1">
        {regionKeys.map((key) => {
          const isActive = activeRegion === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                isActive
                  ? "bg-white/15 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {REGIONS[key].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
