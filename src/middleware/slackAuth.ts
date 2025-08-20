import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

interface SlackRequest extends Request {
  body: any;
  rawBody?: Buffer;
}

export const verifySlackSignature = (req: SlackRequest, res: Response, next: NextFunction) => {
  console.log('🔐 [SLACK AUTH] Starting signature verification...');
  console.log('🔐 [SLACK AUTH] Request URL:', req.url);
  console.log('🔐 [SLACK AUTH] Request method:', req.method);
  
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  
  if (!signingSecret) {
    console.error('❌ [SLACK AUTH] SLACK_SIGNING_SECRET not configured');
    return res.status(500).json({ error: 'Server configuration error' });
  }
  console.log('✅ [SLACK AUTH] Signing secret found');

  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  
  console.log('🔐 [SLACK AUTH] Slack signature:', slackSignature);
  console.log('🔐 [SLACK AUTH] Timestamp:', timestamp);

  if (!slackSignature || !timestamp) {
    console.error('❌ [SLACK AUTH] Missing Slack headers');
    return res.status(401).json({ error: 'Unauthorized: Missing Slack headers' });
  }

  // Check if timestamp is too old (5 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(currentTime - parseInt(timestamp));
  console.log('🔐 [SLACK AUTH] Current time:', currentTime);
  console.log('🔐 [SLACK AUTH] Request timestamp:', parseInt(timestamp));
  console.log('🔐 [SLACK AUTH] Time difference (seconds):', timeDiff);
  
  if (timeDiff > 300) {
    console.error('❌ [SLACK AUTH] Request too old:', timeDiff, 'seconds');
    return res.status(401).json({ error: 'Unauthorized: Request too old' });
  }
  console.log('✅ [SLACK AUTH] Timestamp validation passed');

  // Get raw body for signature verification (now comes from bodyParser.raw)
  const body = req.body as Buffer;
  const sigBasestring = `v0:${timestamp}:${body}`;
  
  console.log('🔐 [SLACK AUTH] Raw body length:', body.length);
  console.log('🔐 [SLACK AUTH] Signature basestring:', sigBasestring);
  
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  console.log('🔐 [SLACK AUTH] Generated signature:', mySignature);
  console.log('🔐 [SLACK AUTH] Expected signature: ', slackSignature);

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature))) {
    console.error('❌ [SLACK AUTH] Signature verification failed');
    return res.status(401).json({ error: 'Unauthorized: Invalid signature' });
  }

  console.log('✅ [SLACK AUTH] Signature verification successful!');
  next();
};

// Middleware to capture raw body for signature verification
export const captureRawBody = (req: SlackRequest, res: Response, next: NextFunction) => {
  console.log('📦 [RAW BODY] Starting raw body capture...');
  req.rawBody = Buffer.concat([]);
  
  req.on('data', (chunk) => {
    console.log('📦 [RAW BODY] Received chunk:', chunk.length, 'bytes');
    req.rawBody = Buffer.concat([req.rawBody!, chunk]);
  });
  
  req.on('end', () => {
    console.log('📦 [RAW BODY] Finished capturing body, total size:', req.rawBody?.length, 'bytes');
    next();
  });
};