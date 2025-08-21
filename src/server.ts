import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { prisma } from './db';
import { verifySlackSignature } from './middleware/slackAuth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Custom middleware to handle Slack requests
const parseSlackBody = (req: any, res: any, next: any) => {
  // Store raw body for signature verification
  req.rawBody = req.body;
  
  // Parse the Buffer as URL-encoded string
  if (Buffer.isBuffer(req.body)) {
    const bodyString = req.body.toString();
    req.body = require('querystring').parse(bodyString);
  }
  
  console.log('🔄 [PARSE] Parsed body:', req.body);
  next();
};

app.use('/add', bodyParser.raw({ type: '*/*' }), verifySlackSignature, parseSlackBody);
app.use('/done', bodyParser.raw({ type: '*/*' }), verifySlackSignature, parseSlackBody);
app.use('/list', bodyParser.raw({ type: '*/*' }), verifySlackSignature, parseSlackBody);

interface SlackRequest extends Request {
  body: {
    user_id: string;
    text: string;
    command: string;
  };
}

// Add todo endpoint
app.post('/add', async (req: SlackRequest, res: Response) => {
  console.log('📝 [ADD ENDPOINT] Starting add todo request...');
  console.log('📝 [ADD ENDPOINT] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { user_id, text } = req.body;
    console.log('📝 [ADD ENDPOINT] User ID:', user_id);
    console.log('📝 [ADD ENDPOINT] Text:', text);
    
    if (!text || text.trim() === '') {
      console.log('❌ [ADD ENDPOINT] Empty text provided');
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a task to add. Usage: /add <task>'
      });
    }

    console.log('📝 [ADD ENDPOINT] Creating todo in database...');
    const todo = await prisma.todo.create({
      data: {
        userId: user_id,
        task: text.trim()
      }
    });

    console.log('✅ [ADD ENDPOINT] Todo created successfully:', todo);
    res.json({
      response_type: 'ephemeral',
      text: `✅ Added todo: "${todo.task}"`
    });
  } catch (error) {
    console.error('❌ [ADD ENDPOINT] Error adding todo:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error adding todo. Please try again.'
    });
  }
});

// Mark todo as done endpoint
app.post('/done', async (req: SlackRequest, res: Response) => {
  console.log('✅ [DONE ENDPOINT] Starting mark done request...');
  console.log('✅ [DONE ENDPOINT] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { user_id, text } = req.body;
    console.log('✅ [DONE ENDPOINT] User ID:', user_id);
    console.log('✅ [DONE ENDPOINT] Text:', text);
    
    if (!text || text.trim() === '') {
      console.log('❌ [DONE ENDPOINT] Empty text provided');
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a todo ID. Usage: /done <id>'
      });
    }

    const todoId = parseInt(text.trim());
    console.log('✅ [DONE ENDPOINT] Parsed todo ID:', todoId);
    
    if (isNaN(todoId)) {
      console.log('❌ [DONE ENDPOINT] Invalid todo ID provided');
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a valid todo ID number.'
      });
    }

    console.log('✅ [DONE ENDPOINT] Finding todo in database...');
    const todo = await prisma.todo.findFirst({
      where: {
        id: todoId,
        userId: user_id
      }
    });

    console.log('✅ [DONE ENDPOINT] Found todo:', todo);

    if (!todo) {
      console.log('❌ [DONE ENDPOINT] Todo not found or permission denied');
      return res.json({
        response_type: 'ephemeral',
        text: 'Todo not found or you don\'t have permission to modify it.'
      });
    }

    console.log('✅ [DONE ENDPOINT] Updating todo as completed...');
    await prisma.todo.update({
      where: { id: todoId },
      data: { completed: true }
    });

    console.log('✅ [DONE ENDPOINT] Todo marked as done successfully');
    res.json({
      response_type: 'ephemeral',
      text: `✅ Marked todo as done: "${todo.task}"`
    });
  } catch (error) {
    console.error('❌ [DONE ENDPOINT] Error marking todo as done:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error marking todo as done. Please try again.'
    });
  }
});

// List todos endpoint
app.post('/list', async (req: SlackRequest, res: Response) => {
  console.log('📋 [LIST ENDPOINT] Starting list todos request...');
  console.log('📋 [LIST ENDPOINT] Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { user_id } = req.body;
    console.log('📋 [LIST ENDPOINT] User ID:', user_id);

    console.log('📋 [LIST ENDPOINT] Fetching todos from database...');
    const todos = await prisma.todo.findMany({
      where: { userId: user_id },
      orderBy: { createdAt: 'desc' }
    });

    console.log('📋 [LIST ENDPOINT] Found', todos.length, 'todos:', todos);

    if (todos.length === 0) {
      console.log('📋 [LIST ENDPOINT] No todos found for user');
      return res.json({
        response_type: 'ephemeral',
        text: 'No todos found. Use /add to create your first todo!'
      });
    }

    const pendingTodos = todos.filter(todo => !todo.completed);
    const completedTodos = todos.filter(todo => todo.completed);
    
    console.log('📋 [LIST ENDPOINT] Pending todos:', pendingTodos.length);
    console.log('📋 [LIST ENDPOINT] Completed todos:', completedTodos.length);

    let message = '';
    
    if (pendingTodos.length > 0) {
      message += '*📝 Pending Todos:*\n';
      pendingTodos.forEach(todo => {
        message += `${todo.id}. ${todo.task}\n`;
      });
    }

    if (completedTodos.length > 0) {
      message += '\n*✅ Completed Todos:*\n';
      completedTodos.forEach(todo => {
        message += `${todo.id}. ~${todo.task}~\n`;
      });
    }

    console.log('📋 [LIST ENDPOINT] Generated message:', message);
    res.json({
      response_type: 'ephemeral',
      text: message
    });
  } catch (error) {
    console.error('❌ [LIST ENDPOINT] Error listing todos:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error retrieving todos. Please try again.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});