import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Save, Store, Palette, Printer, Eye, CreditCard, Wallet, QrCode, Building2,
  Plus, Trash2, GripVertical, Monitor,
} from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Switch } from "../components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import api, { formatApiError } from "../lib/api";
import Receipt from "../components/Receipt";
import { printReceipt } from "../lib/printReceipt";
import { useStore } from "../context/StoreContext";

const SAMPLE_TX = {
  receipt_no: "RZP-20260929-A1B2C3",
  created_at: new Date().toISOString(),
  cashier_name: "Owner",
  customer_name: "Budi Santoso",
  payment_method: "qris",
  items: [
    { name: "Kopi Susu Gula Aren", quantity: 2, price: 22000, subtotal: 44000 },
    { name: "Croissant Coklat", quantity: 1, price: 18000, subtotal: 18000 },
    { name: "Es Teh Manis", quantity: 3, price: 8000, subtotal: 24000 },
  ],
  subtotal: 86000,
  discount: 5000,
  tax_rate: 11,
  tax_amount: 8910,
  total: 89910,
  amount_paid: 100000,
  change: 10091,
};

const ACCENT_COLORS = ["#F97316", "#EA580C", "#10B981", "#06B6D4", "#8B5CF6", "#EC4899", "#0F172A"];

const ICONS = { wallet: Wallet, "credit-card": CreditCard, "qr-code": QrCode, building: Building2 };

const TRIPAY_CHANNELS = [
  { code: "QRIS", label: "QRIS" },
  { code: "BRIVA", label: "BRI Virtual Account" },
  { code: "BNIVA", label: "BNI Virtual Account" },
  { code: "BCAVA", label: "BCA Virtual Account" },
  { code: "MANDIRIVA", label: "Mandiri Virtual Account" },
  { code: "PERMATAVA", label: "Permata Virtual Account" },
  { code: "MUAMALATVA", label: "Muamalat Virtual Account" },
  { code: "OVO", label: "OVO" },
  { code: "DANA", label: "DANA" },
  { code: "SHOPEEPAY", label: "ShopeePay" },
  { code: "OTHERBANKVA", label: "Bank Lain (Virtual Account)" },
  { code: "ALFAMART", label: "Alfamart Retail" },
  { code: "INDOMARET", label: "Indomaret Retail" },
];

const KIND_OPTIONS = [
  { v: "cash", l: "Tunai (di Kasir)" },
  { v: "card", l: "Kartu / EDC (manual)" },
  { v: "qris_static", l: "QRIS Statis (di Kasir)" },
  { v: "tripay", l: "Tripay — pilih channel" },
  { v: "midtrans", l: "Midtrans Snap (semua metode)" },
];

const ICON_OPTIONS = [
  { v: "wallet", l: "Wallet" },
  { v: "credit-card", l: "Kartu" },
  { v: "qr-code", l: "QR" },
  { v: "building", l: "Bank/Gedung" },
];

