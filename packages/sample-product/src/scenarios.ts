import type { TrafficScenario } from "@dailycart/connectors";

export interface TrafficScenarioProfile {
  searchRate: number;
  cartRate: number;
  checkoutRate: number;
  featureExposureRate: number;
  failureRate: number;
}

export const trafficScenarios: Record<TrafficScenario, TrafficScenarioProfile> = {
  baseline: {
    searchRate: 0.54,
    cartRate: 0.46,
    checkoutRate: 0.72,
    featureExposureRate: 0,
    failureRate: 0.03
  },
  "feature-exposure": {
    searchRate: 0.62,
    cartRate: 0.56,
    checkoutRate: 0.78,
    featureExposureRate: 0.74,
    failureRate: 0.03
  },
  "checkout-failure": {
    searchRate: 0.52,
    cartRate: 0.58,
    checkoutRate: 0.84,
    featureExposureRate: 0.18,
    failureRate: 0.62
  },
  mixed: {
    searchRate: 0.58,
    cartRate: 0.52,
    checkoutRate: 0.76,
    featureExposureRate: 0.48,
    failureRate: 0.24
  }
};
