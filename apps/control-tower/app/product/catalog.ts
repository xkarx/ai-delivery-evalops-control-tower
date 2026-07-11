export type Product = {
  id: string;
  name: string;
  description: string;
  category: "Pantry" | "Fresh" | "Home" | "Wellness";
  price: number;
  accent: string;
  badge?: string;
};

export const catalog: Product[] = [
  { id: "PROD-0001", name: "Everyday oats", description: "Whole-grain oats for quick, reliable breakfasts.", category: "Pantry", price: 6.49, accent: "#e8d8b8", badge: "Bestseller" },
  { id: "PROD-0002", name: "Citrus sparkling water", description: "A bright twelve-pack with no added sugar.", category: "Pantry", price: 8.99, accent: "#f6d46f" },
  { id: "PROD-0003", name: "Market strawberries", description: "Sweet seasonal berries, packed for the week.", category: "Fresh", price: 5.79, accent: "#ef9c9c", badge: "Fresh today" },
  { id: "PROD-0004", name: "Avocado bundle", description: "Six ready-to-ripen avocados for the whole household.", category: "Fresh", price: 7.25, accent: "#b7cf9b" },
  { id: "PROD-0005", name: "Linen kitchen towels", description: "Soft, durable towels in a neutral two-pack.", category: "Home", price: 14.0, accent: "#bfd2e6" },
  { id: "PROD-0006", name: "Cedar storage set", description: "Stackable containers that make pantry space predictable.", category: "Home", price: 22.5, accent: "#cfa98c" },
  { id: "PROD-0007", name: "Daily multivitamin", description: "A simple thirty-day wellness routine.", category: "Wellness", price: 12.99, accent: "#c4b5e8" },
  { id: "PROD-0008", name: "Lavender hand wash", description: "Gentle plant-based soap for everyday use.", category: "Wellness", price: 9.5, accent: "#d8b8d9" }
];
