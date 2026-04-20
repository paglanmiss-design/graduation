export interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  contact_info: string;
  created_at?: string;
}

export interface MedicalRecord {
  id: string;
  patient_id: string;
  diagnosis: string;
  prescription: string;
  visit_date: string;
  created_at?: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  patient_name?: string;
  appointment_date: string;
  reason: string;
  status: string;
  created_at?: string;
}

export interface Vitals {
  id: string;
  patient_id: string;
  weight: number;
  height: number;
  blood_pressure: string;
  heart_rate: number;
  temperature: number;
  recorded_at: string;
}

export interface DashboardStats {
  totalPatients: number;
  totalRecords: number;
  upcomingAppointments: number;
  recentVisits: { date: string; count: number }[];
}

export interface User {
  id: string;
  username: string;
  role: string;
  full_name?: string;
  bio?: string;
  profile_picture?: string;
}
