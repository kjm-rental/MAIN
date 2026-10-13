# Official Terms integration and policy compatibility report

Review date: October 12, 2026 (Asia/Manila).

## Scope and evidence limits

Read the complete owner-supplied agreement before editing. All 28 sections, 134 numbered clauses and seven section-21 list items are preserved verbatim. The original file and published download share SHA-256 `c3b67ee46b4d490fee7d638b94d5ff9ce560150c513f0ec239901cdd942e8c74`. No claim of legal approval is made.

This is a source-code/migration audit, not a live production database configuration audit. Existing migrations describe architecture; this task did not connect to or modify production data. Current deposit amounts, selected pricing modes, enabled settings and provider credentials were not inspected. Existing readiness artifacts are historical evidence, not new tests performed in this task.

## Integration and pages updated

- `/terms`: complete agreement, section navigation, effective date, download.
- `/terms/2026-10-12`: permanent version archive; unknown versions do not render an agreement.
- `/book/[slug]`: separate unchecked terms acceptance, permanent-version link, current-version UI guard, existing verification/privacy declaration preserved. Unconfigured booking screens also link to terms.
- `/faq`: approved requirement/deposit/insurance/cancellation/geography/extension/prohibited-use summaries and terms links. FAQ count/filter groups updated. Shared FAQ content also feeds the existing homepage FAQ preview; the hero/navigation/design remain unchanged.
- `/how-it-works`: terms link, documented requirements, inspections and return summaries.
- ADMIN existing deposit settings: proposed ₱2,500 help text, explicit reminder that section 4 does not authorize original-ID custody. Values, enable controls and approval gates unchanged.
- ADMIN existing inspection form: clearer labels enumerate condition items and accessories; data structure and save behavior unchanged.

## Booking acceptance and version auditability

Stable current version is `2026-10-12`. Published JSON and downloadable original remain an immutable archive; future amendments must create a new version file and retain old URLs. Source integrity and all source paragraphs/list items are tested. Client bundles import only acceptance constants/validation, not the complete source document.

The new checkbox starts unchecked, points to the complete version in a new tab and controls a version-specific state. Submission is disabled and guarded before auth/upload/RPC unless both terms and the existing declaration are accepted. Unchecking terms revokes UI eligibility. This preserves existing idempotency, server quote, private upload and verification controls.

**Important remaining gap:** no persistent legal-terms acceptance record is written. Existing `p_policy_version` is the deposit policy timestamp; it must not be repurposed as a rental-terms identifier. Existing declaration/privacy timestamps are not independent evidence of this new checkbox. Direct RPC terms enforcement is not added by this UI change. See the exact database proposal below; public booking remains restricted and this is a launch blocker.

## Existing operational features and compatibility

| Area | Findings |
| --- | --- |
| Pricing | Server quote and whole started 24-hour pricing retained. No conflict with sections 8/10 identified for daily rentals; no half-day or early-return refund introduced. Alternative admin modes and long-term pricing need owner confirmation. |
| Deposits | Approved configurable cash amount, immutable requirement snapshot, collected/refunded/held balances and unresolved cases. Separate from rental revenue; deduction events are absent and explicitly unsupported. |
| Verification | Mandatory identity/licence/entitlement/international staff review, expiry checks, required private documents and guarded confirmation/handover retained. No licence categories invented. |
| Inventory/extensions | Unit/hold/maintenance/extras conflict checks and admin approval exist. Two-hour request notice, written extension acceptance and separate short/monthly rate rules are absent. Entire-rental re-quote is a pricing difference requiring owner approval. |
| Pickup/return | Immutable audited inspections, odometer/fuel/condition/accessory/damage notes, cash rental/deposit checks and return prerequisites exist. Photos/video and granular checklist storage absent. |
| Cancellations/refunds | Required staff reasons, audited cash refund/reversal events and guarded rescheduling exist; no agreed fee/no-show schedule. |
| Notifications | Transactional outbox/provider gates already exist. No customer email or Telegram delivery, provider tests or settings changes were activated by this task. |
| Settings | Existing operating hours, duration/partial-day modes, pending expiration/hold, required ID/licence policies, international review/source, privacy/retention, readiness and approval switches reviewed. No dedicated late/cancellation/monthly/delivery settings found; no duplicates created. |

## Clause-by-clause operational compatibility

Each row assesses operation/support, separately from the **completed verbatim presentation of every clause**. “Missing” does not mean a new automated enforcement system is necessarily required: staff procedures or written agreements may be appropriate. Status labels are the five requested categories. Legal-review flags identify issues for counsel, not legal conclusions.

### 1. DRIVER’S LICENSE AND REQUIRED DOCUMENTS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 1.1: 1.1. The renter must present a valid driver’s license legally authorizing them to operate the rented m… | Implemented but needs adjustment | Manual identity, licence, entitlement and international review with current licence expiry and private required documents; no automatic approval. Student-permit refusal and applicable foreign documents remain staff checks. | Owner/manual operating procedure |
| 1.2: 1.2. Student permits are strictly prohibited. | Implemented but needs adjustment | Student permits are explicitly prohibited in terms and customer summaries. Existing staff licence/entitlement review must apply this; no automatic document-category detection is claimed. | Owner/manual operating procedure |
| 1.3: 1.3. Foreign renters must present a valid license and any International Driving Permit (IDP), translat… | Implemented but needs adjustment | Manual identity, licence, entitlement and international review with current licence expiry and private required documents; no automatic approval. Student-permit refusal and applicable foreign documents remain staff checks. | Owner/manual operating procedure |
| 1.4: 1.4. The renter must provide valid identification and any other documents reasonably required by KJM M… | Implemented but needs adjustment | Manual identity, licence, entitlement and international review with current licence expiry and private required documents; no automatic approval. Student-permit refusal and applicable foreign documents remain staff checks. | Owner/manual operating procedure |
| 1.5: 1.5. KJM Motorcycle Rental reserves the right to refuse or cancel a rental if the renter fails to meet… | Already implemented correctly | Staff can reject or cancel with a required reason; missing/unapproved licence or documents block confirmation/release. | Owner/manual operating procedure |

Evidence: MAIN migration 020 guard_rental_workflow; ADMIN actions/bookings.ts reviewVerification.

