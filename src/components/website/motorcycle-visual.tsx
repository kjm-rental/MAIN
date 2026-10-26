import { Camera, Waves } from "lucide-react";
import Image from "next/image";

import type { MotorcycleMedia } from "@/types/motorcycle";

type MotorcycleVisualProps = Readonly<{
  model: string;
  media?: MotorcycleMedia;
  compact?: boolean;
}>;

export function MotorcycleVisual({
  model,
  media,
  compact = false,
}: MotorcycleVisualProps) {
  const background = compact
    ? "bg-[linear-gradient(180deg,#F7F3EB_0%,#EEF6F3_100%)]"
    : "bg-sand";
  if (media) {
    return (
      <figure
        className={`${background} relative isolate overflow-hidden ${compact ? "aspect-[4/3]" : "aspect-[16/11]"}`}
      >
        <Image
          src={media.src}
          alt={media.alt}
          fill
          quality={90}
          sizes={
            compact
              ? "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              : "(max-width: 1024px) 100vw, 55vw"
          }
          className="object-contain transition-transform duration-500 group-hover:scale-[1.02]"
        />
      </figure>
    );
  }

  return (
    <div
      className={`relative isolate overflow-hidden ${compact ? background + " aspect-[4/3]" : "aspect-[16/11] bg-[linear-gradient(145deg,#d8eeeb,#f5ead7_70%)]"}`}
      role="img"
      aria-label={`${model} photography pending licensing approval`}
    >
      <div
        aria-hidden="true"
        className={`${compact ? "bg-ocean/5" : "bg-ocean/12"} absolute -right-8 -bottom-10 size-44 rounded-full`}
      />
      <div
        aria-hidden="true"
        className={`${compact ? "bg-sunset/10" : "bg-sunset/35"} absolute top-7 left-8 size-14 rounded-full`}
      />
      <Waves
        aria-hidden="true"
        className="text-ocean/10 absolute -bottom-6 -left-6 h-32 w-[120%]"
        strokeWidth={1}
      />
      <div className="text-muted absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 text-center">
        <span className="bg-off-white/80 border-deep-teal/10 grid size-14 place-items-center rounded-2xl border shadow-sm">
          <Camera
            aria-hidden="true"
            className="text-ocean size-7"
            strokeWidth={1.6}
          />
        </span>
        <div>
          <span className="block text-xs font-extrabold tracking-[0.14em] uppercase">
            Photography pending approval
          </span>
          <span className="mt-1 block text-[11px]">
            No reference image is presented as the rental unit
          </span>
        </div>
      </div>
    </div>
  );
}
