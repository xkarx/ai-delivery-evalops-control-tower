export const THEME_KEYS = [
  "checkout_recovery",
  "search_quality",
  "delivery_clarity",
  "loyalty_value",
  "accessible_shopping"
] as const;

export type ThemeKey = (typeof THEME_KEYS)[number];

export interface Theme {
  key: ThemeKey;
  label: string;
  problem: string;
  hypothesis: string;
  request: string;
  counterpoint: string;
  metric: string;
  workstream: "experience" | "reliability" | "platform";
}

export const THEMES: Record<ThemeKey, Theme> = {
  checkout_recovery: {
    key: "checkout_recovery",
    label: "Resilient checkout and cart recovery",
    problem: "Returning shoppers lose cart or checkout state after an interruption and must repeat work.",
    hypothesis: "Persisting checkout progress with clear recovery controls will improve completed purchases without increasing payment errors.",
    request: "let me resume a checkout after a timeout without rebuilding my cart",
    counterpoint: "I usually finish in one sitting, so recovery controls would add little value for me",
    metric: "checkout completion rate",
    workstream: "reliability"
  },
  search_quality: {
    key: "search_quality",
    label: "Intent-aware product discovery",
    problem: "Shoppers using descriptive or misspelled queries struggle to find relevant products quickly.",
    hypothesis: "Improved query understanding and transparent result controls will raise search-to-cart conversion.",
    request: "understand descriptive searches and common misspellings instead of returning an empty result",
    counterpoint: "I browse categories and rarely use search, so richer search would not change my routine",
    metric: "search-to-cart conversion",
    workstream: "experience"
  },
  delivery_clarity: {
    key: "delivery_clarity",
    label: "Delivery promise clarity",
    problem: "Delivery dates and fees are not sufficiently clear before checkout for time-sensitive purchases.",
    hypothesis: "Showing a trustworthy delivery promise earlier will reduce checkout abandonment and avoid expectation gaps.",
    request: "show the delivery date and full shipping cost before I start checkout",
    counterpoint: "I care more about item quality than an exact arrival estimate",
    metric: "shipping-step abandonment",
    workstream: "platform"
  },
  loyalty_value: {
    key: "loyalty_value",
    label: "Useful loyalty value",
    problem: "Repeat shoppers cannot see a clear, relevant benefit for maintaining a DailyCart relationship.",
    hypothesis: "Simple benefits based on repeat behavior will increase retention without training customers to wait for discounts.",
    request: "make repeat-purchase benefits predictable instead of sending generic coupons",
    counterpoint: "A loyalty program sounds like clutter unless prices stay competitive without it",
    metric: "90-day repeat purchase rate",
    workstream: "experience"
  },
  accessible_shopping: {
    key: "accessible_shopping",
    label: "Accessible shopping controls",
    problem: "Keyboard, screen-reader, and low-vision customers encounter inconsistent controls in key shopping flows.",
    hypothesis: "Consistent accessible controls and announcements will reduce blocked sessions and broaden successful task completion.",
    request: "make filters, cart updates, and validation messages reliable with keyboard and screen-reader navigation",
    counterpoint: "The current flow worked on my device, though I only tested a simple purchase",
    metric: "accessible task completion",
    workstream: "platform"
  }
};

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  weights: Record<ThemeKey, number>;
  checkoutCompletionProbability: number;
  searchUseProbability: number;
  ambiguityNote: string;
}

export const SCENARIOS: Record<string, ScenarioDefinition> = {
  "checkout-friction": {
    id: "checkout-friction",
    title: "Interrupted checkout pressure",
    description: "Checkout recovery signals are frequent, while several high-value customers report no issue and analytics remain directionally noisy.",
    weights: {
      checkout_recovery: 42,
      search_quality: 20,
      delivery_clarity: 17,
      loyalty_value: 11,
      accessible_shopping: 10
    },
    checkoutCompletionProbability: 0.53,
    searchUseProbability: 0.58,
    ambiguityNote: "A payment-provider retry incident inflates some abandonment reports, so frequency alone is not causal evidence."
  },
  "search-relevance": {
    id: "search-relevance",
    title: "Discovery quality pressure",
    description: "Search and discovery complaints dominate, but browser behavior and stated preferences disagree for some cohorts.",
    weights: {
      checkout_recovery: 17,
      search_quality: 43,
      delivery_clarity: 15,
      loyalty_value: 12,
      accessible_shopping: 13
    },
    checkoutCompletionProbability: 0.69,
    searchUseProbability: 0.76,
    ambiguityNote: "An acquisition campaign brought unusually broad queries, making the magnitude of long-term search demand uncertain."
  },
  "balanced-signals": {
    id: "balanced-signals",
    title: "Competing portfolio signals",
    description: "No single problem dominates, forcing prioritization across reach, severity, confidence, strategy, and feasibility.",
    weights: {
      checkout_recovery: 22,
      search_quality: 22,
      delivery_clarity: 20,
      loyalty_value: 18,
      accessible_shopping: 18
    },
    checkoutCompletionProbability: 0.63,
    searchUseProbability: 0.64,
    ambiguityNote: "Small cohort sizes and seasonal traffic make several apparent differences inconclusive."
  }
};

export const DEFAULT_SCENARIO = "checkout-friction";
export const DEFAULT_SEED = 20250301;

export function getScenario(id: string): ScenarioDefinition {
  const scenario = SCENARIOS[id];
  if (!scenario) {
    throw new Error(`Unknown scenario "${id}". Choose one of: ${Object.keys(SCENARIOS).join(", ")}`);
  }
  return scenario;
}
