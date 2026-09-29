import { formatIDR, formatDate } from "../lib/api";
import { useStore } from "../context/StoreContext";
import { Store } from "lucide-react";

const SIZE_MAP = {
  xs: { base: "10px", head: "13px", total: "15px" },
  sm: { base: "11px", head: "15px", total: "17px" },
  md: { base: "12px", head: "17px", total: "19px" },
  lg: { base: "14px", head: "20px", total: "22px" },
};

const PAPER_WIDTH = {
  "58mm": "220px",
  "80mm": "300px",
  "a4":   "560px",
};

export default function Receipt({ tx, cashier, settings: overrideSettings, id = "rizpos-receipt", preview = false }) {
  const store = useStore();
  const s = overrideSettings || store?.settings || {};
  const size = SIZE_MAP[s.font_size || "sm"];
  const width = PAPER_WIDTH[s.paper_size || "80mm"];
  const accent = s.accent_color || "#F97316";

  const rowStyle = { display: "flex", justifyContent: "space-between", gap: "6px" };

  return (
    <div
      id={id}
      data-paper={s.paper_size || "80mm"}
      className="rizpos-receipt bg-white text-black mx-auto"
      style={{
        width,
        maxWidth: "100%",
        fontFamily: "'JetBrains Mono','Courier New',monospace",
        fontSize: size.base,
        lineHeight: 1.45,
        padding: preview ? "12px" : "0",
        color: "#000",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", borderBottom: "1px dashed #999", paddingBottom: "6px", marginBottom: "6px" }}>
        {s.show_logo !== false && (
          s.logo_url ? (
            <img src={s.logo_url} alt="logo" style={{ width: "48px", height: "48px", objectFit: "cover", margin: "0 auto 4px", borderRadius: "6px" }} />
          ) : (
            <div style={{ width: "40px", height: "40px", margin: "0 auto 4px", borderRadius: "6px", background: accent + "22", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Store style={{ width: "20px", height: "20px", color: accent }} />
            </div>
          )
        )}
        <div style={{ fontWeight: 800, fontSize: size.head, letterSpacing: "-0.02em", color: "#000" }}>{s.name || "RizPOS"}</div>
        {s.show_tagline !== false && s.tagline && <div style={{ fontSize: size.base, color: "#333" }}>{s.tagline}</div>}
        {s.show_address !== false && s.address && <div style={{ fontSize: size.base, color: "#333", whiteSpace: "pre-line" }}>{s.address}</div>}
        {s.show_contact !== false && (s.phone || s.email) && (
          <div style={{ fontSize: size.base, color: "#333" }}>
            {s.phone}{s.phone && s.email ? " · " : ""}{s.email}
          </div>
        )}
        {s.header_note && <div style={{ marginTop: "4px", fontSize: size.base }}>{s.header_note}</div>}
      </div>

      {/* Meta */}
      {(s.show_receipt_no !== false || s.show_datetime !== false || s.show_cashier !== false) && (
        <div style={{ paddingBottom: "6px", marginBottom: "6px", borderBottom: "1px dashed #999" }}>
          {s.show_receipt_no !== false && (
            <div style={rowStyle}><span>No. Struk</span><span>{tx.receipt_no}</span></div>
          )}
          {s.show_datetime !== false && (
            <div style={rowStyle}><span>Tanggal</span><span>{formatDate(tx.created_at)}</span></div>
          )}
          {s.show_cashier !== false && (
            <div style={rowStyle}><span>Kasir</span><span>{cashier || tx.cashier_name}</span></div>
          )}
          {s.show_customer !== false && tx.customer_name && (
            <div style={rowStyle}><span>Pelanggan</span><span>{tx.customer_name}</span></div>
          )}
          <div style={rowStyle}><span>Metode</span><span style={{ textTransform: "uppercase" }}>{tx.payment_method}</span></div>
        </div>
      )}

      {/* Items */}
      <div style={{ paddingBottom: "6px", marginBottom: "6px", borderBottom: "1px dashed #999" }}>
        {tx.items.map((i, idx) => (
          <div key={idx} style={{ marginBottom: "4px" }}>
            <div style={{ fontWeight: 600 }}>{i.name}</div>
            <div style={rowStyle}>
              {s.show_item_price !== false ? (
                <span>{i.quantity} × {formatIDR(i.price)}</span>
              ) : (
                <span>×{i.quantity}</span>
              )}
              <span style={{ fontWeight: 700 }}>{formatIDR(i.subtotal)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ paddingBottom: "6px", marginBottom: "6px", borderBottom: "1px dashed #999" }}>
        <div style={rowStyle}><span>Subtotal</span><span>{formatIDR(tx.subtotal)}</span></div>
        {tx.discount > 0 && <div style={rowStyle}><span>Diskon</span><span>-{formatIDR(tx.discount)}</span></div>}
        {tx.tax_amount > 0 && <div style={rowStyle}><span>Pajak ({tx.tax_rate}%)</span><span>{formatIDR(tx.tax_amount)}</span></div>}
        <div style={{ ...rowStyle, marginTop: "4px", paddingTop: "4px", borderTop: "1px solid #000", fontSize: size.total, fontWeight: 800, color: accent }}>
          <span>TOTAL</span><span>{formatIDR(tx.total)}</span>
        </div>
        <div style={rowStyle}><span>Bayar</span><span>{formatIDR(tx.amount_paid)}</span></div>
        {tx.change > 0 && <div style={rowStyle}><span>Kembalian</span><span>{formatIDR(tx.change)}</span></div>}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", fontSize: size.base, color: "#333", whiteSpace: "pre-line", marginTop: "4px" }}>
        {s.footer_note && <div style={{ marginBottom: "4px" }}>{s.footer_note}</div>}
        {s.receipt_footer || "Terima kasih atas kunjungan Anda!"}
        {s.show_powered_by !== false && (
          <div style={{ marginTop: "6px", color: "#666", fontSize: "9px" }}>Powered by RizPOS</div>
        )}
      </div>
    </div>
  );
}
