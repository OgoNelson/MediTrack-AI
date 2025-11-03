import { logger } from './logger';

// A2A Protocol Types
export interface A2AIncomingMessage {
  event: 'message.created' | 'action.clicked';
  data: {
    message?: {
      text: string;
      id?: string;
    };
    action_id?: string;
    sender_id: string;
    chat_id?: string;
    timestamp?: string;
  };
}

export interface A2AButton {
  type: 'button';
  label: string;
  action_id: string;
  style?: 'primary' | 'secondary' | 'danger';
}

export interface A2AResponseData {
  text: string;
  actions?: A2AButton[];
  attachments?: Array<{
    type: 'image' | 'document';
    url: string;
    caption?: string;
  }>;
}

export interface A2AResponse {
  version: "1.0";
  response: {
    type: "message";
    data: A2AResponseData;
  };
}

export interface MedicationIntent {
  intent: 'add_medication' | 'list_medications' | 'confirm_medication' | 'help' | 'unknown';
  medicineName?: string;
  dosage?: string;
  frequencyHours?: number;
  startTime?: string;
  durationDays?: number;
  patientName?: string; // For caregivers
  notes?: string;
}

// A2A Response Builder Class
export class A2AResponseBuilder {
  private response: A2AResponse;

  constructor() {
    this.response = {
      version: "1.0",
      response: {
        type: "message",
        data: {
          text: "",
          actions: []
        }
      }
    };
  }

  text(message: string): A2AResponseBuilder {
    this.response.response.data.text = message;
    return this;
  }

  addButton(label: string, actionId: string, style?: 'primary' | 'secondary' | 'danger'): A2AResponseBuilder {
    const button: A2AButton = {
      type: 'button',
      label,
      action_id: actionId
    };
    
    if (style) {
      button.style = style;
    }
    
    if (!this.response.response.data.actions) {
      this.response.response.data.actions = [];
    }
    
    this.response.response.data.actions.push(button);
    return this;
  }

  addImage(url: string, caption?: string): A2AResponseBuilder {
    if (!this.response.response.data.attachments) {
      this.response.response.data.attachments = [];
    }
    
    this.response.response.data.attachments.push({
      type: 'image',
      url,
      caption
    });
    
    return this;
  }

  build(): A2AResponse {
    return { ...this.response };
  }
}

// Pre-built response templates
export const A2ATemplates = {
  // Role selection template
  roleSelection: (): A2AResponse => {
    return new A2AResponseBuilder()
      .text("Welcome to MediTrack AI! I'll help you manage medication reminders. Are you a patient or caregiver?")
      .addButton("👤 Patient", "set_role_patient", "primary")
      .addButton("👩‍⚕️ Caregiver", "set_role_caregiver", "secondary")
      .build();
  },

  // Medication confirmation template
  medicationConfirmation: (medicationName: string, dosage: string): A2AResponse => {
    return new A2AResponseBuilder()
      .text(`💊 Time to take your ${dosage} ${medicationName}.`)
      .addButton("✅ Taken", "confirm_taken", "primary")
      .addButton("⏰ Snooze 15min", "snooze_15", "secondary")
      .addButton("❌ Skip", "skip_dose", "danger")
      .build();
  },

  // Help template
  help: (): A2AResponse => {
    return new A2AResponseBuilder()
      .text("🤖 MediTrack AI Help\n\n" +
            "I can help you with:\n" +
            "• Adding medication reminders\n" +
            "• Listing your medications\n" +
            "• Confirming when you've taken medication\n" +
            "• Setting up schedules for patients (caregivers)\n\n" +
            "Try saying:\n" +
            "• \"Remind me to take Amoxicillin 500mg every 8 hours starting at 6 AM for 5 days\"\n" +
            "• \"Show my medications\"\n" +
            "• \"I took my medicine\"")
      .addButton("📋 List Medications", "list_medications")
      .addButton("➕ Add Medication", "add_medication")
      .build();
  },

  // Error template
  error: (message: string): A2AResponse => {
    return new A2AResponseBuilder()
      .text(`❌ Sorry, I encountered an error: ${message}`)
      .addButton("🆘 Help", "help")
      .build();
  },

  // Success template
  success: (message: string): A2AResponse => {
    return new A2AResponseBuilder()
      .text(`✅ ${message}`)
      .build();
  },

  // Medication added confirmation
  medicationAdded: (medicationName: string, dosage: string, frequency: string): A2AResponse => {
    return new A2AResponseBuilder()
      .text(`🎉 Successfully added medication reminder!\n\n` +
            `💊 ${medicationName} - ${dosage}\n` +
            `⏰ Frequency: ${frequency}\n\n` +
            `I'll remind you when it's time to take your medication.`)
      .addButton("📋 View All", "list_medications")
      .addButton("➕ Add Another", "add_medication")
      .build();
  }
};