### 2. AUTHORIZED DRIVER ONLY

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 2.1: 2.1. Only the driver identified and approved in the rental agreement is authorized to operate the moto… | Already implemented correctly | Booking identifies the renter and staff verifies that identity at release. Additional drivers and written exceptions remain offline; no automatic authorization of another driver. | Owner/manual operating procedure |
| 2.2: 2.2. Lending, subleasing, transferring, or allowing another person to operate the motorcycle without p… | Already implemented correctly | Booking identifies the renter and staff verifies that identity at release. Additional drivers and written exceptions remain offline; no automatic authorization of another driver. | Owner/manual operating procedure |
| 2.3: 2.3. The renter remains responsible for ensuring that the motorcycle is operated only by an authorized… | Already implemented correctly | Booking identifies the renter and staff verifies that identity at release. Additional drivers and written exceptions remain offline; no automatic authorization of another driver. | Owner/manual operating procedure |

Evidence: MAIN migration 020; ADMIN booking-deposit-panel.tsx.

### 3. BOOKING, PAYMENT, AND RENTAL CONFIRMATION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 3.1: 3.1. All rental rates, rental periods, payment requirements, and applicable fees must be confirmed bef… | Already implemented correctly | Pending request, administrator confirmation, inventory checks, private verification, paid cash rental balance, collected deposit and handover inspection are guarded server-side. No reservation payment is currently required by this cash-on-pickup workflow. | Owner/manual operating procedure |
| 3.2: 3.2. A booking is confirmed only after acknowledgment by KJM Motorcycle Rental and completion of any r… | Already implemented correctly | Pending request, administrator confirmation, inventory checks, private verification, paid cash rental balance, collected deposit and handover inspection are guarded server-side. No reservation payment is currently required by this cash-on-pickup workflow. | Owner/manual operating procedure |
| 3.3: 3.3. The motorcycle will not be released until the required documents, security deposit, and applicabl… | Already implemented correctly | Pending request, administrator confirmation, inventory checks, private verification, paid cash rental balance, collected deposit and handover inspection are guarded server-side. No reservation payment is currently required by this cash-on-pickup workflow. | Owner/manual operating procedure |
| 3.4: 3.4. The renter is responsible for settling all agreed rental fees and additional charges incurred dur… | Already implemented correctly | Pending request, administrator confirmation, inventory checks, private verification, paid cash rental balance, collected deposit and handover inspection are guarded server-side. No reservation payment is currently required by this cash-on-pickup workflow. | Owner/manual operating procedure |
| 3.5: 3.5. Any special arrangements, discounts, or exceptions must be approved by KJM Motorcycle Rental in w… | Missing | Written discount/exception authorization is not a structured server-side record; no pricing override or exception was enabled. | Owner/manual operating procedure |

Evidence: MAIN migrations 011, 018, 020; ADMIN actions/bookings.ts.

### 4. SECURITY DEPOSIT

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 4.1: 4.1. A refundable security deposit of ₱2,500, or another amount specified in the booking confirmation,… | Requires owner clarification | ₱2,500 is shown as the proposed official default in admin help only. Existing configured amount is not overwritten. Global amount is configurable; per-booking override is not currently exposed. | Philippine legal review |
| 4.2: 4.2. The security deposit may be applied to outstanding rental fees, late-return charges, traffic fine… | Missing | The ledger has no cash_deducted event. Do not simulate a deduction with a refund or rental payment; a separate reviewed immutable deduction workflow is needed. | Philippine legal review |
| 4.3: 4.3. The motorcycle will be inspected upon return. Any deductions from the security deposit must be su… | Implemented but needs adjustment | Return inspection and dispute notes exist, but deduction basis, evidence and customer communication need a reviewed workflow. | Philippine legal review |
| 4.4: 4.4. The remaining refundable balance will be returned after the inspection and assessment of outstand… | Requires owner clarification | Refund event/balance tracking exists; specify the agreed refund period and dispute handling before any automation. | Philippine legal review |
| 4.5: 4.5. If the renter’s outstanding obligations exceed the security deposit, the renter remains responsib… | Missing | No deposit deduction or reviewed obligation ledger tracks amounts beyond the held deposit. Existing rental payment balance is separate. | Philippine legal review |
| 4.6: 4.6. The security deposit does not automatically authorize an extension of the rental period or contin… | Already implemented correctly | Deposit custody/collection never extends rental dates or authorizes retention. Extension is admin-only and checks conflicts. | Philippine legal review |

Evidence: MAIN migrations 020–021; ADMIN security-deposit-settings.tsx, lib/deposit-balances.ts.

### 5. FUEL RESPONSIBILITY

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 5.1: 5.1. The renter is responsible for all fuel consumed during the rental period. | Implemented but needs adjustment | Pickup/return fuel percentage is recorded. No automatic fuel-shortfall or refueling fee; exact disclosed fee and assessment procedure need confirmation. | Owner/manual operating procedure |
| 5.2: 5.2. The motorcycle must be returned with the same fuel level as recorded at the time of release. | Implemented but needs adjustment | Pickup/return fuel percentage is recorded. No automatic fuel-shortfall or refueling fee; exact disclosed fee and assessment procedure need confirmation. | Owner/manual operating procedure |
| 5.3: 5.3. If the motorcycle is returned with a lower fuel level, the renter may be charged for the fuel req… | Implemented but needs adjustment | Pickup/return fuel percentage is recorded. No automatic fuel-shortfall or refueling fee; exact disclosed fee and assessment procedure need confirmation. | Owner/manual operating procedure |

Evidence: MAIN migration 020 rental_inspections; ADMIN booking-deposit-panel.tsx.

