import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit, Trash2, User, Phone, Mail } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import api, { formatIDR, formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const empty = { name: "", phone: "", email: "", address: "" };

export default function Customers() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [q, setQ] = useState("");

  const load = () => api.get("/customers").then((r) => setItems(r.data));
  useEffect(load, []);

  const submit = async () => {
    try {
      if (editId) await api.patch(`/customers/${editId}`, form);
      else await api.post("/customers", form);
      toast.success("Tersimpan");
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (id) => {
    if (!confirm("Hapus pelanggan?")) return;
    await api.delete(`/customers/${id}`);
    load();
  };

  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6" data-testid="customers-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Pelanggan</h1>
          <p className="text-sm text-muted-foreground">Database pelanggan & histori pembelian.</p>
        </div>
        <Button onClick={() => { setForm(empty); setEditId(null); setOpen(true); }} data-testid="add-customer"><Plus className="w-4 h-4 mr-2" />Tambah Pelanggan</Button>
      </div>

      <Input placeholder="Cari nama…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Kontak</TableHead>
              <TableHead>Kunjungan</TableHead>
              <TableHead>Total Belanja</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center">{c.name[0]?.toUpperCase()}</div>
                    <div className="font-medium">{c.name}</div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</div>}
                  {c.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</div>}
                </TableCell>
                <TableCell><Badge variant="outline" className="font-mono">{c.visits || 0}x</Badge></TableCell>
                <TableCell className="font-mono font-semibold">{formatIDR(c.total_spent || 0)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => { setForm(c); setEditId(c.id); setOpen(true); }}><Edit className="w-4 h-4" /></Button>
                  {isAdmin && <Button size="icon" variant="ghost" onClick={() => del(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">Belum ada pelanggan.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Pelanggan" : "Tambah Pelanggan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="customer-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Telepon</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Alamat</Label><Input value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <Button onClick={submit} className="w-full" data-testid="save-customer">Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
