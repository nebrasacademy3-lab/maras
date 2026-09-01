import { allPrograms, getInstitutionPrograms } from "@/lib/academic-data";

export type InstitutionType = "حكومية" | "أهلية" | "كلية" | "تقنية";

export type Institution = {
  slug: string;
  name: string;
  nameEn: string;
  region: string;
  type: InstitutionType;
  logo?: string;
  domain?: string;
  specialties: number;
  courses: number;
  featured?: boolean;
  officialName?: string;
  aliases?: string[];
  parentSlug?: string;
  directorySourceUrl?: string;
  verificationStatus?: "official-directory" | "pending-review";
};

export type Lesson = {
  id: string;
  title: string;
  description?: string;
  ready?: boolean;
  duration: string;
  free?: boolean;
  completed?: boolean;
  type?: "video" | "pdf" | "quiz";
};

export type CourseUnit = {
  title: string;
  description?: string;
  lessons: Lesson[];
};

export type Course = {
  slug: string;
  title: string;
  titleEn: string;
  code?: string;
  university: string;
  universitySlug: string;
  specialty: string;
  specialtySlug?: string;
  description: string;
  coverImage?: string;
  price: number;
  oldPrice?: number;
  rating: number;
  ratingsCount: number;
  students: number;
  duration: string;
  lessons: number;
  updatedAt: string;
  instructor: string;
  color: string;
  icon: string;
  featured?: boolean;
  access: string;
  accessDurationDays?: number;
  units: CourseUnit[];
  readyLessons?: number;
  availableForPurchase?: boolean;
};

const moeLogo = (file: string) =>
  `https://object.moe.gov.sa/studyinsaudi/universities/${file}`;

const cuaLogo = (file: string, folder = "2023/01") =>
  `https://www.cua.gov.sa/wp-content/uploads/${folder}/${file}`;

