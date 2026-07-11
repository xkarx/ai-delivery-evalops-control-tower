"use client";

import { ArrowRight, Check, Search, ShoppingBag, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { catalog, type Product } from "./catalog";
import type { RuntimeMode } from "@/lib/runtime-mode";

type CartLine = { product: Product; quantity: number };
const customerId = "CUS-9001";

function eventId(event: string) {
  return typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `PROD-${event}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendEvent(event: "session_started" | "product_viewed" | "search_used" | "cart_added" | "checkout_started" | "checkout_completed", properties: Record<string, string | number | boolean | null>, runtimeMode: RuntimeMode) {
  void fetch("/api/product/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: eventId(event), event, customerId, timestamp: new Date().toISOString(), properties, sourceMode: runtimeMode === "live" ? "live" : "simulated" }) }).catch(() => undefined);
}

export function ProductClient({ runtimeMode }: { runtimeMode: RuntimeMode }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => { sendEvent("session_started", { surface: "dailycart-product" }, runtimeMode); }, [runtimeMode]);

  const visible = useMemo(() => catalog.filter((product) => (category === "All" || product.category === category) && `${product.name} ${product.description}`.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const total = cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0);

  function add(product: Product) {
    setCart((current) => current.some((line) => line.product.id === product.id) ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line) : [...current, { product, quantity: 1 }]);
    sendEvent("product_viewed", { productId: product.id, productName: product.name }, runtimeMode);
    sendEvent("cart_added", { productId: product.id, price: product.price }, runtimeMode);
  }

  function beginCheckout() {
    if (!cart.length) return;
    setCheckout(true);
    sendEvent("checkout_started", { itemCount, total: Number(total.toFixed(2)) }, runtimeMode);
  }

  function completeCheckout() {
    setComplete(true);
    sendEvent("checkout_completed", { itemCount, total: Number(total.toFixed(2)) }, runtimeMode);
  }

  return <div className="product-page">
    <header className="product-header"><div className="product-brand"><span className="product-brand-mark"><ShoppingCart size={17} /></span><div><b>DailyCart</b><small>Everyday shopping, made predictable</small></div></div><div className="product-header-note">{runtimeMode === "live" ? "Connected product environment" : "Synthetic product environment"} <span>{runtimeMode === "live" ? "LIVE EVENTS ON" : "LOCAL EVENTS ON"}</span></div><button className="product-cart-button" onClick={() => { if (cart.length) beginCheckout(); else setCheckout(true); }}><ShoppingBag size={18} /><span>{itemCount}</span> Cart</button></header>
    <section className="product-hero"><div><p className="eyebrow">The DailyCart market</p><h1>Good things for every day.</h1><p>Fresh essentials, simple prices, and a checkout that helps you recover when something changes.</p></div><div className="product-hero-card"><span>Built for delivery experiments</span><b>Track every customer signal</b><small>Events flow to the control tower as you browse.</small></div></section>
    <section className="product-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) sendEvent("search_used", { query: event.target.value }, runtimeMode); }} placeholder="Search products" /></label><div className="product-categories">{["All", "Pantry", "Fresh", "Home", "Wellness"].map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    <section className="product-grid">{visible.map((product) => <article className="product-card" key={product.id}><div className="product-art" style={{ background: product.accent }}><span>{product.category}</span>{product.badge && <b>{product.badge}</b>}<strong>{product.name.split(" ").map((word) => word[0]).join("")}</strong></div><div className="product-card-body"><div><span className="product-category">{product.category}</span><h2>{product.name}</h2></div><strong>${product.price.toFixed(2)}</strong></div><p>{product.description}</p><button className="product-add" onClick={() => add(product)}>Add to cart <ArrowRight size={15} /></button></article>)}</section>
    {!visible.length && <div className="product-empty">No products match that search. Try “oats” or “strawberries”.</div>}
    <footer className="product-footer"><span>DailyCart product surface</span><span>Customer <code>{customerId}</code> · events are linked to the delivery control tower</span></footer>
    {checkout && <div className="cart-overlay" role="dialog" aria-label="Cart"><aside className="cart-drawer"><header><div><p className="eyebrow">Your cart</p><h2>{complete ? "Order confirmed" : "Ready for checkout"}</h2></div><button className="icon-button" onClick={() => setCheckout(false)} aria-label="Close cart"><X size={19} /></button></header>{complete ? <div className="order-complete"><span><Check size={22} /></span><h3>Thanks for shopping DailyCart.</h3><p>Your order was recorded and the completion event was sent to the control tower.</p><button className="button primary" onClick={() => { setCart([]); setCheckout(false); setComplete(false); }}>Continue shopping</button></div> : <><div className="cart-lines">{cart.length ? cart.map((line) => <div className="cart-line" key={line.product.id}><div><b>{line.product.name}</b><small>{line.quantity} × ${line.product.price.toFixed(2)}</small></div><strong>${(line.product.price * line.quantity).toFixed(2)}</strong></div>) : <p className="cart-empty">Your cart is empty. Add an everyday essential to begin.</p>}</div>{cart.length > 0 && <><div className="cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div><button className="button primary checkout-button" onClick={completeCheckout}>Checkout securely <ArrowRight size={15} /></button></>}</>}</aside></div>}
  </div>;
}