### 6. LATE RETURN CHARGES

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 6.1: 6.1. A grace period of fifteen (15) minutes is allowed after the agreed return time. | Missing | The 15-minute grace provision is published; there is no return-fee computation to which a grace threshold can safely be applied yet. | Philippine legal review |
| 6.2: 6.2. Returns exceeding the grace period may be subject to the applicable hourly extension or late-retu… | Requires owner clarification | No dedicated late-return fee calculator/settings or grace enforcement found. Define hourly rate, rounding, grace treatment and when the conditional 10% applies. Prevent overlap with full-day/extension charges. No fee introduced. | Philippine legal review |
| 6.3: 6.3. An additional charge equivalent to ten percent (10%) of the daily rental rate may apply for exces… | Requires owner clarification | No dedicated late-return fee calculator/settings or grace enforcement found. Define hourly rate, rounding, grace treatment and when the conditional 10% applies. Prevent overlap with full-day/extension charges. No fee introduced. | Philippine legal review |
| 6.4: 6.4. The applicable charges and calculation method must be clarified to the renter before the rental b… | Requires owner clarification | Need one disclosed fee method, a non-overlap rule, and a booking policy snapshot. No combined hourly-plus-10% charge was introduced. | Philippine legal review |
| 6.5: 6.5. Late-return charges do not automatically authorize the renter to retain or continue using the mot… | Requires owner clarification | No dedicated late-return fee calculator/settings or grace enforcement found. Define hourly rate, rounding, grace treatment and when the conditional 10% applies. Prevent overlap with full-day/extension charges. No fee introduced. | Philippine legal review |

Evidence: MAIN migrations 011, 018, 020; ADMIN actions/bookings.ts.

### 7. RENTAL EXTENSION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 7.1: 7.1. A short-term rental extension of up to two (2) hours may be permitted, subject to prior approval … | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |
| 7.2: 7.2. All extension requests must be submitted at least two (2) hours before the agreed return time. | Missing | No extension request submission timestamp/notice validator exists. An admin extension is not evidence of a timely customer request. | Philippine legal review |
| 7.3: 7.3. If the motorcycle is retained for more than two (2) hours beyond the agreed return time without a… | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |
| 7.4: 7.4. Failure to request an extension within the required notice period may result in additional charge… | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |
| 7.5: 7.5. All extensions are subject to approval by KJM Motorcycle Rental. Approval is not automatic and de… | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |
| 7.6: 7.6. For monthly or other long-term rentals, any extension must be approved in advance. An extension o… | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |
| 7.7: 7.7. Before an extension begins, the additional rental period, charges, and payment terms must be conf… | Missing | No written extension charge/period/payment acceptance snapshot exists; current audit log records date changes only. | Philippine legal review |
| 7.8: 7.8. Unauthorized extensions are prohibited and may result in additional charges and termination of th… | Implemented but needs adjustment | Existing admin extension uses admin_reschedule_booking with conflict/maintenance/extra inventory protection. It has no two-hour notice/cap or written acceptance snapshot and re-quotes the entire rental using current model prices. Short/monthly extension pricing must be confirmed before adjustments. | Philippine legal review |

Evidence: MAIN migration 018 admin_reschedule_booking; ADMIN actions/bookings.ts and dashboard/bookings/[id]/page.tsx.

### 8. NO HALF-DAY RENTALS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 8.1: 8.1. KJM Motorcycle Rental does not offer half-day rental arrangements unless expressly advertised or … | Already implemented correctly | Started 24-hour periods charge whole started days; no half-day product or automatic early-return refund found. Existing alternative calendar/prorated settings remain untouched; actual live selection was not queried. Written exceptions remain manual. | Owner/manual operating procedure |
| 8.2: 8.2. Rental fees are based on the agreed rental duration and applicable rate schedule. | Already implemented correctly | Server quote remains authoritative, peso amounts and model rates unchanged. Started 24-hour pricing is compatible with no half-day rental absent an approved exception. | Owner/manual operating procedure |
| 8.3: 8.3. Any early return or unused portion of the rental period does not automatically entitle the renter… | Already implemented correctly | Started 24-hour periods charge whole started days; no half-day product or automatic early-return refund found. Existing alternative calendar/prorated settings remain untouched; actual live selection was not queried. Written exceptions remain manual. | Owner/manual operating procedure |

Evidence: MAIN lib/booking.ts; migration 011 calculate_booking_quote; ADMIN booking-settings-form.tsx.

### 9. CANCELLATION, RESCHEDULING, AND NO-SHOW

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 9.1: 9.1. Cancellation and rescheduling requests must be communicated to KJM Motorcycle Rental as early as … | Implemented but needs adjustment | Admin cancellation/rejection requires a reason, payments support audited refunds/reversals, and rescheduling checks inventory. No disclosed fee/deadline/no-show schedule snapshot or automatic fee exists. | Philippine legal review |
| 9.2: 9.2. Applicable cancellation fees, reservation-payment refunds, and rescheduling conditions will follo… | Requires owner clarification | Owner must supply cancellation/rescheduling/refund fee schedules and deadlines. Existing manual refund ledger is not that policy. | Philippine legal review |
| 9.3: 9.3. Failure to arrive at the agreed pickup time without prior notice may be treated as a no-show and … | Missing | No dedicated no-show event/approved fee schedule. Existing pending-request expiration is not a renter no-show policy. | Philippine legal review |
| 9.4: 9.4. Changes to the rental date, pickup time, return time, or motorcycle unit are subject to availabil… | Already implemented correctly | Admin date/unit changes invoke guarded inventory/maintenance/extra conflict checks; customers cannot automatically reschedule. | Philippine legal review |
| 9.5: 9.5. KJM Motorcycle Rental may cancel or refuse to release a motorcycle if the renter fails to meet th… | Implemented but needs adjustment | Admin cancellation/rejection requires a reason, payments support audited refunds/reversals, and rescheduling checks inventory. No disclosed fee/deadline/no-show schedule snapshot or automatic fee exists. | Philippine legal review |

Evidence: ADMIN actions/bookings.ts; MAIN migrations 011 and 018.

### 10. NO REFUND FOR EARLY RETURN

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 10.1: 10.1. Returning the motorcycle before the agreed return date or time does not automatically entitle th… | Already implemented correctly | Return/completion does not automatically issue rental refunds. Manual refund events remain separate and verified; written exceptions must be handled by staff. | Philippine legal review |
| 10.2: 10.2. Any exception must be expressly approved in writing by KJM Motorcycle Rental, subject to the app… | Already implemented correctly | Return/completion does not automatically issue rental refunds. Manual refund events remain separate and verified; written exceptions must be handled by staff. | Philippine legal review |

Evidence: ADMIN actions/bookings.ts; MAIN migration 020 guard_rental_workflow.

