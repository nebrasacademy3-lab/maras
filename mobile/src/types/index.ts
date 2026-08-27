export type UserRole = "student" | "supervisor" | "admin";

export type SessionUser = {
  id: number;
  email: string;
  phone: string | null;
  fullName: string;
  universitySlug: string | null;
  specialty: string | null;
  role: UserRole;
  profileCompleted: boolean;
  onboardingCompleted: boolean;
};

export type Institution = {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  type: string;
  logo?: string;
  domain?: string;
  specialties: number;
  courses: number;
  featured?: boolean;
};

export type Lesson = { id: string; title: string; duration: string; free: boolean; type: "video" | "pdf" };
export type CourseUnit = { title: string; lessons: Lesson[] };
export type Course = {
  slug: string;
  title: string;
  titleEn: string;
  code?: string;
  university: string;
  universitySlug: string;
  specialty: string;
  description: string;
  price: number;
  oldPrice?: number;
  rating: number;
  ratingsCount: number;
  students: number;
  duration: string;
  lessons: number;
  instructor: string;
  color: string;
  icon: string;
  featured?: boolean;
  access: string;
  units: CourseUnit[];
  updatedAt?: string;
};

export type Catalog = { ok: true; institutions: Institution[]; courses: Course[] };
export type ProgressRow = { id: number; courseSlug: string; lessonId: string; watchedSeconds: number; completed: boolean; updatedAt: string };
export type OwnedCourse = Course & { progress: number; currentLessonId: string | null; expiresAt: string | null };
export type CourseRequest = { id: number; courseName: string; university: string; specialty: string; status: string; attachmentsCount: number; createdAt: string; notes?: string };
export type Order = { orderNumber: string; courseSlug: string; courseTitle: string; total: number; currency: string; status: string; createdAt: string };
export type Invoice = { id: number; invoiceNumber: string; orderNumber: string; total: number; taxAmount: number; currency: string; issuedAt: string; pdfObjectKey: string | null };
export type Notice = { id: number; title: string; body: string; actionUrl: string | null; readAt: string | null; createdAt: string };
export type SupportReply = { id: number; body: string; createdAt: string };
export type SupportTicket = { id: number; ticketNumber: string; category: string; title: string; message: string; status: string; createdAt: string; replies: SupportReply[] };
export type Dashboard = {
  ok: true;
  user: SessionUser;
  owned: OwnedCourse[];
  progress: ProgressRow[];
  orders: Order[];
  invoices: Invoice[];
  requests: CourseRequest[];
  notifications: Notice[];
  tickets: SupportTicket[];
  recommended: Course[];
  institutions: Institution[];
};

export type PublicSettings = {
  whatsapp_number: string;
  whatsapp_message: string;
  whatsapp_url: string;
  support_email: string;
  support_hours: string;
  social_x: string;
  social_instagram: string;
  social_tiktok: string;
  social_telegram: string;
  social_youtube: string;
  social_linkedin: string;
  announcement: string;
};

export type Review = { id: number; courseSlug: string; rating: number; body: string; createdAt: string; author: string; specialty: string; verifiedPurchase: true };
