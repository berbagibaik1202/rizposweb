import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PackagePlus, Plus, Receipt, Trash2, Truck } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api, { formatIDR, formatApiError, formatDate } from "../lib/api";

const emptySupplier = { name: "", phone: "", email: "", address: "" };

export default function Purchases() {
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [openOrder, setOpenOrder] = useState(false);
  const [openSupplier, setOpenSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplier);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = () => {
    Promise.all([api.get("/suppliers"), api.get("/products"), api.get("/purchases")])
      .then(([s, p, o]) => { setSuppliers(s.data); setProducts(p.data); setPurchases(o.data); })
      .catch((e) => toast.error(formatApiError(e)));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProduct = products.find((p) => p.id === productId);
  const total = useMemo(() => items.reduce((sum, item) => sum + item.subtotal, 0), [items]);
  const outstanding = purchases.filter((p) => p.payment_status === "unpaid").reduce((sum, p) => sum + Number(p.total || 0), 0);

  const resetOrder = () => {
    setSupplierId(""); setInvoiceNo(""); setPaymentMethod("cash"); setNote(""); setItems([]);
    setProductId(""); setQuantity(1); setUnitCost(0);
  };

  const chooseProduct = (id) => {
    setProductId(id);
    const p = products.find((item) => item.id === id);
    setUnitCost(p?.cost || 0);
  };

  const addItem = () => {
    if (!selectedProduct || Number(quantity) < 1) return;
    const qty = Number(quantity);
    const cost = Number(unitCost) || 0;
    setItems((current) => {
      const found = current.find((item) => item.product_id === selectedProduct.id);
      if (found) return current.map((item) => item.product_id === selectedProduct.id
        ? { ...item, quantity: item.quantity + qty, unit_cost: cost, subtotal: (item.quantity + qty) * cost }
        : item);
      return [...current, { product_id: selectedProduct.id, name: selectedProduct.name, sku: selectedProduct.sku, unit: selectedProduct.unit, quantity: qty, unit_cost: cost, subtotal: qty * cost }];
    });
    setProductId(""); setQuantity(1); setUnitCost(0);
  };

  const saveSupplier = async () => {
    try {
      const { data } = await api.post("/suppliers", supplierForm);
      setSuppliers((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(data.id); setOpenSupplier(false); setSupplierForm(emptySupplier);
      toast.success("Supplier berhasil ditambahkan");
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const saveOrder = async () => {
    if (!supplierId || !invoiceNo.trim() || items.length === 0) {
      toast.error("Supplier, nomor faktur, dan minimal satu produk wajib diisi"); return;
    }
    setSaving(true);
    try {
      await api.post("/purchases", { supplier_id: supplierId, invoice_no: invoiceNo, items: items.map(({ product_id, quantity, unit_cost }) => ({ product_id, quantity, unit_cost })), payment_method: paymentMethod, note });
      toast.success("Pembelian tersimpan dan stok bertambah");
      setOpenOrder(false); resetOrder(); load();
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const pay = async (purchase) => {
    const method = window.prompt("Metode pelunasan: cash atau transfer", "transfer");
    if (!method || !["cash", "transfer"].includes(method.toLowerCase())) return;
    try { await api.post(`/purchases/${purchase.id}/pay`, { payment_method: method.toLowerCase() }); toast.success("Hutang supplier dilunasi"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="purchases-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-heading text-3xl font-bold">Pembelian Supplier</h1><p className="text-sm text-muted-foreground">Catat faktur pembelian, stok masuk, dan pembayaran supplier.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setOpenSupplier(true)}><Truck className="w-4 h-4 mr-2" />Supplier</Button><Button onClick={() => { resetOrder(); setOpenOrder(true); }}><Plus className="w-4 h-4 mr-2" />Order Pembelian</Button></div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4"><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Total Order</div><div className="font-mono font-bold text-2xl mt-1">{purchases.length}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Hutang Supplier</div><div className="font-mono font-bold text-2xl mt-1 text-destructive">{formatIDR(outstanding)}</div></Card><Card className="p-4"><div className="text-xs text-muted-foreground uppercase">Supplier Aktif</div><div className="font-mono font-bold text-2xl mt-1">{suppliers.length}</div></Card></div>

      <Card className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Tanggal</TableHead><TableHead>Supplier</TableHead><TableHead>Faktur</TableHead><TableHead>Total</TableHead><TableHead>Pembayaran</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader><TableBody>
        {purchases.map((p) => <TableRow key={p.id}><TableCell className="text-sm">{formatDate(p.created_at)}</TableCell><TableCell className="font-medium">{p.supplier_name}</TableCell><TableCell className="font-mono text-xs">{p.invoice_no}</TableCell><TableCell className="font-mono font-semibold">{formatIDR(p.total)}</TableCell><TableCell><Badge variant="outline">{p.payment_method === "payable" ? "Piutang" : p.payment_method === "transfer" ? "Transfer" : "Cash"}</Badge></TableCell><TableCell><Badge variant={p.payment_status === "paid" ? "default" : "destructive"}>{p.payment_status === "paid" ? "Lunas" : "Belum Lunas"}</Badge></TableCell><TableCell className="text-right">{p.payment_status !== "paid" && <Button size="sm" variant="outline" onClick={() => pay(p)}>Bayar</Button>}</TableCell></TableRow>)}
        {purchases.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">Belum ada pembelian supplier.</TableCell></TableRow>}
      </TableBody></Table></Card>

      <Dialog open={openSupplier} onOpenChange={setOpenSupplier}><DialogContent><DialogHeader><DialogTitle>Tambah Supplier</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Nama Supplier</Label><Input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></div><div className="grid grid-cols-2 gap-3"><div><Label>Telepon</Label><Input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div><div><Label>Email</Label><Input value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div></div><div><Label>Alamat</Label><Input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div><Button className="w-full" onClick={saveSupplier}>Simpan Supplier</Button></div></DialogContent></Dialog>

      <Dialog open={openOrder} onOpenChange={setOpenOrder}><DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" />Order Pembelian Supplier</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid md:grid-cols-3 gap-3"><div><Label>Supplier</Label><Select value={supplierId} onValueChange={setSupplierId}><SelectTrigger><SelectValue placeholder="Pilih supplier" /></SelectTrigger><SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Nomor Faktur</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-SUP-001" /></div><div><Label>Status Pembayaran</Label><Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="transfer">Transfer</SelectItem><SelectItem value="payable">Piutang</SelectItem></SelectContent></Select></div></div>
        <Card className="p-3 bg-muted/30"><div className="grid md:grid-cols-[1fr_100px_150px_auto] gap-2 items-end"><div><Label>Produk</Label><Select value={productId} onValueChange={chooseProduct}><SelectTrigger><SelectValue placeholder="Pilih produk" /></SelectTrigger><SelectContent>{products.filter((p) => p.active !== false).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}</SelectContent></Select></div><div><Label>Jumlah</Label><Input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div><div><Label>Harga Beli</Label><Input type="number" min="0" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></div><Button onClick={addItem}><PackagePlus className="w-4 h-4 mr-2" />Tambah</Button></div></Card>
        <div className="border rounded-lg overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Produk</TableHead><TableHead>Qty</TableHead><TableHead>Harga Beli</TableHead><TableHead>Subtotal</TableHead><TableHead /></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.product_id}><TableCell>{item.name}<div className="text-xs text-muted-foreground">{item.sku}</div></TableCell><TableCell>{item.quantity} {item.unit}</TableCell><TableCell className="font-mono">{formatIDR(item.unit_cost)}</TableCell><TableCell className="font-mono font-semibold">{formatIDR(item.subtotal)}</TableCell><TableCell><Button size="icon" variant="ghost" onClick={() => setItems(items.filter((x) => x.product_id !== item.product_id))}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell></TableRow>)}{items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Belum ada produk.</TableCell></TableRow>}</TableBody></Table></div>
        <div><Label>Keterangan</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" /></div><div className="flex items-center justify-between border-t pt-4"><span className="font-semibold">Total Pembelian</span><span className="font-mono font-bold text-xl">{formatIDR(total)}</span></div><Button className="w-full" disabled={saving} onClick={saveOrder}>{saving ? "Menyimpan..." : "Simpan Pembelian & Tambah Stok"}</Button>
      </div></DialogContent></Dialog>
    </div>
  );
}
