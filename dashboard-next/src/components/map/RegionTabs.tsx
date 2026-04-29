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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-[calc(100vw-2rem)]">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200 rounded-full px-1.5 py-1.5 shadow-lg flex gap-1 overflow-x-auto scrollbar-none">
        {regionKeys.map((key) => {
          const isActive = activeRegion === key;
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