### 11. UNLIMITED KILOMETERS AND GEOGRAPHICAL RESTRICTIONS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 11.1: 11.1. Unlimited kilometers are allowed within the approved rental area, subject to the terms of the bo… | Requires owner clarification | Exact unlimited-distance and prior-written-approval provisions now published. Confirm approved rental area and unit-specific restrictions for each agreement. No tracking/geofence rule was invented. | Owner/manual operating procedure |
| 11.2: 11.2. The renter must obtain prior written approval before taking the motorcycle outside Cebu Province. | Requires owner clarification | Exact unlimited-distance and prior-written-approval provisions now published. Confirm approved rental area and unit-specific restrictions for each agreement. No tracking/geofence rule was invented. | Owner/manual operating procedure |
| 11.3: 11.3. Additional restrictions may apply depending on the motorcycle unit, rental agreement, insurance … | Requires owner clarification | Exact unlimited-distance and prior-written-approval provisions now published. Confirm approved rental area and unit-specific restrictions for each agreement. No tracking/geofence rule was invented. | Owner/manual operating procedure |
| 11.4: 11.4. The renter must not take the motorcycle outside the approved area without authorization. | Requires owner clarification | Exact unlimited-distance and prior-written-approval provisions now published. Confirm approved rental area and unit-specific restrictions for each agreement. No tracking/geofence rule was invented. | Owner/manual operating procedure |

Evidence: MAIN terms/2026-10-12.json; faq-content.ts; rental_inspections mileage.

### 12. TRAVEL OUTSIDE CEBU AND FERRY OR RORO TRANSPORTATION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 12.1: 12.1. Taking the motorcycle outside Cebu Province or transporting it on any ferry or Roll-on/Roll-off … | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |
| 12.2: 12.2. The renter must provide the proposed destination, travel dates, and relevant transportation deta… | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |
| 12.3: 12.3. Approval is subject to the motorcycle’s suitability, applicable insurance coverage, ferry operat… | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |
| 12.4: 12.4. Any additional transportation, delivery, pickup, or recovery charges must be agreed upon before … | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |
| 12.5: 12.5. The renter must not assume that the motorcycle’s insurance coverage remains valid for travel out… | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |
| 12.6: 12.6. Unauthorized travel or transportation may constitute a breach of this agreement and may result i… | Requires owner clarification | Prior written ferry/RoRo/outside-Cebu approval now published. No structured destination/transport approval record or fee schedule found. Suitability and insurance must be confirmed by staff. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json and faq-content.ts; ADMIN existing booking workflow.

### 13. VEHICLE INSPECTION AND DOCUMENTATION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 13.1: 13.1. The renter is strongly advised to inspect the motorcycle thoroughly before accepting it. | Implemented but needs adjustment | Immutable pickup/return inspections retain time, actor, condition, damage, fuel, mileage and accessories. Labels now prompt tires/lights/brakes/mirrors and specified accessories. Dedicated photo/video attachment storage and per-item checklist fields are absent. | Owner/manual operating procedure |
| 13.2: 13.2. Existing scratches, dents, tire condition, lights, brakes, mirrors, fuel level, mileage, and oth… | Implemented but needs adjustment | Immutable pickup/return inspections retain time, actor, condition, damage, fuel, mileage and accessories. Labels now prompt tires/lights/brakes/mirrors and specified accessories. Dedicated photo/video attachment storage and per-item checklist fields are absent. | Owner/manual operating procedure |
| 13.3: 13.3. Taking photographs or videos of the motorcycle at pickup and return is strongly encouraged. | Missing | No private rental-inspection photo/video attachments found. Identity verification storage is purpose-specific and must not be repurposed. | Owner/manual operating procedure |
| 13.4: 13.4. Any existing damage or missing accessories should be reported and documented before the motorcyc… | Implemented but needs adjustment | Immutable pickup/return inspections retain time, actor, condition, damage, fuel, mileage and accessories. Labels now prompt tires/lights/brakes/mirrors and specified accessories. Dedicated photo/video attachment storage and per-item checklist fields are absent. | Owner/manual operating procedure |
| 13.5: 13.5. The renter should immediately report any safety concern identified during the inspection before … | Implemented but needs adjustment | Immutable pickup/return inspections retain time, actor, condition, damage, fuel, mileage and accessories. Labels now prompt tires/lights/brakes/mirrors and specified accessories. Dedicated photo/video attachment storage and per-item checklist fields are absent. | Owner/manual operating procedure |

Evidence: MAIN migration 020 rental_inspections; ADMIN booking-deposit-panel.tsx.

### 14. CONDITION UPON RETURN

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 14.1: 14.1. The motorcycle must be returned in substantially the same condition as received, allowing for no… | Implemented but needs adjustment | Return inspection, actual return time, accessories notes and mileage/fuel are recorded before completion. Damage fee/deduction adjudication and agreed return-location change records are not structured. | Owner/manual operating procedure |
| 14.2: 14.2. The renter must return all supplied keys, helmets, raincoats, phone holders, top boxes, document… | Implemented but needs adjustment | Return inspection, actual return time, accessories notes and mileage/fuel are recorded before completion. Damage fee/deduction adjudication and agreed return-location change records are not structured. | Owner/manual operating procedure |
| 14.3: 14.3. Missing items or damage beyond normal wear and tear may result in reasonable, documented repair … | Implemented but needs adjustment | Return inspection, actual return time, accessories notes and mileage/fuel are recorded before completion. Damage fee/deduction adjudication and agreed return-location change records are not structured. | Owner/manual operating procedure |
| 14.4: 14.4. The renter must return the motorcycle at the agreed date, time, and location. | Implemented but needs adjustment | Return inspection, actual return time, accessories notes and mileage/fuel are recorded before completion. Damage fee/deduction adjudication and agreed return-location change records are not structured. | Owner/manual operating procedure |
| 14.5: 14.5. Changes to the return location require prior approval. Additional delivery, pickup, or recovery … | Implemented but needs adjustment | Return inspection, actual return time, accessories notes and mileage/fuel are recorded before completion. Damage fee/deduction adjudication and agreed return-location change records are not structured. | Owner/manual operating procedure |

Evidence: MAIN migration 020; ADMIN booking-deposit-panel.tsx.

