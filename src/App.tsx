/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Plus, 
  LogOut, 
  Package, 
  ChevronRight, 
  ShieldAlert, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Activity,
  X,
  Menu,
  Lock,
  User as UserIcon,
  Save,
  Truck,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, User } from './types';
import TheForge from './components/TheForge';
import ManageShipment from './components/ManageShipment';
import AuthGateway from './components/AuthGateway';
import { supabase } from './lib/supabase';

const FEDEX_PURPLE = '#4D148C';
const DARK_NAVY = '#0f172a';

// --- Components ---

const StatusBadge = ({ status }: { status: ShipmentStatus }) => {
  const styles: Record<string, string> = {
    'Shipping label created': 'bg-fedex-orange text-white',
    'Package received by FedEx': 'bg-blue-500 text-white',
    'In Transit': 'bg-fedex-purple text-white',
    'On the way': 'bg-indigo-500 text-white',
    'Out for Delivery': 'bg-sky-500 text-white',
    'Arriving at destination facility': 'bg-teal-500 text-white',
    'On Hold': 'bg-red-500 text-white',
    'Delivered': 'bg-green-500 text-white',
    'Pending': 'bg-slate-500 text-white',
    'Exception': 'bg-orange-500 text-white',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status] || styles.Pending}`}>
      {status}
    </span>
  );
};

// --- App Entry ---

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const [savedShipments, setSavedShipments] = useState<Shipment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isForgeOpen, setIsForgeOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  useEffect(() => {
    // Auth Listeners & Initial Recovery
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      
      if (activeUser) {
        console.log("Auth System Observer:", event, "| User Authenticated. Synchronizing Cloud Ledger...");
        const { data, error } = await supabase
          .from('shipments')
          .select('*')
          .eq('user_id', activeUser.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Post-Login Recovery Critical Failure:', error);
        } else if (data) {
          console.log("Cloud Ledger Recovered:", data.length, "entries found.");
          setSavedShipments(data);
        }

        // --- Real-time Subscription Setup ---
        const channel = supabase
          .channel('shipments_realtime')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'shipments', filter: `user_id=eq.${activeUser.id}` },
            (payload) => {
              if (payload.eventType === 'INSERT') {
                setSavedShipments(prev => {
                  if (prev.some(s => s.id === payload.new.id)) return prev;
                  return [payload.new as Shipment, ...prev];
                });
              } else if (payload.eventType === 'UPDATE') {
                const updated = payload.new as Shipment;
                setSavedShipments(prev => prev.map(s => s.id === updated.id ? updated : s));
                setSelectedShipment(prev => prev?.id === updated.id ? updated : prev);
              } else if (payload.eventType === 'DELETE') {
                setSavedShipments(prev => prev.filter(s => s.id !== payload.old.id));
                setSelectedShipment(prev => prev?.id === payload.old.id ? null : prev);
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      } else {
        console.log("Auth System Observer:", event, "| Session Terminated. Clearing Ledger.");
        setSavedShipments([]);
        setSelectedShipment(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchActiveShipments = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) console.error('Data acquisition failure:', error);
    else if (data) setSavedShipments(data);
  };

  const handleLogin = (userData: any) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleOptimisticCreate = (newShipment: Shipment) => {
    // Instant UI update
    setSavedShipments(prev => {
      const alreadyExists = prev.some(s => s.id === newShipment.id);
      if (alreadyExists) return prev;
      return [newShipment, ...prev];
    });
    // Note: Forge closure is now handled by the 'Done' action within the Forge component
  };

  const handleShipmentUpdated = (updatedShipment: Shipment) => {
    setSelectedShipment(updatedShipment);
    fetchActiveShipments(); // Ensure sidebar reflects latest status instantly
  };

  const handleSelectShipment = (shipment: Shipment) => {
    setIsForgeOpen(false);
    setSelectedShipment(shipment);
    setIsSidebarOpen(false);
  };

  const formatTrackingId = (id: string) => {
    return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  };

  const filteredShipments = useMemo(() => {
    return savedShipments.filter(s => 
      s.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.recipient_name.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [savedShipments, searchQuery]);

  if (!isAuthReady) {
    return (
      <div className="h-screen bg-slate-950 flex items-center justify-center">
        <Activity className="text-fedex-purple w-12 h-12 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return <AuthGateway onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden text-[16px]">
      {/* Mobile Drawer Backdrop */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar / Drawer */}
      <motion.aside 
        initial={false}
        animate={{ x: isSidebarOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`fixed md:static inset-y-0 left-0 w-80 bg-slate-900 flex flex-col border-r border-slate-800 z-50 md:translate-x-0 ${
          isSidebarOpen ? '' : 'md:flex'
        }`}
      >
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-fedex-purple rounded-lg flex items-center justify-center">
                <Truck className="text-white w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-black tracking-widest text-[10px] uppercase leading-none mb-1">Saved Shipments /</span>
                <span className="text-slate-500 font-bold text-[8px] uppercase tracking-widest leading-none flex items-center gap-2">
                  Shipment History
                </span>
              </div>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4" />
            <input
              type="text"
              placeholder="Search ID or Recipient..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 text-base md:text-xs pl-10 pr-4 py-3 rounded-xl focus:outline-none focus:border-fedex-purple transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {filteredShipments.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-slate-700 mx-auto mb-3 opacity-20" />
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No Active Nodes</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/30">
              {filteredShipments.map((shipment) => (
                <button
                  key={shipment.id}
                  onClick={() => handleSelectShipment(shipment)}
                  className={`w-full p-5 text-left hover:bg-slate-800/50 transition-colors group relative border-l-4 ${
                    selectedShipment?.id === shipment.id ? 'bg-slate-800/50 border-fedex-purple' : 'border-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-fedex-purple font-mono text-sm font-black tracking-widest">
                      #{formatTrackingId(shipment.id)}
                    </span>
                    <StatusBadge status={shipment.status} />
                  </div>
                  <h3 className="text-slate-200 text-base font-black uppercase tracking-wider truncate mb-2">
                    {shipment.recipient_name}
                  </h3>
                  <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5" />
                    {(() => {
                      const date = new Date(shipment.created_at);
                      const d = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                      const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                      return `${d} • ${t}`;
                    })()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 bg-slate-800 rounded-full flex items-center justify-center border border-slate-700">
                <UserIcon className="w-4 h-4 text-slate-400" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-500 text-[8px] font-black uppercase tracking-widest">Operator Session</p>
                <p className="text-slate-300 text-[10px] font-bold truncate">{user.email}</p>
              </div>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-5 rounded-[1.25rem] transition-all text-[10px] font-black uppercase tracking-[0.2em] border border-red-500/20 shadow-lg shadow-red-500/5 active:scale-[0.98]"
          >
            <LogOut className="w-4 h-4" />
            Terminate Protocol
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        <header className="h-16 border-b border-slate-200 flex items-center justify-between px-4 md:px-8 bg-white shrink-0 shadow-sm z-30">
          <div className="flex items-center gap-4 min-w-0">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="md:hidden p-2 text-slate-900"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-fedex-purple rounded-full shrink-0" />
              <h2 className="text-slate-900 font-black text-xs md:text-sm tracking-widest uppercase truncate">
                FedEx <span className="text-fedex-purple">Tower Node</span>
              </h2>
            </div>
          </div>

          <button 
            onClick={() => setIsForgeOpen(true)}
            className="flex items-center gap-2 bg-fedex-purple hover:bg-purple-700 text-white px-4 md:px-6 py-2 rounded-xl font-black text-[10px] md:text-xs transition-all active:scale-95 shadow-lg shadow-fedex-purple/20 shrink-0 uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            Initialize
          </button>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto w-full bg-slate-50/50">
          <div className="w-full h-full max-w-lg mx-auto md:max-w-none">
            {selectedShipment ? (
              <div className="p-0 h-full">
                <ManageShipment 
                  shipment={selectedShipment}
                  onClose={() => setSelectedShipment(null)}
                  onUpdate={handleShipmentUpdated}
                  onSyncComplete={() => {}}
                  userId={user.id}
                />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center">
                <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6 border border-slate-200">
                  <Activity className="text-slate-300 w-10 h-10 animate-pulse" />
                </div>
                <h3 className="text-slate-900 font-black text-lg mb-2 uppercase tracking-[0.2em]">Node Ready</h3>
                <p className="text-slate-400 max-w-xs text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                  Authentication Verified. Select a registry node from the grid or initialize a new packet.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <TheForge 
        isOpen={isForgeOpen} 
        onClose={() => setIsForgeOpen(false)} 
        onShipmentCreated={() => {}} 
        onOptimisticCreate={handleOptimisticCreate}
        userId={user.id}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 2px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
        }
      `}</style>
    </div>
  );
}
