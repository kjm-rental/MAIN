import { editorialImages } from "@/lib/content/editorial-images";
export function EditorialPhotoCredit({
  image,
}: {
  image: keyof typeof editorialImages;
}) {
  const p = editorialImages[image];
  return (
    <p className="text-muted mt-3 text-xs leading-5">
      {p.title}
    </p>
  );
}
