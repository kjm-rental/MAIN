import { Bike, MapPin, Waves, Mountain } from "lucide-react";
export function IslandJourneyIllustration({
  guide = false,
}: {
  guide?: boolean;
}) {
  return (
    <div
      className="text-deep-teal relative overflow-hidden rounded-[2rem] bg-[#e8f0ec] p-7 sm:p-9"
      role="img"
      aria-label={
        guide
          ? "Illustrated journal motifs: coast, city and hills. Decorative, not a route map."
          : "Illustrated motorcycle journey with a winding line and coastal motifs. Not a real route map."
      }
    >
      <div className="text-ocean flex items-center justify-between">
        <Waves size={40} strokeWidth={1.2} />
        <span className="text-xs font-bold tracking-[.15em]">
          {guide ? "COAST / CITY / HILLS" : "CHOOSE / PLAN / EXPLORE"}
        </span>
      </div>
      <svg viewBox="0 0 400 220" className="my-4 w-full" aria-hidden="true">
        <path
          d="M30 180 C100 205 40 50 140 80 S220 210 280 125 S350 35 380 60"
          fill="none"
          stroke="#086d69"
          strokeWidth="2"
          strokeDasharray="5 7"
        />
        <path
          d="M0 210 Q100 155 180 210 T400 190"
          fill="none"
          stroke="#b6ccc6"
          strokeWidth="20"
        />
        <circle cx="140" cy="80" r="26" fill="#f6ad88" />
        <circle cx="280" cy="125" r="15" fill="#fcfaf6" />
        <circle cx="380" cy="60" r="9" fill="#153f40" />
      </svg>
      <div className="flex items-center justify-between">
        <MapPin size={32} strokeWidth={1.3} />
        {guide ? (
          <Mountain size={42} strokeWidth={1.3} />
        ) : (
          <Bike size={52} strokeWidth={1.3} />
        )}
      </div>
      <p className="text-muted mt-5 text-xs tracking-wide">
        An island-inspired illustration · not a navigable route.
      </p>
    </div>
  );
}
