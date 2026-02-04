#!/usr/bin/env npx tsx
/**
 * Script to set the OpenAI API key for the admin user
 * This encrypts the key and stores it in the database
 * Creates the admin user if it doesn't exist
 * 
 * Usage: npx tsx scripts/set-admin-openai-key.ts [API_KEY]
 * If API_KEY is not provided, reads from OPENAI_API_KEY environment variable
 */

import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

// Load .env file
dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_SECRET || 'filadex-default-encryption-key-32b';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  const combined = Buffer.concat([
    iv,
    Buffer.from(encrypted, 'hex'),
    authTag
  ]);
  
  return combined.toString('base64');
}

async function main() {
  // Get API key from argument or environment
  const apiKey = process.argv[2] || process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('No OPENAI_API_KEY found in .env or provided as argument');
    console.log('Skipping API key setup - user can add it later through settings');
    process.exit(0);
  }

  // Validate key format
  if (!apiKey.startsWith('sk-')) {
    console.error('Invalid API key format - should start with "sk-"');
    process.exit(1);
  }

  console.log('🔑 Encrypting OpenAI API key...');
  const encryptedKey = encrypt(apiKey);

  // Connect to database - try dev database first (port 5433), then production (port 5432)
  const isDev = process.env.NODE_ENV !== 'production';
  
  const dbConfig = {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || (isDev ? '5433' : '5432')),
    user: process.env.PGUSER || (isDev ? 'filadex_dev' : 'filadex'),
    password: process.env.PGPASSWORD || (isDev ? 'filadex_dev' : 'filadex'),
    database: process.env.PGDATABASE || (isDev ? 'filadex_dev' : 'filadex')
  };

  const client = new pg.Client(dbConfig);

  try {
    await client.connect();
    console.log(`📦 Connected to database at ${dbConfig.host}:${dbConfig.port}...`);

    // Check if admin user exists
    const checkResult = await client.query(
      `SELECT id, username FROM users WHERE username = 'admin'`
    );

    if (checkResult.rowCount === 0) {
      // Create admin user with bcrypt password hash for 'admin'
      console.log('👤 Admin user not found, creating...');
      const hashedPassword = await bcrypt.hash('admin', 10);
      
      await client.query(
        `INSERT INTO users (username, password, is_admin, force_change_password, openai_api_key) 
         VALUES ('admin', $1, true, true, $2)`,
        [hashedPassword, encryptedKey]
      );
      console.log('✅ Admin user created with OpenAI API key');
    } else {
      // Update existing admin user's API key
      const result = await client.query(
        `UPDATE users SET openai_api_key = $1 WHERE username = 'admin' RETURNING id, username`,
        [encryptedKey]
      );
      console.log(`✅ OpenAI API key updated for admin user (id: ${result.rows[0].id})`);
    }
  } catch (error: any) {
    console.error('❌ Database error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
