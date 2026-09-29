import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Search, Package } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api, { formatIDR, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const empty = { name: "", sku: "", barcode: "", category_id: "", price: 0, cost: 0, stock: 0, unit: "pcs", image_url: "", description: "", active: true };

export default function Products() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/categories").then((r) => setCategories(r.data));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startAdd = () => { setForm(empty); setEditId(null); setOpen(true); };
  const startEdit = (p) => { setForm({ ...empty, ...p, category_id: p.category_id || "" }); setEditId(p.id); setOpen(true); };

  const submit = async () => {
    try {
      const payload = { ...form, price: +form.price, cost: +form.cost, stock: +form.stock, category_id: form.category_id || null };
      if (editId) await api.patch(`/products/${editId}`, payload);
      else await api.post("/products", payload);
      toast.success(editId ? "Produk diperbarui" : "Produk ditambahkan");
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };

  const del = async (id) => {
    if (!confirm("Hapus produk ini?")) return;
    try { await api.delete(`/products/${id}`); toast.success("Dihapus"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const filtered = products.filter((p) => !q || `${p.name} ${p.sku}`.toLowerCase().includes(q.toLowerCase()));
  const catName = (id) => categories.find((c) => c.id === id)?.name || "—";
  const catColor = (id) => categories.find((c) => c.id === id)?.color || "#94A3B8";

  return (
    <div className="space-y-6" data-testid="products-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Produk</h1>
          <p className="text-sm text-muted-foreground">Kelola katalog produk dan stok.</p>
        </div>
        {isAdmin && <Button onClick={startAdd} data-testid="add-product-button"><Plus className="w-4 h-4 mr-2" />Tambah Produk</Button>}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Cari produk…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" data-testid="products-search" />
      </div>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produk</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Kategori</TableHead>
              <TableHead>Harga</TableHead>
              <TableHead>Stok</TableHead>
              {isAdmin && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover rounded-lg" alt="" /> : <Package className="w-4 h-4 text-muted-foreground" />}
                    </div>
                    <div className="font-medium">{p.name}</div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.sku}</TableCell>
                <TableCell>
                  <Badge style={{ backgroundColor: catColor(p.category_id), color: "#fff" }}>{catName(p.category_id)}</Badge>
                </TableCell>
                <TableCell className="font-mono font-semibold">{formatIDR(p.price)}</TableCell>
                <TableCell>
                  <Badge variant={p.stock <= 5 ? "destructive" : "outline"} className="font-mono">{p.stock} {p.unit}</Badge>
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`edit-${p.sku}`}><Edit className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada produk.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Edit Produk" : "Tambah Produk"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nama Produk</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="product-name" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>SKU</Label><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="font-mono" data-testid="product-sku" /></div>
              <div><Label>Barcode</Label><Input value={form.barcode || ""} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="font-mono" data-testid="product-barcode" placeholder="EAN/UPC" /></div>
              <div>
                <Label>Kategori</Label>
                <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa Kategori</SelectItem>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Harga Jual</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="product-price" /></div>
              <div><Label>HPP</Label><Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></div>
              <div><Label>Stok</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} data-testid="product-stock" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Satuan</Label><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div><Label>URL Gambar</Label><Input value={form.image_url || ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" /></div>
            </div>
            <Button onClick={submit} className="mt-2" data-testid="save-product">{editId ? "Simpan Perubahan" : "Tambah Produk"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