export default function Settings() {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pmEditor, setPmEditor] = useState(null); // {index, method}
  const store = useStore();

  useEffect(() => { api.get("/settings").then((r) => setForm(r.data)); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings", form);
      store?.refresh?.();
      toast.success("Pengaturan disimpan");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setBusy(false); }
  };

  const upd = (patch) => setForm((f) => ({ ...f, ...patch }));

  const upsertMethod = (m, idx = null) => {
    setForm((f) => {
      const arr = [...(f.payment_methods || [])];
      if (idx === null) arr.push(m);
      else arr[idx] = m;
      arr.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      return { ...f, payment_methods: arr };
    });
    setPmEditor(null);
  };
  const deleteMethod = (idx) => setForm((f) => ({ ...f, payment_methods: f.payment_methods.filter((_, i) => i !== idx) }));
  const toggleMethod = (idx, on) => setForm((f) => ({ ...f, payment_methods: f.payment_methods.map((m, i) => i === idx ? { ...m, enabled: on } : m) }));

  if (!form) return null;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-3xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Identitas toko, desain struk, metode bayar, dan tampilan layar pelanggan.</p>
      </div>

      <Tabs defaultValue="store" className="space-y-6">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="store" data-testid="tab-store"><Store className="w-4 h-4 mr-2" />Toko</TabsTrigger>
          <TabsTrigger value="receipt" data-testid="tab-receipt"><Printer className="w-4 h-4 mr-2" />Desain Struk</TabsTrigger>
          <TabsTrigger value="payments" data-testid="tab-payments"><CreditCard className="w-4 h-4 mr-2" />Metode Bayar</TabsTrigger>
          <TabsTrigger value="display" data-testid="tab-display"><Monitor className="w-4 h-4 mr-2" />Layar Pelanggan</TabsTrigger>
        </TabsList>

        {/* ---------- Store ---------- */}
        <TabsContent value="store">
          <Card className="p-6 space-y-5 max-w-3xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden">
                {form.logo_url ? <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" /> : <Store className="w-7 h-7 text-primary" />}
              </div>
              <div className="flex-1">
                <Label>URL Logo</Label>
                <Input value={form.logo_url || ""} onChange={(e) => upd({ logo_url: e.target.value })} placeholder="https://…/logo.png" className="mt-1" data-testid="settings-logo" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Nama Toko</Label><Input value={form.name || ""} onChange={(e) => upd({ name: e.target.value })} className="mt-1" data-testid="settings-name" /></div>
              <div><Label>Tagline</Label><Input value={form.tagline || ""} onChange={(e) => upd({ tagline: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label>Alamat</Label><Textarea rows={2} value={form.address || ""} onChange={(e) => upd({ address: e.target.value })} className="mt-1" data-testid="settings-address" /></div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><Label>Telepon</Label><Input value={form.phone || ""} onChange={(e) => upd({ phone: e.target.value })} className="mt-1" data-testid="settings-phone" /></div>
              <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => upd({ email: e.target.value })} className="mt-1" /></div>
            </div>
            <Button onClick={save} disabled={busy} data-testid="save-settings-store"><Save className="w-4 h-4 mr-2" />{busy ? "Menyimpan…" : "Simpan"}</Button>
          </Card>
        </TabsContent>

        {/* ---------- Receipt Design ---------- */}
        <TabsContent value="receipt">
          <div className="grid lg:grid-cols-5 gap-6">
            <Card className="p-6 space-y-5 lg:col-span-3">
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <Label>Ukuran Kertas</Label>
                  <Select value={form.paper_size || "80mm"} onValueChange={(v) => upd({ paper_size: v })}>
                    <SelectTrigger className="mt-1" data-testid="paper-size"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm">58 mm (Thermal Kecil)</SelectItem>
                      <SelectItem value="80mm">80 mm (Thermal Standar)</SelectItem>
                      <SelectItem value="a4">A4 (Full Paper)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ukuran Font</Label>
                  <Select value={form.font_size || "sm"} onValueChange={(v) => upd({ font_size: v })}>
                    <SelectTrigger className="mt-1" data-testid="font-size"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="xs">Extra Kecil</SelectItem><SelectItem value="sm">Kecil</SelectItem>
                      <SelectItem value="md">Sedang</SelectItem><SelectItem value="lg">Besar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Gaya</Label>
                  <Select value={form.receipt_style || "detailed"} onValueChange={(v) => upd({ receipt_style: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="detailed">Detail</SelectItem><SelectItem value="compact">Ringkas</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-2"><Palette className="w-4 h-4" />Warna Aksen (Total)</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ACCENT_COLORS.map((c) => (
                    <button key={c} onClick={() => upd({ accent_color: c })} className={`w-9 h-9 rounded-full border-2 transition-all ${form.accent_color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
                  ))}
                  <Input value={form.accent_color || ""} onChange={(e) => upd({ accent_color: e.target.value })} className="w-32 h-9 font-mono text-xs" placeholder="#RRGGBB" />
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-primary font-semibold mb-2">Tampilkan Elemen</div>
                <div className="grid sm:grid-cols-2 gap-2">
                  {[
                    ["show_logo", "Logo"], ["show_tagline", "Tagline"], ["show_address", "Alamat"],
                    ["show_contact", "Telepon/Email"], ["show_receipt_no", "No. Struk"], ["show_datetime", "Tanggal"],
                    ["show_cashier", "Nama Kasir"], ["show_customer", "Nama Pelanggan"],
                    ["show_item_price", "Harga per Unit"], ["show_powered_by", '"Powered by RizPOS"'],
                  ].map(([k, l]) => (
                    <label key={k} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-secondary/50 cursor-pointer">
                      <span className="text-sm">{l}</span>
                      <Switch checked={form[k] !== false} onCheckedChange={(v) => upd({ [k]: v })} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><Label>Catatan Header</Label><Input value={form.header_note || ""} onChange={(e) => upd({ header_note: e.target.value })} className="mt-1" /></div>
                <div><Label>Catatan Footer</Label><Input value={form.footer_note || ""} onChange={(e) => upd({ footer_note: e.target.value })} className="mt-1" /></div>
              </div>
              <div><Label>Ucapan Terima Kasih</Label><Textarea rows={2} value={form.receipt_footer || ""} onChange={(e) => upd({ receipt_footer: e.target.value })} className="mt-1" /></div>
              <div className="flex gap-2 pt-2 border-t">
                <Button onClick={save} disabled={busy} data-testid="save-settings"><Save className="w-4 h-4 mr-2" />{busy ? "Menyimpan…" : "Simpan"}</Button>
                <Button onClick={() => printReceipt("rizpos-receipt-preview")} variant="outline" data-testid="test-print"><Printer className="w-4 h-4 mr-2" />Uji Cetak</Button>
              </div>
            </Card>
            <Card className="p-4 lg:col-span-2 lg:sticky lg:top-4 h-fit">
              <div className="flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-primary" /><h3 className="font-heading font-bold">Preview</h3></div>
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-4 overflow-auto max-h-[70vh] flex justify-center">
                <Receipt tx={SAMPLE_TX} cashier="Owner" settings={form} id="rizpos-receipt-preview" preview />
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- Payment Methods ---------- */}
        <TabsContent value="payments">
          <Card className="p-6 max-w-4xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-heading font-bold text-lg">Metode Pembayaran</h3>
                <p className="text-sm text-muted-foreground mt-1">Atur metode yang tampil di kasir & layar pelanggan. Kasir/pelanggan tidak lagi memilih provider — hanya metode akhir.</p>
              </div>
              <Button onClick={() => setPmEditor({ index: null, method: { id: "", label: "", kind: "tripay", channel: "QRIS", icon: "qr-code", color: "#EA580C", enabled: true, sort: (form.payment_methods?.length || 0) + 1 } })} data-testid="add-payment-method">
                <Plus className="w-4 h-4 mr-2" />Tambah Metode
              </Button>
            </div>
            <div className="space-y-2">
              {(form.payment_methods || []).map((m, idx) => {
                const Icon = ICONS[m.icon] || Wallet;
                return (
                  <div key={m.id + idx} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-secondary/30 transition-colors">
                    <GripVertical className="w-4 h-4 text-muted-foreground" />
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: m.color + "22", color: m.color }}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {m.kind}{m.channel ? ` · ${m.channel}` : ""} · #{m.id}
                      </div>
                    </div>
                    <Badge variant={m.enabled ? "default" : "outline"} className="text-xs">
                      {m.enabled ? "Aktif" : "Nonaktif"}
                    </Badge>
                    <Switch checked={m.enabled} onCheckedChange={(v) => toggleMethod(idx, v)} data-testid={`toggle-pm-${m.id}`} />
                    <Button size="sm" variant="ghost" onClick={() => setPmEditor({ index: idx, method: { ...m } })} data-testid={`edit-pm-${m.id}`}>Edit</Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMethod(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                );
              })}
              {(!form.payment_methods || form.payment_methods.length === 0) && (
                <div className="text-center py-8 text-muted-foreground text-sm">Belum ada metode pembayaran.</div>
              )}
            </div>
            <div className="pt-4 mt-4 border-t flex gap-2">
              <Button onClick={save} disabled={busy} data-testid="save-payment-methods"><Save className="w-4 h-4 mr-2" />Simpan Metode</Button>
            </div>
          </Card>

          <PaymentMethodEditor
            open={!!pmEditor}
            initial={pmEditor?.method}
            index={pmEditor?.index}
            onClose={() => setPmEditor(null)}
            onSave={upsertMethod}
          />
        </TabsContent>

        {/* ---------- Customer Display ---------- */}
        <TabsContent value="display">
          <div className="grid lg:grid-cols-5 gap-6">
            <Card className="p-6 space-y-5 lg:col-span-3">
              <div>
                <Label>Sapaan Layar</Label>
                <Input value={form.display_welcome || ""} onChange={(e) => upd({ display_welcome: e.target.value })} className="mt-1" placeholder="Selamat Datang" data-testid="display-welcome" />
              </div>
              <ColorInput label="Warna Latar (Background)" value={form.display_bg_color} onChange={(v) => upd({ display_bg_color: v })} testId="color-bg" />
              <ColorInput label="Warna Aksen (Total, Highlight)" value={form.display_accent_color} onChange={(v) => upd({ display_accent_color: v })} testId="color-accent" />
              <ColorInput label="Warna Kartu (Card/Panel)" value={form.display_card_color} onChange={(v) => upd({ display_card_color: v })} testId="color-card" />
              <ColorInput label="Warna Teks" value={form.display_text_color} onChange={(v) => upd({ display_text_color: v })} testId="color-text" />

              <Button onClick={save} disabled={busy} data-testid="save-display"><Save className="w-4 h-4 mr-2" />{busy ? "Menyimpan…" : "Simpan"}</Button>
            </Card>

            {/* Live preview mini */}
            <Card className="p-4 lg:col-span-2 lg:sticky lg:top-4 h-fit overflow-hidden">
              <div className="flex items-center gap-2 mb-3"><Eye className="w-4 h-4 text-primary" /><h3 className="font-heading font-bold">Preview Layar</h3></div>
              <div className="rounded-xl overflow-hidden aspect-[9/16] sm:aspect-[3/4] flex flex-col"
                style={{ backgroundColor: form.display_bg_color, color: form.display_text_color }}>
                <div className="p-3 flex items-center gap-2 border-b" style={{ borderColor: form.display_text_color + "22" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: form.display_accent_color + "33" }}>
                    <Store className="w-4 h-4" style={{ color: form.display_accent_color }} />
                  </div>
                  <div className="font-heading font-bold text-sm">{form.name || "RizPOS"}</div>
                </div>
                <div className="flex-1 p-3 space-y-2 text-xs">
                  <div className="rounded-lg p-3" style={{ backgroundColor: form.display_card_color }}>
                    <div className="opacity-60 text-[10px] uppercase">Total</div>
                    <div className="font-mono font-extrabold text-2xl mt-1" style={{ color: form.display_accent_color }}>Rp 89.910</div>
                  </div>
                  {(form.payment_methods || []).filter((m) => m.enabled).slice(0, 3).map((m) => {
                    const Icon = ICONS[m.icon] || Wallet;
                    return (
                      <div key={m.id} className="rounded-lg p-2 flex items-center gap-2" style={{ backgroundColor: form.display_card_color }}>
                        <div className="w-7 h-7 rounded flex items-center justify-center" style={{ backgroundColor: m.color + "33", color: m.color }}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs">{m.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ColorInput({ label, value, onChange, testId }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-2">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-10 w-14 rounded border cursor-pointer" data-testid={testId} />
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="font-mono" placeholder="#RRGGBB" />
      </div>
    </div>
  );
}

function PaymentMethodEditor({ open, initial, index, onClose, onSave }) {
  const [m, setM] = useState(initial);
  useEffect(() => { setM(initial); }, [initial]);
  if (!m) return null;
  const setF = (patch) => setM((v) => ({ ...v, ...patch }));

  const submit = () => {
    if (!m.label?.trim()) return;
    let id = (m.id || "").trim();
    if (!id) id = m.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20) + "_" + m.kind;
    onSave({ ...m, id, sort: Number(m.sort) || 0 }, index);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{index === null ? "Tambah Metode" : "Edit Metode"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Nama Tampil</Label><Input value={m.label} onChange={(e) => setF({ label: e.target.value })} placeholder="Contoh: QRIS" className="mt-1" data-testid="pm-label" /></div>
            <div><Label>Urutan</Label><Input type="number" value={m.sort || 0} onChange={(e) => setF({ sort: e.target.value })} className="mt-1" /></div>
          </div>
          <div>
            <Label>Jenis</Label>
            <Select value={m.kind} onValueChange={(v) => setF({ kind: v, channel: v === "tripay" ? (m.channel || "QRIS") : null })}>
              <SelectTrigger className="mt-1" data-testid="pm-kind"><SelectValue /></SelectTrigger>
              <SelectContent>{KIND_OPTIONS.map((k) => <SelectItem key={k.v} value={k.v}>{k.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {m.kind === "tripay" && (
            <div>
              <Label>Channel Tripay</Label>
              <Select value={m.channel || "QRIS"} onValueChange={(v) => setF({ channel: v })}>
                <SelectTrigger className="mt-1" data-testid="pm-channel"><SelectValue /></SelectTrigger>
                <SelectContent>{TRIPAY_CHANNELS.map((c) => <SelectItem key={c.code} value={c.code}>{c.label} ({c.code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ikon</Label>
              <Select value={m.icon || "wallet"} onValueChange={(v) => setF({ icon: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ICON_OPTIONS.map((k) => <SelectItem key={k.v} value={k.v}>{k.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Warna</Label>
              <div className="mt-1 flex gap-2">
                <input type="color" value={m.color || "#F97316"} onChange={(e) => setF({ color: e.target.value })} className="h-10 w-12 rounded border cursor-pointer" />
                <Input value={m.color || ""} onChange={(e) => setF({ color: e.target.value })} className="font-mono" />
              </div>
            </div>
          </div>
          <label className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span className="text-sm">Aktifkan</span>
            <Switch checked={m.enabled !== false} onCheckedChange={(v) => setF({ enabled: v })} />
          </label>
          <Button onClick={submit} className="w-full" data-testid="save-pm">Simpan Metode</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
