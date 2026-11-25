import { el } from "./dom.ts";

/** Penyaji markdown kecil dan aman: membangun DOM, hanya tautan http(s), tanpa HTML mentah. */
function inline(teks: string): Node[] {
  const out: Node[] = [];
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let akhir = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(teks))) {
    if (m.index > akhir) out.push(document.createTextNode(teks.slice(akhir, m.index)));
    const t = m[0];
    if (m[1]) out.push(el("code", {}, t.slice(1, -1)));
    else if (m[2]) out.push(el("strong", {}, t.slice(2, -2)));
    else {
      const [, label, url] = /^\[([^\]]+)\]\((.+)\)$/.exec(t)!;
      out.push(el("a", { href: url!, target: "_blank", rel: "noopener noreferrer" }, label));
    }
    akhir = m.index + t.length;
  }
  if (akhir < teks.length) out.push(document.createTextNode(teks.slice(akhir)));
  return out;
}

export function renderMarkdown(src: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const baris = src.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < baris.length) {
    const b = baris[i]!;
    const kode = /^```(\w*)/.exec(b);
    if (kode) {
      const isi: string[] = [];
      i++;
      while (i < baris.length && !baris[i]!.startsWith("```")) isi.push(baris[i++]!);
      i++;
      frag.append(el("pre", {}, el("code", {}, isi.join("\n"))));
    } else if (/^#{1,4}\s/.test(b)) {
      frag.append(el("p", { class: "md-h" }, ...inline(b.replace(/^#+\s/, ""))));
      i++;
    } else if (/^\s*([-*]|\d+\.)\s/.test(b)) {
      const urut = /^\s*\d+\./.test(b);
      const list = el(urut ? "ol" : "ul");
      while (i < baris.length && /^\s*([-*]|\d+\.)\s/.test(baris[i]!)) {
        list.append(el("li", {}, ...inline(baris[i]!.replace(/^\s*([-*]|\d+\.)\s/, ""))));
        i++;
      }
      frag.append(list);
    } else if (!b.trim()) i++;
    else {
      const para: string[] = [];
      while (i < baris.length && baris[i]!.trim() && !/^(```|#{1,4}\s|\s*([-*]|\d+\.)\s)/.test(baris[i]!)) para.push(baris[i++]!);
      const p = el("p");
      para.forEach((l, k) => {
        if (k) p.append(el("br"));
        p.append(...inline(l));
      });
      frag.append(p);
    }
  }
  return frag;
}