// A2A Message Parser
export class A2AMessageParser {
  static parseIncoming(rawData: any): A2AIncomingMessage {
    try {
      // Validate basic structure
      if (!rawData.event || !rawData.data) {
        throw new Error('Invalid A2A message structure');
      }

      const message: A2AIncomingMessage = {
        event: rawData.event,
        data: {
          sender_id: rawData.data.sender_id || '',
          chat_id: rawData.data.chat_id,
          timestamp: rawData.data.timestamp
        }
      };

      if (rawData.data.message) {
        message.data.message = {
          text: rawData.data.message.text || '',
          id: rawData.data.message.id
        };
      }

      if (rawData.data.action_id) {
        message.data.action_id = rawData.data.action_id;
      }

      return message;
    } catch (error) {
      logger.error('Error parsing A2A message:', error);
      throw new Error('Failed to parse A2A message');
    }
  }

  static extractMedicationIntent(text: string): MedicationIntent {
    const lowerText = text.toLowerCase();
    
    // Check for add medication intent
    if (lowerText.includes('remind') || lowerText.includes('add') || lowerText.includes('schedule')) {
      return this.extractMedicationDetails(text);
    }
    
    // Check for list medications intent
    if (lowerText.includes('list') || lowerText.includes('show') || lowerText.includes('my medications')) {
      return { intent: 'list_medications' };
    }
    
    // Check for confirmation intent
    if (lowerText.includes('took') || lowerText.includes('taken') || lowerText.includes('confirm')) {
      return { intent: 'confirm_medication' };
    }
    
    // Check for help intent
    if (lowerText.includes('help') || lowerText.includes('how') || lowerText.includes('?')) {
      return { intent: 'help' };
    }
    
    return { intent: 'unknown' };
  }

  private static extractMedicationDetails(text: string): MedicationIntent {
    const intent: MedicationIntent = { intent: 'add_medication' };
    
    // Extract medication name (simplified regex - in production, use NLP/Mastra)
    const nameMatch = text.match(/(?:take|remind me to take|add)\s+([a-zA-Z\s-]+)/i);
    if (nameMatch) {
      intent.medicineName = nameMatch[1].trim();
    }
    
    // Extract dosage
    const dosageMatch = text.match(/(\d+(?:\.\d+)?\s*(?:mg|ml|tablet|capsule|pill)s?)/i);
    if (dosageMatch) {
      intent.dosage = dosageMatch[1];
    }
    
    // Extract frequency
    if (text.toLowerCase().includes('every 6 hours') || text.toLowerCase().includes('6 hourly')) {
      intent.frequencyHours = 6;
    } else if (text.toLowerCase().includes('every 8 hours') || text.toLowerCase().includes('8 hourly')) {
      intent.frequencyHours = 8;
    } else if (text.toLowerCase().includes('every 12 hours') || text.toLowerCase().includes('12 hourly')) {
      intent.frequencyHours = 12;
    } else if (text.toLowerCase().includes('daily') || text.toLowerCase().includes('every 24 hours')) {
      intent.frequencyHours = 24;
    }
    
    // Extract start time
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (timeMatch) {
      intent.startTime = timeMatch[1];
    }
    
    // Extract duration
    const durationMatch = text.match(/(\d+)\s*(?:day|days|week|weeks)/i);
    if (durationMatch) {
      intent.durationDays = parseInt(durationMatch[1]);
      if (text.toLowerCase().includes('week')) {
        intent.durationDays *= 7;
      }
    }
    
    return intent;
  }
}

// Validation utilities
export const validateA2AMessage = (message: A2AIncomingMessage): boolean => {
  return !!(
    message.event &&
    message.data &&
    message.data.sender_id
  );
};

export const validateA2AResponse = (response: A2AResponse): boolean => {
  return !!(
    response.version === "1.0" &&
    response.response &&
    response.response.type === "message" &&
    response.response.data &&
    response.response.data.text
  );
};

export default {
  A2AResponseBuilder,
  A2ATemplates,
  A2AMessageParser,
  validateA2AMessage,
  validateA2AResponse
};