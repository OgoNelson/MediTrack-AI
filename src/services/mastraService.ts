import { logger } from '../utils/logger';
import { MedicationIntent } from '../utils/a2aFormatter';

// Mastra AI Service Configuration
interface MastraConfig {
  apiKey: string;
  agentId: string;
  baseUrl: string;
}

interface MastraResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface MedicationExtraction {
  medicineName: string;
  dosage: string;
  frequencyHours: number;
  startTime: string;
  durationDays: number;
  notes?: string;
  confidence: number;
}

/**
 * Mastra AI Service for Medication Understanding
 * This service integrates with Mastra AI to extract medication information
 * from natural language input and provide intelligent responses.
 */
export class MastraService {
  private config: MastraConfig;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      apiKey: process.env.MASTRA_API_KEY || '',
      agentId: process.env.MASTRA_AGENT_ID || 'medication-agent',
      baseUrl: process.env.MASTRA_BASE_URL || 'https://api.mastra.ai'
    };

    this.validateConfig();
  }

  /**
   * Validate Mastra configuration
   */
  private validateConfig(): void {
    if (!this.config.apiKey) {
      logger.warn('⚠️ Mastra API key not configured. Using fallback extraction.');
      return;
    }

    if (!this.config.agentId) {
      logger.warn('⚠️ Mastra agent ID not configured. Using default.');
    }

    this.isInitialized = true;
  }

  /**
   * Extract medication information from natural language
   */
  async extractMedicationInfo(text: string): Promise<MedicationExtraction> {
    try {
      // If Mastra is not configured, use fallback extraction
      if (!this.isInitialized) {
        return this.fallbackExtraction(text);
      }

      logger.info('🧠 Using Mastra AI to extract medication info', { text });

      const response = await this.callMastraAPI({
        action: 'extract_medication',
        text,
        schema: {
          medicineName: { type: 'string', required: true },
          dosage: { type: 'string', required: true },
          frequencyHours: { type: 'number', required: true },
          startTime: { type: 'string', required: true },
          durationDays: { type: 'number', required: true },
          notes: { type: 'string', required: false },
          confidence: { type: 'number', required: true }
        }
      });

      if (response.success && response.data) {
        logger.info('✅ Mastra extraction successful', { data: response.data });
        return response.data;
      } else {
        throw new Error(response.error || 'Mastra extraction failed');
      }

    } catch (error) {
      logger.warn('⚠️ Mastra extraction failed, using fallback', { error });
      return this.fallbackExtraction(text);
    }
  }

  /**
   * Generate intelligent medication reminders
   */
  async generateReminderMessage(
    medicationName: string, 
    dosage: string, 
    userContext?: any
  ): Promise<string> {
    try {
      if (!this.isInitialized) {
        return this.generateFallbackReminder(medicationName, dosage);
      }

      const response = await this.callMastraAPI({
        action: 'generate_reminder',
        medicationName,
        dosage,
        userContext,
        tone: 'friendly',
        includeInstructions: true
      });

      if (response.success && response.data?.message) {
        return response.data.message;
      } else {
        throw new Error(response.error || 'Reminder generation failed');
      }

    } catch (error) {
      logger.warn('⚠️ Mastra reminder generation failed, using fallback', { error });
      return this.generateFallbackReminder(medicationName, dosage);
    }
  }

  /**
   * Analyze medication adherence patterns
   */
  async analyzeAdherencePatterns(
    userId: string, 
    medicationHistory: any[]
  ): Promise<{
    adherenceRate: number;
    patterns: string[];
    recommendations: string[];
  }> {
    try {
      if (!this.isInitialized) {
        return this.fallbackAdherenceAnalysis(medicationHistory);
      }

      const response = await this.callMastraAPI({
        action: 'analyze_adherence',
        userId,
        medicationHistory,
        timeframe: '30d'
      });

      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error || 'Adherence analysis failed');
      }

    } catch (error) {
      logger.warn('⚠️ Mastra adherence analysis failed, using fallback', { error });
      return this.fallbackAdherenceAnalysis(medicationHistory);
    }
  }

  /**
   * Get medication interaction warnings
   */
  async checkMedicationInteractions(
    medications: string[]
  ): Promise<{
    hasInteractions: boolean;
    warnings: string[];
    severity: 'low' | 'medium' | 'high';
  }> {
    try {
      if (!this.isInitialized || medications.length < 2) {
        return { hasInteractions: false, warnings: [], severity: 'low' };
      }

      const response = await this.callMastraAPI({
        action: 'check_interactions',
        medications
      });

      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.error || 'Interaction check failed');
      }

    } catch (error) {
      logger.warn('⚠️ Mastra interaction check failed', { error });
      return { hasInteractions: false, warnings: [], severity: 'low' };
    }
  }

  /**
   * Call Mastra API
   */
  private async callMastraAPI(payload: any): Promise<MastraResponse> {
    try {
      const response = await fetch(`${this.config.baseUrl}/v1/agents/${this.config.agentId}/invoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Mastra API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data.result || data
      };

    } catch (error) {
      logger.error('❌ Mastra API call failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Fallback medication extraction (rule-based)
   */
  private fallbackExtraction(text: string): MedicationExtraction {
    const lowerText = text.toLowerCase();
    
    // Extract medication name
    let medicineName = '';
    const namePatterns = [
      /(?:take|remind me to take|add)\s+([a-zA-Z\s-]+?)(?:\s+\d+)/i,
      /(?:medication|medicine):\s*([a-zA-Z\s-]+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match) {
        medicineName = match[1].trim();
        break;
      }
    }

    // Extract dosage
    let dosage = '';
    const dosageMatch = text.match(/(\d+(?:\.\d+)?\s*(?:mg|ml|tablet|capsule|pill)s?)/i);
    if (dosageMatch) {
      dosage = dosageMatch[1];
    }

    // Extract frequency
    let frequencyHours = 24; // Default to daily
    if (lowerText.includes('every 6 hours') || lowerText.includes('6 hourly')) {
      frequencyHours = 6;
    } else if (lowerText.includes('every 8 hours') || lowerText.includes('8 hourly')) {
      frequencyHours = 8;
    } else if (lowerText.includes('every 12 hours') || lowerText.includes('12 hourly')) {
      frequencyHours = 12;
    }

    // Extract start time
    let startTime = '08:00'; // Default to 8 AM
    const timeMatch = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (timeMatch) {
      startTime = timeMatch[1];
    }

    // Extract duration
    let durationDays = 7; // Default to 7 days
    const durationMatch = text.match(/(\d+)\s*(?:day|days|week|weeks)/i);
    if (durationMatch) {
      durationDays = parseInt(durationMatch[1]);
      if (lowerText.includes('week')) {
        durationDays *= 7;
      }
    }

    return {
      medicineName: medicineName || 'Unknown Medication',
      dosage: dosage || 'As prescribed',
      frequencyHours,
      startTime,
      durationDays,
      confidence: 0.7 // Lower confidence for fallback
    };
  }

  /**
   * Generate fallback reminder message
   */
  private generateFallbackReminder(medicationName: string, dosage: string): string {
    return `💊 Time to take your ${dosage} ${medicationName}. Please take your medication as prescribed by your doctor.`;
  }

  /**
   * Fallback adherence analysis
   */
  private fallbackAdherenceAnalysis(medicationHistory: any[]): any {
    if (!medicationHistory || medicationHistory.length === 0) {
      return {
        adherenceRate: 0,
        patterns: ['No medication history available'],
        recommendations: ['Start taking medications as prescribed']
      };
    }

    const takenCount = medicationHistory.filter(m => m.status === 'confirmed').length;
    const adherenceRate = Math.round((takenCount / medicationHistory.length) * 100);

    return {
      adherenceRate,
      patterns: adherenceRate >= 80 ? ['Good adherence pattern'] : ['Inconsistent adherence'],
      recommendations: adherenceRate >= 80 
        ? ['Keep up the good work!'] 
        : ['Try to take medications at the same time each day']
    };
  }

  /**
   * Check if Mastra service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && !!this.config.apiKey;
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    apiKeyConfigured: boolean;
    agentId: string;
    baseUrl: string;
  } {
    return {
      initialized: this.isInitialized,
      apiKeyConfigured: !!this.config.apiKey,
      agentId: this.config.agentId,
      baseUrl: this.config.baseUrl
    };
  }
}

// Export singleton instance
export const mastraService = new MastraService();

export default mastraService;