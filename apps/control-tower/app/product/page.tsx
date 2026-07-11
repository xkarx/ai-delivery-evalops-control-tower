import Link from "next/link";
import { ProductClient } from "./product-client";
import { getRuntimeMode } from "@/lib/runtime-mode";

export default function ProductPage() {
  return <><div className="product-backlink"><Link href="/">← Back to delivery control tower</Link></div><ProductClient runtimeMode={getRuntimeMode()} /></>;
}