### 15. ACCIDENTS, DAMAGE, AND INCIDENT REPORTING

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 15.1: 15.1. The renter must immediately notify KJM Motorcycle Rental of any accident, collision, damage, or … | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |
| 15.2: 15.2. When necessary, the renter must contact emergency services, the police, or other appropriate aut… | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |
| 15.3: 15.3. The renter must provide accurate information about the incident and reasonably cooperate with in… | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |
| 15.4: 15.4. The renter must not abandon the motorcycle or authorize non-emergency repairs without prior appr… | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |
| 15.5: 15.5. The renter may be held responsible for documented repair costs, replacement costs, or other loss… | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |
| 15.6: 15.6. Responsibility for an accident or damage will be assessed in accordance with the circumstances, … | Missing | Terms and incident instructions are now published. Existing inspection damage notes are not an incident/insurance claims workflow; contact escalation, incident evidence and reviewed loss assessment need operating procedures. No automatic liability assignment exists. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; rental_inspections; ADMIN booking-deposit-panel.tsx.

### 16. INSURANCE COVERAGE AND LIMITATIONS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 16.1: 16.1. Insurance coverage varies by motorcycle unit and is subject to the applicable insurance policy. | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.2: 16.2. Compulsory Third Party Liability (CTPL) insurance does not automatically cover damage to the ren… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.3: 16.3. Comprehensive insurance, where available, is subject to the written policy terms, limits, exclus… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.4: 16.4. The renter must immediately report incidents that may give rise to an insurance claim and cooper… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.5: 16.5. Insurance coverage does not automatically release the renter from contractual responsibilities o… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.6: 16.6. The renter may be responsible for uninsured losses or applicable deductibles to the extent provi… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |
| 16.7: 16.7. KJM Motorcycle Rental does not guarantee payment of an insurance claim where the claim is exclud… | Requires owner clarification | Full insurance limitations now presented; no per-unit policy/coverage/deductible registry found. Obtain actual insurer documents and unit-specific disclosure; no comprehensive coverage promise or auto liability assignment introduced. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; faq-content.ts; both projects types/database.ts.

### 17. THEFT, LOSS OF KEYS, AND MISSING ACCESSORIES

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 17.1: 17.1. The renter must take reasonable precautions to protect the motorcycle, keys, registration docume… | Missing | Loss/security duties are published. Accessories and damage observations exist; dedicated theft/lost-key report, recovery expense evidence and insurer review process are absent. | Philippine legal review |
| 17.2: 17.2. The motorcycle must be parked in a reasonably secure location when not in use. The renter must n… | Missing | Loss/security duties are published. Accessories and damage observations exist; dedicated theft/lost-key report, recovery expense evidence and insurer review process are absent. | Philippine legal review |
| 17.3: 17.3. Theft, attempted theft, lost keys, or missing accessories must be reported to KJM Motorcycle Ren… | Missing | Loss/security duties are published. Accessories and damage observations exist; dedicated theft/lost-key report, recovery expense evidence and insurer review process are absent. | Philippine legal review |
| 17.4: 17.4. The renter may be held responsible for documented losses, recovery expenses, or replacement cost… | Missing | Loss/security duties are published. Accessories and damage observations exist; dedicated theft/lost-key report, recovery expense evidence and insurer review process are absent. | Philippine legal review |
| 17.5: 17.5. Any applicable insurance coverage and claim requirements will be considered when determining res… | Missing | Loss/security duties are published. Accessories and damage observations exist; dedicated theft/lost-key report, recovery expense evidence and insurer review process are absent. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; migration 020.

### 18. TRAFFIC VIOLATIONS, FINES, AND IMPOUNDMENT

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 18.1: 18.1. The renter must comply with all applicable Philippine traffic laws and regulations. | Missing | Traffic/fine rules are published. No reviewed traffic-fine/impoundment ledger or incident workflow found; charges require attribution, evidence and review. | Philippine legal review |
| 18.2: 18.2. The renter is responsible for traffic fines, parking penalties, and other charges arising from t… | Missing | Traffic/fine rules are published. No reviewed traffic-fine/impoundment ledger or incident workflow found; charges require attribution, evidence and review. | Philippine legal review |
| 18.3: 18.3. If the motorcycle is impounded, detained, or confiscated because of the renter’s actions or viol… | Missing | Traffic/fine rules are published. No reviewed traffic-fine/impoundment ledger or incident workflow found; charges require attribution, evidence and review. | Philippine legal review |
| 18.4: 18.4. Reasonable, documented expenses arising from such incidents may be charged to the renter where p… | Missing | Traffic/fine rules are published. No reviewed traffic-fine/impoundment ledger or incident workflow found; charges require attribution, evidence and review. | Philippine legal review |
| 18.5: 18.5. The renter must not use the motorcycle for any activity prohibited by applicable law. | Missing | Traffic/fine rules are published. No reviewed traffic-fine/impoundment ledger or incident workflow found; charges require attribution, evidence and review. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; existing payment events.

### 19. MAINTENANCE, MECHANICAL PROBLEMS, AND REPAIRS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 19.1: 19.1. The renter must promptly report mechanical problems, warning lights, unusual noises, tire damage… | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |
| 19.2: 19.2. The renter must stop operating the motorcycle when it appears unsafe to ride and contact KJM Mot… | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |
| 19.3: 19.3. The renter must not modify, dismantle, or arrange non-emergency repairs to the motorcycle withou… | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |
| 19.4: 19.4. Damage resulting from misuse, negligence, unauthorized modifications, or failure to follow reaso… | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |
| 19.5: 19.5. Normal mechanical failures and ordinary wear and tear will be assessed separately from damage at… | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |
| 19.6: 19.6. The renter must not continue operating a motorcycle when doing so could cause further damage or … | Implemented but needs adjustment | Maintenance unavailability protects inventory. No customer breakdown reporting or emergency-repair authorization process is exposed; normal wear versus misuse must be reviewed by staff. | Philippine legal review |

Evidence: MAIN migrations 008, 011, 018; ADMIN fleet/maintenance workflow.

### 20. PROHIBITED SUBSTANCES

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 20.1: 20.1. Operating the motorcycle under the influence of alcohol, illegal drugs, or any substance that im… | Already implemented correctly | Safety prohibition is published verbatim; manual pickup identity/eligibility review remains mandatory. This is an operating rule, not a claim that the website can detect impairment. | Philippine legal review |
| 20.2: 20.2. The renter must not permit any person who is impaired, unfit, or legally disqualified from ridin… | Already implemented correctly | Safety prohibition is published verbatim; manual pickup identity/eligibility review remains mandatory. This is an operating rule, not a claim that the website can detect impairment. | Philippine legal review |
| 20.3: 20.3. Violations may result in termination of the rental agreement and other lawful remedies. | Already implemented correctly | Safety prohibition is published verbatim; manual pickup identity/eligibility review remains mandatory. This is an operating rule, not a claim that the website can detect impairment. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; migration 020 handover guard.

