"use client";

import { ArrowRight, Check, Search, ShoppingBag, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { catalog, type Product } from "./catalog";
import type { RuntimeMode } from "@/lib/runtime-mode";

type CartLine = { product: Product; quantity: number };
const customerId = "CUS-9001";

function eventId(event: string) {
  return typeof crypto?.randomUUID === "function" ? crypto.randomUUID() : `PROD-${event}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function sendEvent(event: "session_started" | "product_viewed" | "search_used" | "cart_added" | "checkout_started" | "checkout_interrupted" | "checkout_recovery_used" | "checkout_completed" | "cart_persisted" | "cart_recovered", properties: Record<string, string | number | boolean | null>, runtimeMode: RuntimeMode) {
  void fetch("/api/product/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: eventId(event), event, customerId, timestamp: new Date().toISOString(), properties, sourceMode: runtimeMode === "live" ? "live" : "simulated" }) }).catch(() => undefined);
}

const cartPersistenceEnabled = true; // FEAT-0002: approved persistent cart
const focusRestorationEnabled = true;

export function ProductClient({ runtimeMode }: { runtimeMode: RuntimeMode }) {
  const checkoutRecoveryEnabled = true; // FEAT-0001: approved recovery guidance
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [complete, setComplete] = useState(false);
  const [savedCart, setSavedCart] = useState<CartLine[]>([]);
  const recoveryHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (interrupted && focusRestorationEnabled) recoveryHeadingRef.current?.focus();
  }, [interrupted]);

  useEffect(() => { sendEvent("session_started", { surface: "dailycart-product" }, runtimeMode); }, [runtimeMode]);
  useEffect(() => {
    if (!cartPersistenceEnabled) return;
    try { const stored = window.localStorage.getItem("dailycart.saved-cart"); if (stored) { const parsed = JSON.parse(stored) as CartLine[]; if (parsed.length) setSavedCart(parsed); } } catch { /* Ignore malformed local demo state. */ }
  }, []);
  useEffect(() => {
    if (!cartPersistenceEnabled || !cart.length) return;
    window.localStorage.setItem("dailycart.saved-cart", JSON.stringify(cart));
    sendEvent("cart_persisted", { itemCount: cart.reduce((sum, line) => sum + line.quantity, 0) }, runtimeMode);
  }, [cart, runtimeMode]);

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

  function interruptCheckout() {
    setInterrupted(true);
    sendEvent("checkout_interrupted", { itemCount, total: Number(total.toFixed(2)), reason: "session_timeout" }, runtimeMode);
  }

  function recoverCheckout() {
    setInterrupted(false);
    sendEvent("checkout_recovery_used", { itemCount, total: Number(total.toFixed(2)), recovery: "restore_cart" }, runtimeMode);
  }

  function completeCheckout() {
    setComplete(true);
    sendEvent("checkout_completed", { itemCount, total: Number(total.toFixed(2)) }, runtimeMode);
  }

  return <div className="product-page">
    <header className="product-header"><div className="product-brand"><span className="product-brand-mark"><ShoppingCart size={17} /></span><div><b>DailyCart</b><small>Everyday shopping, made predictable</small></div></div><div className="product-header-note">Synthetic customer product <span>{runtimeMode === "live" ? "LIVE EVENT ADAPTER CONFIGURED" : "LOCAL EVENTS"}</span></div><button className="product-cart-button" onClick={() => { if (cart.length) beginCheckout(); else setCheckout(true); }}><ShoppingBag size={18} /><span>{itemCount}</span> Cart</button></header>
    <section className="product-hero"><div><p className="eyebrow">The DailyCart market</p><h1>Good things for every day.</h1><p>Fresh essentials, simple prices, and a checkout that helps you recover when something changes.</p>{savedCart.length > 0 && <button className="button secondary saved-cart-button" onClick={() => { setCart(savedCart); setSavedCart([]); sendEvent("cart_recovered", { itemCount: savedCart.reduce((sum, line) => sum + line.quantity, 0) }, runtimeMode); }}>Resume your saved cart <ArrowRight size={14} /></button>}</div><div className="product-hero-card"><span>Recovery guidance preview · FEAT-0001</span><b>Track every customer signal</b><small>Events flow to the control tower as you browse.</small></div></section>
    <section className="product-toolbar"><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) sendEvent("search_used", { query: event.target.value }, runtimeMode); }} placeholder="Search products" /></label><div className="product-categories">{["All", "Pantry", "Fresh", "Home", "Wellness"].map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></section>
    <section className="product-grid">{visible.map((product) => <article className="product-card" key={product.id}><div className="product-art" style={{ background: product.accent }}><span>{product.category}</span>{product.badge && <b>{product.badge}</b>}<ProductIllustration productId={product.id} /></div><div className="product-card-body"><div><span className="product-category">{product.category}</span><h2>{product.name}</h2></div><strong>${product.price.toFixed(2)}</strong></div><p>{product.description}</p><button className="product-add" onClick={() => add(product)}>Add to cart <ArrowRight size={15} /></button></article>)}</section>
    {!visible.length && <div className="product-empty">No products match that search. Try “oats” or “strawberries”.</div>}
    <footer className="product-footer"><span>DailyCart product surface</span><span>{checkoutRecoveryEnabled ? "Recovery guidance" : "Baseline checkout"} · {!cartPersistenceEnabled ? "session cart" : "persistent cart"} · Customer <code>{customerId}</code> · events are linked to the delivery control tower</span></footer>
    {checkout && <div className="cart-overlay" role="dialog" aria-label="Cart"><aside className="cart-drawer"><header><div><p className="eyebrow">Your cart</p><h2>{complete ? "Order confirmed" : interrupted ? "Checkout recovered" : "Ready for checkout"}</h2></div><button className="icon-button" onClick={() => setCheckout(false)} aria-label="Close cart"><X size={19} /></button></header>{complete ? <div className="order-complete"><span><Check size={22} /></span><h3>Thanks for shopping DailyCart.</h3><p>Your order was recorded and the completion event was sent to the control tower.</p><button className="button primary" onClick={() => { setCart([]); setCheckout(false); setComplete(false); }}>Continue shopping</button></div> : interrupted && checkoutRecoveryEnabled ? <div className="recovery-panel" role="alert"><span className="recovery-panel-icon"><ArrowRight size={20} /></span><h3 tabIndex={-1} ref={recoveryHeadingRef}>Your checkout was interrupted</h3><p>Your cart is safe. Restore your checkout and continue without rebuilding your order.</p><button className="button primary" onClick={recoverCheckout}>Restore checkout <ArrowRight size={15} /></button></div> : <><div className="cart-lines">{cart.length ? cart.map((line) => <div className="cart-line" key={line.product.id}><div><b>{line.product.name}</b><small>{line.quantity} × ${line.product.price.toFixed(2)}</small></div><strong>${(line.product.price * line.quantity).toFixed(2)}</strong></div>) : <p className="cart-empty">Your cart is empty. Add an everyday essential to begin.</p>}</div>{cart.length > 0 && <><div className="cart-total"><span>Total</span><strong>${total.toFixed(2)}</strong></div>{checkoutRecoveryEnabled && <button className="button secondary checkout-button" onClick={interruptCheckout}>Simulate interruption</button>}<button className="button primary checkout-button" onClick={completeCheckout}>Checkout securely <ArrowRight size={15} /></button></>}</>}</aside></div>}
  </div>;
}

function ProductIllustration({ productId }: { productId: string }) {
  if (productId === "PROD-0004") return <svg className="product-illustration" viewBox="0 0 120 90" aria-label="Illustration of an avocado bundle"><ellipse cx="43" cy="49" rx="27" ry="34" fill="#4c8b56" transform="rotate(-25 43 49)" /><ellipse cx="73" cy="45" rx="27" ry="34" fill="#6eaa5b" transform="rotate(24 73 45)" /><ellipse cx="59" cy="63" rx="11" ry="14" fill="#a8793f" /><path d="M43 18c12-10 23-12 31-9" fill="none" stroke="#2d6740" strokeWidth="6" strokeLinecap="round" /></svg>;
  if (productId === "PROD-0003") return <svg className="product-illustration" viewBox="0 0 120 90" aria-label="Illustration of strawberries"><path d="M18 37c16-9 34-7 43 8-1 22-12 31-28 31C20 69 14 54 18 37Z" fill="#d94b5d" /><path d="M61 31c16-9 34-7 43 8-1 22-12 31-28 31C63 63 57 48 61 31Z" fill="#e35a67" /><path d="m44 31 7-12 5 12 10-6-3 13" fill="#4b8f53" /><path d="m88 25 7-12 5 12 10-6-3 13" fill="#4b8f53" /><g fill="#ffd89c"><circle cx="31" cy="49" r="2"/><circle cx="44" cy="58" r="2"/><circle cx="78" cy="44" r="2"/><circle cx="91" cy="54" r="2"/></g></svg>;
  if (productId === "PROD-0001") return <svg className="product-illustration" viewBox="0 0 120 90" aria-label="Illustration of oats"><path d="M34 23h51l-5 54H39Z" fill="#f6f0df" stroke="#9e7c54" strokeWidth="3"/><path d="M43 38h34M43 48h28" stroke="#9e7c54" strokeWidth="3" strokeLinecap="round"/><path d="M60 21c-7-15 5-18 9-3" fill="none" stroke="#6f9b58" strokeWidth="5" strokeLinecap="round"/></svg>;
  return <svg className="product-illustration" viewBox="0 0 120 90" aria-label="Illustration of a DailyCart product"><rect x="27" y="20" width="66" height="55" rx="9" fill="#fff" fillOpacity=".75" stroke="#8a79be" strokeWidth="3"/><path d="M43 42h34M43 53h22" stroke="#8a79be" strokeWidth="4" strokeLinecap="round"/><circle cx="50" cy="65" r="4" fill="#8a79be"/><circle cx="70" cy="65" r="4" fill="#8a79be"/></svg>;
}
