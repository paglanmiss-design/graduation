import React, { useState, useEffect } from "react";
import { 
  PlusCircle, Search, UserPlus, FileText, History, Activity, User, 
  Phone, Calendar, ChevronRight, ClipboardList, AlertCircle, 
  CheckCircle2, LayoutDashboard, Clock, Thermometer, Heart, 
  Scale, Ruler, Droplets, TrendingUp, Users, ArrowUpRight,
  Lock, LogIn, LogOut, Download, MessageSquare, Send, RefreshCw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Patient, MedicalRecord, Appointment, Vitals, DashboardStats, User as UserType } from "./types";
import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export default function App() {
  const [user, setUser] = useState<UserType | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [token, setToken] = useState<string | null>(localStorage.getItem("charlestrack_token"));

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, {
      ...options,
      headers,
      credentials: "include"
    });
  };
  const [showLanding, setShowLanding] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [activeTab, setActiveTab] = useState<"dashboard" | "directory" | "appointments" | "register" | "messages" | "users">("dashboard");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [showSignup, setShowSignup] = useState(false);
  const [signupForm, setSignupForm] = useState({ username: "", password: "", confirmPassword: "" });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<MedicalRecord[]>([]);
  const [patientVitals, setPatientVitals] = useState<Vitals[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<{ status: string; database: string; messages: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [adminUserForm, setAdminUserForm] = useState({ username: "", password: "", role: "staff" });

  // Forms
  const [patientForm, setPatientForm] = useState({ id: "", name: "", age: "", gender: "Male", contact_info: "" });
  const [recordForm, setRecordForm] = useState({ diagnosis: "", prescription: "", visit_date: format(new Date(), "yyyy-MM-dd") });
  const [appointmentForm, setAppointmentForm] = useState({ patient_id: "", date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), reason: "" });
  const [vitalsForm, setVitalsForm] = useState({ weight: "", height: "", blood_pressure: "", heart_rate: "", temperature: "" });
  const [contactForm, setContactForm] = useState({ first_name: "", last_name: "", email: "", message: "" });

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchPatients();
      fetchAppointments();
      fetchMessages();
      if (user.role === "admin") fetchUsers();

      // Poll for new messages every 30 seconds
      const interval = setInterval(fetchMessages, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const checkAuth = async () => {
    try {
      console.log("Checking authentication...");
      const res = await fetchWithAuth("/api/me");
      const data = await res.json();
      console.log("Auth response:", data);
      if (data.authenticated) {
        setUser(data.user);
      } else {
        setUser(null);
        if (!data.authenticated && token) {
          console.warn("Token invalid, clearing");
          localStorage.removeItem("charlestrack_token");
          setToken(null);
        }
      }
    } catch (err) {
      console.error("Auth check failed", err);
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log("Attempting login with:", loginForm.username);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
        credentials: "include"
      });
      console.log("Login response status:", res.status);
      const data = await res.json();
      console.log("Login response data:", data);
      if (res.ok) {
        if (data.token) {
          localStorage.setItem("charlestrack_token", data.token);
          setToken(data.token);
        }
        setUser(data.user);
        showMsg("success", "Welcome back!");
      } else {
        showMsg("error", data.error || "Login failed. Please check your credentials.");
      }
    } catch (err) {
      console.error("Login error:", err);
      showMsg("error", "Network error during login. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth("/api/logout", { method: "POST" });
      localStorage.removeItem("charlestrack_token");
      setToken(null);
      setUser(null);
      setActiveTab("dashboard");
      showMsg("success", "Logged out successfully");
    } catch (err) {
      showMsg("error", "Logout failed");
    }
  };

  const fetchDashboardData = async () => {
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetchWithAuth("/api/dashboard/stats"),
        fetchWithAuth("/api/health")
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (healthRes.ok) setHealth(await healthRes.json());
    } catch (err) { console.error("Dashboard fetch error:", err); }
  };

  const fetchPatients = async (query = "") => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/patients${query ? `?query=${query}` : ""}`);
      
      if (res.status === 401) {
        setUser(null);
        return;
      }

      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setPatients(data);
      } else {
        console.error("Failed to fetch patients:", data.error || "Invalid response");
        setPatients([]);
      }
    } catch (err) { 
      console.error("Patient fetch error:", err);
      setPatients([]);
    } finally { setLoading(false); }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetchWithAuth("/api/appointments");
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setAppointments(data);
      } else {
        console.error("Failed to fetch appointments:", data.error || "Invalid response");
        setAppointments([]);
      }
    } catch (err) { 
      console.error("Appointment fetch error:", err);
      setAppointments([]);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetchWithAuth("/api/contact");
      
      if (res.status === 401) {
        if (user) setUser(null);
        return;
      }

      const data = await res.json();
      if (res.ok) {
        setMessages(data);
      } else {
        showMsg("error", "Failed to sync messages");
        console.error("Failed to fetch messages:", data.error);
      }
    } catch (err) { 
      console.error("Message fetch error:", err);
    }
  };

  const fetchUsers = async () => {
    try {
      console.log("Fetching users...");
      const res = await fetchWithAuth("/api/users");
      
      if (res.status === 401) {
        console.warn("Session expired or unauthorized. Logging out.");
        setUser(null);
        return;
      }
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("Expected JSON but got:", text.substring(0, 100));
        throw new Error("Server returned non-JSON response. Check console for details.");
      }

      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setUsers(data);
      } else {
        console.error("Failed to fetch users:", data.error || "Invalid response");
        showMsg("error", data.error || "Failed to fetch users");
        setUsers([]);
      }
    } catch (err: any) { 
      console.error("Failed to fetch users:", err);
      showMsg("error", err.message || "Failed to fetch users");
      setUsers([]);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupForm.password !== signupForm.confirmPassword) {
      showMsg("error", "Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: signupForm.username, password: signupForm.password }),
        credentials: "include"
      });
      if (res.ok) {
        showMsg("success", "Account created! Please login.");
        setShowSignup(false);
        setLoginForm({ username: signupForm.username, password: "" });
      } else {
        const data = await res.json();
        showMsg("error", data.error || "Signup failed");
      }
    } catch (err) {
      showMsg("error", "Network error during signup");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRole = async (userId: string, role: string) => {
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      if (res.ok) {
        showMsg("success", "User role updated");
        fetchUsers();
      }
    } catch (err) { showMsg("error", "Failed to update role"); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    try {
      const res = await fetchWithAuth(`/api/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        showMsg("success", "User deleted");
        fetchUsers();
      }
    } catch (err) { showMsg("error", "Failed to delete user"); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(adminUserForm)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("success", "User created successfully");
        setAdminUserForm({ username: "", password: "", role: "staff" });
        setShowCreateUser(false);
        fetchUsers();
      } else {
        showMsg("error", data.error || "Failed to create user");
      }
    } catch (err) {
      showMsg("error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId: string) => {
    const newPassword = prompt("Enter new password for this user:");
    if (!newPassword) return;
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword })
      });
      if (res.ok) {
        showMsg("success", "Password reset successfully");
      } else {
        const data = await res.json();
        showMsg("error", data.error || "Failed to reset password");
      }
    } catch (err) {
      showMsg("error", "Network error");
    }
  };

  const handleReplyMessage = async (messageId: number, content: string) => {
    if (!content.trim()) return;
    try {
      const res = await fetchWithAuth(`/api/contact/${messageId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        fetchMessages();
        showMsg("success", "Reply sent!");
      }
    } catch (err) {
      showMsg("error", "Failed to send reply");
    }
  };

  const handleMarkAsRead = async (messageId: number) => {
    try {
      const res = await fetchWithAuth(`/api/contact/${messageId}/read`, { method: "POST" });
      if (res.ok) fetchMessages();
    } catch (err) { console.error(err); }
  };

  const fetchPatientDetails = async (patientId: string) => {
    try {
      const [historyRes, vitalsRes] = await Promise.all([
        fetchWithAuth(`/api/patients/${patientId}/history`),
        fetchWithAuth(`/api/patients/${patientId}/vitals`)
      ]);
      setPatientHistory(await historyRes.json());
      setPatientVitals(await vitalsRes.json());
    } catch (err) { console.error(err); }
  };

  const handleRegisterPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const ageNum = parseInt(patientForm.age);
    if (isNaN(ageNum)) {
      showMsg("error", "Please enter a valid age");
      return;
    }

    try {
      const res = await fetchWithAuth("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...patientForm, age: ageNum })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showMsg("success", "Patient registered!");
        setPatientForm({ id: "", name: "", age: "", gender: "Male", contact_info: "" });
        fetchPatients();
        fetchDashboardData();
      } else {
        showMsg("error", data.error || "Failed to register");
        console.error("Registration error:", data.error);
      }
    } catch (err: any) {
      showMsg("error", `Network error: ${err.message || 'Check server connection'}`);
      console.error("Fetch error:", err);
    }
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    
    try {
      const res = await fetchWithAuth("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: `REC-${Date.now()}`, patient_id: selectedPatient.id, ...recordForm })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showMsg("success", "Record saved!");
        setRecordForm({ diagnosis: "", prescription: "", visit_date: format(new Date(), "yyyy-MM-dd") });
        fetchPatientDetails(selectedPatient.id);
        fetchDashboardData();
      } else {
        showMsg("error", data.error || "Failed to save record");
      }
    } catch (err) {
      showMsg("error", "Network error");
    }
  };

  const handleAddVitals = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    
    try {
      const res = await fetchWithAuth("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `VIT-${Date.now()}`,
          patient_id: selectedPatient.id,
          weight: parseFloat(vitalsForm.weight),
          height: parseFloat(vitalsForm.height),
          blood_pressure: vitalsForm.blood_pressure,
          heart_rate: parseInt(vitalsForm.heart_rate),
          temperature: parseFloat(vitalsForm.temperature)
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showMsg("success", "Vitals updated!");
        setVitalsForm({ weight: "", height: "", blood_pressure: "", heart_rate: "", temperature: "" });
        fetchPatientDetails(selectedPatient.id);
      } else {
        showMsg("error", data.error || "Failed to update vitals");
      }
    } catch (err) {
      showMsg("error", "Network error");
    }
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const res = await fetchWithAuth("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `APP-${Date.now()}`,
          patient_id: appointmentForm.patient_id,
          appointment_date: appointmentForm.date,
          reason: appointmentForm.reason
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        showMsg("success", "Appointment scheduled!");
        setAppointmentForm({ patient_id: "", date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), reason: "" });
        fetchAppointments();
        fetchDashboardData();
      } else {
        showMsg("error", data.error || "Failed to schedule appointment");
      }
    } catch (err) {
      showMsg("error", "Network error");
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm)
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("success", "Message sent! You can view it in the admin dashboard.");
        setContactForm({ first_name: "", last_name: "", email: "", message: "" });
      } else {
        showMsg("error", data.error || "Failed to send message. Please try again.");
      }
    } catch (err) {
      showMsg("error", "Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const selectPatient = (p: Patient) => {
    setSelectedPatient(p);
    fetchPatientDetails(p.id);
    setActiveTab("directory");
  };

  const downloadPatientPDF = () => {
    if (!selectedPatient) return;

    const doc = new jsPDF();
    const timestamp = format(new Date(), "yyyy-MM-dd HH:mm");

    // Header
    doc.setFontSize(22);
    doc.setTextColor(16, 185, 129); // Emerald-500
    doc.text("CharlesTrack - Medical Report", 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${timestamp}`, 14, 28);
    doc.line(14, 32, 196, 32);

    // Patient Info
    doc.setFontSize(16);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text("Patient Information", 14, 45);
    
    doc.setFontSize(11);
    doc.text(`Name: ${selectedPatient.name}`, 14, 55);
    doc.text(`Patient ID: ${selectedPatient.id}`, 14, 62);
    doc.text(`Age: ${selectedPatient.age}`, 14, 69);
    doc.text(`Gender: ${selectedPatient.gender}`, 14, 76);
    doc.text(`Contact: ${selectedPatient.contact_info}`, 14, 83);

    // Vitals Table
    if (patientVitals.length > 0) {
      doc.setFontSize(16);
      doc.text("Latest Vital Signs", 14, 100);
      
      autoTable(doc, {
        startY: 105,
        head: [['Date', 'Weight (kg)', 'Height (cm)', 'BP', 'HR (bpm)', 'Temp (°C)']],
        body: patientVitals.map(v => [
          v.recorded_at ? format(new Date(v.recorded_at), "MMM d, yyyy") : "N/A",
          v.weight,
          v.height,
          v.blood_pressure,
          v.heart_rate,
          v.temperature
        ]),
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
      });
    }

    // Medical History Table
    if (patientHistory.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 110;
      doc.setFontSize(16);
      doc.text("Medical History", 14, finalY + 15);
      
      autoTable(doc, {
        startY: finalY + 20,
        head: [['Visit Date', 'Diagnosis', 'Prescription']],
        body: patientHistory.map(h => [
          h.visit_date,
          h.diagnosis,
          h.prescription
        ]),
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }
      });
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount} - CharlesTrack Confidential`, 105, 285, { align: 'center' });
    }

    doc.save(`${selectedPatient.name.replace(/\s+/g, '_')}_Medical_Record.pdf`);
    showMsg("success", "PDF generated and downloading...");
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (showLanding) {
      return (
        <div className="min-h-screen bg-white text-slate-900 font-sans selection:bg-emerald-100">
          {/* Navigation */}
          <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-slate-100 z-50">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="bg-emerald-500 p-2 rounded-xl shadow-lg shadow-emerald-200">
                  <img src="https://picsum.photos/seed/logo/64/64" alt="CharlesTrack Logo" className="w-6 h-6 object-contain" referrerPolicy="no-referrer" />
                </div>
                <span className="font-bold text-2xl text-slate-900 tracking-tight italic serif">CharlesTrack</span>
              </div>
              <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
                <a href="#home" className="hover:text-emerald-600 transition-colors">Home</a>
                <a href="#modules" className="hover:text-emerald-600 transition-colors">Modules</a>
                <a href="#features" className="hover:text-emerald-600 transition-colors">Features</a>
                <a href="#about" className="hover:text-emerald-600 transition-colors">About Us</a>
                <a href="#contact" className="hover:text-emerald-600 transition-colors">Contact</a>
                <button 
                  onClick={() => setShowLanding(false)}
                  className="bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2"
                >
                  <LogIn size={18} />
                  Login
                </button>
              </div>
            </div>
            <button 
              onClick={() => setActiveTab("messages")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${activeTab === "messages" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <MessageSquare size={20} />
              <span className="font-bold text-sm">Messages</span>
              {messages.filter(m => m.is_read === 0).length > 0 && (
                <span className="ml-auto bg-rose-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {messages.filter(m => m.is_read === 0).length}
                </span>
              )}
            </button>

            {user?.role === "admin" && (
              <button 
                onClick={() => setActiveTab("users")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300 ${activeTab === "users" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
              >
                <Lock size={20} />
                <span className="font-bold text-sm">User Management</span>
              </button>
            )}
          </nav>

          {/* Hero Section */}
          <section id="home" className="pt-40 pb-20 px-6">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-xs font-bold uppercase tracking-wider mb-6">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  Smart Healthcare Management
                </div>
                <h1 className="text-6xl lg:text-7xl font-bold text-slate-900 leading-[1.1] tracking-tight mb-8">
                  Your Health, <br />
                  <span className="text-emerald-500 italic serif">Digitally Perfected.</span>
                </h1>
                <p className="text-xl text-slate-500 mb-10 leading-relaxed max-w-lg">
                  CharlesTrack provides a secure, intuitive, and powerful platform for managing personal health records and clinic operations.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => setShowLanding(false)}
                    className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-200 flex items-center gap-2"
                  >
                    Get Started Now
                    <ArrowUpRight size={20} />
                  </button>
                  <a href="#modules" className="px-8 py-4 rounded-2xl font-bold text-lg text-slate-600 hover:bg-slate-50 transition-all border border-slate-200">
                    Explore Modules
                  </a>
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="aspect-square bg-emerald-50 rounded-[3rem] overflow-hidden relative group">
                  <img 
                    src="https://picsum.photos/seed/medical/800/800" 
                    alt="Healthcare" 
                    className="w-full h-full object-cover mix-blend-multiply opacity-80 group-hover:scale-105 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/20 to-transparent" />
                </div>
                {/* Floating Stats */}
                <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 max-w-[200px]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-50 text-blue-500 rounded-lg"><Users size={20} /></div>
                    <span className="text-2xl font-bold text-slate-900">10k+</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Active Patients</p>
                </div>
                <div className="absolute -top-6 -right-6 bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 max-w-[200px]">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-50 text-emerald-500 rounded-lg"><CheckCircle2 size={20} /></div>
                    <span className="text-2xl font-bold text-slate-900">99.9%</span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Data Accuracy</p>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Modules Section */}
          <section id="modules" className="py-24 bg-white px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-slate-900 mb-4">Core Application Modules</h2>
                <p className="text-slate-500 max-w-2xl mx-auto">Explore the different sections of our management system designed for healthcare professionals.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { icon: LayoutDashboard, title: "Dashboard", desc: "Real-time analytics and overview of clinic performance and patient visits.", color: "bg-blue-500" },
                  { icon: Users, title: "Patient Directory", desc: "Comprehensive database to manage and search patient profiles and history.", color: "bg-emerald-500" },
                  { icon: Clock, title: "Appointment Schedule", desc: "Efficiently manage and track upcoming patient visits and consultations.", color: "bg-amber-500" },
                  { icon: UserPlus, title: "New Registration", desc: "Streamlined process for onboarding new patients into the system.", color: "bg-indigo-500" }
                ].map((module, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                    className="p-8 rounded-[2rem] border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-xl transition-all cursor-pointer group"
                    onClick={() => setShowLanding(false)}
                  >
                    <div className={`${module.color} w-12 h-12 rounded-xl flex items-center justify-center text-white mb-6 group-hover:scale-110 transition-transform`}>
                      <module.icon size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{module.title}</h3>
                    <p className="text-slate-500 text-sm leading-relaxed">{module.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section id="features" className="py-24 bg-slate-50 px-6">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-20">
                <h2 className="text-4xl font-bold text-slate-900 mb-4">Platform Capabilities</h2>
                <p className="text-slate-500 max-w-2xl mx-auto">Everything you need to manage health records efficiently and securely in one place.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[
                  { icon: FileText, title: "Electronic Records", desc: "Digital storage for all medical history, prescriptions, and diagnostic reports.", color: "bg-blue-500" },
                  { icon: Activity, title: "Vitals Tracking", desc: "Monitor patient vital signs with intuitive charts and real-time data visualization.", color: "bg-emerald-500" },
                  { icon: Clock, title: "Smart Scheduling", desc: "Manage appointments effortlessly with our automated scheduling system.", color: "bg-amber-500" },
                  { icon: Lock, title: "Secure Access", desc: "Enterprise-grade security ensuring patient data is always protected and private.", color: "bg-indigo-500" },
                  { icon: Download, title: "PDF Reports", desc: "Generate professional medical reports and summaries with a single click.", color: "bg-rose-500" },
                  { icon: Users, title: "Patient Directory", desc: "A comprehensive database to manage patient profiles and contact information.", color: "bg-slate-800" }
                ].map((feature, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    viewport={{ once: true }}
                    className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group"
                  >
                    <div className={`${feature.color} w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-6 shadow-lg shadow-${feature.color.split('-')[1]}-200 group-hover:scale-110 transition-transform`}>
                      <feature.icon size={28} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                    <p className="text-slate-500 leading-relaxed text-sm">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* About Us Section */}
          <section id="about" className="py-24 px-6">
            <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="order-2 lg:order-1"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <img src="https://picsum.photos/seed/clinic1/400/500" alt="Clinic" className="rounded-3xl w-full h-64 object-cover" referrerPolicy="no-referrer" />
                    <img src="https://picsum.photos/seed/clinic2/400/300" alt="Clinic" className="rounded-3xl w-full h-40 object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div className="space-y-4 pt-12">
                    <img src="https://picsum.photos/seed/clinic3/400/300" alt="Clinic" className="rounded-3xl w-full h-40 object-cover" referrerPolicy="no-referrer" />
                    <img src="https://picsum.photos/seed/clinic4/400/500" alt="Clinic" className="rounded-3xl w-full h-64 object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>
              </motion.div>
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="order-1 lg:order-2"
              >
                <h2 className="text-4xl font-bold text-slate-900 mb-6 leading-tight">Dedicated to <span className="text-emerald-500 italic serif">Modern Healthcare</span> Excellence.</h2>
                <p className="text-slate-500 mb-8 leading-relaxed">
                  At CharlesTrack, we believe that technology should empower healthcare providers, not hinder them. Our mission is to simplify medical record management through innovative digital solutions that prioritize security, accessibility, and user experience.
                </p>
                <div className="space-y-4">
                  {[
                    "Over 10 years of healthcare technology experience",
                    "Trusted by clinics and hospitals nationwide",
                    "Committed to patient data privacy and security",
                    "Continuous innovation and feature updates"
                  ].map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 size={12} />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>

          {/* Contact Section */}
          <section id="contact" className="py-24 bg-slate-900 px-6 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-full h-full opacity-10">
              <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500 via-transparent to-transparent blur-3xl" />
            </div>
            <div className="max-w-7xl mx-auto relative z-10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                <div>
                  <h2 className="text-4xl font-bold text-white mb-6">Get in Touch</h2>
                  <p className="text-slate-400 mb-10 text-lg">Have questions about CharlesTrack? Our team is here to help you optimize your clinic's operations.</p>
                  <div className="space-y-6">
                    <div className="flex items-center gap-4 text-slate-300">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500"><Phone size={20} /></div>
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Phone</p><p className="font-medium">+86 186 5192 7052</p></div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500"><FileText size={20} /></div>
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Email</p><p className="font-medium">support@charlestrack.com</p></div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500"><Activity size={20} /></div>
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Office</p><p className="font-medium">JUST int build 111</p></div>
                    </div>
                    {user && (
                      <button 
                        onClick={() => {
                          setShowLanding(false);
                          setActiveTab("messages");
                        }}
                        className="mt-4 flex items-center gap-2 text-emerald-400 hover:text-emerald-300 font-bold text-sm transition-colors"
                      >
                        <MessageSquare size={18} />
                        View Active Messages in Dashboard
                        <ArrowUpRight size={16} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl">
                  <form onSubmit={handleContactSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">First Name</label>
                        <input 
                          required
                          type="text" 
                          placeholder="Jane" 
                          value={contactForm.first_name}
                          onChange={e => setContactForm({...contactForm, first_name: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                        />
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Last Name</label>
                        <input 
                          required
                          type="text" 
                          placeholder="Doe" 
                          value={contactForm.last_name}
                          onChange={e => setContactForm({...contactForm, last_name: e.target.value})}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Email Address</label>
                      <input 
                        required
                        type="email" 
                        placeholder="jane@example.com" 
                        value={contactForm.email}
                        onChange={e => setContactForm({...contactForm, email: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Message</label>
                      <textarea 
                        required
                        rows={4} 
                        placeholder="How can we help you?" 
                        value={contactForm.message}
                        onChange={e => setContactForm({...contactForm, message: e.target.value})}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 resize-none" 
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={loading}
                      className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-100 disabled:opacity-50"
                    >
                      {loading ? "Sending..." : "Send Message"}
                    </button>
                    <p className="text-[10px] text-center text-slate-400 uppercase tracking-widest font-bold mt-4">
                      Note: Messages are stored securely in our clinic dashboard.
                    </p>
                  </form>
                </div>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="bg-slate-950 text-slate-500 py-16 px-6">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 border-b border-slate-900 pb-12 mb-12">
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center gap-2 mb-6">
                  <div className="bg-emerald-500 p-2 rounded-xl">
                    <img src="https://picsum.photos/seed/logo/64/64" alt="CharlesTrack Logo" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
                  </div>
                  <span className="font-bold text-xl text-white tracking-tight">CharlesTrack</span>
                </div>
                <p className="max-w-xs text-sm leading-relaxed">
                  Empowering healthcare through digital innovation. Secure, reliable, and intuitive health record management for the modern era.
                </p>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Quick Links</h4>
                <ul className="space-y-4 text-sm">
                  <li><a href="#home" className="hover:text-emerald-400 transition-colors">Home</a></li>
                  <li><a href="#modules" className="hover:text-emerald-400 transition-colors">Modules</a></li>
                  <li><a href="#features" className="hover:text-emerald-400 transition-colors">Features</a></li>
                  <li><a href="#about" className="hover:text-emerald-400 transition-colors">About Us</a></li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-bold mb-6">Support</h4>
                <ul className="space-y-4 text-sm">
                  <li><a href="#contact" className="hover:text-emerald-400 transition-colors">Contact Us</a></li>
                  <li><a href="#" className="hover:text-emerald-400 transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-emerald-400 transition-colors">Terms of Service</a></li>
                </ul>
              </div>
            </div>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-xs uppercase tracking-widest font-bold">
              <p>© 2026 CharlesTrack. All Rights Reserved.</p>
              <div className="flex gap-8">
                <a href="#" className="hover:text-white transition-colors">Facebook</a>
                <a href="#" className="hover:text-white transition-colors">Twitter</a>
                <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
              </div>
            </div>
          </footer>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Decoration */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md relative z-10"
        >
          <button 
            onClick={() => setShowLanding(true)}
            className="mb-8 text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <ChevronRight className="rotate-180" size={16} />
            Back to Home
          </button>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 bg-emerald-500/10 rounded-3xl mb-4">
              <img src="https://picsum.photos/seed/logo/128/128" alt="CharlesTrack Logo" className="w-10 h-10 object-contain" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">CharlesTrack</h1>
            <p className="text-slate-400 mt-2">Personal Health Record Management System</p>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-2xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500">
                {showSignup ? <UserPlus size={20} /> : <Lock size={20} />}
              </div>
              <h2 className="text-xl font-bold text-white">{showSignup ? "Create Account" : "Secure Login"}</h2>
            </div>

            {showSignup ? (
              <form onSubmit={handleSignup} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      required
                      type="text"
                      placeholder="Choose a username"
                      value={signupForm.username}
                      onChange={e => setSignupForm({ ...signupForm, username: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      required
                      type="password"
                      placeholder="••••••••"
                      value={signupForm.password}
                      onChange={e => setSignupForm({ ...signupForm, password: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      required
                      type="password"
                      placeholder="••••••••"
                      value={signupForm.confirmPassword}
                      onChange={e => setSignupForm({ ...signupForm, confirmPassword: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 text-slate-950 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? "Creating Account..." : (
                    <>
                      <UserPlus size={20} />
                      Sign Up
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500">
                  Already have an account?{" "}
                  <button type="button" onClick={() => setShowSignup(false)} className="text-emerald-500 font-bold hover:underline">
                    Login
                  </button>
                </p>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Username</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      required
                      type="text"
                      placeholder="Enter your username"
                      value={loginForm.username}
                      onChange={e => setLoginForm({ ...loginForm, username: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input 
                      required
                      type="password"
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={e => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="w-full pl-12 pr-4 py-4 bg-slate-950 border border-slate-800 rounded-2xl text-white outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 text-slate-950 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/10 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? "Authenticating..." : (
                    <>
                      <LogIn size={20} />
                      Login to Dashboard
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => setShowSignup(true)} className="text-emerald-500 font-bold hover:underline">
                    Sign Up
                  </button>
                </p>
              </form>
            )}

            <div className="mt-8 pt-8 border-t border-slate-800 text-center">
              <p className="text-slate-500 text-sm">
                Default credentials: <span className="text-emerald-500 font-mono">admin / admin123</span>
              </p>
            </div>
          </div>

          <AnimatePresence>
            {message && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className={`mt-6 p-4 rounded-2xl border flex items-center gap-3 ${
                  message.type === "success" 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                    : "bg-red-500/10 border-red-500/20 text-red-400"
                }`}
              >
                {message.type === "success" ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                <span className="text-sm font-medium">{message.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <img src="https://picsum.photos/seed/logo/64/64" alt="CharlesTrack Logo" className="w-5 h-5 object-contain" referrerPolicy="no-referrer" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">CharlesTrack</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "directory", icon: Users, label: "Patients" },
            { id: "appointments", icon: Clock, label: "Schedule" },
            { id: "register", icon: UserPlus, label: "New Patient" },
            { id: "messages", icon: MessageSquare, label: "Messages" },
            ...(user?.role === "admin" ? [{ id: "users", icon: Lock, label: "User Management" }] : [])
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" : "hover:bg-slate-800 hover:text-white"}`}
            >
              <div className="flex items-center gap-3">
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </div>
              {item.id === "messages" && messages.some(m => m.is_read === 0) && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {messages.filter(m => m.is_read === 0).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="bg-slate-800 p-4 rounded-xl">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Logged in as</p>
            <div className="flex items-center gap-2 text-slate-300 text-sm font-bold">
              <User size={14} className="text-emerald-400" />
              {user?.username}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${user?.role === 'admin' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                {user?.role}
              </span>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
          <div className="bg-slate-800 p-4 rounded-xl">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">System Status</p>
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Connected
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 capitalize">{activeTab}</h1>
            <p className="text-slate-500 mt-1">{format(new Date(), "EEEE, MMMM do yyyy")}</p>
          </div>
          <AnimatePresence>
            {message && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                className={`px-4 py-2 rounded-lg border flex items-center gap-2 ${message.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                {message.type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <span className="text-sm font-medium">{message.text}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div key="dash" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              {/* Welcome & Quick Actions */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800">Welcome back, {user?.username}</h2>
                  <p className="text-slate-500">Here's what's happening at CharlesTrack today.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => setActiveTab("register")} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200">
                    <UserPlus size={18} />
                    Register Patient
                  </button>
                  <button onClick={() => setActiveTab("appointments")} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 transition-all shadow-lg shadow-slate-200">
                    <Clock size={18} />
                    New Appointment
                  </button>
                </div>
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Stats Cards */}
                {[
                  { label: "Total Patients", value: stats?.totalPatients || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-50", tab: "directory" },
                  { label: "Medical Records", value: stats?.totalRecords || 0, icon: FileText, color: "text-emerald-500", bg: "bg-emerald-50", tab: "directory" },
                  { label: "Upcoming Appts", value: stats?.upcomingAppointments || 0, icon: Clock, color: "text-amber-500", bg: "bg-amber-50", tab: "appointments" },
                  { label: "Active Messages", value: messages.filter(m => m.is_read === 0).length, icon: MessageSquare, color: "text-rose-500", bg: "bg-rose-50", tab: "messages" }
                ].map(stat => (
                  <div 
                    key={stat.label} 
                    onClick={() => stat.tab && setActiveTab(stat.tab as any)}
                    className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group hover:border-emerald-200"
                  >
                    <div className={`${stat.bg} w-12 h-12 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                      <stat.icon size={24} className={stat.color} />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-3xl font-black text-slate-800">{stat.value}</p>
                      <ArrowUpRight size={20} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </div>
                ))}

                {/* Main Chart Area */}
                <div className="md:col-span-2 lg:col-span-3 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-8">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Clinic Activity</h3>
                      <p className="text-sm text-slate-500">Patient visits over the last 7 days</p>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full text-xs font-bold">
                      <TrendingUp size={14} />
                      +12% from last week
                    </div>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats?.recentVisits || []}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
                          dy={10}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
                          dx={-10}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            borderRadius: "16px", 
                            border: "none", 
                            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
                            padding: "12px"
                          }} 
                        />
                        <Area 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#10b981" 
                          strokeWidth={4} 
                          fillOpacity={1} 
                          fill="url(#colorCount)" 
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Next Appointments Sidebar */}
                <div className="lg:col-span-1 bg-slate-900 p-8 rounded-3xl text-white shadow-xl shadow-slate-200">
                  <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                    <Clock size={20} className="text-emerald-400" />
                    Next Up
                  </h3>
                  <div className="space-y-6">
                    {appointments.slice(0, 4).map(app => (
                      <div key={app.id} className="group cursor-pointer">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 group-hover:text-emerald-400 transition-colors">
                          {format(new Date(app.appointment_date), "h:mm a")}
                        </p>
                        <p className="font-bold text-white">{app.patient_name}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{app.reason}</p>
                      </div>
                    ))}
                    {appointments.length === 0 && (
                      <div className="py-12 text-center text-slate-500">
                        <Calendar size={32} className="mx-auto mb-3 opacity-20" />
                        <p className="text-sm">No appointments</p>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setActiveTab("appointments")} className="w-full mt-8 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                    View Schedule
                  </button>
                </div>

                {/* System Status Widget */}
                <div className="lg:col-span-1 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">System Status</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">API Status</span>
                      <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Database</span>
                      <span className="text-xs font-bold text-slate-800">{health?.database || 'Unknown'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Total Messages</span>
                      <span className="text-xs font-bold text-slate-800">{health?.messages ?? 0}</span>
                    </div>
                  </div>
                  <button 
                    onClick={fetchDashboardData}
                    className="w-full mt-6 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-400 uppercase tracking-widest transition-all"
                  >
                    Refresh Status
                  </button>
                </div>

                {/* Patient Messages - Full Width Bottom */}
                <div className="lg:col-span-4 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="text-xl font-bold text-slate-800">Patient Inquiries</h3>
                      <p className="text-sm text-slate-500">Recent messages from the contact portal</p>
                    </div>
                    <button 
                      onClick={fetchMessages}
                      className="p-2 hover:bg-slate-50 rounded-lg text-slate-400 transition-colors"
                    >
                      <RefreshCw size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {messages.length > 0 ? messages.slice(0, 3).map((msg) => (
                      <div key={msg.id} className="group bg-slate-50 p-6 rounded-2xl border border-transparent hover:border-emerald-200 hover:bg-white transition-all">
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm relative">
                            <User size={20} />
                            {msg.is_read === 0 && (
                              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 border-2 border-white rounded-full"></span>
                            )}
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                              {format(new Date(msg.created_at), "MMM d, HH:mm")}
                            </span>
                            {msg.is_read === 0 && (
                              <button 
                                onClick={() => handleMarkAsRead(msg.id)}
                                className="text-[9px] font-bold text-emerald-600 hover:text-emerald-700 uppercase mt-1"
                              >
                                Mark as read
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="font-bold text-slate-800">{msg.first_name} {msg.last_name}</p>
                        <p className="text-xs text-slate-500 mb-4">{msg.email}</p>
                        <div className="bg-white/50 p-3 rounded-xl text-sm text-slate-600 italic line-clamp-2 mb-4">
                          "{msg.message}"
                        </div>
                        
                        {replyingTo === msg.id ? (
                          <div className="space-y-2">
                            <textarea 
                              autoFocus
                              placeholder="Type your reply..."
                              value={replyContent}
                              onChange={(e) => setReplyContent(e.target.value)}
                              className="w-full p-3 bg-white border border-emerald-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[80px] resize-none"
                            />
                            <div className="flex gap-2">
                              <button 
                                onClick={() => {
                                  handleReplyMessage(msg.id, replyContent);
                                  setReplyingTo(null);
                                  setReplyContent("");
                                }}
                                className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-all"
                              >
                                Send
                              </button>
                              <button 
                                onClick={() => {
                                  setReplyingTo(null);
                                  setReplyContent("");
                                }}
                                className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setReplyingTo(msg.id)}
                            className="w-full py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                          >
                            Send Quick Reply
                          </button>
                        )}
                      </div>
                    )) : (
                      <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <MessageSquare className="mx-auto mb-3 text-slate-300" size={32} />
                        <p className="text-slate-500 font-medium">No new messages</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "messages" && (
            <motion.div key="messages" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Patient Inquiries</h2>
                  <p className="text-slate-500">Manage and respond to messages from the contact portal.</p>
                </div>
                <button 
                  onClick={fetchMessages}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <RefreshCw size={18} />
                  Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6">
                {messages.length > 0 ? messages.map((msg) => (
                  <div key={msg.id} className={`bg-white p-8 rounded-3xl border ${msg.is_read === 0 ? 'border-emerald-200 shadow-emerald-50' : 'border-slate-200'} shadow-sm transition-all`}>
                    <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                      <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${msg.is_read === 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                          <User size={28} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-800">{msg.first_name} {msg.last_name}</h3>
                            {msg.is_read === 0 && (
                              <span className="bg-rose-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">New</span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">{msg.email}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                          {format(new Date(msg.created_at), "MMMM d, yyyy 'at' h:mm a")}
                        </span>
                        {msg.is_read === 0 && (
                          <button 
                            onClick={() => handleMarkAsRead(msg.id)}
                            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline"
                          >
                            Mark as read
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 mb-8">
                      <p className="text-slate-700 leading-relaxed italic">"{msg.message}"</p>
                    </div>

                    {msg.replies && msg.replies.length > 0 && (
                      <div className="space-y-4 mb-8 pl-8 border-l-2 border-emerald-100">
                        {msg.replies.map((reply: any) => (
                          <div key={reply.id} className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center text-white">
                                <CheckCircle2 size={12} />
                              </div>
                              <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Clinic Response</span>
                              <span className="text-[10px] text-slate-400 ml-auto">{format(new Date(reply.created_at), "MMM d, h:mm a")}</span>
                            </div>
                            <p className="text-sm text-slate-700">{reply.content}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-col gap-4">
                      {replyingTo === msg.id ? (
                        <div className="space-y-4">
                          <textarea 
                            autoFocus
                            placeholder="Type your response here..."
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            className="w-full p-4 bg-white border border-emerald-200 rounded-2xl text-sm outline-none focus:ring-2 focus:ring-emerald-500 min-h-[120px] shadow-inner"
                          />
                          <div className="flex gap-3">
                            <button 
                              onClick={() => {
                                handleReplyMessage(msg.id, replyContent);
                                setReplyingTo(null);
                                setReplyContent("");
                              }}
                              className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200"
                            >
                              Send Response
                            </button>
                            <button 
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyContent("");
                              }}
                              className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={() => setReplyingTo(msg.id)}
                          className="flex items-center justify-center gap-2 w-full py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all group"
                        >
                          <Send size={18} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                          Reply to Message
                        </button>
                      )}
                    </div>
                  </div>
                )) : (
                  <div className="py-24 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                      <MessageSquare className="text-slate-300" size={40} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 mb-2">No messages found</h3>
                    <p className="text-slate-500">When patients contact you from the landing page, they will appear here.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "users" && user?.role === "admin" && (
            <motion.div key="users" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 tracking-tight">User Management</h2>
                  <p className="text-slate-500">Manage clinic staff accounts and permissions.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <input 
                      type="text" 
                      placeholder="Search users..." 
                      value={userSearchQuery}
                      onChange={(e) => setUserSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-64"
                    />
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                  </div>
                  <button 
                    onClick={() => setShowCreateUser(!showCreateUser)}
                    className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-200"
                  >
                    <UserPlus size={20} />
                    {showCreateUser ? "Cancel" : "Create New User"}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showCreateUser && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-800 mb-6">Register New Staff Member</h3>
                      <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username</label>
                          <input 
                            required
                            type="text" 
                            placeholder="johndoe" 
                            value={adminUserForm.username}
                            onChange={e => setAdminUserForm({...adminUserForm, username: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                          <input 
                            required
                            type="password" 
                            placeholder="••••••••" 
                            value={adminUserForm.password}
                            onChange={e => setAdminUserForm({...adminUserForm, password: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Role</label>
                          <select 
                            value={adminUserForm.role}
                            onChange={e => setAdminUserForm({...adminUserForm, role: e.target.value})}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="admin">Admin</option>
                            <option value="doctor">Doctor</option>
                            <option value="staff">Staff</option>
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <button 
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all disabled:opacity-50"
                          >
                            {loading ? "Creating..." : "Create Account"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Username</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Role</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => u.username.toLowerCase().includes(userSearchQuery.toLowerCase())).map((u) => (
                      <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                              <User size={16} />
                            </div>
                            <span className="font-bold text-slate-700">{u.username}</span>
                            {u.id === user.id && <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase">You</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <select 
                            value={u.role}
                            disabled={u.id === user.id}
                            onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50"
                          >
                            <option value="admin">Admin</option>
                            <option value="doctor">Doctor</option>
                            <option value="staff">Staff</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-4">
                            <button 
                              onClick={() => handleResetPassword(u.id)}
                              className="text-slate-400 hover:text-emerald-500 font-bold text-sm transition-colors flex items-center gap-1"
                            >
                              <RefreshCw size={14} />
                              Reset Password
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.id)}
                              disabled={u.id === user.id}
                              className="text-rose-500 hover:text-rose-600 font-bold text-sm disabled:opacity-30"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "directory" && (
            <motion.div key="dir" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="relative mb-6">
                    <input type="text" placeholder="Search patients..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none" />
                    <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                    {patients.map(p => (
                      <button key={p.id} onClick={() => selectPatient(p)}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-center justify-between group ${selectedPatient?.id === p.id ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-emerald-200"}`}>
                        <div><p className="font-bold text-slate-800">{p.name}</p><p className="text-xs text-slate-500 font-mono">{p.id}</p></div>
                        <ChevronRight size={16} className={selectedPatient?.id === p.id ? "text-emerald-500" : "text-slate-300"} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="lg:col-span-8">
                {selectedPatient ? (
                  <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-center">
                      <div className="w-24 h-24 bg-emerald-100 rounded-3xl flex items-center justify-center text-emerald-600"><User size={48} /></div>
                      <div className="flex-1 text-center md:text-left">
                        <h2 className="text-3xl font-bold text-slate-800">{selectedPatient.name} – <span className="text-slate-400 font-mono">{selectedPatient.id}</span></h2>
                        <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-3 text-slate-500">
                          <span className="flex items-center gap-1 text-sm"><Calendar size={14} /> {selectedPatient.age}y</span>
                          <span className="flex items-center gap-1 text-sm"><Scale size={14} /> {selectedPatient.gender}</span>
                          <span className="flex items-center gap-1 text-sm"><Ruler size={14} /> {patientVitals[0]?.height || "--"} cm</span>
                          <span className="flex items-center gap-1 text-sm"><Phone size={14} /> {selectedPatient.contact_info}</span>
                        </div>
                        <div className="flex flex-wrap justify-center md:justify-start gap-6 mt-4 pt-4 border-t border-slate-100">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Visit</p>
                            <p className="text-sm font-bold text-slate-700">{patientHistory[0]?.visit_date || "No visits yet"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Next Appointment</p>
                            <p className="text-sm font-bold text-emerald-600">
                              {appointments.find(a => a.patient_id === selectedPatient.id && new Date(a.appointment_date) > new Date())?.appointment_date 
                                ? format(new Date(appointments.find(a => a.patient_id === selectedPatient.id && new Date(a.appointment_date) > new Date())!.appointment_date), "MMM d, yyyy") 
                                : "None scheduled"}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={downloadPatientPDF} className="p-3 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors shadow-lg shadow-blue-200 flex items-center gap-2 px-4">
                          <Download size={20} />
                          <span className="font-bold text-sm">Download PDF</span>
                        </button>
                        <button className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-colors"><Phone size={20} /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* History Section - Moved to top of Update area */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><History className="text-emerald-500" size={20} /> Medical History</h3>
                        
                        {(user?.role === "admin" || user?.role === "doctor") && (
                          <form onSubmit={handleAddRecord} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Add New Record</p>
                            <input placeholder="Diagnosis" value={recordForm.diagnosis} onChange={e => setRecordForm({...recordForm, diagnosis: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                            <input placeholder="Prescription" value={recordForm.prescription} onChange={e => setRecordForm({...recordForm, prescription: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                            <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors">Add Record</button>
                          </form>
                        )}

                        <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                          {patientHistory.map(record => (
                            <div key={record.id} className="p-3 bg-white rounded-xl border border-slate-100">
                              <div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-emerald-600 uppercase">{record.visit_date}</span></div>
                              <p className="text-xs font-bold text-slate-800">{record.diagnosis}</p>
                              <p className="text-[10px] text-slate-500 mt-1 italic">{record.prescription}</p>
                            </div>
                          ))}
                          {patientHistory.length === 0 && (
                            <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-100 rounded-xl text-amber-700">
                              <AlertCircle size={16} />
                              <p className="text-sm font-medium">No past records – add first diagnosis</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Vitals Section */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="flex justify-between items-center mb-6">
                          <h3 className="font-bold text-slate-800 flex items-center gap-2"><Thermometer className="text-red-500" size={20} /> Latest Vitals</h3>
                        </div>

                        {(user?.role === "admin" || user?.role === "doctor") && (
                          <form onSubmit={handleAddVitals} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-3">Record New Vitals</p>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <input type="text" placeholder="BP (120/80)" value={vitalsForm.blood_pressure} onChange={e => setVitalsForm({...vitalsForm, blood_pressure: e.target.value})} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                              <input type="number" placeholder="HR (bpm)" value={vitalsForm.heart_rate} onChange={e => setVitalsForm({...vitalsForm, heart_rate: e.target.value})} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                              <input type="number" step="0.1" placeholder="Temp (°C)" value={vitalsForm.temperature} onChange={e => setVitalsForm({...vitalsForm, temperature: e.target.value})} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                              <input type="number" step="0.1" placeholder="Wt (kg)" value={vitalsForm.weight} onChange={e => setVitalsForm({...vitalsForm, weight: e.target.value})} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                              <input type="number" step="0.1" placeholder="Ht (cm)" value={vitalsForm.height} onChange={e => setVitalsForm({...vitalsForm, height: e.target.value})} className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                            </div>
                            <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors">Save Vitals</button>
                          </form>
                        )}

                        {patientVitals[0] ? (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {[
                              { label: "BP", value: patientVitals[0].blood_pressure, icon: Droplets, color: "text-red-500" },
                              { label: "Heart Rate", value: `${patientVitals[0].heart_rate} bpm`, icon: Heart, color: "text-rose-500" },
                              { label: "Temp", value: `${patientVitals[0].temperature}°C`, icon: Thermometer, color: "text-orange-500" },
                              { label: "Weight", value: `${patientVitals[0].weight} kg`, icon: Scale, color: "text-blue-500" },
                              { label: "Height", value: `${patientVitals[0].height} cm`, icon: Ruler, color: "text-indigo-500" }
                            ].map(v => (
                              <div key={v.label} className="bg-white p-3 rounded-xl border border-slate-100">
                                <div className="flex items-center gap-2 mb-1"><v.icon size={14} className={v.color} /><span className="text-[10px] font-bold text-slate-400 uppercase">{v.label}</span></div>
                                <p className="text-sm font-bold text-slate-800">{v.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-4 bg-orange-50 border border-orange-100 rounded-xl text-orange-700">
                            <AlertCircle size={16} />
                            <p className="text-sm font-medium">No vitals recorded</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[500px] bg-white rounded-3xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                    <Users size={48} className="opacity-20 mb-4" />
                    <h3 className="text-xl font-bold text-slate-600">Patient Profile</h3>
                    <p className="max-w-xs text-sm mt-2">Select a patient to view their complete medical profile, vitals, and history.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "appointments" && (
            <motion.div key="appts" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><Clock className="text-amber-500" size={20} /> Schedule Appointment</h3>
                  <form onSubmit={handleAddAppointment} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Patient</label>
                      <select required value={appointmentForm.patient_id} onChange={e => setAppointmentForm({...appointmentForm, patient_id: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none">
                        <option value="">Select Patient</option>
                        {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date & Time</label>
                      <input required type="datetime-local" value={appointmentForm.date} onChange={e => setAppointmentForm({...appointmentForm, date: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reason</label>
                      <input required placeholder="e.g. Annual Checkup" value={appointmentForm.reason} onChange={e => setAppointmentForm({...appointmentForm, reason: e.target.value})} className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none" />
                    </div>
                    <button type="submit" className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900 transition-colors shadow-lg shadow-slate-200">Schedule</button>
                  </form>
                </div>
              </div>
              <div className="lg:col-span-8">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2"><ClipboardList className="text-emerald-500" size={20} /> Upcoming Schedule</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map(app => (
                      <div key={app.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
                        <div className="bg-white p-3 rounded-xl shadow-sm text-emerald-600"><Calendar size={20} /></div>
                        <div>
                          <p className="font-bold text-slate-800">{app.patient_name}</p>
                          <p className="text-xs text-slate-500 font-medium">{format(new Date(app.appointment_date), "MMM d, yyyy • h:mm a")}</p>
                          <div className="mt-2 inline-block px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider">{app.reason}</div>
                        </div>
                      </div>
                    ))}
                    {appointments.length === 0 && <div className="col-span-2 text-center py-20 text-slate-400 italic">No appointments scheduled</div>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "register" && (
            <motion.div key="reg" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-2xl mx-auto">
              <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-4 mb-8">
                  <div className="bg-emerald-100 p-3 rounded-2xl text-emerald-600"><UserPlus size={24} /></div>
                  <div><h3 className="text-xl font-bold text-slate-800">New Patient Registration</h3><p className="text-sm text-slate-500">Enter patient details to create a new health record.</p></div>
                </div>
                <form onSubmit={handleRegisterPatient} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Patient ID</label>
                      <input required placeholder="PAT-001" value={patientForm.id} onChange={e => setPatientForm({...patientForm, id: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name</label>
                      <input required placeholder="John Doe" value={patientForm.name} onChange={e => setPatientForm({...patientForm, name: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Age</label>
                      <input required type="number" placeholder="25" value={patientForm.age} onChange={e => setPatientForm({...patientForm, age: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Gender</label>
                      <select value={patientForm.gender} onChange={e => setPatientForm({...patientForm, gender: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500">
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Contact Information</label>
                      <input required placeholder="Phone or Email" value={patientForm.contact_info} onChange={e => setPatientForm({...patientForm, contact_info: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 mt-4">Complete Registration</button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
