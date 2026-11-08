import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SignatureChoice } from "./signature-choice";
const shared = {
  onMethod: () => {},
  onStrokes: () => {},
  onImage: () => {},
  readOnly: true,
  strokes: [
    [
      { x: 0.1, y: 0.2 },
      { x: 0.7, y: 0.6 },
    ],
  ],
  image: "data:image/png;base64,synthetic",
};
it.each(["drawn", "uploaded"] as const)(
  "keeps the saved %s signature visible without editable signing controls during payment",
  (method) => {
    const html = renderToStaticMarkup(
      createElement(SignatureChoice, { ...shared, method }),
    );
    expect(html).toContain("Your saved signature");
    expect(html).toContain("Saved with your accepted rental terms");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<dialog");
    if (method === "uploaded") expect(html).toContain(shared.image);
    else expect(html).toContain("polyline");
  },
);
