export type InstructorContractPdfInput = {
 id: number; version: number; status: string; title: string; termsAr: string; termsEn: string; compensationModel: string; rateHalalas: number; trialDays: number; trialTermsAr: string; trialTermsEn: string; contentHash: string; signedAt: string;
 instructor: { fullName: string; email: string; phone: string; country: string; address: string };
 organization: { legal_name: string; legal_address: string; commercial_registration_number: string; vat_number: string; employment_authorization_number: string };
 employment: { startDate: string; endDate: string; workLocation: string; weeklyHours: number; nationality: string; paymentTermsAr: string; paymentTermsEn: string; benefitsAr: string; benefitsEn: string };
 signature: { x: number; y: number }[][] | null;
};
export function validateInstructorContractPdf(input: unknown): InstructorContractPdfInput;
export function buildInstructorContractDocument(input: InstructorContractPdfInput, assets: { logo: string }): { html: string; header: string; footer: string };
