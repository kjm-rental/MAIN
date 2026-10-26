import * as React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it,vi} from "vitest";
vi.mock("@/lib/payment-availability",()=>({customerOnlinePaymentsEnabled:true}));
import {PaymentMethodChoice} from "./payment-method-choice";
it("permits QRPh only when both verified capability and enablement are present",()=>{vi.stubGlobal("React",React);const html=renderToStaticMarkup(React.createElement(PaymentMethodChoice,{value:"online",methods:["qrph"],onlineEnabled:true,cashEnabled:true,disabled:false,onChange:vi.fn()}));expect(html).toMatch(/<input[^>]*checked=""[^>]*value="online"/);expect(html).not.toMatch(/<input[^>]*disabled=""[^>]*value="online"/);expect(html.match(/type="radio"/g)).toHaveLength(2);});
it("does not activate cards even if a cached capability lists them",()=>{vi.stubGlobal("React",React);const html=renderToStaticMarkup(React.createElement(PaymentMethodChoice,{value:"cash",methods:["card"],onlineEnabled:true,disabled:false,onChange:vi.fn()}));expect(html).toMatch(/<input[^>]*disabled=""[^>]*value="online"/);expect(html).not.toContain('value="card"');});