export const institutions: Institution[] = [
  { slug: "umm-al-qura", name: "جامعة أم القرى", nameEn: "Umm Al-Qura University", region: "مكة المكرمة", type: "حكومية", logo: moeLogo("30022.jpg"), domain: "uqu.edu.sa", specialties: 38, courses: 12, featured: true },
  { slug: "islamic-university", name: "الجامعة الإسلامية", nameEn: "Islamic University of Madinah", region: "المدينة المنورة", type: "حكومية", logo: moeLogo("30032.jpg"), domain: "iu.edu.sa", specialties: 24, courses: 0 },
  { slug: "imamu", name: "جامعة الإمام محمد بن سعود الإسلامية", nameEn: "Imam Mohammad Ibn Saud Islamic University", region: "الرياض", type: "حكومية", logo: moeLogo("1.jpg"), domain: "imamu.edu.sa", specialties: 42, courses: 8, featured: true },
  { slug: "ksu", name: "جامعة الملك سعود", nameEn: "King Saud University", region: "الرياض", type: "حكومية", logo: moeLogo("2.jpg"), domain: "ksu.edu.sa", specialties: 54, courses: 15, featured: true },
  { slug: "kau", name: "جامعة الملك عبدالعزيز", nameEn: "King Abdulaziz University", region: "مكة المكرمة", type: "حكومية", logo: moeLogo("30016.jpg"), domain: "kau.edu.sa", specialties: 57, courses: 9, featured: true },
  { slug: "kfupm", name: "جامعة الملك فهد للبترول والمعادن", nameEn: "King Fahd University of Petroleum & Minerals", region: "الشرقية", type: "حكومية", domain: "kfupm.edu.sa", specialties: 30, courses: 6, featured: true },
  { slug: "kfu", name: "جامعة الملك فيصل", nameEn: "King Faisal University", region: "الشرقية", type: "حكومية", logo: moeLogo("30013.jpg"), domain: "kfu.edu.sa", specialties: 41, courses: 4 },
  { slug: "kku", name: "جامعة الملك خالد", nameEn: "King Khalid University", region: "عسير", type: "حكومية", logo: moeLogo("30014.jpg"), domain: "kku.edu.sa", specialties: 45, courses: 5, featured: true },
  { slug: "qu", name: "جامعة القصيم", nameEn: "Qassim University", region: "القصيم", type: "حكومية", logo: moeLogo("30029.jpg"), domain: "qu.edu.sa", specialties: 48, courses: 7 },
  { slug: "taibahu", name: "جامعة طيبة", nameEn: "Taibah University", region: "المدينة المنورة", type: "حكومية", logo: moeLogo("30020.jpg"), domain: "taibahu.edu.sa", specialties: 39, courses: 3 },
  { slug: "tu", name: "جامعة الطائف", nameEn: "Taif University", region: "مكة المكرمة", type: "حكومية", logo: moeLogo("30027.jpg"), domain: "tu.edu.sa", specialties: 35, courses: 3 },
  { slug: "uoh", name: "جامعة حائل", nameEn: "University of Hail", region: "حائل", type: "حكومية", logo: moeLogo("30017.jpg"), domain: "uoh.edu.sa", specialties: 36, courses: 5 },
  { slug: "jazanu", name: "جامعة جازان", nameEn: "Jazan University", region: "جازان", type: "حكومية", logo: moeLogo("30012.jpg"), domain: "jazanu.edu.sa", specialties: 40, courses: 4 },
  { slug: "ju", name: "جامعة الجوف", nameEn: "Jouf University", region: "الجوف", type: "حكومية", logo: moeLogo("30026.jpg"), domain: "ju.edu.sa", specialties: 34, courses: 2 },
  { slug: "bu", name: "جامعة الباحة", nameEn: "Al-Baha University", region: "الباحة", type: "حكومية", logo: moeLogo("30007.jpg"), domain: "bu.edu.sa", specialties: 28, courses: 1 },
  { slug: "ut", name: "جامعة تبوك", nameEn: "University of Tabuk", region: "تبوك", type: "حكومية", logo: moeLogo("30011.jpg"), domain: "ut.edu.sa", specialties: 32, courses: 2 },
  { slug: "nu", name: "جامعة نجران", nameEn: "Najran University", region: "نجران", type: "حكومية", logo: moeLogo("30021.jpg"), domain: "nu.edu.sa", specialties: 31, courses: 3 },
  { slug: "nbu", name: "جامعة الحدود الشمالية", nameEn: "Northern Border University", region: "الحدود الشمالية", type: "حكومية", logo: moeLogo("30028.jpg"), domain: "nbu.edu.sa", specialties: 24, courses: 1 },
  { slug: "pnu", name: "جامعة الأميرة نورة بنت عبدالرحمن", nameEn: "Princess Nourah Bint Abdulrahman University", region: "الرياض", type: "حكومية", logo: moeLogo("3.jpg"), domain: "pnu.edu.sa", specialties: 50, courses: 5, featured: true },
  { slug: "iau", name: "جامعة الإمام عبدالرحمن بن فيصل", nameEn: "Imam Abdulrahman Bin Faisal University", region: "الشرقية", type: "حكومية", logo: moeLogo("30010.jpg"), domain: "iau.edu.sa", specialties: 45, courses: 6 },
  { slug: "psau", name: "جامعة الأمير سطام بن عبدالعزيز", nameEn: "Prince Sattam Bin Abdulaziz University", region: "الرياض", type: "حكومية", logo: moeLogo("30024.jpg"), domain: "psau.edu.sa", specialties: 30, courses: 3 },
  { slug: "su", name: "جامعة شقراء", nameEn: "Shaqra University", region: "الرياض", type: "حكومية", logo: moeLogo("30018.jpg"), domain: "su.edu.sa", specialties: 27, courses: 1 },
  { slug: "mu", name: "جامعة المجمعة", nameEn: "Majmaah University", region: "الرياض", type: "حكومية", logo: moeLogo("30030.jpg"), domain: "mu.edu.sa", specialties: 29, courses: 2 },
  { slug: "seu", name: "الجامعة السعودية الإلكترونية", nameEn: "Saudi Electronic University", region: "الرياض", type: "حكومية", domain: "seu.edu.sa", specialties: 17, courses: 8, featured: true },
  { slug: "uj", name: "جامعة جدة", nameEn: "University of Jeddah", region: "مكة المكرمة", type: "حكومية", logo: moeLogo("30015.jpg"), domain: "uj.edu.sa", specialties: 32, courses: 5 },
  { slug: "ub", name: "جامعة بيشة", nameEn: "University of Bisha", region: "عسير", type: "حكومية", logo: moeLogo("30031.jpg"), domain: "ub.edu.sa", specialties: 25, courses: 3 },
  { slug: "uhb", name: "جامعة حفر الباطن", nameEn: "University of Hafr Al Batin", region: "الشرقية", type: "حكومية", logo: moeLogo("30023.jpg"), domain: "uhb.edu.sa", specialties: 28, courses: 2 },
  { slug: "ksau-hs", name: "جامعة الملك سعود بن عبدالعزيز للعلوم الصحية", nameEn: "King Saud bin Abdulaziz University for Health Sciences", region: "الرياض", type: "حكومية", domain: "ksau-hs.edu.sa", specialties: 18, courses: 4 },
  { slug: "kaust", name: "جامعة الملك عبدالله للعلوم والتقنية", nameEn: "King Abdullah University of Science & Technology", region: "مكة المكرمة", type: "حكومية", domain: "kaust.edu.sa", specialties: 16, courses: 0 },

  { slug: "psu", name: "جامعة الأمير سلطان", nameEn: "Prince Sultan University", region: "الرياض", type: "أهلية", logo: cuaLogo("PULogo003.jpeg"), domain: "psu.edu.sa", specialties: 22, courses: 3 },
  { slug: "alfaisal", name: "جامعة الفيصل", nameEn: "Alfaisal University", region: "الرياض", type: "أهلية", logo: cuaLogo("PULogo007.jpeg"), domain: "alfaisal.edu", specialties: 21, courses: 4 },
  { slug: "alyamamah", name: "جامعة اليمامة", nameEn: "Al Yamamah University", region: "الرياض", type: "أهلية", logo: cuaLogo("PULogo008.jpeg"), domain: "yu.edu.sa", specialties: 18, courses: 2 },
  { slug: "aou", name: "الجامعة العربية المفتوحة", nameEn: "Arab Open University", region: "عدة مناطق", type: "أهلية", logo: cuaLogo("PHOTO-2022-11-17-11-53-57.jpeg"), domain: "arabou.edu.sa", specialties: 15, courses: 4 },
  { slug: "effat", name: "جامعة عفت", nameEn: "Effat University", region: "مكة المكرمة", type: "أهلية", logo: cuaLogo("EfatUnversitylogo.jpeg"), domain: "effatuniversity.edu.sa", specialties: 19, courses: 2 },
  { slug: "dah", name: "جامعة دار الحكمة", nameEn: "Dar Al-Hekma University", region: "مكة المكرمة", type: "أهلية", logo: cuaLogo("PULogo011.jpeg"), domain: "dah.edu.sa", specialties: 16, courses: 1 },
  { slug: "ubt", name: "جامعة الأعمال والتكنولوجيا", nameEn: "University of Business & Technology", region: "مكة المكرمة", type: "أهلية", logo: cuaLogo("PULogo002.jpeg"), domain: "ubt.edu.sa", specialties: 24, courses: 3 },
  { slug: "pmu", name: "جامعة الأمير محمد بن فهد", nameEn: "Prince Mohammad Bin Fahd University", region: "الشرقية", type: "أهلية", logo: cuaLogo("PULogo005.jpeg"), domain: "pmu.edu.sa", specialties: 22, courses: 2 },
  { slug: "fbsu", name: "جامعة الأمير فهد بن سلطان", nameEn: "Prince Fahd Bin Sultan University", region: "تبوك", type: "أهلية", logo: cuaLogo("PULogo004.jpeg"), domain: "fbsu.edu.sa", specialties: 16, courses: 1, aliases: ["جامعة فهد بن سلطان"] },
  { slug: "sr.edu", name: "جامعة سليمان الراجحي", nameEn: "Sulaiman Al Rajhi University", region: "القصيم", type: "أهلية", logo: cuaLogo("ALrajhe.jpg"), domain: "sr.edu.sa", specialties: 12, courses: 2 },
  { slug: "almaarefa", name: "جامعة المعرفة", nameEn: "AlMaarefa University", region: "الرياض", type: "أهلية", logo: cuaLogo("PULogo013.jpeg"), domain: "um.edu.sa", specialties: 13, courses: 4 },
  { slug: "riyadh-elm", name: "جامعة رياض العلم", nameEn: "Riyadh Elm University", region: "الرياض", type: "أهلية", logo: cuaLogo("شعار-جامعة-رياض-العلم-1.jpeg"), domain: "riyadh.edu.sa", specialties: 12, courses: 2 },
  { slug: "dar-aluloom", name: "جامعة دار العلوم", nameEn: "Dar Al Uloom University", region: "الرياض", type: "أهلية", logo: cuaLogo("PULogo009.jpeg"), domain: "dau.edu.sa", specialties: 18, courses: 2 },
  { slug: "mustaqbal", name: "جامعة المستقبل", nameEn: "Mustaqbal University", region: "القصيم", type: "أهلية", logo: cuaLogo("PULogo014.jpeg"), domain: "uom.edu.sa", specialties: 17, courses: 2 },
  { slug: "upm", name: "جامعة الأمير مقرن بن عبدالعزيز", nameEn: "University of Prince Mugrin", region: "المدينة المنورة", type: "أهلية", logo: cuaLogo("PULogo006.jpeg"), domain: "upm.edu.sa", specialties: 15, courses: 1 },
  { slug: "aloola", name: "كليات الأولى الأهلية بالأحساء", nameEn: "Al Oula National Colleges", region: "الشرقية", type: "كلية", domain: "aloola.edu.sa", specialties: 8, courses: 0 },
  { slug: "jadara", name: "كلية جدارة للعلوم الإدارية والإنسانية بحفر الباطن", nameEn: "Jadara College of Administrative and Humanities Sciences", region: "الشرقية", type: "كلية", domain: "jadara.edu.sa", specialties: 7, courses: 0, aliases: ["كلية جدارة للعلوم الإدارية والإنسانية"] },
  { slug: "madinah-law", name: "كلية الحقوق والعلوم الإسلامية بالمدينة المنورة", nameEn: "College of Law and Islamic Sciences", region: "المدينة المنورة", type: "كلية", domain: "clis.edu.sa", specialties: 6, courses: 0 },
  { slug: "manar-aljanoub", name: "كلية منار الجنوب للعلوم والتقنية", nameEn: "Manar Al Janoub College", region: "عسير", type: "كلية", domain: "mjc.edu.sa", specialties: 7, courses: 0 },
  { slug: "makkah-national", name: "كلية مكة الأهلية", nameEn: "Makkah National College", region: "مكة المكرمة", type: "كلية", domain: "mnc.edu.sa", specialties: 8, courses: 0 },
  { slug: "alnahda", name: "كلية النهضة للصيدلة والعلوم الطبية", nameEn: "Al Nahda College", region: "الرياض", type: "كلية", domain: "alnahda.edu.sa", specialties: 7, courses: 0 },
  { slug: "kspp", name: "كلية كابسارك للسياسات العامة", nameEn: "KAPSARC School of Public Policy", region: "الرياض", type: "كلية", domain: "kspp.edu.sa", specialties: 5, courses: 0 },
  { slug: "mbsc", name: "كلية الأمير محمد بن سلمان للإدارة وريادة الأعمال", nameEn: "MBSC", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("PULogo002.png", "2024/04"), domain: "mbsc.edu.sa", specialties: 8, courses: 0 },

  { slug: "bmc", name: "كلية البترجي الطبية للعلوم والتكنولوجيا", nameEn: "Batterjee Medical College for Science and Technology", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo008.jpeg"), domain: "bmc.edu.sa", specialties: 11, courses: 4, aliases: ["كلية البترجي الطبية"] },
  { slug: "ibnsina", name: "كلية ابن سينا الأهلية", nameEn: "Ibn Sina National College for Medical Studies", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo006.jpeg"), domain: "ibnsina.edu.sa", specialties: 8, courses: 3, aliases: ["كلية ابن سينا الأهلية للعلوم الطبية"] },
  { slug: "fakeeh", name: "كلية فقيه للعلوم الطبية", nameEn: "Fakeeh College for Medical Sciences", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo0019.jpeg"), domain: "fakeehcollege.edu.sa", specialties: 8, courses: 3 },
  { slug: "machs", name: "كلية محمد المانع للعلوم الطبية", nameEn: "Mohammed Al-Mana College for Medical Sciences", region: "الشرقية", type: "كلية", logo: cuaLogo("CLogo0020-1.jpeg"), domain: "machs.edu.sa", specialties: 7, courses: 3 },
  { slug: "vision", name: "كلية الرؤية بالرياض", nameEn: "Vision College Riyadh", region: "الرياض", type: "كلية", logo: cuaLogo("Vision.jpg"), domain: "vision.edu.sa", specialties: 8, courses: 2, aliases: ["كليات الرؤية"] },
  { slug: "alghad", name: "كلية الغد الدولية للعلوم الطبية التطبيقية", nameEn: "Al-Ghad International College for Applied Medical Sciences", region: "عدة مناطق", type: "كلية", logo: cuaLogo("Untitled-1.jpg"), domain: "gc.edu.sa", specialties: 9, courses: 3, aliases: ["كليات الغد الدولية للعلوم الطبية التطبيقية"] },
  { slug: "inaya", name: "كلية العناية الطبية", nameEn: "Inaya Medical College", region: "الرياض", type: "كلية", logo: cuaLogo("CLogo0012.jpeg"), domain: "inaya.edu.sa", specialties: 8, courses: 2, aliases: ["كليات العناية الطبية"] },
  { slug: "aic", name: "كليات الشرق العربي للدراسات العليا", nameEn: "Arab East Colleges for Graduate Studies", region: "الرياض", type: "كلية", logo: cuaLogo("CLogo0011.jpeg"), domain: "arabeast.edu.sa", specialties: 12, courses: 1, aliases: ["كليات الشرق العربي"] },
  { slug: "gulf", name: "كليات الخليج", nameEn: "Gulf Colleges", region: "المنطقة الشرقية", type: "كلية", logo: cuaLogo("CLogo002.jpeg"), domain: "gulf.edu.sa", specialties: 10, courses: 1 },
  { slug: "jic", name: "كلية جدة العالمية", nameEn: "Jeddah International College", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo0017.jpeg"), domain: "jicollege.edu.sa", specialties: 12, courses: 2 },
  { slug: "jubail-industrial", name: "كلية الجبيل الصناعية", nameEn: "Jubail Industrial College", region: "الشرقية", type: "كلية", domain: "rcjy.edu.sa", specialties: 14, courses: 2 },
  { slug: "yanbu-industrial", name: "كلية ينبع الصناعية", nameEn: "Yanbu Industrial College", region: "المدينة المنورة", type: "كلية", domain: "rcjy.edu.sa", specialties: 14, courses: 2 },
  { slug: "alasala", name: "كليات الأصالة الأهلية", nameEn: "Alasala Colleges", region: "الشرقية", type: "كلية", logo: cuaLogo("CLogo001.jpeg"), domain: "alasala.edu.sa", specialties: 11, courses: 0 },
  { slug: "unaizah-colleges", name: "كليات عنيزة الأهلية", nameEn: "Unaizah Colleges", region: "القصيم", type: "كلية", logo: cuaLogo("CLogo004.jpeg"), domain: "oc.edu.sa", specialties: 12, courses: 0 },
  { slug: "ibn-rushd", name: "كلية ابن رشد للعلوم الإدارية", nameEn: "Ibn Rushd College", region: "عسير", type: "كلية", logo: cuaLogo("CLogo005.jpeg"), domain: "ibnrushd.edu.sa", specialties: 7, courses: 0 },
  { slug: "baha-private", name: "كلية الباحة الأهلية للعلوم", nameEn: "Al Baha Private College of Science", region: "الباحة", type: "كلية", logo: cuaLogo("CLogo007.jpeg"), domain: "bpcs.edu.sa", specialties: 8, courses: 0 },
  { slug: "alriyada", name: "كلية الريادة للعلوم الصحية", nameEn: "Al Riyada College for Health Sciences", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo009.jpeg"), domain: "alriyada.edu.sa", specialties: 7, courses: 0 },
  { slug: "alrayan", name: "كليات الريان الأهلية بالمدينة المنورة", nameEn: "Al Rayan National Colleges in Madinah", region: "المدينة المنورة", type: "كلية", logo: cuaLogo("CLogo0010.jpeg"), domain: "amc.edu.sa", specialties: 9, courses: 0, aliases: ["كليات الريان الأهلية"] },
  { slug: "buraidah-colleges", name: "كليات بريدة الأهلية", nameEn: "Buraidah Private Colleges", region: "القصيم", type: "كلية", logo: cuaLogo("CLogo0016.jpeg"), domain: "bpc.edu.sa", specialties: 12, courses: 0 },
  { slug: "saad-nursing", name: "كلية سعد للتمريض والعلوم الصحية", nameEn: "Saad College of Nursing and Health Sciences", region: "الشرقية", type: "كلية", logo: cuaLogo("CLogo0018.jpeg"), domain: "saadcollege.edu.sa", specialties: 6, courses: 0 },
  { slug: "psc-management", name: "جامعة الفيصل – كلية الأمير سلطان للإدارة", nameEn: "Alfaisal University – Prince Sultan College of Business", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("CLogo0021.jpeg"), domain: "pscj.edu.sa", specialties: 8, courses: 0, parentSlug: "alfaisal", aliases: ["كلية الأمير سلطان للإدارة"] },
  { slug: "north-nursing", name: "كلية الشمال للتمريض", nameEn: "Northern College of Nursing", region: "الحدود الشمالية", type: "كلية", logo: cuaLogo("ncn.jpeg"), domain: "nec.edu.sa", specialties: 5, courses: 0 },
  { slug: "vision-jeddah", name: "كلية الرؤية لطب الأسنان والتمريض بجدة", nameEn: "Vision College Jeddah", region: "مكة المكرمة", type: "كلية", logo: cuaLogo("Vision-1.jpg"), domain: "vision.edu.sa", specialties: 6, courses: 0 },
  { slug: "fayha", name: "كلية الفيحاء الأهلية", nameEn: "Al Fayha National College", region: "الشرقية", type: "كلية", logo: cuaLogo("alfaiha.jpg"), domain: "fayha.edu.sa", specialties: 7, courses: 0 },
  { slug: "almoosa", name: "كلية الموسى للعلوم الصحية", nameEn: "Almoosa College of Health Sciences", region: "الشرقية", type: "كلية", logo: cuaLogo("Almosa.jpeg"), domain: "almoosacollege.edu.sa", specialties: 7, courses: 0 },

  { slug: "tvtc-riyadh", name: "الكلية التقنية بالرياض", nameEn: "Riyadh Technical College", region: "الرياض", type: "تقنية", domain: "tvtc.gov.sa", specialties: 19, courses: 1 },
  { slug: "tvtc-jeddah", name: "الكلية التقنية بجدة", nameEn: "Jeddah Technical College", region: "مكة المكرمة", type: "تقنية", domain: "tvtc.gov.sa", specialties: 17, courses: 1 },
  { slug: "tvtc-madinah", name: "الكلية التقنية بالمدينة المنورة", nameEn: "Madinah Technical College", region: "المدينة المنورة", type: "تقنية", domain: "tvtc.gov.sa", specialties: 15, courses: 1 },
  { slug: "tvtc-dammam", name: "الكلية التقنية بالدمام", nameEn: "Dammam Technical College", region: "الشرقية", type: "تقنية", domain: "tvtc.gov.sa", specialties: 16, courses: 1 },
  { slug: "tvtc-abha", name: "الكلية التقنية بأبها", nameEn: "Abha Technical College", region: "عسير", type: "تقنية", domain: "tvtc.gov.sa", specialties: 14, courses: 1 },
  { slug: "tvtc-qassim", name: "الكلية التقنية ببريدة", nameEn: "Buraidah Technical College", region: "القصيم", type: "تقنية", domain: "tvtc.gov.sa", specialties: 15, courses: 1 },
  { slug: "tvtc-taif", name: "الكلية التقنية بالطائف", nameEn: "Taif Technical College", region: "مكة المكرمة", type: "تقنية", domain: "tvtc.gov.sa", specialties: 14, courses: 1 },
  { slug: "tvtc-tabuk", name: "الكلية التقنية بتبوك", nameEn: "Tabuk Technical College", region: "تبوك", type: "تقنية", domain: "tvtc.gov.sa", specialties: 13, courses: 1 },
];

for (const institution of institutions) {
  institution.specialties = getInstitutionPrograms(institution.slug).length;
}

const discreteUnits: CourseUnit[] = [
  { title: "الوحدة الأولى: المنطق الرياضي", lessons: [
    { id: "d-1", title: "كيف تدرس المادة وخريطة المحتوى", duration: "08:21", free: true, completed: true },
    { id: "d-2", title: "Propositions & Logical Operators", duration: "24:18", completed: true },
    { id: "d-3", title: "Truth Tables", duration: "31:44" },
    { id: "d-4", title: "Logical Equivalences", duration: "27:09" },
  ]},
  { title: "الوحدة الثانية: المجموعات والعلاقات", lessons: [
    { id: "d-5", title: "Sets & Set Operations", duration: "36:12" },
    { id: "d-6", title: "Relations & Properties", duration: "41:07" },
    { id: "d-7", title: "Functions", duration: "33:55" },
  ]},
  { title: "المراجعات والاختبارات", lessons: [
    { id: "d-8", title: "مراجعة شاملة للوحدتين", duration: "52:20" },
    { id: "d-9", title: "حل نموذج اختبار سابق", duration: "47:16", type: "video" },
    { id: "d-10", title: "اختبار قصير تفاعلي", duration: "10 أسئلة", type: "quiz" },
  ]},
];

const commonUnits = (prefix: string): CourseUnit[] => [
  { title: "أساسيات المادة", lessons: [
    { id: `${prefix}-1`, title: "الدرس التجريبي: مقدمة وخطة المذاكرة", duration: "09:12", free: true },
    { id: `${prefix}-2`, title: "المفاهيم الأساسية", duration: "28:40" },
    { id: `${prefix}-3`, title: "أمثلة تطبيقية محلولة", duration: "34:18" },
  ]},
  { title: "التطبيق المتقدم", lessons: [
    { id: `${prefix}-4`, title: "تطبيقات وتمارين", duration: "42:15" },
    { id: `${prefix}-5`, title: "حل واجب نموذجي", duration: "37:50" },
    { id: `${prefix}-6`, title: "مراجعة قبل الاختبار", duration: "49:05" },
  ]},
];

export const courses: Course[] = [
  { slug: "discrete-structures", title: "الهياكل المتقطعة", titleEn: "Discrete Structures", code: "CS 230", university: "جامعة أم القرى", universitySlug: "umm-al-qura", specialty: "الأمن السيبراني", description: "شرح مبسّط ومنظم للمنطق الرياضي والمجموعات والعلاقات والدوال، مع حل تمارين واختبارات سابقة خطوة بخطوة.", price: 79, oldPrice: 119, rating: 4.9, ratingsCount: 184, students: 1240, duration: "11 ساعة", lessons: 32, updatedAt: "أغسطس 2026", instructor: "م. عبدالله القحطاني", color: "from-blue-600 to-violet-600", icon: "∑", featured: true, access: "حتى نهاية الترم", units: discreteUnits },
  { slug: "calculus-1", title: "التفاضل والتكامل 1", titleEn: "Calculus I", code: "MATH 101", university: "جامعة الإمام محمد بن سعود الإسلامية", universitySlug: "imamu", specialty: "علوم الحاسب", description: "أساسيات النهايات والاشتقاق والتطبيقات بطريقة عملية تساعدك على فهم الأسئلة وحلها بثقة.", price: 69, oldPrice: 99, rating: 4.8, ratingsCount: 121, students: 890, duration: "9 ساعات", lessons: 26, updatedAt: "أغسطس 2026", instructor: "د. فيصل العتيبي", color: "from-cyan-500 to-blue-700", icon: "∫", featured: true, access: "90 يومًا", units: commonUnits("calc") },
  { slug: "java-programming", title: "برمجة Java — نظري وعملي", titleEn: "Java Programming", code: "CS 201", university: "جامعة الملك سعود", universitySlug: "ksu", specialty: "تقنية المعلومات", description: "من الصفر حتى البرمجة كائنية التوجه مع تطبيقات عملية وتمارين مباشرة على الأكواد.", price: 89, oldPrice: 129, rating: 4.9, ratingsCount: 206, students: 1570, duration: "14 ساعة", lessons: 38, updatedAt: "أغسطس 2026", instructor: "م. نواف الحربي", color: "from-orange-500 to-rose-600", icon: "</>", featured: true, access: "حتى نهاية الترم", units: commonUnits("java") },
  { slug: "data-structures", title: "هياكل البيانات", titleEn: "Data Structures", code: "CSC 212", university: "جامعة الملك عبدالعزيز", universitySlug: "kau", specialty: "علوم الحاسب", description: "شرح القوائم والمكدسات والطوابير والأشجار والخوارزميات مع رسومات وأمثلة برمجية.", price: 84, rating: 4.7, ratingsCount: 98, students: 720, duration: "12 ساعة", lessons: 31, updatedAt: "يوليو 2026", instructor: "م. شهد الزهراني", color: "from-emerald-500 to-teal-700", icon: "⌘", featured: true, access: "120 يومًا", units: commonUnits("ds") },
  { slug: "anatomy-1", title: "التشريح البشري 1", titleEn: "Human Anatomy I", code: "ANAT 101", university: "جامعة الملك سعود بن عبدالعزيز للعلوم الصحية", universitySlug: "ksau-hs", specialty: "الطب", description: "شرح بصري منظم لأجهزة الجسم ومصطلحات التشريح الأساسية مع مراجعات تثبيتية.", price: 109, oldPrice: 149, rating: 4.9, ratingsCount: 156, students: 980, duration: "16 ساعة", lessons: 42, updatedAt: "أغسطس 2026", instructor: "د. سارة الغامدي", color: "from-rose-500 to-pink-700", icon: "✚", featured: true, access: "حتى نهاية الترم", units: commonUnits("anat") },
  { slug: "pharmacology", title: "علم الأدوية", titleEn: "Pharmacology", code: "PHRM 214", university: "جامعة الملك خالد", universitySlug: "kku", specialty: "الصيدلة", description: "فهم آلية عمل الأدوية وتصنيفاتها بطريقة مترابطة مع خرائط ذهنية وأسئلة متوقعة.", price: 99, rating: 4.8, ratingsCount: 87, students: 630, duration: "13 ساعة", lessons: 35, updatedAt: "يوليو 2026", instructor: "د. ريم الشهراني", color: "from-violet-500 to-fuchsia-700", icon: "Rx", access: "90 يومًا", units: commonUnits("pharm") },
  { slug: "accounting-principles", title: "مبادئ المحاسبة", titleEn: "Accounting Principles", code: "ACC 101", university: "الجامعة السعودية الإلكترونية", universitySlug: "seu", specialty: "إدارة الأعمال", description: "شرح القيود المحاسبية والقوائم المالية من خلال مسائل عملية متدرجة.", price: 59, rating: 4.6, ratingsCount: 74, students: 510, duration: "8 ساعات", lessons: 24, updatedAt: "يونيو 2026", instructor: "أ. خالد الدوسري", color: "from-amber-500 to-orange-700", icon: "₿", access: "60 يومًا", units: commonUnits("acc") },
  { slug: "cybersecurity-fundamentals", title: "أساسيات الأمن السيبراني", titleEn: "Cybersecurity Fundamentals", code: "CYB 101", university: "جامعة جدة", universitySlug: "uj", specialty: "الأمن السيبراني", description: "مدخل عملي لمفاهيم الحماية والتهديدات وإدارة المخاطر والشبكات الآمنة.", price: 74, rating: 4.8, ratingsCount: 91, students: 680, duration: "10 ساعات", lessons: 28, updatedAt: "أغسطس 2026", instructor: "م. عبدالرحمن الشهري", color: "from-slate-700 to-blue-800", icon: "◈", access: "90 يومًا", units: commonUnits("cyb") },
];

export const specialtyTaxonomy = [
  "الأمن السيبراني", "علوم الحاسب", "تقنية المعلومات", "الذكاء الاصطناعي", "علم البيانات", "تحليل البيانات", "هندسة البرمجيات", "هندسة الحاسب", "نظم المعلومات", "نظم المعلومات الإدارية", "الشبكات", "الحوسبة السحابية", "الوسائط الرقمية", "تقنية الويب",
  "الطب", "الجراحة", "الصيدلة", "الصيدلة الإكلينيكية", "التمريض", "طب الأسنان", "الصحة العامة", "المعلوماتية الصحية", "الإدارة الصحية", "التغذية الإكلينيكية", "العلاج الطبيعي", "العلاج التنفسي", "الأشعة التشخيصية", "المختبرات الطبية", "البصريات", "التخدير", "الخدمات الطبية الطارئة", "العلوم الطبية التطبيقية",
  "الهندسة", "الهندسة الكهربائية", "الهندسة الميكانيكية", "الهندسة المدنية", "الهندسة الصناعية", "الهندسة الكيميائية", "هندسة البترول", "هندسة الطيران", "هندسة العمارة", "العمارة والتخطيط", "هندسة الطاقة المتجددة", "هندسة التعدين", "الهندسة النووية", "الهندسة الطبية الحيوية", "هندسة الاتصالات", "هندسة الميكاترونكس",
  "إدارة الأعمال", "المحاسبة", "المالية", "الاقتصاد", "التسويق", "إدارة الموارد البشرية", "ريادة الأعمال", "سلاسل الإمداد", "إدارة المشاريع", "إدارة المخاطر والتأمين", "التجارة الإلكترونية", "الإدارة العامة", "السياسات العامة", "إدارة السياحة والضيافة",
  "القانون", "الأنظمة", "الشريعة", "الدراسات الإسلامية", "القرآن وعلومه", "أصول الدين", "الدعوة والإعلام", "اللغة العربية", "اللغة الإنجليزية", "الترجمة", "اللغات والترجمة",
  "الرياضيات", "الإحصاء", "الفيزياء", "الكيمياء", "الأحياء", "الكيمياء الحيوية", "الأحياء الدقيقة", "علوم البيئة", "الجيولوجيا", "علوم الأرض", "علوم البحار", "الزراعة", "الإنتاج النباتي", "الإنتاج الحيواني", "علوم الأغذية",
  "التربية", "التربية الخاصة", "رياض الأطفال", "علم النفس", "علم الاجتماع", "الخدمة الاجتماعية", "الإعلام", "الاتصال", "العلاقات العامة", "الصحافة", "التصميم الجرافيكي", "التصميم الداخلي", "تصميم الأزياء", "الفنون البصرية", "الآثار", "التاريخ", "الجغرافيا", "علوم الرياضة والنشاط البدني",
  "القوى الكهربائية", "الإلكترونيات", "التبريد والتكييف", "المحركات والمركبات", "التصنيع", "المساحة", "السلامة والصحة المهنية", "تقنية الإنتاج", "تقنية البيئة", "تقنية الغذاء", "تقنية الأجهزة الطبية",
];

export const specialties = Array.from(new Set([...specialtyTaxonomy, ...allPrograms.map((program) => program.name)])).sort((a, b) => a.localeCompare(b, "ar"));

export const faq = [
  { q: "هل أستطيع تجربة الشرح قبل الاشتراك؟", a: "نعم، كل مادة في مراس تحتوي درسًا مجانيًا واحدًا على الأقل لتتأكد من جودة الشرح قبل الدفع." },
  { q: "متى تظهر المادة في حسابي؟", a: "تظهر تلقائيًا داخل «موادي» فور تأكيد عملية الدفع من Tap، وليس بمجرد الرجوع من صفحة الدفع." },
  { q: "كم تستمر صلاحية المادة؟", a: "تختلف حسب المادة، ويظهر نوع الوصول بوضوح قبل الدفع وداخل حسابك بعد الشراء." },
  { q: "هل يمكن تنزيل الفيديوهات؟", a: "لا. الدروس المدفوعة تُعرض عبر بث خاص داخل مشغل مراس، مع جلسات مشاهدة وروابط مؤقتة وعلامة مائية." },
  { q: "ماذا أفعل إذا لم أجد مادتي؟", a: "ارسل طلب توفير المادة، وسنخبرك تلقائيًا عند إضافتها أو عند دخولها مرحلة «قريبًا»." },
];

export const platformStats = [
  { value: String(institutions.length), label: "جامعة وكلية وجهة تقنية" },
  { value: `+${allPrograms.length}`, label: "مسارًا أكاديميًا" },
  { value: "24/7", label: "مساعد مراس الذكي" },
  { value: "100%", label: "متجاوب مع الأجهزة" },
];

export const reviews = [
  { name: "جرّب قبل الشراء", university: "قرار واضح", text: "كل مادة منشورة تتيح درسًا مجانيًا قبل الدفع حتى تتأكد من أسلوب الشرح بنفسك.", rating: 5 },
  { name: "تقدم محفوظ", university: "بين أجهزتك", text: "يسجل المشغل آخر تقدمك ويربطه بحسابك لتكمل رحلتك من الجوال أو الكمبيوتر.", rating: 5 },
  { name: "طلب مادة منظم", university: "مرتبط بالمشرف", text: "إذا لم تجد المادة، ارفع التوصيف أو السلايدات وتابع حالتها من لوحة الطالب حتى تتوفر.", rating: 5 },
];

export function getCourse(slug: string) {
  return courses.find((course) => course.slug === slug);
}

export function getInstitution(slug: string) {
  return institutions.find((institution) => institution.slug === slug);
}
