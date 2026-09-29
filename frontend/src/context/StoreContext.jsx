import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../lib/api";
import { useAuth } from "./AuthContext";

const StoreContext = createContext(null);

export const StoreProvider = ({ children }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    name: "RizPOS",
    tagline: "Point of Sale System",
    address: "",
    phone: "",
    email: "",
    logo_url: "",
    receipt_footer: "Terima kasih atas kunjungan Anda!",
  });

  const refresh = useCallback(() => {
    if (!user) return;
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <StoreContext.Provider value={{ settings, refresh, setSettings }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
