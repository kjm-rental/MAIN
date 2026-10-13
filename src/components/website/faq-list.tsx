import { ChevronDown } from "lucide-react";
import styles from "./faq-preview.module.css";

export { FAQ_ITEMS } from "./faq-content";
import { FAQ_ITEMS } from "./faq-content";

export function FaqList({
  limit,
  preview = false,
}: {
  limit?: number;
  preview?: boolean;
}) {
  const items =
    typeof limit === "number" ? FAQ_ITEMS.slice(0, limit) : FAQ_ITEMS;
  return (
    <div
      className={
        preview
          ? styles.preview
          : "divide-deep-teal/10 border-deep-teal/10 divide-y overflow-hidden rounded-[1.5rem] border bg-white"
      }
    >
      {items.map((item) => (
        <details key={item.question} className="group p-5 sm:p-6">
          <summary className="text-deep-teal flex cursor-pointer list-none items-center justify-between gap-5 font-bold">
            {item.question}
            <ChevronDown
              aria-hidden="true"
              className="text-ocean size-5 shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="text-muted max-w-3xl pt-4 text-sm leading-7">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
