import { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Search, Clock, MapPin, Building2, User, LogOut, Shield, Plus, RefreshCw, CheckCircle, XCircle, Lock, ArrowUpDown, Settings, Mail, MessageSquare, Eye, Trash2, ExternalLink } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./components/ui/dialog";
import { Label } from "./components/ui/label";
import { Badge } from "./components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./components/ui/dropdown-menu";
import { Switch } from "./components/ui/switch";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// NHS Logo SVG Component
const NHSLogo = ({ className = "" }) => (
  <div className={`bg-[#005EB8] rounded px-3 py-1 flex items-center justify-center ${className}`}>
    <span className="text-white font-bold text-lg tracking-tight" style={{ fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif" }}>
      NHS
    </span>
  </div>
);

// PayPal Subscribe Button Component
const PayPalSubscribeButton = ({ clientId, planId, onSuccess }) => {
  const containerRef = useState(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [paypalError, setPaypalError] = useState(false);
  const btnContainerId = "paypal-subscribe-btn";

  useEffect(() => {
    if (!clientId || !planId) return;

    // Check if script already loaded
    const existingScript = document.querySelector(`script[src*="paypal.com/sdk/js"]`);
    if (existingScript) {
      existingScript.remove();
      if (window.paypal) delete window.paypal;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription`;
    script.setAttribute("data-sdk-integration-source", "button-factory");
    script.async = true;
    script.onload = () => setSdkReady(true);
    script.onerror = () => setPaypalError(true);
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [clientId, planId]);

  useEffect(() => {
    if (!sdkReady || !window.paypal || !planId) return;

    const container = document.getElementById(btnContainerId);
    if (!container) return;
    container.innerHTML = "";

    try {
      window.paypal.Buttons({
        style: { shape: "rect", color: "gold", layout: "vertical", label: "paypal" },
        createSubscription: function (data, actions) {
          return actions.subscription.create({ plan_id: planId });
        },
        onApprove: function (data) {
          if (onSuccess) onSuccess(data.subscriptionID);
        },
        onError: function (err) {
          console.error("PayPal error:", err);
          setPaypalError(true);
        }
      }).render(`#${btnContainerId}`);
    } catch (e) {
      console.error("PayPal render error:", e);
      setPaypalError(true);
    }
  }, [sdkReady, planId, onSuccess]);

  if (paypalError) {
    return <p className="text-sm text-red-500">PayPal failed to load. Please try again later.</p>;
  }

  return (
    <div>
      <div id={btnContainerId} style={{ minHeight: 50, maxWidth: 300 }} />
      {!sdkReady && <p className="text-xs text-slate-400 mt-1">Loading payment...</p>}
    </div>
  );
};

// Auth Context
const AuthContext = createContext(null);

// Contact Dialog Component
const ContactDialog = ({ open, onOpenChange }) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!name || !email || !message) {
      toast.error("Please fill in all fields");
      return;
    }
    
    setSending(true);
    try {
      await axios.post(`${API}/contact`, { name, email, message });
      toast.success("Message sent! We'll get back to you soon.");
      onOpenChange(false);
      setName("");
      setEmail("");
      setMessage("");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to send message. Please try again.");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Contact Support</DialogTitle>
          <DialogDescription>
            Having issues with payment or your account? Send us a message and we'll get back to you.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="contact-name">Your Name</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              className="mt-2"
              data-testid="contact-name-input"
            />
          </div>
          <div>
            <Label htmlFor="contact-email">Your Email</Label>
            <Input
              id="contact-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="mt-2"
              data-testid="contact-email-input"
            />
          </div>
          <div>
            <Label htmlFor="contact-message">Message</Label>
            <textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue..."
              className="mt-2 w-full min-h-[100px] px-3 py-2 border border-slate-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#005EB8] focus:border-transparent"
              data-testid="contact-message-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            className="bg-[#005EB8] hover:bg-[#004C97]"
            onClick={handleSubmit}
            disabled={sending}
            data-testid="send-contact-button"
          >
            {sending ? "Sending..." : "Send Message"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Footer Component
const Footer = () => {
  const [contactOpen, setContactOpen] = useState(false);
  
  return (
    <>
      <footer className="bg-[#0A1128] text-white py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <NHSLogo className="h-6" />
              <span className="text-sm text-slate-300">UK Wait Times Tracker</span>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setContactOpen(true)}
                className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                data-testid="contact-support-button"
              >
                <Mail className="w-4 h-4" />
                <span className="text-sm">Contact Support</span>
              </button>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-slate-700 text-center">
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} WaitTimes.uk. Wait time data sourced from user reports and WaitSmart.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              For payment issues or account help, please{" "}
              <button onClick={() => setContactOpen(true)} className="underline hover:text-slate-300">
                contact us
              </button>.
            </p>
          </div>
        </div>
      </footer>
      <ContactDialog open={contactOpen} onOpenChange={setContactOpen} />
    </>
  );
};

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("ae_token"));
  const [siteSettings, setSiteSettings] = useState({ price: "0.99", paypal_client_id: "", paypal_plan_id: "" });

  useEffect(() => {
    // Load site settings on mount
    axios.get(`${API}/settings`).then(res => setSiteSettings(res.data)).catch(() => {});
    if (token) {
      axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchUser = async () => {
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem("ae_token");
      setToken(null);
      delete axios.defaults.headers.common["Authorization"];
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    const response = await axios.post(`${API}/auth/login`, { email, password });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("ae_token", access_token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password, paymentId = null) => {
    const response = await axios.post(`${API}/auth/register`, {
      name,
      email,
      password,
      payment_id: paymentId,
    });
    const { access_token, user: userData } = response.data;
    localStorage.setItem("ae_token", access_token);
    axios.defaults.headers.common["Authorization"] = `Bearer ${access_token}`;
    setToken(access_token);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("ae_token");
    delete axios.defaults.headers.common["Authorization"];
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  const refreshSettings = async () => {
    try {
      const res = await axios.get(`${API}/settings`);
      setSiteSettings(res.data);
    } catch (e) {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, siteSettings, refreshSettings }}>
      {children}
    </AuthContext.Provider>
  );
};

// Header Component
const Header = () => {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maskNameSetting, setMaskNameSetting] = useState(user?.mask_name ?? true);

  useEffect(() => {
    if (user) {
      setMaskNameSetting(user.mask_name ?? true);
    }
  }, [user]);

  const updateMaskNameSetting = async (value) => {
    setMaskNameSetting(value);
    try {
      await axios.patch(`${API}/auth/profile`, { mask_name: value });
      await refreshUser();
      toast.success(value ? "Your name will be masked" : "Your name will be shown");
    } catch (error) {
      toast.error("Failed to update settings");
      setMaskNameSetting(!value);
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-xl border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => navigate("/")}
            data-testid="header-logo"
          >
            <NHSLogo className="h-8 w-auto" />
            <span className="font-bold text-xl text-[#0A1128] hidden sm:inline" style={{ fontFamily: "'Manrope', sans-serif" }}>
              A&E Wait Times
            </span>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2" data-testid="user-menu-button">
                      <User className="w-4 h-4" />
                      <span className="hidden sm:inline">{user.name}</span>
                      {user.is_admin && <Badge variant="secondary" className="ml-1">Admin</Badge>}
                      {user.is_paid && !user.is_admin && <Badge className="ml-1 bg-[#007F3B]">Paid</Badge>}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setSettingsOpen(true)} data-testid="settings-menu-item">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </DropdownMenuItem>
                    {user.is_admin && (
                      <DropdownMenuItem onClick={() => navigate("/admin")} data-testid="admin-menu-item">
                        <Shield className="w-4 h-4 mr-2" />
                        Admin Dashboard
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={logout} data-testid="logout-menu-item">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Settings Dialog */}
                <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Settings</DialogTitle>
                      <DialogDescription>
                        Manage your profile preferences
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="mask-name" className="text-base font-medium">Mask my name</Label>
                          <p className="text-sm text-slate-500 mt-1">
                            When enabled, your name will appear as "{user?.name ? (user.name.split(' ')[0]?.slice(0,4) + '* **' + (user.name.split(' ')[1]?.slice(-3) || '***')) : 'Harr* **les'}" instead of "{user?.name || 'Harry Miles'}"
                          </p>
                        </div>
                        <Switch
                          id="mask-name"
                          checked={maskNameSetting}
                          onCheckedChange={updateMaskNameSetting}
                          data-testid="mask-name-switch"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setSettingsOpen(false)}>
                        Done
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : (
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/login")}
                  data-testid="login-button"
                >
                  Login
                </Button>
                <Button 
                  className="bg-[#005EB8] hover:bg-[#004C97]"
                  onClick={() => navigate("/register")}
                  data-testid="register-button"
                >
                  Sign Up Free
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

// Wait Time Badge Component
const WaitTimeBadge = ({ minutes, blurred = false }) => {
  if (minutes === null || minutes === undefined) {
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-bold bg-slate-100 text-slate-500 border border-slate-200 ${blurred ? 'wait-time-blur' : ''}`}>
        No data
      </span>
    );
  }

  let colorClasses = "";
  if (minutes <= 60) {
    // Green: up to 1 hour
    colorClasses = "bg-[#E5F2E8] text-[#007F3B] border-[#007F3B]/20";
  } else if (minutes < 180) {
    // Amber/Yellow: 1-3 hours
    colorClasses = "bg-[#FFF8E5] text-[#B38000] border-[#FFB81C]/30";
  } else {
    // Red: 3+ hours
    colorClasses = "bg-[#D5281B] text-white border-[#D5281B]";
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const display = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  return (
    <span className={`px-3 py-1 rounded-full text-sm font-bold border status-pill ${colorClasses} ${blurred ? 'wait-time-blur' : ''}`}>
      {display}
    </span>
  );
};

// Hospital Card Component
const HospitalCard = ({ hospital, canSeeWaitTimes, onUpdateWaitTime, index }) => {
  const formatLastUpdated = (dateString) => {
    if (!dateString) return "Never updated";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  const maskName = (name, shouldMask = true) => {
    if (!name || !shouldMask) return name;
    // Handle "(Admin)" suffix
    const isAdmin = name.includes("(Admin)");
    const cleanName = name.replace(" (Admin)", "").trim();
    
    const parts = cleanName.split(" ");
    if (parts.length === 1) {
      // Single name: show first 3 chars + ***
      const first = parts[0];
      return first.slice(0, 3) + "***" + (isAdmin ? " (Admin)" : "");
    }
    
    // Multiple parts: mask first and last name
    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    
    // First name: show first 4 chars (or less if shorter) + *
    const maskedFirst = firstName.slice(0, Math.min(4, firstName.length)) + "*";
    
    // Last name: ** + last 3 chars (or less if shorter)
    const maskedLast = "**" + lastName.slice(-Math.min(3, lastName.length));
    
    return maskedFirst + " " + maskedLast + (isAdmin ? " (Admin)" : "");
  };

  return (
    <Card 
      className={`hospital-card bg-white border border-slate-200 shadow-sm animate-fade-in-up stagger-${(index % 5) + 1}`}
      data-testid={`hospital-card-${hospital.id}`}
    >
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-[#005EB8]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-[#005EB8]" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  {hospital.name}
                </h3>
                <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                  <MapPin className="w-3 h-3" />
                  {hospital.address}
                </p>
                <p className="text-xs text-slate-400 mt-1">{hospital.postcode}</p>
                {hospital.distance !== undefined && (
                  <p className="text-sm text-[#005EB8] font-medium mt-1">
                    {hospital.distance} km away
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="relative">
              {!canSeeWaitTimes && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <Lock className="w-4 h-4 text-slate-400" />
                </div>
              )}
              <WaitTimeBadge 
                minutes={hospital.current_wait_minutes} 
                blurred={!canSeeWaitTimes}
              />
            </div>
            
            <div className="text-xs text-slate-400 text-right">
              {hospital.last_updated ? (
                <>
                  <span className="block">{formatLastUpdated(hospital.last_updated)}</span>
                  {hospital.last_updated_by && (
                    <span className="block">by {maskName(hospital.last_updated_by, hospital.last_updated_by_masked)}</span>
                  )}
                </>
              ) : (
                <span>No updates yet</span>
              )}
            </div>

            {onUpdateWaitTime && (
              <Button
                size="sm"
                variant="outline"
                className="text-xs mt-2"
                onClick={() => onUpdateWaitTime(hospital)}
                data-testid={`update-wait-time-btn-${hospital.id}`}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Update
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Home Page
const HomePage = () => {
  const { user, siteSettings, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchPostcode, setSearchPostcode] = useState("");
  const [sortByWait, setSortByWait] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [waitMinutes, setWaitMinutes] = useState("");
  const [submitHospitalOpen, setSubmitHospitalOpen] = useState(false);
  const [newHospital, setNewHospital] = useState({ name: "", address: "", postcode: "" });
  const [similarHospitals, setSimilarHospitals] = useState([]);
  const [showSimilarDialog, setShowSimilarDialog] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [claimingPayment, setClaimingPayment] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);

  const handlePaymentSuccess = async (subscriptionId) => {
    try {
      await axios.post(`${API}/payment/activate`, { subscription_id: subscriptionId });
      toast.success("Payment successful! You now have full access.");
      setPaymentDialogOpen(false);
      refreshUser();
    } catch (e) {
      toast.error("Payment recorded but activation failed. Please contact support.");
    }
  };

  const canSeeWaitTimes = user && (user.is_paid || user.is_admin);

  useEffect(() => {
    seedAndFetchHospitals();
  }, []);

  const seedAndFetchHospitals = async () => {
    try {
      await axios.post(`${API}/seed`);
    } catch (error) {
      // Ignore if already seeded
    }
    fetchHospitals();
  };

  const fetchHospitals = async (postcode = "", sortWait = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (postcode) params.append("postcode", postcode);
      if (sortWait) params.append("sort_by", "wait_time");
      
      const response = await axios.get(`${API}/hospitals?${params.toString()}`);
      setHospitals(response.data);
    } catch (error) {
      toast.error("Failed to fetch hospitals");
    }
    setLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchHospitals(searchPostcode, sortByWait);
  };

  const toggleSortByWait = () => {
    const newSort = !sortByWait;
    setSortByWait(newSort);
    fetchHospitals(searchPostcode, newSort);
  };


  const handleUpdateWaitTime = (hospital) => {
    setSelectedHospital(hospital);
    setWaitMinutes("");
    setUpdateDialogOpen(true);
  };


  const submitWaitTimeUpdate = async () => {
    if (!waitMinutes || isNaN(parseInt(waitMinutes))) {
      toast.error("Please enter a valid wait time");
      return;
    }
    
    try {
      const response = await axios.post(`${API}/wait-times/update`, {
        hospital_id: selectedHospital.id,
        wait_minutes: parseInt(waitMinutes),
      });
      toast.success("Wait time updated successfully!");
      setUpdateDialogOpen(false);
      fetchHospitals(searchPostcode, sortByWait);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update wait time");
    }
  };

  const checkForSimilarHospitals = async () => {
    if (!newHospital.name) {
      toast.error("Please enter a hospital name");
      return;
    }

    setCheckingDuplicates(true);
    try {
      const response = await axios.post(`${API}/hospitals/check-similar`, {
        name: newHospital.name,
        postcode: newHospital.postcode || null,
      });
      
      if (response.data.length > 0) {
        setSimilarHospitals(response.data);
        setShowSimilarDialog(true);
      } else {
        // No similar hospitals found, proceed with submission
        await confirmSubmitHospital();
      }
    } catch (error) {
      toast.error("Failed to check for similar hospitals");
    }
    setCheckingDuplicates(false);
  };

  const confirmSubmitHospital = async () => {
    if (!newHospital.name || !newHospital.address || !newHospital.postcode) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await axios.post(`${API}/hospitals/submit`, newHospital);
      toast.success("Hospital submitted for admin approval!");
      setSubmitHospitalOpen(false);
      setShowSimilarDialog(false);
      setNewHospital({ name: "", address: "", postcode: "" });
      setSimilarHospitals([]);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to submit hospital");
    }
  };

  const selectExistingHospital = (hospital) => {
    // Close dialogs and scroll to the hospital or show update dialog
    setShowSimilarDialog(false);
    setSubmitHospitalOpen(false);
    setNewHospital({ name: "", address: "", postcode: "" });
    setSimilarHospitals([]);
    
    // Find the hospital and open update dialog if user can update
    if (canSeeWaitTimes) {
      const existingHospital = hospitals.find(h => h.id === hospital.id);
      if (existingHospital) {
        handleUpdateWaitTime(existingHospital);
        toast.success(`Selected ${hospital.name} - you can now update its wait time`);
      }
    } else {
      toast.info(`${hospital.name} already exists in our database`);
    }
  };

  const submitNewHospital = async () => {
    if (!newHospital.name || !newHospital.address || !newHospital.postcode) {
      toast.error("Please fill in all fields");
      return;
    }

    // Check for similar hospitals first
    await checkForSimilarHospitals();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Hero Section */}
      <div 
        className="relative bg-cover bg-center py-16 sm:py-24"
        style={{ 
          backgroundImage: `url('https://static.prod-images.emergentagent.com/jobs/042a6030-888c-4e4e-b517-3587118cf787/images/598a58dfee2d5149ed8558a5c0836e978e54313752d5142301d58d0ebda9cbe5.png')` 
        }}
      >
        <div className="absolute inset-0 hero-gradient"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight leading-tight"
              style={{ fontFamily: "'Manrope', sans-serif" }}
            >
              Real-Time A&E Wait Times
            </h1>
            <p className="mt-4 text-lg sm:text-xl text-white/90 max-w-2xl mx-auto">
              Find the nearest hospital with the shortest wait time. Updated by real patients like you.
            </p>

            {/* Search Form */}
            <form onSubmit={handleSearch} className="mt-8 max-w-xl mx-auto">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Enter your postcode (e.g., SW1A 1AA)"
                    value={searchPostcode}
                    onChange={(e) => setSearchPostcode(e.target.value)}
                    className="pl-10 h-12 text-base border-2 border-white/20 bg-white/95 focus:border-white focus:ring-4 focus:ring-[#FFEB3B]/50"
                    data-testid="postcode-search-input"
                  />
                </div>
                <Button 
                  type="submit" 
                  className="h-12 px-6 bg-white text-[#005EB8] hover:bg-slate-100 font-semibold"
                  data-testid="search-button"
                >
                  Search
                </Button>
              </div>
            </form>

            {!user && (
              <div className="mt-6">
                <Button
                  onClick={() => navigate("/register")}
                  className="pulse-cta bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128] font-bold px-8 py-3 h-auto text-lg"
                  data-testid="hero-signup-button"
                >
                  Sign Up Free
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {searchPostcode ? `Hospitals near ${searchPostcode.toUpperCase()}` : "All A&E Hospitals"}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {hospitals.length} hospitals found
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={sortByWait ? "default" : "outline"}
              onClick={toggleSortByWait}
              className={sortByWait ? "bg-[#005EB8] hover:bg-[#004C97]" : ""}
              data-testid="sort-by-wait-button"
            >
              <ArrowUpDown className="w-4 h-4 mr-2" />
              Sort by Wait Time
            </Button>
            
            {user && (
              <Button
                variant="outline"
                onClick={() => setSubmitHospitalOpen(true)}
                data-testid="submit-hospital-button"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Hospital
              </Button>
            )}
          </div>
        </div>

        {/* Unlock Banner for Non-Paid Users */}
        {user && !user.is_paid && !user.is_admin && (
          <Card className="mb-6 border-[#005EB8] bg-[#005EB8]/5">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="w-8 h-8 text-[#005EB8]" />
                <div>
                  <p className="font-semibold text-[#0A1128]">Upgrade to see wait times</p>
                  <p className="text-sm text-slate-600">Upgrade for only 99p to see wait times</p>
                </div>
              </div>
              <Button 
                className="bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128] font-bold"
                onClick={() => setPaymentDialogOpen(true)}
                data-testid="unlock-payment-button"
              >
                Upgrade for £{siteSettings.price}
              </Button>
            </CardContent>
          </Card>
        )}

        {!user && (
          <Card className="mb-6 border-[#FFB81C] bg-[#FFB81C]/10">
            <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Lock className="w-8 h-8 text-[#B38000]" />
                <div>
                  <p className="font-semibold text-[#0A1128]">Create a free account</p>
                  <p className="text-sm text-slate-600">Sign up free, upgrade for £{siteSettings.price} to see wait times</p>
                </div>
              </div>
              <Button 
                className="bg-[#FFB81C] hover:bg-[#E5A619] text-[#0A1128]"
                onClick={() => navigate("/register")}
                data-testid="banner-signup-button"
              >
                Sign Up Free
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Hospital List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-32 rounded-lg skeleton"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {hospitals.map((hospital, index) => (
              <HospitalCard
                key={hospital.id}
                hospital={hospital}
                canSeeWaitTimes={canSeeWaitTimes}
                onUpdateWaitTime={user ? handleUpdateWaitTime : null}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Update Wait Time Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Update Wait Time</DialogTitle>
            <DialogDescription>
              {selectedHospital?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="wait-minutes">Current wait time (minutes)</Label>
            <Input
              id="wait-minutes"
              type="number"
              min="0"
              max="720"
              value={waitMinutes}
              onChange={(e) => setWaitMinutes(e.target.value)}
              placeholder="e.g., 90"
              className="mt-2"
              data-testid="wait-minutes-input"
            />
            <div className="mt-3 p-3 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-500 flex items-start gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>We'll check your location to verify you're near this hospital. If not nearby, your update will be sent for admin approval.</span>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpdateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitWaitTimeUpdate}
              data-testid="submit-wait-time-button"
            >
              Update
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit Hospital Dialog */}
      <Dialog open={submitHospitalOpen} onOpenChange={(open) => {
        setSubmitHospitalOpen(open);
        if (!open) {
          setSimilarHospitals([]);
          setShowSimilarDialog(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Submit New Hospital</DialogTitle>
            <DialogDescription>
              Add a hospital that's not on the list. Admin will review and approve.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="hospital-name">Hospital Name</Label>
              <Input
                id="hospital-name"
                value={newHospital.name}
                onChange={(e) => setNewHospital({ ...newHospital, name: e.target.value })}
                placeholder="e.g., Royal Hospital"
                className="mt-2"
                data-testid="new-hospital-name-input"
              />
            </div>
            <div>
              <Label htmlFor="hospital-address">Address</Label>
              <Input
                id="hospital-address"
                value={newHospital.address}
                onChange={(e) => setNewHospital({ ...newHospital, address: e.target.value })}
                placeholder="e.g., 123 High Street, London"
                className="mt-2"
                data-testid="new-hospital-address-input"
              />
            </div>
            <div>
              <Label htmlFor="hospital-postcode">Postcode</Label>
              <Input
                id="hospital-postcode"
                value={newHospital.postcode}
                onChange={(e) => setNewHospital({ ...newHospital, postcode: e.target.value })}
                placeholder="e.g., SW1A 1AA"
                className="mt-2"
                data-testid="new-hospital-postcode-input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitHospitalOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitNewHospital}
              disabled={checkingDuplicates}
              data-testid="submit-new-hospital-button"
            >
              {checkingDuplicates ? "Checking..." : "Submit for Approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Similar Hospitals Dialog */}
      <Dialog open={showSimilarDialog} onOpenChange={setShowSimilarDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>
              Did you mean one of these?
            </DialogTitle>
            <DialogDescription>
              We found similar hospitals in our database. Select one if it matches, or continue to add a new hospital.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-80 overflow-y-auto">
            {similarHospitals.map((hospital) => (
              <Card 
                key={hospital.id} 
                className="cursor-pointer hover:border-[#005EB8] hover:bg-slate-50 transition-all"
                onClick={() => selectExistingHospital(hospital)}
                data-testid={`similar-hospital-${hospital.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-[#005EB8]/10 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-[#005EB8]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#0A1128]">{hospital.name}</p>
                        <p className="text-sm text-slate-500">{hospital.address}</p>
                        <p className="text-xs text-slate-400">{hospital.postcode}</p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {Math.round(hospital.similarity_score * 100)}% match
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowSimilarDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97] w-full sm:w-auto"
              onClick={confirmSubmitHospital}
              data-testid="continue-add-hospital-button"
            >
              Not Listed - Continue Adding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Upgrade to Full Access</DialogTitle>
            <DialogDescription>
              Upgrade for only 99p to see all wait times.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {paymentDialogOpen && siteSettings.paypal_client_id && siteSettings.paypal_plan_id && (
              <PayPalSubscribeButton
                clientId={siteSettings.paypal_client_id}
                planId={siteSettings.paypal_plan_id}
                onSuccess={handlePaymentSuccess}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Login Page
const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Login failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-[#005EB8] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Manrope', sans-serif" }}>
            Welcome Back
          </CardTitle>
          <CardDescription>Login to see real-time wait times</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2"
                data-testid="login-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="mt-2"
                data-testid="login-password-input"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#005EB8] hover:bg-[#004C97]"
              disabled={loading}
              data-testid="login-submit-button"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>
          <p className="text-center text-sm text-slate-500 mt-4">
            Don't have an account?{" "}
            <button
              onClick={() => navigate("/register")}
              className="text-[#005EB8] font-medium hover:underline"
              data-testid="go-to-register-link"
            >
              Sign up free
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// Register Page
const RegisterPage = () => {
  const { register, siteSettings } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!name || !email || !password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      // Register without payment - they can upgrade later
      await register(name, email, password, null);
      toast.success("Account created! Upgrade to see wait times.");
      navigate("/");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Registration failed");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-[#005EB8] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8 text-white" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: "'Manrope', sans-serif" }}>
            Create Free Account
          </CardTitle>
          <CardDescription>
            Sign up free, then upgrade to see wait times
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-2"
                data-testid="register-name-input"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="mt-2"
                data-testid="register-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="mt-2"
                data-testid="register-password-input"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-[#005EB8] hover:bg-[#004C97]"
              disabled={loading}
              data-testid="register-submit-button"
            >
              {loading ? "Creating account..." : "Create Free Account"}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-600 text-center">
              <strong>Free account includes:</strong>
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-500">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-[#007F3B]" />
                View hospital list & search by postcode
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-[#007F3B]" />
                Update wait times to help others
              </li>
              <li className="flex items-center gap-2">
                <Lock className="w-3 h-3 text-slate-400" />
                <span className="text-slate-400">See wait times (£{siteSettings.price} upgrade)</span>
              </li>
            </ul>
          </div>

          <p className="text-center text-sm text-slate-500 mt-4">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-[#005EB8] font-medium hover:underline"
              data-testid="go-to-login-link"
            >
              Login
            </button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

// Admin Dashboard
const AdminPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingHospitals, setPendingHospitals] = useState([]);
  const [pendingWaitUpdates, setPendingWaitUpdates] = useState([]);
  const [allHospitals, setAllHospitals] = useState([]);
  const [users, setUsers] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState(null);
  const [overrideMinutes, setOverrideMinutes] = useState("");
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", is_paid: true });
  const [settingsPrice, setSettingsPrice] = useState("");
  const [settingsClientId, setSettingsClientId] = useState("");
  const [settingsPlanId, setSettingsPlanId] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const { siteSettings, refreshSettings } = useAuth();

  useEffect(() => {
    if (!user?.is_admin) {
      navigate("/");
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pendingRes, pendingWaitRes, hospitalsRes, usersRes, messagesRes] = await Promise.all([
        axios.get(`${API}/admin/pending-hospitals`),
        axios.get(`${API}/admin/pending-wait-updates`),
        axios.get(`${API}/hospitals`),
        axios.get(`${API}/admin/users`),
        axios.get(`${API}/admin/messages`),
      ]);
      setPendingHospitals(pendingRes.data);
      setPendingWaitUpdates(pendingWaitRes.data);
      setAllHospitals(hospitalsRes.data);
      setUsers(usersRes.data);
      setContactMessages(messagesRes.data);
      // Load settings into form
      const settingsRes = await axios.get(`${API}/settings`);
      setSettingsPrice(settingsRes.data.price);
      setSettingsClientId(settingsRes.data.paypal_client_id);
      setSettingsPlanId(settingsRes.data.paypal_plan_id);
    } catch (error) {
      toast.error("Failed to fetch data");
    }
    setLoading(false);
  };

  const approveHospital = async (id) => {
    try {
      await axios.post(`${API}/admin/approve-hospital/${id}`);
      toast.success("Hospital approved!");
      fetchData();
    } catch (error) {
      toast.error("Failed to approve hospital");
    }
  };

  const rejectHospital = async (id) => {
    try {
      await axios.delete(`${API}/admin/reject-hospital/${id}`);
      toast.success("Hospital rejected");
      fetchData();
    } catch (error) {
      toast.error("Failed to reject hospital");
    }
  };

  const approveWaitUpdate = async (id) => {
    try {
      await axios.post(`${API}/admin/approve-wait-update/${id}`);
      toast.success("Wait time update approved!");
      fetchData();
    } catch (error) {
      toast.error("Failed to approve wait update");
    }
  };

  const rejectWaitUpdate = async (id) => {
    try {
      await axios.delete(`${API}/admin/reject-wait-update/${id}`);
      toast.success("Wait time update rejected");
      fetchData();
    } catch (error) {
      toast.error("Failed to reject wait update");
    }
  };

  const handleOverride = (hospital) => {
    setSelectedHospital(hospital);
    setOverrideMinutes("");
    setOverrideDialogOpen(true);
  };

  const submitOverride = async () => {
    if (!overrideMinutes || isNaN(parseInt(overrideMinutes))) {
      toast.error("Please enter a valid wait time");
      return;
    }

    try {
      await axios.post(`${API}/admin/override-wait-time`, {
        hospital_id: selectedHospital.id,
        wait_minutes: parseInt(overrideMinutes),
      });
      toast.success("Wait time overridden!");
      setOverrideDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error("Failed to override wait time");
    }
  };

  const deleteUser = async (userId) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    
    try {
      await axios.delete(`${API}/admin/users/${userId}`);
      toast.success("User deleted");
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to delete user");
    }
  };

  const [scraping, setScraping] = useState(false);
  
  const triggerWaitSmartScrape = async () => {
    setScraping(true);
    try {
      const response = await axios.post(`${API}/admin/scrape-waitsmart`);
      const msg = response.data.updated > 0
        ? `Wait times updated for ${response.data.updated} hospitals`
        : `No wait time updates found`;
      toast.success(response.data.added > 0 ? `${msg}, ${response.data.added} new hospitals added` : msg);
      fetchData();
    } catch (error) {
      toast.error("Failed to scrape WaitSmart");
    }
    setScraping(false);
  };

  const toggleUserPaid = async (userId) => {
    try {
      const response = await axios.patch(`${API}/admin/users/${userId}/toggle-paid`);
      toast.success(response.data.message);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to update user");
    }
  };

  const createUser = async () => {
    if (!newUser.name || !newUser.email || !newUser.password) {
      toast.error("Please fill in all fields");
      return;
    }
    if (newUser.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      await axios.post(`${API}/admin/users/create`, newUser);
      toast.success("User created successfully!");
      setAddUserDialogOpen(false);
      setNewUser({ name: "", email: "", password: "", is_paid: true });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Failed to create user");
    }
  };

  const markMessageRead = async (msgId) => {
    try {
      await axios.patch(`${API}/admin/messages/${msgId}/read`);
      fetchData();
    } catch (error) {
      toast.error("Failed to mark message as read");
    }
  };

  const deleteMessage = async (msgId) => {
    try {
      await axios.delete(`${API}/admin/messages/${msgId}`);
      toast.success("Message deleted");
      fetchData();
    } catch (error) {
      toast.error("Failed to delete message");
    }
  };

  if (!user?.is_admin) return null;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#005EB8] rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-[#0A1128]" style={{ fontFamily: "'Manrope', sans-serif" }}>
                Admin Dashboard
              </h1>
              <p className="text-slate-500">Manage hospitals, wait times, and users</p>
            </div>
          </div>
          <Button
            onClick={triggerWaitSmartScrape}
            disabled={scraping}
            className="bg-[#007F3B] hover:bg-[#006630]"
            data-testid="scrape-waitsmart-button"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${scraping ? 'animate-spin' : ''}`} />
            {scraping ? 'Updating...' : 'Update from WaitSmart'}
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-200 pb-2">
          {[
            { id: "pending", label: "Pending Hospitals", count: pendingHospitals.length },
            { id: "wait-updates", label: "Pending Wait Updates", count: pendingWaitUpdates.length },
            { id: "hospitals", label: "All Hospitals", count: allHospitals.length },
            { id: "users", label: "Users", count: users.length },
            { id: "messages", label: "Messages", count: contactMessages.filter(m => !m.read).length },
            { id: "settings", label: "Settings", count: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-[#005EB8] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
              data-testid={`admin-tab-${tab.id}`}
            >
              {tab.label}
              {tab.count !== null && <Badge variant={tab.count > 0 && (tab.id === "pending" || tab.id === "wait-updates" || tab.id === "messages") ? "destructive" : "secondary"} className="ml-2">{tab.count}</Badge>}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg skeleton"></div>
            ))}
          </div>
        ) : (
          <>
            {/* Pending Hospitals */}
            {activeTab === "pending" && (
              <div className="space-y-4">
                {pendingHospitals.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="w-12 h-12 text-[#007F3B] mx-auto mb-4" />
                      <p className="text-slate-600">No pending hospitals to approve</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingHospitals.map((hospital) => (
                    <Card key={hospital.id} data-testid={`pending-hospital-${hospital.id}`}>
                      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-[#0A1128]">{hospital.name}</h3>
                          <p className="text-sm text-slate-500">{hospital.address}</p>
                          <p className="text-xs text-slate-400">{hospital.postcode}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            Submitted by: {hospital.submitted_by_email}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-[#007F3B] hover:bg-[#006630]"
                            onClick={() => approveHospital(hospital.id)}
                            data-testid={`approve-hospital-${hospital.id}`}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => rejectHospital(hospital.id)}
                            data-testid={`reject-hospital-${hospital.id}`}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Pending Wait Updates */}
            {activeTab === "wait-updates" && (
              <div className="space-y-4">
                {pendingWaitUpdates.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <CheckCircle className="w-12 h-12 text-[#007F3B] mx-auto mb-4" />
                      <p className="text-slate-600">No pending wait time updates to review</p>
                    </CardContent>
                  </Card>
                ) : (
                  pendingWaitUpdates.map((update) => (
                    <Card key={update.id} data-testid={`pending-wait-update-${update.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <h3 className="font-bold text-[#0A1128]">{update.hospital_name}</h3>
                            <p className="text-sm text-slate-600">
                              Proposed wait time: <span className="font-semibold">{Math.floor(update.wait_minutes / 60)}h {update.wait_minutes % 60}m</span>
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              Submitted by: {update.submitted_by_email}
                            </p>
                            <p className="text-xs text-slate-400">
                              {update.distance_km 
                                ? `Distance from hospital: ${update.distance_km}km (too far)`
                                : "Location not shared"
                              }
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-[#007F3B] hover:bg-[#006630]"
                              onClick={() => approveWaitUpdate(update.id)}
                              data-testid={`approve-wait-update-${update.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectWaitUpdate(update.id)}
                              data-testid={`reject-wait-update-${update.id}`}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* All Hospitals */}
            {activeTab === "hospitals" && (
              <div className="space-y-4">
                {allHospitals.map((hospital) => (
                  <Card key={hospital.id} data-testid={`admin-hospital-${hospital.id}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="font-bold text-[#0A1128]">{hospital.name}</h3>
                        <p className="text-sm text-slate-500">{hospital.postcode}</p>
                        {hospital.last_updated && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            Last updated: {new Date(hospital.last_updated).toLocaleString()} {hospital.last_updated_by ? `by ${hospital.last_updated_by}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <WaitTimeBadge minutes={hospital.current_wait_minutes} />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOverride(hospital)}
                          data-testid={`override-wait-${hospital.id}`}
                        >
                          Override
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Users */}
            {activeTab === "users" && (
              <div className="space-y-4">
                {/* Add User Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => setAddUserDialogOpen(true)}
                    className="bg-[#005EB8] hover:bg-[#004C97]"
                    data-testid="add-user-button"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add User
                  </Button>
                </div>

                {users.map((u) => (
                  <Card key={u.id} data-testid={`admin-user-${u.id}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-slate-500" />
                        </div>
                        <div>
                          <p className="font-medium text-[#0A1128]">{u.name}</p>
                          <p className="text-sm text-slate-500">{u.email}</p>
                          {u.plain_password && (
                            <p className="text-xs text-amber-600 font-mono mt-0.5" data-testid={`user-password-${u.id}`}>
                              Password: {u.plain_password}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {u.is_admin && <Badge>Admin</Badge>}
                        {u.is_paid && !u.is_admin && <Badge className="bg-[#007F3B]">Paid</Badge>}
                        {!u.is_paid && !u.is_admin && <Badge variant="secondary">Unpaid</Badge>}
                        {u.id !== user.id && !u.is_admin && (
                          <Button
                            size="sm"
                            variant={u.is_paid ? "outline" : "default"}
                            className={!u.is_paid ? "bg-[#007F3B] hover:bg-[#006630]" : ""}
                            onClick={() => toggleUserPaid(u.id)}
                            data-testid={`toggle-paid-${u.id}`}
                          >
                            {u.is_paid ? "Revoke Access" : "Mark as Paid"}
                          </Button>
                        )}
                        {u.id !== user.id && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteUser(u.id)}
                            data-testid={`delete-user-${u.id}`}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Messages */}
            {activeTab === "messages" && (
              <div className="space-y-4">
                {contactMessages.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                      <p className="text-slate-600">No contact messages yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  contactMessages.map((msg) => (
                    <Card key={msg.id} className={!msg.read ? "border-l-4 border-l-[#005EB8]" : "opacity-75"} data-testid={`message-${msg.id}`}>
                      <CardContent className="p-4">
                        <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-bold text-[#0A1128]">{msg.name}</p>
                              {!msg.read && <Badge className="bg-[#005EB8] text-xs">New</Badge>}
                            </div>
                            <p className="text-sm text-[#005EB8]">{msg.email}</p>
                            <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{msg.message}</p>
                            <p className="text-xs text-slate-400 mt-2">
                              {new Date(msg.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2 flex-shrink-0">
                            {!msg.read && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => markMessageRead(msg.id)}
                                data-testid={`mark-read-${msg.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                Mark Read
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMessage(msg.id)}
                              data-testid={`delete-message-${msg.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            )}

            {/* Settings */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Manrope', sans-serif" }}>Payment Settings</CardTitle>
                    <CardDescription>Update the price and PayPal button settings. Changes apply site-wide instantly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="settings-price">Price (£)</Label>
                      <Input
                        id="settings-price"
                        value={settingsPrice}
                        onChange={(e) => setSettingsPrice(e.target.value)}
                        placeholder="e.g., 0.99"
                        className="mt-2 max-w-xs"
                        data-testid="settings-price-input"
                      />
                      <p className="text-xs text-slate-400 mt-1">Displayed as £{settingsPrice || "0.00"} across the site</p>
                    </div>
                    <div>
                      <Label htmlFor="settings-client-id">PayPal Client ID</Label>
                      <Input
                        id="settings-client-id"
                        value={settingsClientId}
                        onChange={(e) => setSettingsClientId(e.target.value)}
                        placeholder="AY6Pgn..."
                        className="mt-2"
                        data-testid="settings-client-id-input"
                      />
                      <p className="text-xs text-slate-400 mt-1">From your PayPal button code (client-id value)</p>
                    </div>
                    <div>
                      <Label htmlFor="settings-plan-id">PayPal Plan ID</Label>
                      <Input
                        id="settings-plan-id"
                        value={settingsPlanId}
                        onChange={(e) => setSettingsPlanId(e.target.value)}
                        placeholder="P-4M43..."
                        className="mt-2"
                        data-testid="settings-plan-id-input"
                      />
                      <p className="text-xs text-slate-400 mt-1">From your PayPal button code (plan_id value)</p>
                    </div>
                    <Button
                      className="bg-[#005EB8] hover:bg-[#004C97]"
                      disabled={savingSettings}
                      onClick={async () => {
                        setSavingSettings(true);
                        try {
                          await axios.put(`${API}/admin/settings`, {
                            price: settingsPrice,
                            paypal_client_id: settingsClientId,
                            paypal_plan_id: settingsPlanId
                          });
                          await refreshSettings();
                          toast.success("Settings saved successfully");
                        } catch (e) {
                          toast.error("Failed to save settings");
                        }
                        setSavingSettings(false);
                      }}
                      data-testid="save-settings-button"
                    >
                      {savingSettings ? "Saving..." : "Save Settings"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>

      {/* Override Dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Override Wait Time</DialogTitle>
            <DialogDescription>
              {selectedHospital?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="override-minutes">New wait time (minutes)</Label>
            <Input
              id="override-minutes"
              type="number"
              min="0"
              max="720"
              value={overrideMinutes}
              onChange={(e) => setOverrideMinutes(e.target.value)}
              placeholder="e.g., 90"
              className="mt-2"
              data-testid="override-minutes-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={submitOverride}
              data-testid="submit-override-button"
            >
              Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addUserDialogOpen} onOpenChange={setAddUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Manrope', sans-serif" }}>Add New User</DialogTitle>
            <DialogDescription>
              Create a user account and optionally mark them as paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="new-user-name">Full Name</Label>
              <Input
                id="new-user-name"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="e.g., John Smith"
                className="mt-2"
                data-testid="new-user-name-input"
              />
            </div>
            <div>
              <Label htmlFor="new-user-email">Email</Label>
              <Input
                id="new-user-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                placeholder="e.g., john@example.com"
                className="mt-2"
                data-testid="new-user-email-input"
              />
            </div>
            <div>
              <Label htmlFor="new-user-password">Password</Label>
              <Input
                id="new-user-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="mt-2"
                data-testid="new-user-password-input"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="new-user-paid"
                checked={newUser.is_paid}
                onChange={(e) => setNewUser({ ...newUser, is_paid: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-[#005EB8] focus:ring-[#005EB8]"
                data-testid="new-user-paid-checkbox"
              />
              <Label htmlFor="new-user-paid" className="cursor-pointer">
                Mark as paid (grant full access)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#005EB8] hover:bg-[#004C97]"
              onClick={createUser}
              data-testid="create-user-button"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Main App Component
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
          <Routes>
            <Route path="/login" element={<><LoginPage /><Footer /></>} />
            <Route path="/register" element={<><RegisterPage /><Footer /></>} />
            <Route
              path="/*"
              element={
                <>
                  <Header />
                  <main className="flex-1">
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="/admin" element={<AdminPage />} />
                    </Routes>
                  </main>
                  <Footer />
                </>
              }
            />
          </Routes>
          <Toaster position="top-right" richColors />
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
