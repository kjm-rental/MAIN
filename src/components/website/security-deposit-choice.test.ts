import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SecurityDepositChoice } from "./security-deposit-choice";
const options = {
  cash_enabled: true,
  cash_amount_centavos: 250000,
  id_enabled: true,
  accepted_document_types: ["Original ID"],
  collection_instructions: "Bring your selected deposit at pickup.",
  return_instructions: "Collect it on return.",
  dispute_instructions: "Contact KJM for help.",
  policy_version: "2026-11-06",
};
function render(idEnabled: boolean, types = ["Original ID"]) {
  return renderToStaticMarkup(
    createElement(SecurityDepositChoice, {
      options: {
        ...options,
        id_enabled: idEnabled,
        accepted_document_types: types,
      },
      value: "eligible_id",
      documentType: types[0],
      onChange: () => {},
      onDocumentChange: () => {},
    }),
  );
}
describe("ID deposit checkout", () => {
  it("offers the ID option only when enabled", () => {
    expect(render(true)).toContain('value="eligible_id"');
    expect(render(false)).not.toContain('value="eligible_id"');
  });
  it("does not require an extra document-type selection for the standard ID option", () => {
    expect(render(true)).not.toContain("<select");
  });
  it("preserves selection when multiple existing document types are configured", () => {
    expect(render(true, ["Card A", "Card B"])).toContain("<select");
  });
});
