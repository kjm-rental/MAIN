"use client";
export function BookingEmailIdentity({
  value,
  onChange,
}: {
  value: string;
  verifiedEmail?: string;
  onChange: (email: string) => void;
}) {
  return (
    <label className="text-deep-teal text-sm font-bold">
      Email
      <input
        className="field"
        type="email"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
