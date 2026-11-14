process.env.NODE_ENV='test';
process.env.DISABLE_BACKGROUND_JOBS='true';
process.env.JWT_SECRET=require('crypto').randomBytes(64).toString('base64url');
