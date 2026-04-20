import React, { useState, useEffect } from "react";
import { 
  PlusCircle, Search, UserPlus, FileText, History, Activity, User, 
  Phone, Calendar, ChevronRight, ClipboardList, AlertCircle, 
  CheckCircle2, LayoutDashboard, Clock, Thermometer, Heart, 
  Scale, Ruler, Droplets, TrendingUp, Users, ArrowUpRight,
  Lock, LogIn, LogOut, Download, MessageSquare, Send, RefreshCw,
  Trash2, ShieldCheck, ShieldAlert, Camera, Upload, Stethoscope
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
  const [showLanding, setShowLanding] = useState(true);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [activeTab, setActiveTab] = useState<"dashboard" | "directory" | "appointments" | "register" | "accounts" | "profile">("dashboard");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientHistory, setPatientHistory] = useState<MedicalRecord[]>([]);
  const [patientVitals, setPatientVitals] = useState<Vitals[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Forms
  const [patientForm, setPatientForm] = useState({ id: "", name: "", age: "", gender: "Male", contact_info: "" });
  const [recordForm, setRecordForm] = useState({ diagnosis: "", prescription: "", visit_date: format(new Date(), "yyyy-MM-dd") });
  const [appointmentForm, setAppointmentForm] = useState({ patient_id: "", date: format(new Date(), "yyyy-MM-dd'T'HH:mm"), reason: "" });
  const [vitalsForm, setVitalsForm] = useState({ weight: "", height: "", blood_pressure: "", heart_rate: "", temperature: "" });
  const [contactForm, setContactForm] = useState({ first_name: "", last_name: "", email: "", message: "" });
  const [userForm, setUserForm] = useState({ username: "", password: "", role: "staff" });
  const [profileForm, setProfileForm] = useState({ full_name: "", bio: "", profile_picture: "" });

  useEffect(() => {
    if (user) {
      setProfileForm({
        full_name: user.full_name || "",
        bio: user.bio || "",
        profile_picture: user.profile_picture || ""
      });
    }
  }, [user]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchPatients();
      fetchAppointments();
      fetchMessages();

      // Poll for new messages every 30 seconds
      const interval = setInterval(fetchMessages, 30000);
      return () => clearInterval(interval);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === "accounts" && user?.role === "admin") {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  };

  const checkAuth = async () => {
    try {
      const res = await fetchWithAuth("/api/me");
      const data = await res.json();
      if (data.authenticated) {
        setUser(data.user);
      }
    } catch (err) {
      console.error("Auth check failed", err);
    } finally {
      setAuthChecked(true);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetchWithAuth("/api/users");
      const data = await res.json();
      if (res.ok) setAllUsers(data);
    } catch (err) { console.error(err); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userForm)
      });
      
      const contentType = res.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        console.error("Non-JSON Server Response:", text);
        data = { error: "The server sent back something that wasn't JSON. This usually means a connection error." };
      }
      
      if (res.ok) {
        showMsg("success", "Account created successfully!");
        setUserForm({ username: "", password: "", role: "staff" });
        fetchUsers();
      } else {
        showMsg("error", data.error || `Server Error ${res.status}`);
        console.error("Account creation failure details:", data);
      }
    } catch (err: any) { 
      showMsg("error", `Network Error: ${err.message || 'Check your internet connection'}`);
      console.error("Fetch implementation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to delete this account?")) return;
    try {
      const res = await fetchWithAuth(`/api/users/${userId}`, { method: "DELETE" });
      if (res.ok) {
        showMsg("success", "Account deleted");
        fetchUsers();
      } else {
        const data = await res.json();
        showMsg("error", data.error || "Failed to delete");
      }
    } catch (err) { showMsg("error", "Network error"); }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetchWithAuth(`/api/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        showMsg("success", "Role updated");
        fetchUsers();
      } else {
        const data = await res.json().catch(() => ({ error: "Update failed" }));
        showMsg("error", data.error || "Failed to update role");
      }
    } catch (err) { showMsg("error", "Network error"); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        showMsg("success", "Welcome back!");
      } else {
        showMsg("error", data.error || "Login failed");
      }
    } catch (err) {
      showMsg("error", "Network error during login");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetchWithAuth("/api/logout", { method: "POST" });
      if (res.ok) {
        setUser(null);
        setActiveTab("dashboard");
        showMsg("success", "Logged out successfully");
      }
    } catch (err) {
      showMsg("error", "Logout failed");
    }
  };

  const fetchDashboardData = async () => {
    try {
      const res = await fetchWithAuth("/api/dashboard/stats");
      const data = await res.json();
      setStats(data);
    } catch (err) { console.error(err); }
  };

  const fetchPatients = async (query = "") => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/patients${query ? `?query=${query}` : ""}`);
      const data = await res.json();
      setPatients(data);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchAppointments = async () => {
    try {
      const res = await fetchWithAuth("/api/appointments");
      const data = await res.json();
      setAppointments(data);
    } catch (err) { console.error(err); }
  };

  const fetchMessages = async () => {
    try {
      const res = await fetchWithAuth("/api/contact");
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
      } else {
        if (res.status !== 401) { // Don't show error if just not logged in
          showMsg("error", "Failed to sync messages");
        }
        console.error("Failed to fetch messages:", data.error);
      }
    } catch (err) { 
      console.error("Message fetch error:", err);
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
      
      const data = await res.json().catch(() => ({ error: "Invalid server response" }));
      
      if (res.ok) {
        showMsg("success", "Patient registered!");
        setPatientForm({ id: "", name: "", age: "", gender: "Male", contact_info: "" });
        fetchPatients();
        fetchDashboardData();
      } else {
        showMsg("error", data.error || `Error ${res.status}`);
        console.error("Registration failed:", data);
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
      if (res.ok) {
        showMsg("success", "Message sent successfully! We will get back to you soon.");
        setContactForm({ first_name: "", last_name: "", email: "", message: "" });
      } else {
        showMsg("error", "Failed to send message. Please try again.");
      }
    } catch (err) {
      showMsg("error", "Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm)
      });
      if (res.ok) {
        showMsg("success", "Profile updated successfully!");
        checkAuth();
      } else {
        const data = await res.json();
        showMsg("error", data.error || "Update failed");
      }
    } catch (err) { showMsg("error", "Network error"); }
    finally { setLoading(false); }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showMsg("error", "Image too large. Please select an image under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileForm({ ...profileForm, profile_picture: reader.result as string });
    };
    reader.readAsDataURL(file);
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
                <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-2.5 rounded-2xl shadow-xl shadow-emerald-200/50 flex items-center justify-center">
                  <Stethoscope size={28} className="text-white" strokeWidth={2.5} />
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
                  <Lock size={18} />
                  Staff Portal
                </button>
              </div>
            </div>
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
                  CharlesTrack provides a secure, intuitive, and professional platform for managing patient health records and clinic operations.
                </p>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => setShowLanding(false)}
                    className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-200 flex items-center gap-2"
                  >
                    Portal Access
                    <ArrowUpRight size={20} />
                  </button>
                  <a href="#modules" className="px-8 py-4 rounded-2xl font-bold text-lg text-slate-600 hover:bg-slate-50 transition-all border border-slate-200">
                    Explore Solution
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
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Phone</p><p className="font-medium">+63 912 345 6789</p></div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500"><FileText size={20} /></div>
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Email</p><p className="font-medium">support@meditrack.ph</p></div>
                    </div>
                    <div className="flex items-center gap-4 text-slate-300">
                      <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center text-emerald-500"><Activity size={20} /></div>
                      <div><p className="text-xs font-bold text-slate-500 uppercase">Office</p><p className="font-medium">BGC, Taguig City, Metro Manila</p></div>
                    </div>
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
                  <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-2 rounded-xl flex items-center justify-center">
                    <Stethoscope size={20} className="text-white" strokeWidth={2.5} />
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
            <div className="inline-flex items-center justify-center p-6 bg-gradient-to-br from-emerald-400/20 to-teal-600/20 rounded-[2rem] mb-6 shadow-inner border border-emerald-500/10">
              <Stethoscope size={48} className="text-emerald-500" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">CharlesTrack</h1>
            <p className="text-slate-400 mt-2">Personal Health Record Management System</p>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] border border-slate-800 shadow-2xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-500">
                <Lock size={20} />
              </div>
              <h2 className="text-xl font-bold text-white">Secure Login</h2>
            </div>

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
            </form>

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
          <div className="bg-gradient-to-br from-emerald-400 to-teal-600 p-2.5 rounded-xl shadow-lg shadow-emerald-900/40">
            <Stethoscope size={20} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">CharlesTrack</span>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
            { id: "directory", icon: Users, label: "Patients" },
            { id: "appointments", icon: Clock, label: "Schedule" },
            { id: "register", icon: UserPlus, label: "New Patient" },
            { id: "profile", icon: User, label: "Profile" },
            ...(user?.role === "admin" ? [{ id: "accounts", icon: Lock, label: "Accounts" }] : [])
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
              {item.id === "dashboard" && messages.some(m => m.is_read === 0) && (
                <span className="bg-emerald-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full">
                  {messages.filter(m => m.is_read === 0).length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-800 space-y-4">
          <div className="bg-slate-800 p-4 rounded-xl">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">User</p>
            <div className="flex items-center gap-2 text-slate-300 text-sm">
              <User size={14} className="text-emerald-400" />
              {user?.username}
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
                  { label: "Total Patients", value: stats?.totalPatients || 0, icon: Users, color: "text-blue-500", bg: "bg-blue-50" },
                  { label: "Medical Records", value: stats?.totalRecords || 0, icon: FileText, color: "text-emerald-500", bg: "bg-emerald-50" },
                  { label: "Upcoming Appts", value: stats?.upcomingAppointments || 0, icon: Clock, color: "text-amber-500", bg: "bg-amber-50" },
                  { label: "Active Messages", value: messages.filter(m => m.is_read === 0).length, icon: MessageSquare, color: "text-rose-500", bg: "bg-rose-50" }
                ].map(stat => (
                  <div key={stat.label} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className={`${stat.bg} w-12 h-12 rounded-2xl flex items-center justify-center mb-4`}>
                      <stat.icon size={24} className={stat.color} />
                    </div>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                    <p className="text-3xl font-black text-slate-800 mt-1">{stat.value}</p>
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
                          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-slate-400 group-hover:text-emerald-500 transition-colors shadow-sm">
                            <User size={20} />
                          </div>
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
                            {format(new Date(msg.created_at), "MMM d, HH:mm")}
                          </span>
                        </div>
                        <p className="font-bold text-slate-800">{msg.first_name} {msg.last_name}</p>
                        <p className="text-xs text-slate-500 mb-4">{msg.email}</p>
                        <div className="bg-white/50 p-3 rounded-xl text-sm text-slate-600 italic line-clamp-2 mb-4">
                          "{msg.message}"
                        </div>
                        <button 
                          onClick={() => {
                            const reply = prompt("Enter your reply:");
                            if (reply) handleReplyMessage(msg.id, reply);
                          }}
                          className="w-full py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-emerald-500 hover:text-white hover:border-emerald-500 transition-all"
                        >
                          Send Quick Reply
                        </button>
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
                        
                        <form onSubmit={handleAddRecord} className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                          <p className="text-xs font-bold text-slate-500 uppercase mb-2">Add New Record</p>
                          <input placeholder="Diagnosis" value={recordForm.diagnosis} onChange={e => setRecordForm({...recordForm, diagnosis: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                          <input placeholder="Prescription" value={recordForm.prescription} onChange={e => setRecordForm({...recordForm, prescription: e.target.value})} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs" />
                          <button type="submit" className="w-full bg-emerald-600 text-white py-2 rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors">Add Record</button>
                        </form>

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

          {activeTab === "profile" && (
            <motion.div key="profile" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-4xl mx-auto w-full">
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="h-32 bg-gradient-to-r from-emerald-500 to-teal-500" />
                <div className="px-8 pb-8 text-left">
                  <div className="relative -mt-16 mb-8 flex flex-col md:flex-row md:items-end gap-6">
                    <div className="relative group">
                      <div className="w-32 h-32 rounded-3xl border-4 border-white bg-slate-100 shadow-lg overflow-hidden flex items-center justify-center">
                        {profileForm.profile_picture ? (
                          <img src={profileForm.profile_picture} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <User size={48} className="text-slate-400" />
                        )}
                        <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                          <Camera className="text-white" size={24} />
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      </div>
                    </div>
                    <div className="flex-1">
                      <h2 className="text-3xl font-black text-slate-800">{user?.full_name || user?.username}</h2>
                      <p className="text-slate-500 font-bold uppercase tracking-wider text-xs bg-slate-100 inline-block px-3 py-1 rounded-full mt-2">{user?.role}</p>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Basic Information</h3>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Full Name</label>
                        <input 
                          placeholder="Your official name" 
                          value={profileForm.full_name} 
                          onChange={e => setProfileForm({...profileForm, full_name: e.target.value})} 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Profile Picture</label>
                        <div className="flex gap-4">
                          <input 
                            placeholder="https://example.com/photo.jpg" 
                            value={profileForm.profile_picture} 
                            onChange={e => setProfileForm({...profileForm, profile_picture: e.target.value})} 
                            className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500" 
                          />
                          <label className="bg-slate-200 p-3 rounded-xl cursor-pointer hover:bg-slate-300 transition-colors flex items-center justify-center">
                            <Upload size={20} className="text-slate-600" />
                            <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Professional Bio</h3>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Short Biography</label>
                        <textarea 
                          rows={5}
                          placeholder="Tell us about yourself..." 
                          value={profileForm.bio} 
                          onChange={e => setProfileForm({...profileForm, bio: e.target.value})} 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 resize-none" 
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2 pt-4">
                      <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-slate-800 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-900 transition-all shadow-lg shadow-slate-200 flex items-center justify-center gap-2"
                      >
                        {loading && <RefreshCw className="animate-spin" size={20} />}
                        Save Profile Changes
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "accounts" && user?.role === "admin" && (
            <motion.div key="accounts" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-4">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm sticky top-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600"><UserPlus size={24} /></div>
                    <div><h3 className="text-xl font-bold text-slate-800">Create Account</h3><p className="text-sm text-slate-500">Add a new staff or admin user.</p></div>
                  </div>
                  <form onSubmit={handleCreateUser} className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Username</label>
                      <input required placeholder="johndoe" value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Password</label>
                      <input required type="password" placeholder="••••••••" value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Role</label>
                      <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="staff">Staff</option>
                        <option value="admin">Administrator</option>
                      </select>
                    </div>
                    <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">Create Account</button>
                  </form>
                </div>
              </div>
              <div className="lg:col-span-8">
                <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-xl font-bold text-slate-800 mb-8 flex items-center gap-2"><Users className="text-indigo-500" size={24} /> System Users</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allUsers.map(u => (
                      <div key={u.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between group h-full">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-200 text-slate-500'}`}>
                            {u.role === 'admin' ? <ShieldCheck size={24} /> : <User size={24} />}
                          </div>
                          <div>
                            <p className="font-bold text-slate-800">{u.username}</p>
                            <select 
                              value={u.role}
                              onChange={(e) => handleChangeRole(u.id, e.target.value)}
                              className={`mt-1 block px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer ${u.role === 'admin' ? 'bg-indigo-500 text-white' : 'bg-slate-300 text-slate-600'}`}
                            >
                              <option value="staff">Staff</option>
                              <option value="admin">Admin</option>
                            </select>
                          </div>
                        </div>
                        {u.id !== user?.id && (
                          <button 
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all md:opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs font-bold"
                          >
                             <Trash2 size={16} /> 
                             <span className="hidden sm:inline">Delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {allUsers.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                        <Users size={48} className="mx-auto mb-4 text-slate-300" />
                        <p className="text-slate-500">Syncing users...</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
