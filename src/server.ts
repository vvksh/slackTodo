import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { prisma } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

interface SlackRequest extends Request {
  body: {
    user_id: string;
    text: string;
    command: string;
  };
}

// Add todo endpoint
app.post('/add', async (req: SlackRequest, res: Response) => {
  try {
    const { user_id, text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a task to add. Usage: /add <task>'
      });
    }

    const todo = await prisma.todo.create({
      data: {
        userId: user_id,
        task: text.trim()
      }
    });

    res.json({
      response_type: 'ephemeral',
      text: `✅ Added todo: "${todo.task}"`
    });
  } catch (error) {
    console.error('Error adding todo:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error adding todo. Please try again.'
    });
  }
});

// Mark todo as done endpoint
app.post('/done', async (req: SlackRequest, res: Response) => {
  try {
    const { user_id, text } = req.body;
    
    if (!text || text.trim() === '') {
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a todo ID. Usage: /done <id>'
      });
    }

    const todoId = parseInt(text.trim());
    if (isNaN(todoId)) {
      return res.json({
        response_type: 'ephemeral',
        text: 'Please provide a valid todo ID number.'
      });
    }

    const todo = await prisma.todo.findFirst({
      where: {
        id: todoId,
        userId: user_id
      }
    });

    if (!todo) {
      return res.json({
        response_type: 'ephemeral',
        text: 'Todo not found or you don\'t have permission to modify it.'
      });
    }

    await prisma.todo.update({
      where: { id: todoId },
      data: { completed: true }
    });

    res.json({
      response_type: 'ephemeral',
      text: `✅ Marked todo as done: "${todo.task}"`
    });
  } catch (error) {
    console.error('Error marking todo as done:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error marking todo as done. Please try again.'
    });
  }
});

// List todos endpoint
app.post('/list', async (req: SlackRequest, res: Response) => {
  try {
    const { user_id } = req.body;

    const todos = await prisma.todo.findMany({
      where: { userId: user_id },
      orderBy: { createdAt: 'desc' }
    });

    if (todos.length === 0) {
      return res.json({
        response_type: 'ephemeral',
        text: 'No todos found. Use /add to create your first todo!'
      });
    }

    const pendingTodos = todos.filter(todo => !todo.completed);
    const completedTodos = todos.filter(todo => todo.completed);

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

    res.json({
      response_type: 'ephemeral',
      text: message
    });
  } catch (error) {
    console.error('Error listing todos:', error);
    res.json({
      response_type: 'ephemeral',
      text: 'Error retrieving todos. Please try again.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});