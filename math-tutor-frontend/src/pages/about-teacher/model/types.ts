import type { AboutTeacherAssetContract } from "@/shared/contracts/profile.contract";

export type AboutTeacherMetric = {
  label: string;
  value: string;
  note: string;
};

export type AboutTeacherEducationItem = {
  title: string;
  subtitle: string;
  years: string;
  description: string;
};

export type AboutTeacherReviewFallback = {
  author: string;
  context: string;
  quote: string;
};

export type AboutTeacherAsset = AboutTeacherAssetContract;
