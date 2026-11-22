import type { AnchorHTMLAttributes } from "react";
export default function Link(p: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...p} />;
}
