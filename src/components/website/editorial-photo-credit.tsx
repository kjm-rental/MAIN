import Link from "next/link";
import { editorialImages } from "@/lib/content/editorial-images";
export function EditorialPhotoCredit({
  image,
}: {
  image: keyof typeof editorialImages;
}) {
  const p = editorialImages[image];
  return (
    <p className="text-muted mt-3 text-xs leading-5">
      {p.title} · {p.author} ·{" "}
      <Link
        href={`/photo-credits#${p.id}`}
        className="underline underline-offset-4"
      >
        CC BY-SA {p.license}
      </Link>
    </p>
  );
}
