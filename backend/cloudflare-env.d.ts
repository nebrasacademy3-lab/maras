declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET: R2Bucket;
    TAP_SECRET_KEY?: string;
    TAP_PUBLIC_KEY?: string;
    TAP_MERCHANT_ID?: string;
    VIDEO_SIGNING_SECRET?: string;
    ADMIN_API_TOKEN?: string;
    ADMIN_UPLOAD_TOKEN?: string;
    APP_URL?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    OTP_PROVIDER?: string;
  }
}
