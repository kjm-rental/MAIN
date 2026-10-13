export type VerificationStatus = "verified" | "reference_only" | "pending";

export type MotorcycleMedia = Readonly<{
  src: string;
  alt: string;
  credit: string;
  sourceUrl: string;
  licenseName: string;
  licenseUrl: string;
}>;

export type MotorcycleSpecifications = Readonly<{
  manufacturer: string;
  exactModelName: string | null;
  modelYear: string | null;
  engineDisplacementCc: number | null;
  transmission: string | null;
  fuelTankCapacityLiters: number | null;
  coolingSystem: string | null;
  startingSystem: string | null;
  brakingSystem: string | null;
  category: string | null;
  notableFeatures: readonly string[];
  verificationStatus: VerificationStatus;
  verificationNote: string;
  sourceUrl: string | null;
}>;

export type MotorcycleModel = Readonly<{
  id?: string;
  slug: string;
  model: string;
  dailyRatePhp: number;
  description: string;
  specifications: MotorcycleSpecifications;
  primaryImage?: MotorcycleMedia;
  galleryImages?: readonly MotorcycleMedia[];
}>;
