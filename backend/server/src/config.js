import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8080),
  databaseUrl: process.env.DATABASE_URL || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  dbSslMode: process.env.DB_SSL_MODE || 'verify-full',
  dbSslCaPath: process.env.DB_SSL_CA_PATH || '',
  adminApiKey: process.env.ADMIN_API_KEY || ''
};

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
