import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Edit, Trash2, Tag } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../components/ui/dialog";
import api, { formatApiError } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const empty = { name: "", color: "#F97316", icon: "tag" };
const COLORS = ["#F97316", "#06B6D4", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#0EA5E9"];

export default function Categories() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);

  const load = () => {
    api.get("/categories").then((r) => setCats(r.data));
    api.get("/products").then((r) => setProducts(r.data));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const count = (id) => products.filter((p) => p.category_id === id).length;

  const submit = async () => {
    try {
      if (editId) await api.patch(`/categories/${editId}`, form);
      else await api.post("/categories", form);
      toast.success("Tersimpan");
      setOpen(false);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const del = async (id) => {
    if (!confirm("Hapus kategori?")) return;
    await api.delete(`/categories/${id}`);
    toast.success("Dihapus");
    load();
  };

  return (
    <div className="space-y-6" data-testid="categories-page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold">Kategori</h1>
          <p className="text-sm text-muted-foreground">Kelompokkan produk berdasarkan kategori.</p>
        </div>
        {isAdmin && <Button onClick={() => { setForm(empty); setEditId(null); setOpen(true); }} data-testid="add-category"><Plus className="w-4 h-4 mr-2" />Tambah Kategori</Button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cats.map((c) => (
          <Card key={c.id} className="p-5 group hover:shadow-lg transition-all">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.color + "20", color: c.color }}>
                <Tag className="w-5 h-5" />
              </div>
              {isAdmin && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" onClick={() => { setForm(c); setEditId(c.id); setOpen(true); }}><Edit className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(c.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              )}
            </div>
            <h3 className="font-heading font-bold text-lg mt-3">{c.name}</h3>
            <p className="text-sm text-muted-foreground">{count(c.id)} produk</p>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Kategori" : "Tambah Kategori"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nama</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="category-name" /></div>
            <div>
              <Label>Warna</Label>
              <div className="flex gap-2 mt-2">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "ring-2 ring-offset-2 ring-primary scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <Button onClick={submit} className="w-full" data-testid="save-category">Simpan</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