### 21. PROHIBITED USE

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 21.1: 21.1. The rented motorcycle is intended for normal, lawful road use only. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2: 21.2. The following activities are strictly prohibited: | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 1: Off-road riding or use on terrain for which the motorcycle is not intended or authorized. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 2: Racing, speed competitions, stunts, reckless driving, or dangerous riding. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 3: Use for any illegal activity. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 4: Use for ride-hailing or passenger-for-hire services, including Angkas, Move It, Maxim, or habal-habal … | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 5: Use for delivery or courier services, including commercial delivery work. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 6: Carrying loads or passengers beyond the motorcycle’s legal or manufacturer-specified limits. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.2 bullet 7: Any activity that violates the rental agreement, applicable law, or insurance policy. | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |
| 21.3: 21.3. KJM Motorcycle Rental may terminate the rental agreement if the motorcycle is used in violation … | Already implemented correctly | All seven prohibited-use bullets published verbatim; no commercial-use product or automatic permission added. Enforcement is staff responsibility. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; terms-agreement.tsx.

### 22. NO UNAUTHORIZED TRANSFER, SUBLEASING, OR MODIFICATION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 22.1: 22.1. The renter must not lend, sublease, sell, transfer possession of, or otherwise allow another per… | Already implemented correctly | Exact restrictions are published. Assigned renter/manual review remains; no transfer/sublease/modification permission added. Exceptions are written offline arrangements. | Philippine legal review |
| 22.2: 22.2. The renter must not alter the motorcycle’s mechanical components, bodywork, registration plates,… | Already implemented correctly | Exact restrictions are published. Assigned renter/manual review remains; no transfer/sublease/modification permission added. Exceptions are written offline arrangements. | Philippine legal review |
| 22.3: 22.3. Unauthorized modifications or transfers may constitute a breach of this agreement and may result… | Already implemented correctly | Exact restrictions are published. Assigned renter/manual review remains; no transfer/sublease/modification permission added. Exceptions are written offline arrangements. | Philippine legal review |

Evidence: MAIN terms/2026-10-12.json; migration 020.

### 23. LONG-TERM AND MONTHLY RENTALS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 23.1: 23.1. Long-term rental rates, payment schedules, included accessories, insurance arrangements, and ren… | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.2: 23.2. Monthly or long-term rental privileges and rates do not automatically apply to a subsequent rent… | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.3: 23.3. Any extension must be approved in advance by KJM Motorcycle Rental. Extensions of less than one … | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.4: 23.4. The renter must comply with the agreed payment schedule and make the motorcycle available for sc… | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.5: 23.5. Early termination, outstanding rental payments, advance payments, and any applicable charges wil… | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.6: 23.6. If the long-term rental agreement specifies a minimum rental commitment or payment obligation up… | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |
| 23.7: 23.7. Changes to the rental period, payment schedule, authorized use, or other material terms must be … | Requires owner clarification | No separate monthly/long-term contract, maintenance/payment schedule or extension rate override. Existing daily pricing and extension re-quote cannot be represented as a complete monthly workflow. Confirm handling and written schedules. | Philippine legal review |

Evidence: MAIN migration 018 admin_reschedule_booking; ADMIN booking-settings-form.tsx.

### 24. CANCELLATION OR TERMINATION BY KJM MOTORCYCLE RENTAL

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 24.1: 24.1. KJM Motorcycle Rental may terminate the rental agreement and request the return of the motorcycl… | Implemented but needs adjustment | Pending/confirmed cancellation and reason audit exist; active rentals currently transition only to completed. No active termination/recovery workflow; preserve existing guards until a lawful reviewed process is specified. | Philippine legal review |
| 24.2: 24.2. Where necessary and legally permitted, KJM Motorcycle Rental may arrange the lawful recovery of … | Implemented but needs adjustment | Pending/confirmed cancellation and reason audit exist; active rentals currently transition only to completed. No active termination/recovery workflow; preserve existing guards until a lawful reviewed process is specified. | Philippine legal review |
| 24.3: 24.3. Termination does not automatically waive outstanding rental fees, documented damages, or other a… | Implemented but needs adjustment | Pending/confirmed cancellation and reason audit exist; active rentals currently transition only to completed. No active termination/recovery workflow; preserve existing guards until a lawful reviewed process is specified. | Philippine legal review |
| 24.4: 24.4. Any recovery, collection, or enforcement action must be carried out lawfully and without violati… | Implemented but needs adjustment | Pending/confirmed cancellation and reason audit exist; active rentals currently transition only to completed. No active termination/recovery workflow; preserve existing guards until a lawful reviewed process is specified. | Philippine legal review |
| 24.5: 24.5. Refunds, if any, will be handled in accordance with the applicable booking terms, rental agreeme… | Implemented but needs adjustment | Pending/confirmed cancellation and reason audit exist; active rentals currently transition only to completed. No active termination/recovery workflow; preserve existing guards until a lawful reviewed process is specified. | Philippine legal review |

Evidence: MAIN migration 020 guard_rental_workflow; ADMIN actions/bookings.ts.

### 25. DELIVERY, PICKUP, AND RETURN ARRANGEMENTS

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 25.1: 25.1. Delivery and pickup services may be available depending on the renter’s location and the availab… | Requires owner clarification | No customer location-specific delivery quote/approval workflow. Notification pickup-location configuration is not a delivery service/fee schedule. Confirm locations, fees and change procedure; manual arrangements must be agreed in writing. | Owner/manual operating procedure |
| 25.2: 25.2. Delivery and pickup fees depend on the agreed location and must be confirmed before the booking … | Requires owner clarification | No customer location-specific delivery quote/approval workflow. Notification pickup-location configuration is not a delivery service/fee schedule. Confirm locations, fees and change procedure; manual arrangements must be agreed in writing. | Owner/manual operating procedure |
| 25.3: 25.3. The renter must provide accurate delivery, pickup, and return addresses and ensure that the desi… | Requires owner clarification | No customer location-specific delivery quote/approval workflow. Notification pickup-location configuration is not a delivery service/fee schedule. Confirm locations, fees and change procedure; manual arrangements must be agreed in writing. | Owner/manual operating procedure |
| 25.4: 25.4. Changes to the agreed location or schedule require prior approval and may result in additional c… | Requires owner clarification | No customer location-specific delivery quote/approval workflow. Notification pickup-location configuration is not a delivery service/fee schedule. Confirm locations, fees and change procedure; manual arrangements must be agreed in writing. | Owner/manual operating procedure |
| 25.5: 25.5. Any delay or difficulty affecting delivery, pickup, or return must be communicated to KJM Motorc… | Requires owner clarification | No customer location-specific delivery quote/approval workflow. Notification pickup-location configuration is not a delivery service/fee schedule. Confirm locations, fees and change procedure; manual arrangements must be agreed in writing. | Owner/manual operating procedure |

