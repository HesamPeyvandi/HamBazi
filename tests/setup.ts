import 'dotenv/config';
process.env.APP_ENV = 'development';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? 'postgres://postgres@localhost:5433/hambazi_test';
process.env.OTP_HMAC_SECRET ||= 'dev-otp-secret-not-for-production-0123456789abcdef';
process.env.SESSION_SECRET ||= 'dev-session-secret-not-for-production-0123456789abcdef';
process.env.SMS_PROVIDER = 'mock';
process.env.PAYMENT_MODE = 'simulated';
