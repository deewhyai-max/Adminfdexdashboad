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
  ArrowRight,
  ShieldCheck,
  Edit3
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, User, UserProfile } from './types';
import TheForge from './components/TheForge';
import ManageShipment from './components/ManageShipment';
import AuthGateway from './components/AuthGateway';
import PendingApproval from './components/PendingApproval';
import ProfileModal from './components/ProfileModal';
import { supabase } from './lib/supabase';

const FEDEX_PURPLE = '#4D148C';
const DARK_NAVY = '#0f172a';

// --- Components ---

const StatusBadge = ({ status, isOnHold, autoAdvance }: { status: ShipmentStatus; isOnHold?: boolean; autoAdvance?: boolean }) => {
  const styles: Record<string, string> = {
    'Shipping label created': 'bg-fedex-orange text-white',
    'Package received by FedEx': 'bg-blue-500 text-white',
    'In Transit': 'bg-fedex-purple text-white',
    'On the way': 'bg-indigo-500 text-white',
    'Arriving at destination facility': 'bg-teal-500 text-white',
    'At local FedEx facility': 'bg-sky-600 text-white',
    'Out for Delivery': 'bg-sky-500 text-white',
    'On Hold': 'bg-red-500 text-white',
    'Delivered': 'bg-green-500 text-white',
    'Pending': 'bg-slate-500 text-white',
    'Exception': 'bg-orange-500 text-white',
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {isOnHold && (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-fedex-orange text-white flex items-center gap-1 shadow-sm shadow-fedex-orange/20 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-white" />
          ON HOLD
        </span>
      )}
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${styles[status] || styles.Pending}`}>
        {status}
      </span>
      {autoAdvance === false && (
        <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
          Static
        </span>
      )}
    </div>
  );
};

// --- App Entry ---

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  // Profile & Approval State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfilePromptOpen, setIsProfilePromptOpen] = useState(false);
  const [dismissProfileBanner, setDismissProfileBanner] = useState(false);

  const [savedShipments, setSavedShipments] = useState<Shipment[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isForgeOpen, setIsForgeOpen] = useState(false);
  const [forgeKey, setForgeKey] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const handleOpenForge = () => {
    try {
      localStorage.removeItem('forge_form_cache');
    } catch {}
    setForgeKey(prev => prev + 1);
    setIsForgeOpen(true);
  };

  const fetchUserProfile = async (uid: string, userEmail?: string) => {
    setIsProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      if (error) {
        if (
          error.code === 'PGRST205' || 
          error.message?.includes('does not exist') || 
          error.message?.includes('schema cache')
        ) {
          // If table doesn't exist yet, restrict by default until approved
          setProfile({
            id: uid,
            email: userEmail || '',
            is_approved: false
          });
          return;
        }
        throw error;
      }

      if (data) {
        const userProf = data as UserProfile;
        setProfile(userProf);

        // If approved, check if profile is complete
        if (userProf.is_approved) {
          const isComplete = Boolean(
            userProf.name?.trim() && 
            userProf.username?.trim() && 
            userProf.phone?.trim()
          );
          if (!isComplete) {
            setIsProfilePromptOpen(true);
          }
        }
      } else {
        // Record doesn't exist yet in profiles; auto-initialize
        const defaultUsername = (userEmail || '').split('@')[0]?.toLowerCase() || 'user';
        const { data: inserted, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: uid,
            email: userEmail || '',
            username: defaultUsername,
            is_approved: false
          })
          .select()
          .maybeSingle();

        if (insertError) {
          console.warn('Profile initialization note:', insertError);
          setProfile({
            id: uid,
            email: userEmail || '',
            username: defaultUsername,
            is_approved: false
          });
        } else if (inserted) {
          setProfile(inserted as UserProfile);
        }
      }
    } catch (err) {
      console.error('Error retrieving user profile:', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  useEffect(() => {
    // Auth Listeners & Initial Recovery
    supabase.auth.getSession().then(({ data: { session } }) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      setIsAuthReady(true);
      
      if (activeUser) {
        fetchUserProfile(activeUser.id, activeUser.email);
        fetchShipmentsForUser(activeUser.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);
      
      if (activeUser) {
        console.log("Auth System Observer:", event, "| User Authenticated. Synchronizing Cloud Ledger...");
        fetchUserProfile(activeUser.id, activeUser.email);
        fetchShipmentsForUser(activeUser.id);

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
        console.log("Auth System Observer:", event, "| Session Ended. Clearing Ledger.");
        setProfile(null);
        setSavedShipments([]);
        setSelectedShipment(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchShipmentsForUser = async (uid: string) => {
    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Shipment ledger recovery failure:', error);
    } else if (data) {
      console.log("Shipment Ledger Recovered:", data.length, "entries found.");
      setSavedShipments(data);
    }
  };

  const fetchActiveShipments = async () => {
    if (!user) return;
    fetchShipmentsForUser(user.id);
  };

  const handleLogin = (userData: any) => {
    setUser(userData);
    fetchUserProfile(userData.id, userData.email);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
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
    const q = searchQuery.toLowerCase().trim().replace(/\s+/g, '');
    const rawQ = searchQuery.toLowerCase().trim();
    if (!rawQ) return [...savedShipments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return savedShipments.filter(s => {
      const idMatch = s.id.toLowerCase().includes(q) || formatTrackingId(s.id).toLowerCase().includes(rawQ);
      const recipientMatch = s.recipient_name?.toLowerCase().includes(rawQ);
      const senderMatch = s.sender_name?.toLowerCase().includes(rawQ);
      const destMatch = s.destination_address?.toLowerCase().includes(rawQ);
      const serviceMatch = s.service_type?.toLowerCase().includes(rawQ);
      const currencyMatch = s.currency?.toLowerCase().includes(rawQ);
      return idMatch || recipientMatch || senderMatch || destMatch || serviceMatch || currencyMatch;
    }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [savedShipments, searchQuery]);

  const isProfileComplete = Boolean(
    profile?.name?.trim() && 
    profile?.username?.trim() && 
    profile?.phone?.trim()
  );

  if (!isAuthReady || (user && isProfileLoading && !profile)) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <Activity className="text-fedex-purple w-12 h-12 animate-pulse" />
        <span className="text-slate-400 text-xs font-bold tracking-widest uppercase">
          Verifying Account Permissions...
        </span>
      </div>
    );
  }

  if (!user) {
    return <AuthGateway onLogin={handleLogin} />;
  }

  // RESTRICTION CHECK:
  // If user is not approved, block them entirely from entering the website to make shipments
  if (profile && !profile.is_approved) {
    return (
      <PendingApproval
        email={user.email || ''}
        userId={user.id}
        onRefresh={() => fetchUserProfile(user.id, user.email)}
        onLogout={handleLogout}
      />
    );
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
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">No Active Shipments</p>
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
                    <StatusBadge 
                      status={shipment.status} 
                      isOnHold={shipment.is_on_hold} 
                      autoAdvance={shipment.auto_advance} 
                    />
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

        {/* User Account & Profile Footer */}
        <div className="p-4 border-t border-slate-800 space-y-3">
          <div 
            onClick={() => setIsProfileModalOpen(true)}
            className="bg-slate-950/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-3 cursor-pointer transition-all group"
            title="Click to manage profile"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 bg-fedex-purple/30 text-white rounded-xl flex items-center justify-center border border-purple-400/30 shrink-0 font-bold text-xs">
                  {(profile?.name || profile?.username || user.email || 'O')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-white text-xs font-bold truncate">
                    {profile?.name || profile?.username || 'Dispatcher'}
                  </p>
                  <p className="text-slate-400 text-[11px] truncate">{user.email}</p>
                </div>
              </div>
              <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors shrink-0" />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px]">
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Approved Dispatcher
              </span>
              <span className="text-slate-400 font-semibold group-hover:text-slate-200">
                Edit Profile
              </span>
            </div>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 py-3 rounded-xl transition-all text-xs font-bold border border-red-500/20 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
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
                FedEx <span className="text-fedex-purple">Dispatch Portal</span>
              </h2>
            </div>
          </div>

          <button 
            onClick={handleOpenForge}
            className="flex items-center gap-2 bg-fedex-purple hover:bg-purple-700 text-white px-4 md:px-6 py-2 rounded-xl font-bold text-xs transition-all active:scale-95 shadow-lg shadow-fedex-purple/20 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Shipment</span>
          </button>
        </header>

        {/* Profile Incomplete Notification Banner */}
        {!isProfileComplete && !dismissProfileBanner && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-8 py-2.5 flex items-center justify-between gap-4 text-amber-900 z-20 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs font-medium text-amber-800 truncate">
                <strong className="font-bold text-amber-900">Profile incomplete:</strong> Please add your name, username, and phone number for verified shipment records.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsProfilePromptOpen(true)}
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Complete Profile
              </button>
              <button
                onClick={() => setDismissProfileBanner(true)}
                className="text-amber-600 hover:text-amber-800 p-1 cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

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
                  <Truck className="text-slate-400 w-10 h-10" />
                </div>
                <h3 className="text-slate-900 font-bold text-lg mb-2">Ready to Dispatch</h3>
                <p className="text-slate-500 max-w-sm text-xs font-normal leading-relaxed">
                  Select an existing shipment from the history list to view tracking stages, or click "New Shipment" to create a new delivery.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      <TheForge 
        key={forgeKey}
        isOpen={isForgeOpen} 
        onClose={() => setIsForgeOpen(false)} 
        onShipmentCreated={() => {}} 
        onOptimisticCreate={handleOptimisticCreate}
        userId={user.id}
        profile={profile}
      />

      {/* Profile Management & Prompt Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen || isProfilePromptOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setIsProfilePromptOpen(false);
        }}
        profile={profile}
        userEmail={user.email || ''}
        userId={user.id}
        isPrompt={isProfilePromptOpen && !isProfileComplete}
        onProfileUpdated={(updated) => {
          setProfile(updated);
          setIsProfilePromptOpen(false);
          setIsProfileModalOpen(false);
        }}
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