Evidence: ADMIN notifications/config.ts; MAIN booking-checkout.tsx.

### 26. RENTAL PERIOD AND RESPONSIBILITY FOR THE MOTORCYCLE

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 26.1: 26.1. The renter’s responsibility for the motorcycle begins upon its release and continues until it is… | Already implemented correctly | Release and accepted return are captured by mandatory handover/return inspection timestamps; completion is guarded. | Philippine legal review |
| 26.2: 26.2. The renter must not abandon the motorcycle, leave it with an unauthorized person, or leave it at… | Implemented but needs adjustment | Actual handover/return inspection times are immutable and identify actor; responsibility/emergency-location/recovery arrangements remain operational. No automated additional charges introduced. | Philippine legal review |
| 26.3: 26.3. If the renter cannot return the motorcycle as agreed because of an emergency, accident, breakdow… | Implemented but needs adjustment | Actual handover/return inspection times are immutable and identify actor; responsibility/emergency-location/recovery arrangements remain operational. No automated additional charges introduced. | Philippine legal review |
| 26.4: 26.4. Additional rental, transport, recovery, or other charges may apply where justified by the circum… | Implemented but needs adjustment | Actual handover/return inspection times are immutable and identify actor; responsibility/emergency-location/recovery arrangements remain operational. No automated additional charges introduced. | Philippine legal review |

Evidence: MAIN migration 020; ADMIN booking-deposit-panel.tsx.

### 27. CUSTOMER INFORMATION AND COMMUNICATION

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 27.1: 27.1. The renter must provide accurate and current contact details for booking, delivery, emergency co… | Implemented but needs adjustment | Customer details, private identity documents, RLS, authenticated access, manual verification and gated notification outbox exist. Privacy page is still a draft; retention/deletion and lawful notices require separate approved content. No outbound delivery activated. | Philippine legal review |
| 27.2: 27.2. The renter must promptly inform KJM Motorcycle Rental of any changes to their contact informatio… | Implemented but needs adjustment | Customer details, private identity documents, RLS, authenticated access, manual verification and gated notification outbox exist. Privacy page is still a draft; retention/deletion and lawful notices require separate approved content. No outbound delivery activated. | Philippine legal review |
| 27.3: 27.3. Personal information collected for bookings and rental administration will be handled in accorda… | Requires legal review | Private storage/RLS exist, but the public privacy notice remains draft. Owner terms section 27 is not a substitute for a complete approved privacy policy. | Philippine legal review |
| 27.4: 27.4. Customer information will be used only for legitimate rental-related purposes and other purposes… | Implemented but needs adjustment | Customer details, private identity documents, RLS, authenticated access, manual verification and gated notification outbox exist. Privacy page is still a draft; retention/deletion and lawful notices require separate approved content. No outbound delivery activated. | Philippine legal review |

Evidence: MAIN privacy/page.tsx, booking-checkout.tsx; ADMIN notifications/config.ts; migration 022.

### 28. ACKNOWLEDGMENT AND ACCEPTANCE

| Clause / requirement | Status | Operational finding | Review |
| --- | --- | --- | --- |
| 28.1: 28.1. By proceeding with a booking, signing the rental agreement, or accepting the motorcycle, the ren… | Implemented but needs adjustment | Customers can read the full terms and version archive and must check a separate unchecked acceptance box. UI-only enforcement cannot prove direct RPC callers accepted. | Philippine legal review |
| 28.2: 28.2. The renter agrees to comply with these terms and any additional conditions expressly stated in t… | Implemented but needs adjustment | Verbatim agreement, permanent version archive and separate unchecked booking checkbox added. UI guard requires current version plus existing declaration. V3 RPC stores declaration/privacy timestamps but has no legal-terms version or acceptance fields. Durable server acceptance awaits a separate additive migration. | Philippine legal review |
| 28.3: 28.3. Any special arrangements or amendments must be documented and approved by the parties in writing. | Implemented but needs adjustment | Verbatim agreement, permanent version archive and separate unchecked booking checkbox added. UI guard requires current version plus existing declaration. V3 RPC stores declaration/privacy timestamps but has no legal-terms version or acceptance fields. Durable server acceptance awaits a separate additive migration. | Philippine legal review |
| 28.4: 28.4. If any provision of these Terms and Conditions is found unenforceable, the remaining provisions … | Requires legal review | Severability provision published exactly as supplied; enforceability has not been assessed. | Philippine legal review |
| 28.5: 28.5. These Terms and Conditions are governed by the applicable laws of the Republic of the Philippines. | Requires legal review | Governing-law text published exactly as supplied; no legal determination is made. | Philippine legal review |
| 28.6: 28.6. Nothing in this agreement is intended to waive any right or protection that cannot lawfully be w… | Requires legal review | Non-waivable rights protection preserved verbatim; obtain counsel review of the complete agreement. | Philippine legal review |

Evidence: MAIN terms-acceptance.tsx, terms-acceptance-policy.ts, booking-checkout.tsx; migrations 011 and 020.

## Owner decisions and recommendations

