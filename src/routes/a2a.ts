import { Router, Request, Response, NextFunction } from 'express';
// import { body, validationResult } from 'express-validator';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import A2AController from '../controllers/a2aController';

const router = Router();

/**
 * @route   POST /webhook/a2a
 * @desc    Handle A2A webhook from Telex.im
 * @access  Public
 */
router.post('/a2a', [
  // TODO: Add validation when express-validator is installed
  // body('event').isIn(['message.created', 'action.clicked']).withMessage('Invalid event type'),
  // body('data').isObject().withMessage('Data must be an object'),
  // body('data.sender_id').notEmpty().withMessage('Sender ID is required'),
], async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Add validation when express-validator is installed
    // Check for validation errors
    // const errors = validationResult(req);
    // if (!errors.isEmpty()) {
    //   const errorMessages = errors.array().map((error: any) => error.msg).join(', ');
    //   logger.warn('🚫 A2A webhook validation failed:', { errors: errors.array() });
    //   throw new AppError(`Validation failed: ${errorMessages}`, 400);
    // }

    // Log webhook request
    logger.info('📥 A2A webhook received', {
      event: req.body.event,
      senderId: req.body.data?.sender_id,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Process the webhook
    await A2AController.handleWebhook(req, res);

  } catch (error) {
    logger.error('❌ A2A webhook error:', error);
    next(error);
  }
});

/**
 * @route   GET /webhook/a2a/health
 * @desc    Health check for A2A webhook endpoint
 * @access  Public
 */
router.get('/a2a/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    service: 'A2A Webhook',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * @route   POST /webhook/a2a/test
 * @desc    Test endpoint for A2A webhook
 * @access  Public (development only)
 */
router.post('/a2a/test', (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }

  logger.info('🧪 A2A test webhook received', { body: req.body });

  // Echo back the request for testing
  return res.status(200).json({
    message: 'A2A test webhook received successfully',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

/**
 * @route   GET /webhook/a2a/docs
 * @desc    Documentation for A2A webhook
 * @access  Public
 */
router.get('/a2a/docs', (req: Request, res: Response) => {
  const docs = {
    title: 'MediTrack-AI A2A Webhook API',
    version: '1.0.0',
    description: 'A2A protocol webhook for MediTrack-AI medication reminder system',
    endpoints: {
      'POST /webhook/a2a': {
        description: 'Handle A2A webhook events from Telex.im',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: {
          event: 'message.created | action.clicked',
          data: {
            sender_id: 'string (required)',
            chat_id: 'string (optional)',
            message: {
              text: 'string',
              id: 'string'
            },
            action_id: 'string (for action.clicked events)',
            timestamp: 'string (ISO 8601)'
          }
        },
        response: {
          version: '1.0',
          response: {
            type: 'message',
            data: {
              text: 'string (required)',
              actions: [
                {
                  type: 'button',
                  label: 'string',
                  action_id: 'string',
                  style: 'primary | secondary | danger (optional)'
                }
              ]
            }
          }
        }
      }
    },
    examples: {
      messageCreated: {
        event: 'message.created',
        data: {
          sender_id: 'user123',
          chat_id: 'chat456',
          message: {
            text: 'Remind me to take Amoxicillin 500mg every 8 hours',
            id: 'msg789'
          },
          timestamp: '2023-12-01T10:00:00Z'
        }
      },
      actionClicked: {
        event: 'action.clicked',
        data: {
          sender_id: 'user123',
          action_id: 'confirm_taken',
          timestamp: '2023-12-01T10:05:00Z'
        }
      }
    }
  };

  res.status(200).json(docs);
});

export default router;