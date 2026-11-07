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
describe("cash-only deposit checkout", () => {
  it("never offers original ID custody, even with stale settings", () => {
    expect(render(true)).not.toContain('value="eligible_id"');
    expect(render(false)).not.toContain('value="eligible_id"');
    expect(render(true)).toContain(
      "do not need to leave or surrender your original IDs",
    );
    expect(render(true)).toContain('value="cash"');
  });
});
