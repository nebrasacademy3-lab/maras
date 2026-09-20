export type InstructorAssignment={id:number;courseSlug:string;courseTitle:string;status:string;instructions:string;reviewNotes:string;revision:number;contractId:number};
export type InstructorLesson={id:number;title:string;description:string;position:number;video:{id:number;status:string;processingStatus:string;processingProgress:number;durationSeconds:number}|null};
export type InstructorUnit={id:number;title:string;description:string;position:number;lessons:InstructorLesson[]};
export type InstructorAssignmentDetail={assignment:InstructorAssignment;units:InstructorUnit[];resources:{id:number;title:string;originalName:string;contentType:string;sizeBytes:number;url:string}[]};
export const INSTRUCTOR_ASSIGNMENT_LABELS:Record<string,string>={assigned:"مادة جديدة مسندة إليك",in_progress:"جارٍ إعداد المحتوى",submitted:"قيد مراجعة الإدارة",changes_requested:"ملاحظات لإكمال المحتوى",published:"نُشر المحتوى",cancelled:"أُلغي الإسناد"};
export const instructorAssignmentEditable=(status:string)=>["assigned","in_progress","changes_requested"].includes(status);
