// Robust receipt printer — clones the receipt DOM into an isolated iframe
// so print output is deterministic regardless of parent dialog/modal state.

export function printReceipt(elementId = "rizpos-receipt") {
  const el = document.getElementById(elementId);
  if (!el) {
    console.error("printReceipt: element not found", elementId);
    return;
  }

  // Read paper size from data attribute (set by Receipt component)
  const paper = el.getAttribute("data-paper") || "80mm";
  const pageSize =
    paper === "58mm" ? "58mm auto" :
    paper === "a4" ? "A4" :
    "80mm auto";
  const pageMargin = paper === "a4" ? "12mm" : "3mm";
  const bodyMaxWidth = paper === "58mm" ? "58mm" : paper === "80mm" ? "80mm" : "190mm";

  // Copy over existing style sheets so Tailwind / fonts remain consistent
  const styleTags = Array.from(
    document.querySelectorAll('link[rel="stylesheet"], style')
  )
    .map((n) => n.outerHTML)
    .join("");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt</title>
${styleTags}
<style>
  @page { size: ${pageSize}; margin: ${pageMargin}; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    font-family: 'JetBrains Mono', 'Courier New', monospace;
  }
  body { max-width: ${bodyMaxWidth}; margin: 0 auto !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-shadow: none !important; }
  .rizpos-receipt {
    color: #000 !important;
    background: #fff !important;
    padding: 4mm 3mm !important;
  }
  .rizpos-receipt .text-muted-foreground,
  .rizpos-receipt .text-foreground { color: #000 !important; }
  .rizpos-receipt img { max-width: 100%; }
  .no-print { display: none !important; }
</style>
</head>
<body>${el.outerHTML}</body>
</html>`);
  doc.close();

  const cleanup = () => {
    try { document.body.removeChild(iframe); } catch (e) { /* ignore */ }
  };

  const trigger = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error("print error", e);
    }
    setTimeout(cleanup, 1500);
  };

  // Wait for images/fonts to load
  if (iframe.contentDocument.readyState === "complete") {
    setTimeout(trigger, 250);
  } else {
    iframe.onload = () => setTimeout(trigger, 250);
  }
}
