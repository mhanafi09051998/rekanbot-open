/** Pembuat elemen kecil. Teks selalu lewat textContent (tidak pernah innerHTML) agar kebal XSS. */
type Atribut = Record<string, string | boolean | ((e: Event) => void) | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Atribut = {},
  ...anak: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === "function") n.addEventListener(k.replace(/^on/, ""), v);
    else if (k === "class") n.className = String(v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const a of anak) if (a !== null && a !== undefined) n.append(a);
  return n;
}

export function $<T extends HTMLElement>(id: string): T {
  const n = document.getElementById(id);
  if (!n) throw new Error(`Elemen #${id} tidak ada`);
  return n as T;
}

export function clear(n: Node): void {
  while (n.firstChild) n.removeChild(n.firstChild);
}