1. **Cash deposit:** approve ₱2,500 only for future bookings through the existing approved settings screen, or retain another confirmed amount. Define any per-booking override and refundable-balance deadline. No value is set automatically.
2. **ID custody:** the agreement does not authorize original-ID deposits. Keep custody disabled until the owner supplies a separate explicit policy and Philippine counsel reviews document types, legal basis, retention, safekeeping, release, disputes and customer rights. Do not treat identity verification as custody consent.
3. **Late fees:** confirm hourly PHP rate, started-hour/partial-hour rounding, whether the first 15 minutes are excluded or only a trigger, when the conditional 10% applies and whether it replaces another fee. Define interaction with unauthorized >2-hour full-day charges without billing any period twice. No formula can be inferred.
4. **Extensions:** confirm notice/cap exceptions, separate short-extension charge and monthly/long-term rate schedules. Recommend preserving the original agreed base rental price and charging a separately accepted extension rather than silently repricing the whole rental; this needs explicit management approval. Record request time and written approval.
5. **Cancellation/no-show:** supply the disclosed fee, deadlines, reservation-payment refund rules, rescheduling conditions and no-show procedure. Snapshot the agreed policy per booking before automatic charges.
6. **Insurance:** supply per-unit written coverage, exclusions, limits, deductible and contact/claim procedure. Do not equate CTPL with comprehensive protection.
7. **Delivery/geography:** specify approved rental area, written outside-Cebu/ferry approval procedure, delivery locations, agreed fees and return-location changes.
8. **Long term:** provide written contract/payment/maintenance/termination schedules, minimum commitments and sub-month extension charges. Do not introduce monthly rates into the current daily quote.
9. **Privacy:** approve a full privacy notice, retention/deletion procedure and business contact details. Existing draft privacy page cannot be treated as finalized by section 27.
10. **Terms persistence:** approve the additive acceptance migration design below before implementation/application. UI acceptance alone is insufficient for durable evidence and direct-RPC enforcement.

## Philippine legal review queue

- Full agreement enforceability and booking/written-amendment process.
- Original-ID custody versus verification (not authorized in the agreement).
- Documented deposit deductions, excess obligations, refund timing and disputes (section 4).
- Late/extension/percentage/full-day fees and no-overlap rules (sections 6–7).
- Cancellation/no-show/early-return/long-term minimum commitment and refunds (sections 9–10, 23).
- Accident/insurance/theft/fines/repair costs and attribution, insurer exclusions and deductibles (sections 15–19).
- Termination, recovery, collection, transport charges and renter rights (sections 12, 24, 26).
- Privacy, personal-data purposes, private document retention and customer communication (section 27).
- Severability, governing law and non-waivable rights (section 28).

These are referrals for legal review. No legal research or determination is claimed; the supplied terms are published without editorial changes.

## Proposed database changes — not authored/applied

No SQL migration was created or applied in this task. A numbered production migration should be prepared and reviewed separately; proposed next identifier is **023: immutable rental-terms acceptance** (check current migration numbering before authoring). Exact intended effects:

- Add an immutable `rental_terms_versions` registry: version primary key, effective date, source SHA-256, canonical source text, published timestamp and active-for-new-requests marker; preserve earlier versions.
- Add append-only `booking_terms_acceptances`: booking UUID FK (unique per booking), authenticated customer UUID FK, legal terms version FK, server-generated acceptance timestamp and source digest. Booking reference resolves via booking FK. Existing bookings remain historical with **no fabricated acceptance/backfill**.
- Force RLS; deny anonymous/direct mutations; allow customers to read only their own acceptance and active admins to read relevant records. Customer cannot forge actor/time/digest. Guard updates/deletes; use existing audited controlled RPC conventions and explicit grants/search_path.
- Add a guarded `submit_booking_request_v4` wrapper taking `p_terms_accepted` and `p_terms_version`; call existing V3 booking/pricing/deposit logic and insert acceptance atomically in the same transaction. Keep V3 deposit policy parameter intact. Preserve auth/test/public-booking gates, private identity uploads, quote validation, inventory locks and price computation.
- Extend idempotency checks to agreement version/acceptance. Retries return the original booking/acceptance without altering its timestamp; an idempotent retry after a new terms version is published still resolves the original accepted version. New requests using retired terms are rejected until the customer reviews the active version.
- Revoke customer access to older submission RPC entrypoints once V4 callers are validated to prevent terms bypass. This requires coordinated application/schema rollout; do not revoke or call V4 prematurely.
- Log acceptance creation and controlled version publication without logging private ID files. Expose accepted version/time in authenticated ADMIN booking detail and appropriate customer reference view.
- Test missing/false acceptance, stale version, tampered digest/time/user, cross-customer access, old records, rollback, idempotent retry and unchanged booking totals/availability. Validate first in disposable database, then identify exact SQL/effects for separate production approval.

Future deposit-deduction/fee-policy schema work is a separate proposal after approved owner policies: append-only reviewed deduction events/evidence, held-versus-refunded-versus-deducted balances, booking-specific fee disclosures and written extension approval. Do not introduce a deduction by editing historical events or treating withheld deposit as rental revenue.

## Tests, builds and visual validation

- MAIN TypeScript and ESLint: executed and passed.
- MAIN existing automated suite plus terms tests: **10 files, 65 tests passed**. Includes source/hash/order/28-section preservation, permanent terms version and acceptance guard checks; existing price/currency/migration safeguards run.
- ADMIN TypeScript and ESLint: executed and passed.
- ADMIN automated suite: **18 files, 225 tests passed**, including booking settings, deposit settings/balances and verification contracts.
- Both production builds: executed and passed. MAIN continues to report pre-existing `home-motion.module.css` global-selector warnings.
- Desktop 1440 px / mobile 390 px terms pages: verified every one of **141 paragraph/list blocks** rendered, all 28 sections, no horizontal overflow, complete version archive, unknown-version handling, section-16 anchor and insurance text readability.
- Browser checkbox test uses the **actual TermsAcceptance component in an isolated local harness**, checks initial unchecked state, separate declaration, current-version link/state, enabling only with both and revocation on uncheck. This is not an end-to-end authenticated booking submission and does not certify server-side terms persistence. No booking, availability mutation or private document upload was performed.
- Screenshots and JSON evidence: `docs/terms-integration/terms-{1440,390}.png`, `insurance-{1440,390}.png`, `ui-results.json`, `acceptance-ui-results.json`.

## Remaining work before launch

Keep public booking, anonymous Auth, online payments and outbound customer/Telegram delivery disabled until separately authorized. Complete legal/owner decisions, privacy notice, reviewed fee/refund disclosures, durable atomic terms acceptance and coordinated deployment testing. Resolve deduction/extension/insurance/location/incident operating procedures with management; new automation is not a substitute for those decisions. Preserve existing inspection evidence and audit records. No application deployment or production data/configuration change was performed.
